import {
  useCallback, useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import '@/styles/map.css';
import { Icon } from '@/components/Icon';
import { MapDisplayMenu, type MapSizeBy } from '@/components/MapDisplayMenu';
import { PageHeader } from '@/components/PageHeader';
import { useCompleted } from '@/hooks/useCompleted';
import { useData } from '@/hooks/useData';
import { navigate } from '@/hooks/useRoute';
import { useT } from '@/hooks/useT';
import { useToday } from '@/hooks/useToday';
import { dueDate, formatRelativeDay, formatTimeAgo } from '@/domain/dates';
import { formatDuration } from '@/domain/estimates';
import { summariseLoad } from '@/domain/load';
import { plainTitle } from '@/domain/markdown';
import {
  arcPath, bubbleRadius, fitTransform, layoutMap, pickLabels, type LabelMark, type LayoutNode, type PlacedNode,
} from '@/domain/mapLayout';
import {
  buildProjectMap, FOCUS_LIMIT, HISTORY_DAYS, isOngoing, lensProjects, MAP_ROOT, MAP_STATUSES,
  PERSONAL_SPACE, toggleFocus,
  type MapLens, type MapNode, type MapStatus, type ProjectMap,
} from '@/domain/projectMap';
import { displayTaskContent, type Item } from '@/domain/types';
import { bucketOf } from '@/domain/views';
import { projectTree } from '@/store/selectors';
import { useStore } from '@/store/store';
import type { TranslationKey } from '@/i18n';

/* ------------------------------------------------------------------ */
/* What this window is looking at: a matter of the moment, kept on the */
/* device. What was decided — the focus, what is ongoing — is kept     */
/* with the account's settings instead (store/prefs).                  */
/* ------------------------------------------------------------------ */

type SizeBy = MapSizeBy;
interface Looking {
  /** `all`, `personal`, or the id of a workspace. */
  scope: string;
  /** The branches taken off the map. */
  hidden: string[];
  /** The statuses taken off the map. */
  statuses: MapStatus[];
  size: SizeBy;
  /** The line under the map that says what each mark stands for. */
  legend: boolean;
}
const LOOKING_KEY = 'tde.map';
const defaultLooking = (): Looking => ({ scope: 'all', hidden: [], statuses: [], size: 'tasks', legend: false });

function readLooking(): Looking {
  try {
    const stored = JSON.parse(localStorage.getItem(LOOKING_KEY) ?? 'null') as Partial<Looking> | null;
    if (!stored || typeof stored !== 'object') return defaultLooking();
    return {
      scope: typeof stored.scope === 'string' ? stored.scope : 'all',
      hidden: Array.isArray(stored.hidden) ? stored.hidden.filter((id) => typeof id === 'string') : [],
      statuses: Array.isArray(stored.statuses)
        ? MAP_STATUSES.filter((status) => (stored.statuses as unknown[]).includes(status)) : [],
      size: stored.size === 'time' ? 'time' : 'tasks',
      legend: stored.legend === true,
    };
  } catch {
    return defaultLooking();
  }
}

const STATUS_KEY: Record<MapStatus, TranslationKey> = {
  moving: 'map.status.moving', stalled: 'map.status.stalled', unstarted: 'map.status.unstarted',
  ongoing: 'map.status.ongoing', dormant: 'map.status.dormant', empty: 'map.status.empty',
};
const WHY_KEY: Record<MapStatus, TranslationKey> = {
  moving: 'map.why.moving', stalled: 'map.why.stalled', unstarted: 'map.why.unstarted',
  ongoing: 'map.why.ongoing', dormant: 'map.why.dormant', empty: 'map.why.empty',
};
const LENS_TITLE: Record<MapLens, TranslationKey> = {
  near: 'map.list.near', moving: 'map.status.moving', stalled: 'map.status.stalled',
  unstarted: 'map.status.unstarted', week: 'map.week', focus: 'map.focus', all: 'map.allProjects',
};

const ROOT_RADIUS = 24;
const HUB_RADIUS = 12;
const LABEL_PX = 11.5;
/** The room the layout keeps round each mark for its name (domain/mapLayout). */
const LABEL_ROOM = 20;
const MIN_CLEAR = 44;
const MIN_SCALE = 0.12;
const MAX_SCALE = 5;
/** Further than this and a press was a drag, not a click. */
const DRAG_SLOP = 4;

/** A branch is named by the node at its top; loose projects share one chip per space. */
const branchKey = (map: ProjectMap, node: MapNode): string | null => {
  const top = node.branchId ? map.nodes.get(node.branchId) : undefined;
  if (!top) return null;
  return top.kind === 'project' && top.childIds.length === 0 ? `loose:${top.space}` : top.id;
};

/** How far under a mark its name starts: clear of the focus ring and the arc of progress. */
const labelOffset = (node: MapNode, focused: boolean): number => (focused ? 12 : node.finishable ? 7.5 : 2);
/** How far the arc of progress reaches beyond the mark. */
const ARC_REACH = 6.5;

const trim = (text: string, length: number): string => {
  const letters = Array.from(text);
  return letters.length > length ? `${letters.slice(0, length - 1).join('').trimEnd()}…` : text;
};

interface MapViewProps {
  onOpen: (id: string) => void;
}

export function MapView({ onOpen }: MapViewProps) {
  const { t, locale } = useT();
  const { snapshot, items, childrenOf } = useData();
  const workspaceOrder = useStore((s) => s.prefs.workspaceOrder);
  const focus = useStore((s) => s.prefs.mapFocus);
  const ongoing = useStore((s) => s.prefs.mapOngoing);
  const setPrefs = useStore((s) => s.setPrefs);
  const today = useToday();

  const [looking, setLooking] = useState<Looking>(readLooking);
  const [lens, setLens] = useState<MapLens | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LOOKING_KEY, JSON.stringify(looking));
    } catch { /* A browser with storage blocked keeps the choice for the visit. */ }
  }, [looking]);

  /* The hook reads the range asked for and the one of the same length before
     it, so half the history is asked for and the whole of it comes back. */
  const range = useMemo(() => ({
    since: startOfDay(addDays(today, -(HISTORY_DAYS / 2 - 1))),
    until: endOfDay(today),
  }), [today]);
  const history = useCompleted(range, true);
  const completed = useMemo(
    () => [...history.data, ...history.previous],
    [history.data, history.previous],
  );

  const map = useMemo(() => buildProjectMap({
    groups: projectTree(snapshot, workspaceOrder),
    items, completed, childrenOf, ongoing, now: new Date(today.getTime() + 43_200_000),
  }), [snapshot, workspaceOrder, items, completed, childrenOf, ongoing, today]);

  /* A scope that names a space the account no longer has is "everything". */
  const scope = looking.scope !== 'all' && map.spaces.some((space) => space.id === looking.scope)
    ? looking.scope : 'all';

  /** In the space being looked at, and not in a part taken off the map. */
  const inScope = useCallback((node: MapNode): boolean => {
    if (scope !== 'all' && node.space !== scope) return false;
    const key = branchKey(map, node);
    return key === null || !looking.hidden.includes(key);
  }, [map, scope, looking.hidden]);

  /* What is drawn. A project whose status is switched off stays while one
     under it is still shown, or that one would hang from nothing; a folder
     or a space left with nothing to show goes with what it held. */
  const shown = useMemo(() => {
    const kept = new Set<string>([MAP_ROOT]);
    const off = new Set<MapStatus>(looking.statuses);
    const walk = (node: MapNode): boolean => {
      let below = false;
      for (const id of node.childIds) if (walk(map.nodes.get(id)!)) below = true;
      if (node.kind === 'root') return true;
      const keep = inScope(node) && (
        node.kind === 'space' ? scope === 'all' && (below || node.childIds.length === 0)
          : node.status === null ? below || node.childIds.length === 0
          : below || !off.has(node.status)
      );
      if (keep) kept.add(node.id);
      return keep;
    };
    walk(map.nodes.get(MAP_ROOT)!);
    return kept;
  }, [map, scope, inScope, looking.statuses]);
  const visible = useCallback((node: MapNode): boolean => shown.has(node.id), [shown]);

  const projects = useMemo(
    () => [...map.nodes.values()].filter((node) => node.status !== null && visible(node)),
    [map, visible],
  );
  const anyTime = projects.some((node) => node.minutes > 0);
  const sizeBy: SizeBy = looking.size === 'time' && anyTime ? 'time' : 'tasks';

  /* ---------------- the layout ---------------- */

  const layout = useMemo(() => {
    const measure = (node: MapNode) => (sizeBy === 'time' ? node.minutes : node.open);
    const most = projects.reduce((max, node) => Math.max(max, measure(node)), 0);
    const floor = sizeBy === 'time' ? 600 : 30;

    const build = (node: MapNode): LayoutNode => {
      /* One space on the map needs no hub: its projects hang from the centre. */
      const childIds = node.kind === 'root' && scope !== 'all'
        ? node.childIds.flatMap((id) => {
          const child = map.nodes.get(id)!;
          return child.kind === 'space' ? (child.space === scope ? child.childIds : []) : [id];
        })
        : node.childIds;
      const r = node.kind === 'root' ? ROOT_RADIUS
        : node.container ? HUB_RADIUS
        : Math.max(bubbleRadius(measure(node), most, { floor }), node.childIds.length > 0 ? HUB_RADIUS : 0);
      return {
        id: node.id, r,
        children: childIds.map((id) => map.nodes.get(id)!).filter(visible).map(build),
      };
    };
    return layoutMap(build(map.nodes.get(MAP_ROOT)!), { labelRoom: LABEL_ROOM, minClear: MIN_CLEAR });
  }, [map, projects, sizeBy, scope, visible]);

  const placed = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout],
  );
  /* Hubs are drawn last, so the name of a branch is never under one of its projects. */
  const drawn = useMemo(() => {
    const rank = (at: PlacedNode) => {
      const node = map.nodes.get(at.id);
      return !node ? 0 : node.kind === 'root' ? 2 : node.status === null ? 1 : 0;
    };
    return [...layout.nodes].sort((a, b) => rank(a) - rank(b));
  }, [layout, map]);
  const shownTotal = useMemo(() => projects.reduce((sum, node) => sum + node.open, 0), [projects]);
  /* A hub counts what is drawn under it, like the centre does. */
  const hubTotals = useMemo(() => {
    const totals = new Map<string, number>();
    const sum = (node: MapNode): number => {
      let total = node.status !== null && visible(node) ? node.open : 0;
      for (const id of node.childIds) total += sum(map.nodes.get(id)!);
      totals.set(node.id, total);
      return total;
    };
    sum(map.nodes.get(MAP_ROOT)!);
    return totals;
  }, [map, visible]);
  /* A hub's name goes on the side its projects are not: under a hub whose
     branch fans downwards, the name would sit among them. */
  const nameAbove = useMemo(() => {
    const above = new Set<string>();
    const sums = new Map<string, { y: number; count: number }>();
    for (const node of layout.nodes) {
      if (!node.parentId) continue;
      const sum = sums.get(node.parentId) ?? { y: 0, count: 0 };
      sum.y += node.y;
      sum.count += 1;
      sums.set(node.parentId, sum);
    }
    for (const [id, sum] of sums) {
      const hub = placed.get(id);
      if (hub && hub.parentId && sum.y / sum.count > hub.y + 1) above.add(id);
    }
    return above;
  }, [layout, placed]);

  /* ---------------- pan and zoom ---------------- */

  const stageRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, dragged: false, pinch: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setBox((was) => (was.width === rect.width && was.height === rect.height
        ? was : { width: rect.width, height: rect.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (box.width === 0 || box.height === 0) return;
    setView(fitTransform(layout.bounds, box.width, box.height, { minScale: MIN_SCALE }));
  }, [layout, box]);
  /* Whenever what is drawn changes, or the room to draw it in does. */
  useEffect(fit, [fit]);

  const zoomAt = useCallback((factor: number, at?: { x: number; y: number }) => {
    setView((was) => {
      const k = Math.max(MIN_SCALE, Math.min(MAX_SCALE, was.k * factor));
      const centre = at ?? { x: box.width / 2, y: box.height / 2 };
      const ratio = k / was.k;
      return { k, x: centre.x - (centre.x - was.x) * ratio, y: centre.y - (centre.y - was.y) * ratio };
    });
  }, [box]);

  /* The wheel zooms, and must be able to stop the page scrolling under it:
     React's own wheel listener is passive and cannot. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0016), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: 0, dragged: false, pinch: 0 };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = event.currentTarget.getBoundingClientRect();
      if (gesture.current.pinch > 0 && spread > 0) {
        zoomAt(spread / gesture.current.pinch, { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top });
      }
      gesture.current.pinch = spread;
      gesture.current.dragged = true;
      return;
    }

    gesture.current.moved += Math.abs(dx) + Math.abs(dy);
    if (!gesture.current.dragged && gesture.current.moved > DRAG_SLOP) {
      gesture.current.dragged = true;
      /* Only now: a pointer captured from the first press would take the
         click away from the project that was pressed. */
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (gesture.current.dragged) setView((was) => ({ ...was, x: was.x + dx, y: was.y + dy }));
  };
  const onPointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    gesture.current.pinch = 0;
  };

  /* ---------------- choosing ---------------- */

  const select = (id: string | null) => {
    setSelected(id);
    setNotice(null);
  };
  const reveal = (id: string) => {
    select(id);
    const at = placed.get(id);
    if (!at || box.width === 0) return;
    setView((was) => {
      const k = Math.max(was.k, 0.9);
      return { k, x: box.width / 2 - k * at.x, y: box.height / 2 - k * at.y };
    });
  };
  const flipLens = (next: MapLens) => setLens((was) => (was === next ? null : next));
  const flipBranch = (key: string) => setLooking((was) => ({
    ...was,
    hidden: was.hidden.includes(key) ? was.hidden.filter((other) => other !== key) : [...was.hidden, key],
  }));
  const flipStatus = (status: MapStatus) => setLooking((was) => ({
    ...was,
    statuses: was.statuses.includes(status)
      ? was.statuses.filter((other) => other !== status) : [...was.statuses, status],
  }));

  const inLens = useMemo(() => {
    if (!lens || lens === 'all') return null;
    return new Set(lensProjects(map, lens, { visible, focus }).map((node) => node.id));
  }, [map, lens, visible, focus]);
  const inFocus = useMemo(() => new Set(focus), [focus]);
  const selectedNode = selected ? map.nodes.get(selected) : undefined;
  const open = selectedNode && selectedNode.status !== null && visible(selectedNode) ? selectedNode : null;

  /* ---------------- the page ---------------- */

  const spaceName = (id: string, name: string | null) =>
    (id === PERSONAL_SPACE ? t('nav.myProjects') : name ?? t('nav.projects'));
  const nameOf = (node: MapNode): string => {
    if (node.kind === 'root') return 'Todoist';
    if (node.kind === 'space') return spaceName(node.space, node.name);
    return node.name ?? '';
  };
  /** Where a project sits: the names above it, outermost first. */
  const pathText = (node: MapNode): string => {
    const names: string[] = [];
    let above = node.parentId ? map.nodes.get(node.parentId) : undefined;
    while (above && above.kind !== 'root') {
      names.unshift(nameOf(above));
      above = above.parentId ? map.nodes.get(above.parentId) : undefined;
    }
    return names.join(' › ');
  };

  /* What each mark has written in it and under it. */
  const marks = drawn.flatMap((at) => {
    const node = map.nodes.get(at.id);
    if (!node) return [];
    const hub = node.status === null;
    const root = node.kind === 'root';
    const label = nameOf(node);
    const total = root ? shownTotal : hubTotals.get(at.id) ?? node.totalOpen;
    const value = root ? shownTotal : sizeBy === 'time' ? node.minutes : node.open;
    const counted = sizeBy === 'time' && !root ? formatDuration(value, locale) : String(value);
    const inside = root || (!hub && at.r >= 13 && value > 0);
    const text = root ? label
      : hub ? `${trim(label, 22)} · ${total}`
      : `${trim(label, 18)}${!inside && value > 0 ? ` · ${counted}` : ''}`;
    return [{
      at, node, hub, root, label, total, counted, inside, text,
      focused: inFocus.has(at.id),
      above: nameAbove.has(at.id) && hub,
      lit: inLens !== null && inLens.has(at.id),
    }];
  });

  /* Names are a constant size on the screen, so which of them fit depends on
     the zoom and on nothing else about the view: dragging the map moves them
     all together. */
  const named = pickLabels(marks.map((mark): LabelMark => {
    const { at, node } = mark;
    const k = view.k;
    const width = Array.from(mark.text).length * LABEL_PX * (mark.hub ? 0.6 : 0.56);
    const baseline = mark.above
      ? (at.y - at.r) * k - 6
      : (at.y + at.r + labelOffset(node, mark.focused)) * k + LABEL_PX + 2;
    return {
      id: at.id,
      x: at.x * k, y: at.y * k,
      r: (at.r + (node.finishable && node.progress > 0.005 ? ARC_REACH : 0)) * k,
      box: {
        x0: at.x * k - width / 2, x1: at.x * k + width / 2,
        y0: baseline - LABEL_PX * 0.85, y1: baseline + LABEL_PX * 0.25,
      },
      always: mark.hub || mark.focused || selected === at.id,
      weight: (mark.lit ? 10_000 : 0) + at.r,
    };
  }));

  const branches = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; total: number }>();
    for (const node of map.nodes.values()) {
      if (node.kind === 'root' || node.kind === 'space' || node.branchId !== node.id) continue;
      if (scope !== 'all' && node.space !== scope) continue;
      const key = branchKey(map, node);
      if (!key) continue;
      const loose = key.startsWith('loose:');
      const space = map.spaces.find((entry) => entry.id === node.space);
      const entry = seen.get(key) ?? {
        key, total: 0,
        /* With several spaces on the map, each has loose projects of its own. */
        label: !loose ? (node.name ?? '')
          : scope === 'all' && map.spaces.length > 1
            ? `${spaceName(node.space, space?.name ?? null)} · ${t('map.loose')}`
            : t('map.loose'),
      };
      entry.total += node.totalOpen;
      seen.set(key, entry);
    }
    return [...seen.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `spaceName` only reads `t`.
  }, [map, scope, t]);

  /* The statuses there is something to show or hide for: counted before the
     status filter itself, or a chip switched off would count nothing. */
  const statusChips = useMemo(() => {
    const counts = new Map<MapStatus, number>();
    for (const node of map.nodes.values()) {
      if (node.status !== null && inScope(node)) counts.set(node.status, (counts.get(node.status) ?? 0) + 1);
    }
    return MAP_STATUSES
      .filter((status) => (counts.get(status) ?? 0) > 0 || looking.statuses.includes(status))
      .map((status) => ({
        status, label: t(STATUS_KEY[status]), count: counts.get(status) ?? 0, hint: t(WHY_KEY[status]),
      }));
  }, [map, inScope, looking.statuses, t]);

  /* Hidden parts only count while they are parts of what is being looked at. */
  const hiddenBranches = branches.filter((branch) => looking.hidden.includes(branch.key)).length;
  const changed = Number(scope !== 'all') + Number(sizeBy === 'time')
    + Number(looking.statuses.length > 0) + Number(hiddenBranches > 0) + Number(looking.legend);

  const load = useMemo(() => {
    const counted = new Set(projects.map((node) => node.id));
    return summariseLoad(items.filter((item) => !item.parent_id && counted.has(item.project_id)), childrenOf, null);
  }, [items, projects, childrenOf]);

  const near = lensProjects(map, 'near', { visible });
  const moving = lensProjects(map, 'moving', { visible });
  const inWeek = lensProjects(map, 'week', { visible });
  const focusList = lensProjects(map, 'focus', { focus });
  const held = focusList.filter((node) => node.open > 0).length;
  const listLens: MapLens = lens ?? 'near';
  const list = lensProjects(map, listLens, { visible, focus });

  const toggleProjectFocus = (node: MapNode) => {
    const next = toggleFocus(map, focus, node.id);
    if (next === null) {
      setNotice(t('map.focusFull', { max: FOCUS_LIMIT }));
      return;
    }
    setNotice(null);
    setPrefs({ mapFocus: next });
  };
  const toggleOngoing = (node: MapNode) => {
    if (!node.project) return;
    setPrefs({ mapOngoing: { ...ongoing, [node.id]: !isOngoing(node.project, ongoing) } });
  };

  const legendText = t('map.legend', { measure: t(sizeBy === 'time' ? 'map.legendTime' : 'map.legendTasks') });
  const swatch = (status: MapStatus) => <i className={`mapsw st-${status}`} aria-hidden="true" />;

  const row = (node: MapNode): ReactNode => (
    <button className="maprow" key={node.id} onClick={() => reveal(node.id)}>
      {node.status && swatch(node.status)}
      <span className="maprow-name">
        <b>{node.name}</b>
        <small>{[pathText(node), node.status ? t(STATUS_KEY[node.status]) : ''].filter(Boolean).join(' · ')}</small>
      </span>
      <span className="maprow-count">{t('map.openCount', { count: node.open })}</span>
    </button>
  );

  const tile = (key: MapLens, count: number, label: string, hint: string, status?: MapStatus) => (
    <button
      className="maptile" key={key} aria-pressed={lens === key} title={hint}
      onClick={() => flipLens(key)}
    >
      <span className="maptile-num">{count}</span>
      <span className="maptile-label">{status && swatch(status)}{label}</span>
    </button>
  );

  const overview = (
    <>
      <section className="mapblock">
        <div className="maphead">
          <h2>{t('map.focus')} · {t('map.focusCount', { count: held, max: FOCUS_LIMIT })}</h2>
          {focusList.length > 0 && (
            <button className="maplink" onClick={() => flipLens('focus')}>
              {lens === 'focus' ? t('map.showAll') : t('map.focusOnly')}
            </button>
          )}
        </div>
        {focusList.length === 0
          ? <p className="maphint">{t('map.focusHint', { max: FOCUS_LIMIT })}</p>
          : (
            <div className="mapfocus">
              {focusList.map((node) => (
                <button className="mapfocus-item" key={node.id} onClick={() => reveal(node.id)}>
                  <b>{node.name}</b>
                  <small>{node.open > 0 ? t('map.openCount', { count: node.open }) : t('map.focusDone')}</small>
                </button>
              ))}
            </div>
          )}
      </section>

      <section className="mapblock">
        <h2>{t('map.projectsNow')}</h2>
        <div className="maptiles">
          {tile('moving', moving.length, t('map.status.moving'), t('map.why.moving'), 'moving')}
          {tile('stalled', lensProjects(map, 'stalled', { visible }).length, t('map.status.stalled'), t('map.why.stalled'), 'stalled')}
          {tile('near', near.length, t('map.near'), t('map.nearHint'))}
          {tile('unstarted', lensProjects(map, 'unstarted', { visible }).length, t('map.status.unstarted'), t('map.why.unstarted'), 'unstarted')}
        </div>
        {near.length > 0 && (
          <p className="maphint">
            {t('map.closes', {
              tasks: t('map.nTasks', { count: near.reduce((sum, node) => sum + node.open, 0) }),
              projects: t('map.nProjects', { count: near.length }),
            })}
          </p>
        )}
        {moving.length > FOCUS_LIMIT && (
          <p className="maphint">{t('map.moved', { projects: t('map.nProjects', { count: moving.length }) })}</p>
        )}
        {inWeek.length > 0 && (
          <p className="maphint">
            <button className="maplink" aria-pressed={lens === 'week'} title={t('map.weekHint')} onClick={() => flipLens('week')}>
              {t('map.weekSpread', { projects: t('map.nProjects', { count: inWeek.length }) })}
            </button>
          </p>
        )}
        {history.loading && <p className="maphint">{t('map.loading')}</p>}
        {history.error && (
          <p className="mapnotice">
            {t('map.historyError')}{' '}
            <button className="maplink" onClick={history.retry}>{t('sync.retry')}</button>
          </p>
        )}
      </section>

      <section className="mapblock">
        <div className="maphead">
          <h2>{t(LENS_TITLE[listLens])} · {list.length}</h2>
          <button className="maplink" onClick={() => flipLens('all')}>
            {lens === 'all' ? t('map.backToNear') : t('map.allProjects')}
          </button>
        </div>
        {list.length === 0
          ? <p className="maphint">{t('map.listEmpty')}</p>
          : <div className="maprows">{list.map(row)}</div>}
      </section>

      <details className="mapkey">
        <summary>{t('map.statuses')}</summary>
        <dl>
          {MAP_STATUSES.map((status) => (
            <div key={status}>
              <dt>{swatch(status)}{t(STATUS_KEY[status])}</dt>
              <dd>{t(WHY_KEY[status])}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );

  return (
    <div className="page wide map-page">
      <PageHeader
        title={t('map.title')}
        load={load}
        actions={(
          <MapDisplayMenu
            spaces={map.spaces.length > 1
              ? map.spaces.map((space) => ({ id: space.id, label: spaceName(space.id, space.name) })) : []}
            scope={scope}
            onScope={(next) => setLooking((was) => ({ ...was, scope: next }))}
            sizeBy={sizeBy}
            canSizeByTime={anyTime}
            onSize={(size) => setLooking((was) => ({ ...was, size }))}
            statuses={statusChips}
            hiddenStatuses={looking.statuses}
            onStatus={flipStatus}
            branches={branches}
            hiddenBranches={looking.hidden}
            onBranch={flipBranch}
            legend={looking.legend}
            onLegend={(legend) => setLooking((was) => ({ ...was, legend }))}
            help={legendText}
            changed={changed}
            onReset={() => setLooking(defaultLooking())}
          />
        )}
      />

      <div className="mapstage">
        <div className="mapcanvas">
          <svg
            ref={stageRef}
            role="img"
            aria-label={t('map.aria')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onClick={() => { if (!gesture.current.dragged) select(null); }}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {layout.nodes.map((at) => {
                const parent = at.parentId ? placed.get(at.parentId) : undefined;
                if (!parent) return null;
                const dim = inLens !== null && !inLens.has(at.id);
                return (
                  <line
                    key={`link-${at.id}`} className={`maplink-line${dim ? ' dim' : ''}`}
                    x1={parent.x} y1={parent.y} x2={at.x} y2={at.y}
                  />
                );
              })}
              {marks.map((mark) => (
                <MapMark
                  key={mark.at.id} at={mark.at} node={mark.node} scale={view.k}
                  text={mark.text} counted={mark.inside ? mark.counted : null}
                  tip={`${mark.label} · ${mark.node.status
                    ? t('map.tip', { status: t(STATUS_KEY[mark.node.status]), open: mark.node.open, done: mark.node.done14 })
                    : t('map.openCount', { count: mark.total })}`}
                  named={named.has(mark.at.id)}
                  selected={selected === mark.at.id}
                  above={mark.above}
                  focused={mark.focused}
                  dim={inLens !== null && !mark.lit && selected !== mark.at.id}
                  onPick={() => {
                    if (gesture.current.dragged) return;
                    select(mark.node.status !== null ? mark.node.id : null);
                  }}
                />
              ))}
            </g>
          </svg>

          {projects.length === 0 && <p className="mapnone">{t('map.none')}</p>}

          <div className="mapzoom">
            <button className="btn sm" aria-label={t('map.zoomIn')} title={t('map.zoomIn')} onClick={() => zoomAt(1.35)}>+</button>
            <button className="btn sm" aria-label={t('map.zoomOut')} title={t('map.zoomOut')} onClick={() => zoomAt(1 / 1.35)}>−</button>
            <button className="btn sm" onClick={fit}>{t('map.fit')}</button>
          </div>

          {looking.legend && (
            <div className="maplegend">
              {MAP_STATUSES.map((status) => (
                <span key={status} title={t(WHY_KEY[status])}>{swatch(status)}{t(STATUS_KEY[status])}</span>
              ))}
              <span>{legendText}</span>
            </div>
          )}
        </div>

        <aside className="mappanel" aria-live="polite">
          {open
            ? (
              <MapDetail
                node={open} path={pathText(open)} locale={locale}
                inFocus={inFocus.has(open.id)} notice={notice}
                ongoing={open.project ? isOngoing(open.project, ongoing) : false}
                onBack={() => select(null)}
                onFocus={() => toggleProjectFocus(open)}
                onOngoing={() => toggleOngoing(open)}
                onOpenTask={onOpen}
                swatch={swatch}
              />
            )
            : overview}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface MapMarkProps {
  at: PlacedNode;
  node: MapNode;
  scale: number;
  /** The name, with what is counted beside it when that does not fit inside. */
  text: string;
  /** What is written inside the mark, or null when nothing is. */
  counted: string | null;
  tip: string;
  /** Whether the name is written out: it gives way when it would cover something. */
  named: boolean;
  selected: boolean;
  /** Draws the name over the mark rather than under it. */
  above: boolean;
  focused: boolean;
  dim: boolean;
  onPick: () => void;
}

/**
 * One mark: a project, or the hub of the projects around it.
 *
 * The name is a constant size on the screen whatever the zoom, and is left
 * out where it would run over another name or another project (`pickLabels`)
 * — unless the mark is a hub, in focus, or the one being asked about.
 */
function MapMark({
  at, node, scale, text, counted, tip, named, selected, above, focused, dim, onPick,
}: MapMarkProps) {
  const hub = node.status === null;
  const root = node.kind === 'root';
  const size = LABEL_PX / scale;
  const showCount = counted !== null && (root || at.r * scale >= 8.5);
  /* As large as the mark allows, and never wider than it. */
  const countSize = root ? 14
    : Math.max(8, Math.min(at.r * 0.62, 19, (at.r * 1.7) / (Array.from(counted ?? '').length * 0.58 || 1)));

  return (
    <g
      className={[
        'mapmark', root ? 'root' : hub ? 'hub' : `st-${node.status}`,
        selected ? 'selected' : '', dim ? 'dim' : '',
      ].filter(Boolean).join(' ')}
      data-map-node={node.id}
      transform={`translate(${at.x} ${at.y})`}
      onClick={(event) => { event.stopPropagation(); onPick(); }}
    >
      <title>{tip}</title>
      {focused && <circle className="mapmark-focus" r={at.r + 11} />}
      {node.finishable && node.progress > 0.005 && (
        <path className="mapmark-arc" d={arcPath(at.r + 3, at.r + ARC_REACH, node.progress)} />
      )}
      <circle className="mapmark-body" r={at.r} />
      {showCount && (
        <text className="mapmark-count" fontSize={countSize}>{counted}</text>
      )}
      {named && (
        <text
          className="mapmark-label" fontSize={size} strokeWidth={3.2 / scale}
          y={above ? -(at.r + 6 / scale) : at.r + labelOffset(node, focused) + size + 2 / scale}
        >
          {text}
        </text>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */

interface MapDetailProps {
  node: MapNode;
  path: string;
  locale: 'en' | 'fr';
  inFocus: boolean;
  ongoing: boolean;
  notice: string | null;
  onBack: () => void;
  onFocus: () => void;
  onOngoing: () => void;
  onOpenTask: (id: string) => void;
  swatch: (status: MapStatus) => ReactNode;
}

const SHOWN_TASKS = 12;

/** The tasks worth reading first: the earliest date, then the highest priority, then the newest. */
function firstTasks(tasks: Item[]): Item[] {
  const when = (item: Item) => dueDate(item)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const added = (item: Item) => Date.parse(item.added_at ?? '') || 0;
  return [...tasks].sort((a, b) => when(a) - when(b) || b.priority - a.priority || added(b) - added(a));
}

function MapDetail({
  node, path, locale, inFocus, ongoing, notice, onBack, onFocus, onOngoing, onOpenTask, swatch,
}: MapDetailProps) {
  const { t } = useT();
  const now = new Date();
  const status = node.status!;
  const tasks = firstTasks(node.tasks);
  const stats: Array<[string, string]> = [
    [String(node.open), t('map.stat.open')],
    [String(node.overdue), t('map.stat.overdue')],
    [String(node.done14), t('map.stat.done14')],
    [String(node.done90), t('map.stat.done90')],
  ];
  if (node.week > 0) stats.push([String(node.week), t('map.stat.week')]);
  if (node.minutes > 0) stats.push([formatDuration(node.minutes, locale), t('map.stat.time')]);

  return (
    <>
      <section className="mapblock">
        <button className="maplink mapback" onClick={onBack}>
          <Icon name="arrow-left" size="sm" />{t('map.back')}
        </button>
        <h2 className="mapdetail-title">{node.name}</h2>
        <p className="mapstatus">{swatch(status)}{t(STATUS_KEY[status])}</p>
        <p className="maphint">{[path, t(WHY_KEY[status])].filter(Boolean).join(' · ')}</p>
      </section>

      <section className="mapblock">
        <div className="mapstats">
          {stats.map(([value, label]) => (
            <div className="mapstat" key={label}><b>{value}</b><small>{label}</small></div>
          ))}
        </div>
        {node.done90 + node.open > 0 && (
          <>
            <div className={`mapmeter st-${status}`}><i style={{ width: `${Math.round(node.progress * 100)}%` }} /></div>
            <p className="maphint">
              {t('map.progress', { percent: Math.round(node.progress * 100) })}{' '}
              {node.lastDone !== null
                ? t('map.lastDone', { when: formatTimeAgo(new Date(node.lastDone), locale, now) })
                : t('map.noneDone')}
            </p>
          </>
        )}
      </section>

      <section className="mapblock">
        <div className="mapactions">
          <button className={`btn sm${inFocus ? ' outline' : ''}`} aria-pressed={inFocus} onClick={onFocus}>
            <Icon name="star" size="sm" />{inFocus ? t('map.focusRemove') : t('map.focusAdd')}
          </button>
          <button className="btn sm" title={t('map.ongoingHint')} onClick={onOngoing}>
            {ongoing ? t('map.markFinishable') : t('map.markOngoing')}
          </button>
          <button className="btn sm" onClick={() => navigate('project', node.id)}>
            <Icon name="arrow-right" size="sm" />{t('map.openProject')}
          </button>
        </div>
        {notice && <p className="mapnotice">{notice}</p>}
      </section>

      <section className="mapblock">
        <h2>{t('map.openTasks')} · {node.open}</h2>
        {tasks.length === 0
          ? <p className="maphint">{t('map.nothingOpen')}</p>
          : (
            <ul className="maptasks">
              {tasks.slice(0, SHOWN_TASKS).map((task) => {
                const date = dueDate(task);
                const late = bucketOf(task, now) === 'overdue';
                return (
                  <li key={task.id}>
                    <button onClick={() => onOpenTask(task.id)}>
                      <span>{plainTitle(displayTaskContent(task))}</span>
                      {date && <small className={late ? 'late' : ''}>{formatRelativeDay(date, locale, now)}</small>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        {tasks.length > SHOWN_TASKS && (
          <p className="maphint">{t('map.more', { count: tasks.length - SHOWN_TASKS })}</p>
        )}
      </section>
    </>
  );
}
