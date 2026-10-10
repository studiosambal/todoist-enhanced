import { bucketOf } from './views';
import { effectiveEstimate } from './estimates';
import type { CompletedItem, Item, Project } from './types';

/**
 * The project map: every project as one mark, sized by what is open in it and
 * read by whether anything in it is moving.
 *
 * The rest of the app answers "which tasks, and when". This answers the
 * question above that one — how many projects are open at once, which of them
 * are actually moving, and which are a handful of tasks from being closed —
 * for someone who starts more than they finish.
 *
 * Everything here is a reading of facts Todoist already holds: open tasks,
 * their dates and estimates, and what was completed lately. Nothing is stored
 * in Todoist to draw it.
 */

/**
 * What a project is doing, from what was completed in it and when.
 *
 * - `moving`    something was completed in the last two weeks;
 * - `stalled`   something was completed in the last ninety days, but not lately;
 * - `unstarted` tasks are waiting and nothing has been completed in ninety days;
 * - `ongoing`   work with no end (an inbox, a routine): not a thing to finish;
 * - `dormant`   nothing added or completed in six months, and no dates — a list
 *               kept in a project, far more often than a project left behind;
 * - `empty`     no open task left.
 */
export const MAP_STATUSES = ['moving', 'stalled', 'unstarted', 'ongoing', 'dormant', 'empty'] as const;
export type MapStatus = (typeof MAP_STATUSES)[number];

/** How recent a completion has to be for a project to count as moving. */
export const MOVING_DAYS = 14;
/** How far back completions are read at all. */
export const HISTORY_DAYS = 90;
/** How long a project can go without a new task before it is taken for a list. */
export const DORMANT_DAYS = 180;
/** A project this close to empty is one to finish before starting another. */
export const NEARLY_DONE_MAX = 3;
/** How many projects can be in focus at once. The limit is the point. */
export const FOCUS_LIMIT = 3;

const DAY_MS = 86_400_000;

/** The tree the sidebar already builds (store/selectors), by shape. */
export interface MapTreeNode {
  project: Project;
  children: MapTreeNode[];
}
export interface MapTreeGroup {
  workspaceId: string | null;
  name: string | null;
  roots: MapTreeNode[];
}

export const MAP_ROOT = 'root';
export const PERSONAL_SPACE = 'personal';
export const spaceNodeId = (space: string): string => `space:${space}`;

export interface MapNode {
  id: string;
  kind: 'root' | 'space' | 'folder' | 'project';
  /** Null for the root and for the personal space, which the page names itself. */
  name: string | null;
  project: Project | null;
  parentId: string | null;
  childIds: string[];
  /** `personal`, or the id of a workspace. */
  space: string;
  /** The node at the top of its branch: what a "hide this part" chip names. */
  branchId: string | null;

  /** Open top-level tasks in the project itself: the number the sidebar shows beside it. */
  open: number;
  /** Estimated minutes of its open tasks. */
  minutes: number;
  /** Open top-level tasks due today, late, or committed to this week. */
  week: number;
  overdue: number;
  done14: number;
  done90: number;
  /** When something was last completed here, within the history read. */
  lastDone: number | null;
  lastAdded: number | null;
  hasDates: boolean;
  /** Those tasks. */
  tasks: Item[];

  /** The node and everything under it. */
  totalOpen: number;
  totalMinutes: number;

  /** Holds projects and has nothing of its own to finish: drawn as a hub. */
  container: boolean;
  status: MapStatus | null;
  /** A project with an end: moving, stalled or unstarted. */
  finishable: boolean;
  nearlyDone: boolean;
  /** Share completed over the history read, 0 to 1. */
  progress: number;
}

export interface ProjectMap {
  nodes: Map<string, MapNode>;
  /** The spaces on the map, in the sidebar's order; one entry when there is no workspace. */
  spaces: Array<{ id: string; name: string | null }>;
}

export interface ProjectMapInput {
  groups: MapTreeGroup[];
  /** Every open task, subtasks included. */
  items: Item[];
  /** What was completed over the last `HISTORY_DAYS`. */
  completed: Array<Pick<CompletedItem, 'project_id' | 'completed_at'>>;
  childrenOf: (parentId: string) => Item[];
  /** The projects marked as ongoing, or as having an end after all, by hand. */
  ongoing?: Record<string, boolean>;
  now?: Date;
}

