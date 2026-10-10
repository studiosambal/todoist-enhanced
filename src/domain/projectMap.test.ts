import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildProjectMap, FOCUS_LIMIT, isOngoing, lensProjects, MAP_ROOT, pathOf, spaceNodeId, toggleFocus,
  type MapTreeGroup, type MapTreeNode,
} from './projectMap';
import { setEstimateStorage, setWeekLabel, type Item, type Project } from './types';
import { due, item } from '@/test/items';

const NOW = new Date(2026, 9, 10, 12, 0, 0);
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id, name: id, color: 'grey', parent_id: null, child_order: 1,
  is_archived: false, is_deleted: false, is_favorite: false, workspace_id: null, ...extra,
});
const tree = (id: string, children: MapTreeNode[] = [], extra: Partial<Project> = {}): MapTreeNode =>
  ({ project: project(id, extra), children });
const personal = (...roots: MapTreeNode[]): MapTreeGroup => ({ workspaceId: null, name: null, roots });
const team = (...roots: MapTreeNode[]): MapTreeGroup => ({ workspaceId: 'w1', name: 'Team', roots });

/** `count` open tasks in a project, added `age` days ago. */
const open = (projectId: string, count: number, age = 5, extra: Partial<Item> = {}): Item[] =>
  Array.from({ length: count }, (_, i) =>
    item({ id: `${projectId}-${i}`, project_id: projectId, added_at: daysAgo(age), ...extra }));
const done = (projectId: string, ...ages: number[]) =>
  ages.map((age) => ({ project_id: projectId, completed_at: daysAgo(age) }));

const build = (
  groups: MapTreeGroup[], items: Item[], completed: ReturnType<typeof done> = [],
  ongoing: Record<string, boolean> = {},
) => buildProjectMap({ groups, items, completed, childrenOf: () => [], ongoing, now: NOW });

beforeEach(() => {
  setWeekLabel('week');
  setEstimateStorage('tag');
});

describe('buildProjectMap: the shape', () => {
  it('hangs the projects of a single space straight from the centre', () => {
    const map = build([personal(tree('work', [tree('client')]), tree('home'))], []);
    expect(map.nodes.get(MAP_ROOT)!.childIds).toEqual(['work', 'home']);
    expect(map.nodes.get('client')).toMatchObject({ parentId: 'work', branchId: 'work', space: 'personal' });
    expect(map.spaces).toEqual([{ id: 'personal', name: null }]);
  });

  it('gives each space a hub when there are several, and skips an empty one', () => {
    const map = build([personal(tree('home')), team(tree('seo')), { workspaceId: 'w2', name: 'Empty', roots: [] }], []);
    expect(map.nodes.get(MAP_ROOT)!.childIds).toEqual([spaceNodeId('personal'), spaceNodeId('w1')]);
    expect(map.nodes.get(spaceNodeId('w1'))).toMatchObject({ kind: 'space', name: 'Team', container: true });
    expect(map.nodes.get('seo')).toMatchObject({ parentId: spaceNodeId('w1'), space: 'w1', branchId: 'seo' });
    expect(pathOf(map, map.nodes.get('seo')!)).toEqual(['Team']);
  });

  it('draws a folder, and a project that only holds others, as a hub', () => {
    const map = build([personal(
      tree('folder', [tree('inside')], { is_folder: true }),
      tree('parent', [tree('child')]),
      tree('busy-parent', [tree('other')]),
    )], [...open('inside', 2), ...open('child', 1), ...open('busy-parent', 3), ...open('other', 1)]);
    expect(map.nodes.get('folder')).toMatchObject({ kind: 'folder', container: true, status: null, totalOpen: 2 });
    expect(map.nodes.get('parent')).toMatchObject({ container: true, status: null, totalOpen: 1 });
    expect(map.nodes.get('busy-parent')).toMatchObject({ container: false, open: 3, totalOpen: 4 });
    expect(map.nodes.get(MAP_ROOT)!.totalOpen).toBe(7);
  });
});

