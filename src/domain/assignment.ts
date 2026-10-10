import type { Item } from './types';

/**
 * Who a task is for, in a shared project.
 *
 * A task names its own assignee, or nobody. A subtask with nobody named on it
 * is part of its parent's work, so it is read as the parent's: the checklist
 * under a task assigned to a colleague is theirs too, though no line of it
 * says so.
 */
export function effectiveAssignee(
  item: Item,
  byId: (id: string) => Item | undefined,
): string | null {
  const seen = new Set<string>();
  let current: Item | undefined = item;
  while (current && !seen.has(current.id)) {
    if (current.responsible_uid) return current.responsible_uid;
    seen.add(current.id);
    current = current.parent_id ? byId(current.parent_id) : undefined;
  }
  return null;
}

/**
 * Which tasks stay when those assigned to other people are left out.
 *
 * Yours and nobody's stay. One assigned to someone else goes, with the
 * subtasks that are part of it — unless it holds a task assigned to you, in
 * which case it stays as the place that task lives: taking the parent away
 * would take yours off every list with it.
 *
 * Without a user there is nobody to be "someone else" to, and everything stays.
 */
export function mineOrUnassigned(
  items: Item[],
  userId: string | null | undefined,
  byId: (id: string) => Item | undefined,
): (item: Item) => boolean {
  if (!userId) return () => true;

  const holdsMine = new Set<string>();
  for (const item of items) {
    if (item.responsible_uid !== userId) continue;
    let parent = item.parent_id ? byId(item.parent_id) : undefined;
    while (parent && !holdsMine.has(parent.id)) {
      holdsMine.add(parent.id);
      parent = parent.parent_id ? byId(parent.parent_id) : undefined;
    }
  }

  return (item) => {
    if (holdsMine.has(item.id)) return true;
    const who = effectiveAssignee(item, byId);
    return who === null || who === userId;
  };
}