/**
 * Whether a project is ongoing work unless the user has said otherwise.
 *
 * Only the one case that can be told from the outside: a project that calls
 * itself an inbox is a place things pass through, not a thing to finish.
 */
export const ongoingByDefault = (project: Pick<Project, 'name' | 'inbox_project'>): boolean =>
  project.inbox_project === true || /\binbox\b/i.test(project.name);

export const isOngoing = (
  project: Pick<Project, 'id' | 'name' | 'inbox_project'>,
  marks: Record<string, boolean> = {},
): boolean => (typeof marks[project.id] === 'boolean' ? marks[project.id] : ongoingByDefault(project));

function blank(
  id: string, kind: MapNode['kind'], name: string | null, project: Project | null,
  parentId: string | null, space: string, branchId: string | null,
): MapNode {
  return {
    id, kind, name, project, parentId, childIds: [], space, branchId,
    open: 0, minutes: 0, week: 0, overdue: 0, done14: 0, done90: 0,
    lastDone: null, lastAdded: null, hasDates: false, tasks: [],
    totalOpen: 0, totalMinutes: 0,
    container: kind !== 'project', status: null, finishable: false, nearlyDone: false, progress: 0,
  };
}

export function buildProjectMap(input: ProjectMapInput): ProjectMap {
  const { items, completed, childrenOf, ongoing = {} } = input;
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const nodes = new Map<string, MapNode>();
  const root = blank(MAP_ROOT, 'root', null, null, null, PERSONAL_SPACE, null);
  nodes.set(root.id, root);

  /* A space with nothing in it has nothing to draw, and one space alone needs
     no hub of its own: its projects hang from the centre. */
  const groups = input.groups.filter((group) => group.roots.length > 0);
  const hubs = groups.length > 1;

  const add = (tree: MapTreeNode, parent: MapNode, space: string, branchId: string | null) => {
    const { project } = tree;
    const node = blank(
      project.id, project.is_folder ? 'folder' : 'project', project.name, project,
      parent.id, space, branchId ?? project.id,
    );
    nodes.set(node.id, node);
    parent.childIds.push(node.id);
    for (const child of tree.children) add(child, node, space, node.branchId);
  };

  for (const group of groups) {
    const space = group.workspaceId ?? PERSONAL_SPACE;
    let parent = root;
    if (hubs) {
      parent = blank(spaceNodeId(space), 'space', group.name, null, root.id, space, null);
      nodes.set(parent.id, parent);
      root.childIds.push(parent.id);
    }
    for (const tree of group.roots) add(tree, parent, space, null);
  }

  for (const item of items) {
    const node = nodes.get(item.project_id);
    if (!node || node.kind !== 'project') continue;
    const added = item.added_at ? Date.parse(item.added_at) : NaN;
    if (Number.isFinite(added) && (node.lastAdded === null || added > node.lastAdded)) node.lastAdded = added;
    if (item.due || item.deadline) node.hasDates = true;
    /* A subtask says the project is alive, but is not counted on its own: it
       is part of the task above it, here as in every list. */
    if (item.parent_id) continue;

    node.open += 1;
    node.tasks.push(item);
    node.minutes += effectiveEstimate(item, childrenOf).minutes ?? 0;
    const bucket = bucketOf(item, now);
    if (bucket === 'overdue') node.overdue += 1;
    if (bucket === 'overdue' || bucket === 'today' || bucket === 'anytime') node.week += 1;
  }

  for (const done of completed) {
    const node = nodes.get(done.project_id);
    if (!node || node.kind !== 'project') continue;
    const at = Date.parse(done.completed_at);
    if (!Number.isFinite(at) || at > nowMs || nowMs - at > HISTORY_DAYS * DAY_MS) continue;
    node.done90 += 1;
    if (nowMs - at <= MOVING_DAYS * DAY_MS) node.done14 += 1;
    if (node.lastDone === null || at > node.lastDone) node.lastDone = at;
  }

  const total = (node: MapNode): void => {
    node.totalOpen = node.open;
    node.totalMinutes = node.minutes;
    for (const id of node.childIds) {
      const child = nodes.get(id)!;
      total(child);
      node.totalOpen += child.totalOpen;
      node.totalMinutes += child.totalMinutes;
    }
  };
  total(root);

  for (const node of nodes.values()) {
    if (node.kind !== 'project' || !node.project) continue;
    /* A project that only holds others, with nothing in it and nothing lately
       finished in it, is a heading: there is nothing of its own to finish. */
    node.container = node.childIds.length > 0 && node.open === 0 && node.done90 === 0;
    if (node.container) continue;

    if (isOngoing(node.project, ongoing)) node.status = 'ongoing';
    else if (node.open === 0) node.status = 'empty';
    else if (node.done14 > 0) node.status = 'moving';
    else if (node.done90 > 0) node.status = 'stalled';
    else if (node.hasDates || (node.lastAdded !== null && nowMs - node.lastAdded < DORMANT_DAYS * DAY_MS)) {
      node.status = 'unstarted';
    } else node.status = 'dormant';

    node.finishable = node.status === 'moving' || node.status === 'stalled' || node.status === 'unstarted';
    node.nearlyDone = node.finishable && node.open <= NEARLY_DONE_MAX;
    node.progress = node.done90 + node.open > 0 ? node.done90 / (node.done90 + node.open) : 0;
  }

  return {
    nodes,
    spaces: groups.map((group) => ({ id: group.workspaceId ?? PERSONAL_SPACE, name: group.name })),
  };
}

