/**
 * Where each mark of the project map goes.
 *
 * In two steps. First the tree is drawn as clusters: a node sits by the things
 * it holds, and each of those, with everything it holds in turn, is packed
 * around it as one disc. That gives every branch a place of its own, with no
 * two marks overlapping and no branch tangled in another — but with a lot of
 * empty paper between the discs. So the marks are then let settle: each is
 * drawn towards its parent like a weight on a spring, nothing is allowed to
 * overlap, and the whole is pulled gently towards the centre, a little harder
 * from above and below than from the sides, because a window is wider than
 * it is tall.
 *
 * Worked out, not left to chance: there is no random number anywhere in it,
 * so the same tree always lands in the same place. A project is found where
 * it was yesterday, and nothing moves while the page is being read.
 */

export interface LayoutNode {
  id: string;
  /** The radius the mark is drawn at. */
  r: number;
  children: LayoutNode[];
}

export interface PlacedNode {
  id: string;
  parentId: string | null;
  x: number;
  y: number;
  r: number;
}

export interface MapLayout {
  nodes: PlacedNode[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

export interface LayoutOptions {
  /** Room kept around a mark for its label. */
  labelRoom?: number;
  /** The least room a mark takes, however small it is drawn. */
  minClear?: number;
  /** Space left between two discs. */
  gap?: number;
  /** The second step. Off, the clusters are returned as first drawn. */
  settle?: boolean;
}

interface Packed {
  node: LayoutNode;
  /** The disc that holds the node and everything under it. */
  radius: number;
  /**
   * How far that disc's centre is from the node, along the line away from its
   * parent (never towards it). A branch fans away from its parent, so a disc
   * centred on the node would be half empty and hold the node far from where
   * it hangs; centred on what it holds, the line to the parent is short.
   */
  shift: number;
  /**
   * Where its children sit, in the node's own frame: the node at the origin
   * and its parent straight below it (`BACK`). The frame is turned to face
   * away from the real parent when the node is placed.
   */
  children: Array<{ packed: Packed; x: number; y: number }>;
}

/** How finely the ring around a node is searched for a free place. */
const ANGLE_STEPS = 96;
const DISTANCE_STEP = 5;
const TURN = Math.PI * 2;
/** Straight up: "away from the parent", in a node's own frame. */
const AWAY = -Math.PI / 2;
/** To the left: where the first branch of the root goes, so two branches sit side by side in a wide window. */
const FIRST = Math.PI;
/** Straight down: where a node's parent is, in the node's own frame. */
const BACK = Math.PI / 2;
/** The slice kept clear on each side of the line back to the parent. */
const BACK_MARGIN = 0.2;
/** The most room left between two children of a branch, so a few of them stay together, facing out. */
const MAX_SPARE = 0.3;

/** The angle a disc of this radius covers, seen from this far away, on each side of its centre. */
const halfAngle = (radius: number, distance: number): number =>
  Math.asin(Math.min(1, radius / distance));

/** How far apart two directions are, 0 to π. */
const between = (a: number, b: number): number => {
  const turn = Math.abs(a - b) % TURN;
  return turn > Math.PI ? TURN - turn : turn;
};

/**
 * The children in one ring, evenly spread, when they all fit in one.
 *
 * Seen from the node, a disc at distance `d` with radius `R` covers an angle of
 * `2·asin(R / d)`, and two discs whose angles do not overlap cannot touch,
 * whatever their distances. So if the angles add up to less than the room
 * there is, every child gets its own slice and what is left over is shared out
 * between them — which is what keeps two branches apart instead of side by
 * side. They go round clockwise in the tree's own order.
 *
 * The root has the whole turn. Any other node keeps the slice towards its
 * parent clear, so the line that joins them never runs through a child, and
 * fans its children out on the far side: two of them sit together facing
 * away, not one on each flank.
 */
function ring(
  packs: Packed[], clear: number, gap: number, isRoot: boolean,
): Packed['children'] | null {
  const slots = packs.map((packed) => {
    const distance = clear + packed.radius + gap;
    return { packed, distance, half: halfAngle(packed.radius + gap / 2, distance) };
  });
  const room = isRoot ? TURN : TURN - BACK_MARGIN * 2;
  const taken = slots.reduce((sum, slot) => sum + slot.half * 2, 0);
  if (taken > room) return null;

  /* Round the root the spare room is shared out evenly and the first child is
     centred on the left. Round any other node the fan is centred on the way
     out, and only opens as wide as it needs. */
  const spare = isRoot
    ? (room - taken) / slots.length
    : Math.min(MAX_SPARE, (room - taken) / slots.length);
  let angle = isRoot
    ? FIRST - slots[0].half
    : AWAY - (taken + spare * (slots.length - 1)) / 2;
  return slots.map((slot) => {
    const at = angle + slot.half;
    angle += slot.half * 2 + spare;
    return { packed: slot.packed, x: Math.cos(at) * slot.distance, y: Math.sin(at) * slot.distance };
  });
}

/** How near a point comes to the straight line from `from` to the node at the origin. */
function offLine(from: { x: number; y: number }, point: { x: number; y: number }): number {
  const length = from.x * from.x + from.y * from.y;
  const along = length === 0 ? 0 : Math.max(0, Math.min(1, (point.x * from.x + point.y * from.y) / length));
  return Math.hypot(point.x - from.x * along, point.y - from.y * along);
}

/**
 * The room a sibling needs kept clear of another sibling's line to the node.
 *
 * A cluster needs its whole disc: a line through it would cross whatever it
 * holds. A single mark only needs itself and a little air, which is what lets
 * an outer ring reach the centre between the marks of an inner one.
 */
const lineRoom = (packed: Packed, strict: boolean): number =>
  (strict && packed.children.length > 0 ? packed.radius : packed.node.r + 6);

/** How many steps outwards a rule is held to before it is given up for a looser one. */
const PATIENCE = 60;

/**
 * The children packed as close as they go, when one ring will not hold them.
 *
 * The largest go first and take the places nearest the centre; the small ones
 * then fill what is left between them. Among equals the tree's own order
 * decides, so the picture is the same every time.
 *
 * With more than one ring, a child further out is joined to the node by a
 * line that passes the nearer ones. It is placed so that line runs between
 * them, never through one: a line that disappears behind another project
 * reads as hanging from it. Round a node ringed solid with clusters there is
 * no such gap, so the rule gives way by steps instead of pushing the child
 * out for ever: first to marks alone, then to nothing.
 */
function spiral(
  packs: Packed[], clear: number, gap: number, isRoot: boolean,
): Packed['children'] {
  const order = packs
    .map((packed, index) => ({ packed, index }))
    .sort((a, b) => b.packed.radius - a.packed.radius || a.index - b.index);

  const placed: Packed['children'] = [];
  let angle = isRoot ? FIRST : AWAY;

  for (const { packed } of order) {
    const apart = (x: number, y: number) => placed.every((other) =>
      Math.hypot(x - other.x, y - other.y) >= packed.radius + other.packed.radius + gap);
    const linesClear = (x: number, y: number, strict: boolean) => placed.every((other) =>
      offLine({ x, y }, other) >= lineRoom(other.packed, strict)
      && offLine(other, { x, y }) >= lineRoom(packed, strict));

    let spot: { x: number; y: number; angle: number } | undefined;
    let steps = 0;
    for (let distance = clear + packed.radius + gap; !spot; distance += DISTANCE_STEP, steps += 1) {
      /* Off the line back to the parent, by its own width and a margin. */
      const keepOff = isRoot ? 0 : halfAngle(packed.radius, distance) + BACK_MARGIN / 2;
      for (let step = 0; step < ANGLE_STEPS && !spot; step += 1) {
        /* Onwards from the last one placed, so siblings go round the node in
           turn instead of piling up on one side of it. */
        const at = angle + (step / ANGLE_STEPS) * TURN;
        if (!isRoot && between(at, BACK) < keepOff) continue;
        const x = Math.cos(at) * distance;
        const y = Math.sin(at) * distance;
        if (!apart(x, y)) continue;
        if (steps < PATIENCE * 2 && !linesClear(x, y, steps < PATIENCE)) continue;
        spot = { x, y, angle: at };
      }
    }

    placed.push({ packed, x: spot.x, y: spot.y });
    angle = spot.angle;
  }
  return placed;
}

/** How finely the place of a branch's disc is searched along its axis. */
const SHIFT_STEPS = 48;

/**
 * The smallest disc that holds a node and its children, with its centre on the
 * line away from the node's parent. The root's is centred on the root.
 */
function enclose(
  clear: number, children: Packed['children'], isRoot: boolean,
): { radius: number; shift: number } {
  const reach = (shift: number) => children.reduce(
    (most, child) => Math.max(most, Math.hypot(child.x, child.y - shift) + child.packed.radius),
    clear + Math.abs(shift),
  );
  if (isRoot) return { radius: reach(0), shift: 0 };

  /* Somewhere between the node and its furthest child, on the way out. */
  const furthest = children.reduce((most, child) => Math.min(most, child.y - child.packed.radius), 0);
  let best = { radius: reach(0), shift: 0 };
  for (let step = 1; step <= SHIFT_STEPS; step += 1) {
    const shift = (furthest * step) / SHIFT_STEPS;
    const radius = reach(shift);
    if (radius < best.radius) best = { radius, shift };
  }
  return best;
}

function pack(node: LayoutNode, options: Required<LayoutOptions>, isRoot: boolean): Packed {
  const clear = Math.max(node.r + options.labelRoom, options.minClear);
  if (node.children.length === 0) return { node, radius: clear, shift: 0, children: [] };

  const packs = node.children.map((child) => pack(child, options, false));
  /* Placed by the centres of their discs, which is what must not overlap. */
  const children = ring(packs, clear, options.gap, isRoot) ?? spiral(packs, clear, options.gap, isRoot);
  return { node, ...enclose(clear, children, isRoot), children };
}

/** How many rounds the marks are given to settle, and how many more to stop touching. */
const SETTLE_ROUNDS = 260;
const UNTANGLE_ROUNDS = 40;
/** How much slack a line to a parent has beyond the two marks it joins. */
const LINE_SLACK = 40;

/**
 * Lets the marks settle from where the clusters put them (see the top).
 *
 * Plain relaxation, in a fixed order with fixed constants. Each round pulls
 * every child towards the right distance from its parent, pulls everything
 * towards the centre, and then pushes apart whatever overlaps; the pulls fade
 * out over the rounds and the pushing does not, so the last thing that
 * happens to any two marks is that they stop touching.
 */
function settle(nodes: PlacedNode[], settings: Required<LayoutOptions>): void {
  if (nodes.length < 3) return;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const clear = nodes.map((node) => Math.max(node.r + settings.labelRoom, settings.minClear));
  const links = nodes
    .map((node, i) => ({ child: i, parent: node.parentId === null ? -1 : index.get(node.parentId) ?? -1 }))
    .filter((link) => link.parent >= 0);

  const separate = () => {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const need = clear[i] + clear[j] + settings.gap;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= need) continue;
        if (distance < 0.01) {
          /* Two marks on the same spot have no direction to part in: one is
             given, the same every time. */
          dx = 1 + (i % 3);
          dy = 1 + (j % 5);
          distance = Math.hypot(dx, dy);
        }
        const push = (need - distance) / distance / 2;
        /* The root stays at the centre; whatever touches it gives all the way. */
        const aFixed = a.parentId === null;
        const bFixed = b.parentId === null;
        if (!aFixed) { a.x -= dx * push * (bFixed ? 2 : 1); a.y -= dy * push * (bFixed ? 2 : 1); }
        if (!bFixed) { b.x += dx * push * (aFixed ? 2 : 1); b.y += dy * push * (aFixed ? 2 : 1); }
      }
    }
  };

  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    const heat = 1 - round / SETTLE_ROUNDS;
    for (const link of links) {
      const child = nodes[link.child];
      const parent = nodes[link.parent];
      const rest = child.r + parent.r + LINE_SLACK;
      const dx = child.x - parent.x;
      const dy = child.y - parent.y;
      const distance = Math.hypot(dx, dy) || 1;
      const pull = ((distance - rest) / distance) * 0.3 * heat;
      /* A parent with the whole map hanging from it would be dragged about by
         every child; it gives a little, the child gives most. */
      const give = parent.parentId === null ? 0 : 0.25;
      child.x -= dx * pull * (1 - give);
      child.y -= dy * pull * (1 - give);
      parent.x += dx * pull * give;
      parent.y += dy * pull * give;
    }
    for (const node of nodes) {
      if (node.parentId === null) continue;
      node.x -= node.x * 0.012 * heat;
      node.y -= node.y * 0.03 * heat;
    }
    separate();
  }
  for (let round = 0; round < UNTANGLE_ROUNDS; round += 1) separate();
}