describe('buildProjectMap: what a project is doing', () => {
  const status = (items: Item[], completed = done('p'), ongoing = {}) =>
    build([personal(tree('p'))], items, completed, ongoing).nodes.get('p')!;

  it('is moving when something was completed in the last two weeks', () => {
    expect(status(open('p', 4), done('p', 3, 40))).toMatchObject({ status: 'moving', done14: 1, done90: 2 });
  });

  it('is stalled when the last completion is older than that', () => {
    expect(status(open('p', 4), done('p', 15, 60))).toMatchObject({ status: 'stalled', done14: 0, done90: 2 });
  });

  it('ignores a completion older than the history read', () => {
    expect(status(open('p', 4), done('p', 120))).toMatchObject({ status: 'unstarted', done90: 0, lastDone: null });
  });

  it('is unstarted with recent tasks, or old ones that carry a date', () => {
    expect(status(open('p', 2, 10)).status).toBe('unstarted');
    expect(status(open('p', 2, 400, { due: due('2026-11-01') })).status).toBe('unstarted');
  });

  it('is dormant when nothing was added in six months and nothing has a date', () => {
    expect(status(open('p', 40, 400)).status).toBe('dormant');
  });

  it('is empty with no open task left, whatever was completed', () => {
    expect(status([], done('p', 2))).toMatchObject({ status: 'empty', finishable: false, nearlyDone: false });
  });

  it('is ongoing when it calls itself an inbox, or was marked so by hand, and not when unmarked', () => {
    const inbox = build([personal(tree('! Team inbox'))], open('! Team inbox', 5), done('! Team inbox', 1));
    expect(inbox.nodes.get('! Team inbox')).toMatchObject({ status: 'ongoing', finishable: false });
    expect(status(open('p', 5), done('p', 1), { p: true }).status).toBe('ongoing');
    expect(isOngoing(project('Inbox zero'), { 'Inbox zero': false })).toBe(false);
  });

  it('calls a finishable project nearly done at three open tasks or fewer', () => {
    expect(status(open('p', 3), done('p', 2))).toMatchObject({ nearlyDone: true, progress: 0.25 });
    expect(status(open('p', 4), done('p', 2)).nearlyDone).toBe(false);
    expect(status(open('p', 2, 400)).nearlyDone).toBe(false);
  });
});

describe('buildProjectMap: what it counts', () => {
  it('counts top-level tasks, and reads time, the week and lateness from them', () => {
    const parent = item({ id: 'a', project_id: 'p', labels: ['est-30', 'week'], added_at: daysAgo(2) });
    const child = item({ id: 'b', project_id: 'p', parent_id: 'a', labels: ['est-90'], added_at: daysAgo(1) });
    const late = item({ id: 'c', project_id: 'p', labels: ['est-15'], due: due('2026-10-01') });
    const someday = item({ id: 'd', project_id: 'p' });
    const node = build([personal(tree('p'))], [parent, child, late, someday]).nodes.get('p')!;
    expect(node).toMatchObject({ open: 3, minutes: 45, week: 2, overdue: 1, hasDates: true });
    expect(node.tasks.map((task) => task.id)).toEqual(['a', 'c', 'd']);
    expect(node.lastAdded).toBe(Date.parse(daysAgo(1)));
  });

  it('leaves out tasks and completions of projects that are not on the map', () => {
    const map = build([personal(tree('p'))], open('elsewhere', 3), done('elsewhere', 1));
    expect(map.nodes.get(MAP_ROOT)!.totalOpen).toBe(0);
  });
});

describe('lensProjects and focus', () => {
  const map = () => build(
    [personal(tree('a'), tree('b'), tree('c'), tree('d'), tree('e'))],
    [...open('a', 1), ...open('b', 3), ...open('c', 9), ...open('d', 6, 5, { labels: ['week'] })],
    [...done('a', 20), ...done('b', 1), ...done('c', 2, 3)],
  );

  it('lists the nearly done closest to done first', () => {
    expect(lensProjects(map(), 'near').map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('lists each status, the week, and everything', () => {
    expect(lensProjects(map(), 'moving').map((n) => n.id)).toEqual(['c', 'b']);
    expect(lensProjects(map(), 'stalled').map((n) => n.id)).toEqual(['a']);
    expect(lensProjects(map(), 'unstarted').map((n) => n.id)).toEqual(['d']);
    expect(lensProjects(map(), 'week').map((n) => n.id)).toEqual(['d']);
    expect(lensProjects(map(), 'all').map((n) => n.id)).toEqual(['c', 'd', 'b', 'a', 'e']);
  });

  it('leaves out what the page is not showing', () => {
    expect(lensProjects(map(), 'all', { visible: (n) => n.id !== 'c' }).map((n) => n.id)).not.toContain('c');
  });

  it('keeps the focus in the order it was chosen, dropping what is gone', () => {
    expect(lensProjects(map(), 'focus', { focus: ['c', 'gone', 'a'] }).map((n) => n.id)).toEqual(['c', 'a']);
  });

  it('refuses one more than the limit, and frees a place when a project is finished', () => {
    const focus = ['a', 'b', 'c'];
    expect(focus).toHaveLength(FOCUS_LIMIT);
    expect(toggleFocus(map(), focus, 'd')).toBeNull();
    expect(toggleFocus(map(), focus, 'b')).toEqual(['a', 'c']);
    expect(toggleFocus(map(), ['a', 'b', 'e'], 'd')).toEqual(['a', 'b', 'e', 'd']);
  });
});