/** The lists the page can show beside the map, and light up on it. */
export const MAP_LENSES = ['near', 'moving', 'stalled', 'unstarted', 'week', 'focus', 'all'] as const;
export type MapLens = (typeof MAP_LENSES)[number];

/**
 * The projects a lens holds, in the order they are worth reading in: the
 * closest to done first where finishing is the question, the busiest first
 * where it is not.
 */
export function lensProjects(
  map: ProjectMap,
  lens: MapLens,
  options: { visible?: (node: MapNode) => boolean; focus?: string[] } = {},
): MapNode[] {
  const visible = options.visible ?? (() => true);
  if (lens === 'focus') {
    return (options.focus ?? [])
      .map((id) => map.nodes.get(id))
      .filter((node): node is MapNode => !!node && node.kind === 'project');
  }
  const projects = [...map.nodes.values()].filter((node) => node.status !== null && visible(node));
  const byOpen = (a: MapNode, b: MapNode) => b.open - a.open || (a.name ?? '').localeCompare(b.name ?? '');
  switch (lens) {
    case 'all': return projects.sort(byOpen);
    case 'near':
      return projects.filter((node) => node.nearlyDone)
        .sort((a, b) => a.open - b.open || b.done14 - a.done14 || (a.name ?? '').localeCompare(b.name ?? ''));
    case 'week':
      return projects.filter((node) => node.week > 0)
        .sort((a, b) => b.week - a.week || (a.name ?? '').localeCompare(b.name ?? ''));
    case 'moving':
      return projects.filter((node) => node.status === 'moving')
        .sort((a, b) => b.done14 - a.done14 || byOpen(a, b));
    default:
      return projects.filter((node) => node.status === lens).sort(byOpen);
  }
}

/**
 * The focus list with one project added or taken out, or null when it is full.
 *
 * A project already finished no longer takes a place: closing one is exactly
 * what frees room for the next.
 */
export function toggleFocus(map: ProjectMap, focus: string[], id: string): string[] | null {
  if (focus.includes(id)) return focus.filter((other) => other !== id);
  const held = focus.filter((other) => (map.nodes.get(other)?.open ?? 0) > 0);
  if (held.length >= FOCUS_LIMIT) return null;
  return [...focus, id];
}

/** The names of the nodes above this one, outermost first. */
export function pathOf(map: ProjectMap, node: MapNode): Array<string | null> {
  const path: Array<string | null> = [];
  let parent = node.parentId ? map.nodes.get(node.parentId) : undefined;
  while (parent && parent.kind !== 'root') {
    path.unshift(parent.name);
    parent = parent.parentId ? map.nodes.get(parent.parentId) : undefined;
  }
  return path;
}