/** Lays a tree out around its root, which lands on (0, 0). */
export function layoutMap(root: LayoutNode, options: LayoutOptions = {}): MapLayout {
  const settings: Required<LayoutOptions> = {
    labelRoom: options.labelRoom ?? 20,
    minClear: options.minClear ?? 44,
    gap: options.gap ?? 6,
    settle: options.settle ?? true,
  };
  const nodes: PlacedNode[] = [];

  /* `turn` is how far the node's own frame is turned so that its "back" points
     at its real parent. Turning a cluster about its centre keeps it inside its
     disc, so nothing that did not overlap before can overlap after. */
  const place = (packed: Packed, x: number, y: number, parentId: string | null, turn: number) => {
    const { node } = packed;
    nodes.push({ id: node.id, parentId, x, y, r: node.r });
    for (const child of packed.children) {
      const at = Math.atan2(child.y, child.x) + turn;
      /* The child itself sits short of its disc's centre, nearer this node. */
      const distance = Math.hypot(child.x, child.y) + child.packed.shift;
      /* The child's parent is behind it, the way it came: opposite `at`. */
      place(child.packed, x + Math.cos(at) * distance, y + Math.sin(at) * distance, node.id, at + Math.PI - BACK);
    }
  };
  place(pack(root, settings, true), 0, 0, null, 0);
  if (settings.settle) settle(nodes, settings);

  const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const node of nodes) {
    const reach = Math.max(node.r + settings.labelRoom, settings.minClear);
    bounds.x0 = Math.min(bounds.x0, node.x - reach);
    bounds.x1 = Math.max(bounds.x1, node.x + reach);
    bounds.y0 = Math.min(bounds.y0, node.y - reach);
    bounds.y1 = Math.max(bounds.y1, node.y + reach);
  }
  return { nodes, bounds };
}

