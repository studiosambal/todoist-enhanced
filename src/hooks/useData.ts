import { useMemo } from 'react';
import { useStore } from '@/store/store';
import { childIndex, makeChildrenOf, openItems } from '@/store/selectors';
import { mineOrUnassigned } from '@/domain/assignment';
import type { Item } from '@/domain/types';

/**
 * The derived reading of the snapshot every view needs: the open tasks, and a
 * way to reach a task's children. Recomputed only when the snapshot changes.
 *
 * With "hide tasks assigned to others" on, those tasks are left out here, once,
 * so every list, count and load that reads from this hook agrees about it.
 */
export function useData() {
  const storage = useStore((s) => s.prefs.estimateStorage);
  const hideOthers = useStore((s) => s.prefs.hideAssignedToOthers);
  const snapshot = useStore((s) => s.snapshot);

  return useMemo(() => {
    void storage; // Changing precedence invalidates derived totals and groups.
    const index = childIndex(snapshot);
    const byId = (id: string): Item | undefined => snapshot.items[id];
    const everyChildOf = makeChildrenOf(index);
    const open = openItems(snapshot);
    if (!hideOthers) {
      return { snapshot, items: open, childrenOf: everyChildOf, byId, childIndex: index };
    }
    const stays = mineOrUnassigned(open, snapshot.user?.id, byId);
    const childrenOf = (parentId: string): Item[] => everyChildOf(parentId).filter(stays);
    return { snapshot, items: open.filter(stays), childrenOf, byId, childIndex: index };
  }, [snapshot, storage, hideOthers]);
}
