import { describe, expect, it } from 'vitest';
import { completedByMeOrNobody, effectiveAssignee, mineOrUnassigned } from './assignment';
import { item } from '@/test/items';
import type { Item } from './types';

const ME = 'me';
const board = (...items: Item[]) => {
  const map = new Map(items.map((entry) => [entry.id, entry]));
  const byId = (id: string) => map.get(id);
  const stays = mineOrUnassigned(items, ME, byId);
  return { byId, kept: items.filter(stays).map((entry) => entry.id) };
};

describe('effectiveAssignee', () => {
  it('reads a task with nobody named on it as its parent\'s', () => {
    const parent = item({ id: 'p', responsible_uid: 'ana' });
    const child = item({ id: 'c', parent_id: 'p' });
    const grandchild = item({ id: 'g', parent_id: 'c' });
    const { byId } = board(parent, child, grandchild);
    expect(effectiveAssignee(grandchild, byId)).toBe('ana');
    expect(effectiveAssignee(item({ id: 'alone' }), byId)).toBeNull();
  });

  it('lets a task\'s own assignee win over its parent\'s', () => {
    const parent = item({ id: 'p', responsible_uid: 'ana' });
    const child = item({ id: 'c', parent_id: 'p', responsible_uid: ME });
    expect(effectiveAssignee(child, board(parent, child).byId)).toBe(ME);
  });

  it('does not loop on a parent that points back', () => {
    const a = item({ id: 'a', parent_id: 'b' });
    const b = item({ id: 'b', parent_id: 'a' });
    expect(effectiveAssignee(a, board(a, b).byId)).toBeNull();
  });
});

describe('mineOrUnassigned', () => {
  it('keeps what is yours and what is nobody\'s, and leaves out the rest', () => {
    expect(board(
      item({ id: 'mine', responsible_uid: ME }),
      item({ id: 'open' }),
      item({ id: 'theirs', responsible_uid: 'ana' }),
    ).kept).toEqual(['mine', 'open']);
  });

  it('takes the unassigned subtasks of someone else\'s task out with it', () => {
    expect(board(
      item({ id: 'theirs', responsible_uid: 'ana' }),
      item({ id: 'step', parent_id: 'theirs' }),
    ).kept).toEqual([]);
  });

  it('keeps someone else\'s task when it holds one of yours, but not its other subtasks', () => {
    expect(board(
      item({ id: 'theirs', responsible_uid: 'ana' }),
      item({ id: 'step', parent_id: 'theirs' }),
      item({ id: 'mine', parent_id: 'theirs', responsible_uid: ME }),
    ).kept).toEqual(['theirs', 'mine']);
  });

  it('keeps everything when nobody is signed in', () => {
    const theirs = item({ id: 'theirs', responsible_uid: 'ana' });
    expect(mineOrUnassigned([theirs], null, () => undefined)(theirs)).toBe(true);
  });
});

describe('completedByMeOrNobody', () => {
  const done = [
    { id: 'mine', responsible_uid: ME },
    { id: 'open', responsible_uid: null },
    { id: 'older' },
    { id: 'theirs', responsible_uid: 'ana' },
  ];

  it('leaves out what was assigned to someone else, and nothing more', () => {
    expect(completedByMeOrNobody(done, ME).map((entry) => entry.id)).toEqual(['mine', 'open', 'older']);
  });

  it('keeps everything when nobody is signed in', () => {
    expect(completedByMeOrNobody(done, null)).toBe(done);
  });
});