/**
 * The radius a project is drawn at for what it holds.
 *
 * By area, not by radius: a project with four times the tasks covers four
 * times the paper, which is what the eye compares. `max` is the largest value
 * on the map, and never less than `floor`, so a map of small projects is not
 * blown up until three tasks look like a mountain.
 */
export function bubbleRadius(
  value: number, max: number,
  range: { min?: number; max?: number; floor?: number } = {},
): number {
  const least = range.min ?? 7;
  const most = range.max ?? 54;
  const top = Math.max(range.floor ?? 30, max);
  const share = Math.max(0, Math.min(1, value / top));
  return least + (most - least) * Math.sqrt(share);
}

/** The scale and offset that show the whole layout inside a box, with a margin. */
export function fitTransform(
  bounds: MapLayout['bounds'], width: number, height: number,
  limits: { margin?: number; maxScale?: number; minScale?: number } = {},
): { x: number; y: number; k: number } {
  const margin = limits.margin ?? 16;
  const spanX = Math.max(1, bounds.x1 - bounds.x0);
  const spanY = Math.max(1, bounds.y1 - bounds.y0);
  const k = Math.max(
    limits.minScale ?? 0.12,
    Math.min(
      limits.maxScale ?? 1.5,
      (width - margin * 2) / spanX,
      (height - margin * 2) / spanY,
    ),
  );
  return {
    k,
    x: width / 2 - k * (bounds.x0 + bounds.x1) / 2,
    y: height / 2 - k * (bounds.y0 + bounds.y1) / 2,
  };
}

/** A ring segment from the top of a circle, clockwise, as an SVG path. */
export function arcPath(inner: number, outer: number, share: number): string {
  const sweep = Math.max(0, Math.min(0.9999, share)) * Math.PI * 2;
  if (sweep <= 0) return '';
  const point = (radius: number, angle: number) =>
    `${(Math.sin(angle) * radius).toFixed(2)} ${(-Math.cos(angle) * radius).toFixed(2)}`;
  const large = sweep > Math.PI ? 1 : 0;
  return [
    `M ${point(outer, 0)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${point(outer, sweep)}`,
    `L ${point(inner, sweep)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${point(inner, 0)}`,
    'Z',
  ].join(' ');
}

/** A mark as it is on the screen, with the place its name would take. */
export interface LabelMark {
  id: string;
  /** The centre and radius of the mark, in screen pixels. */
  x: number;
  y: number;
  r: number;
  /** The box the name would fill, in the same pixels. */
  box: { x0: number; y0: number; x1: number; y1: number };
  /** Named whatever it covers: a hub, or the mark being asked about. */
  always?: boolean;
  /** Among the rest, the heavier mark is named first. */
  weight: number;
}

/**
 * Which marks get their name written out.
 *
 * A name that runs over another name, or over another project, tells the eye
 * less than no name at all: every mark still says what it is on hover and in
 * the list beside the map, and zooming in pulls the marks apart until their
 * names fit. So the names are handed out heaviest first, and a name only
 * lands where it covers nothing already drawn.
 */
export function pickLabels(marks: LabelMark[], gap = 3): Set<string> {
  const named = new Set<string>();
  const taken: Array<LabelMark['box']> = [];
  const overlaps = (a: LabelMark['box'], b: LabelMark['box']) =>
    a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
  const covers = (box: LabelMark['box'], mark: LabelMark) => {
    const dx = mark.x - Math.max(box.x0, Math.min(mark.x, box.x1));
    const dy = mark.y - Math.max(box.y0, Math.min(mark.y, box.y1));
    return dx * dx + dy * dy < mark.r * mark.r;
  };
  const order = marks
    .map((mark, index) => ({ mark, index }))
    .sort((a, b) => Number(b.mark.always ?? false) - Number(a.mark.always ?? false)
      || b.mark.weight - a.mark.weight || a.index - b.index);

  for (const { mark } of order) {
    if (!mark.always) {
      if (taken.some((box) => overlaps(mark.box, box))) continue;
      if (marks.some((other) => other.id !== mark.id && covers(mark.box, other))) continue;
    }
    named.add(mark.id);
    taken.push(mark.box);
  }
  return named;
}
