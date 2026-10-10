import { describe, expect, it } from 'vitest';
import {
  arcPath, bubbleRadius, fitTransform, layoutMap, type LayoutNode, type PlacedNode,
} from './mapLayout';

const leaf = (id: string, r = 10): LayoutNode => ({ id, r, children: [] });
const hub = (id: string, children: LayoutNode[], r = 13): LayoutNode => ({ id, r, children });
const many = (prefix: string, count: number, r = 10) =>
  Array.from({ length: count }, (_, i) => leaf(`${prefix}${i}`, r + (i % 4) * 6));

const OPTIONS = { labelRoom: 20, minClear: 44, gap: 6 };
/** The clusters as first drawn, before the marks settle. */
const DRAWN = { ...OPTIONS, settle: false };
const clear = (node: PlacedNode) => Math.max(node.r + OPTIONS.labelRoom, OPTIONS.minClear);
const distance = (a: PlacedNode, b: PlacedNode) => Math.hypot(a.x - b.x, a.y - b.y);

/** Every pair of marks keeps its label room, whichever branches they are in. */
function overlaps(nodes: PlacedNode[], tolerance = 0.001): string[] {
  const found: string[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (distance(nodes[i], nodes[j]) < clear(nodes[i]) + clear(nodes[j]) - tolerance) {
        found.push(`${nodes[i].id}/${nodes[j].id}`);
      }
    }
  }
  return found;
}

const crowded = () => hub('root', [
  hub('work', many('w', 14)), hub('team', [hub('cars', many('c', 12)), hub('boats', many('b', 9))]),
  hub('home', [hub('recipes', many('r', 3), 48), ...many('h', 5)]), ...many('loose', 4, 30),
]);
const area = ({ bounds }: { bounds: { x0: number; y0: number; x1: number; y1: number } }) =>
  (bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0);

describe('layoutMap', () => {
  it('puts the root at the centre and names every node once', () => {
    const tree = hub('root', [hub('a', many('a', 5)), hub('b', many('b', 3)), leaf('c')]);
    const { nodes } = layoutMap(tree, OPTIONS);
    expect(nodes.find((n) => n.id === 'root')).toMatchObject({ x: 0, y: 0, parentId: null });
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ['root', 'a', 'b', 'c', ...many('a', 5).map((n) => n.id), ...many('b', 3).map((n) => n.id)].sort(),
    );
    expect(nodes.find((n) => n.id === 'a2')?.parentId).toBe('a');
  });

  it('never lets two marks overlap, in one ring or in several', () => {
    const few = hub('root', [hub('a', many('a', 4)), hub('b', many('b', 2))]);
    expect(overlaps(layoutMap(few, DRAWN).nodes)).toEqual([]);
    expect(overlaps(layoutMap(crowded(), DRAWN).nodes)).toEqual([]);
  });

  it('settles into less paper without letting marks touch, and keeps the root at the centre', () => {
    const drawn = layoutMap(crowded(), DRAWN);
    const settled = layoutMap(crowded(), OPTIONS);
    expect(overlaps(settled.nodes, 1)).toEqual([]);
    expect(area(settled)).toBeLessThan(area(drawn) * 0.6);
    expect(settled.nodes.find((n) => n.id === 'root')).toMatchObject({ x: 0, y: 0 });
    for (const node of settled.nodes) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
    }
  });

  it('settles wider than tall, as a window is', () => {
    const { bounds } = layoutMap(crowded(), OPTIONS);
    expect(bounds.x1 - bounds.x0).toBeGreaterThan(bounds.y1 - bounds.y0);
  });

  it('keeps the lines short: no project drifts away from the hub it hangs from', () => {
    const { nodes } = layoutMap(crowded(), OPTIONS);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    /* Fourteen marks round one hub take three rings; nothing should be a ring further out than that. */
    const furthest = Math.max(28 + OPTIONS.labelRoom, OPTIONS.minClear) * 2 * 3.5;
    for (const node of nodes) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (!parent || !['work', 'cars', 'boats'].includes(parent.id)) continue;
      expect(distance(node, parent), `${node.id} is far from ${parent.id}`).toBeLessThan(furthest);
    }
  });

  it('puts two branches of the root side by side rather than one above the other', () => {
    const { nodes } = layoutMap(hub('root', [leaf('first'), leaf('second')]), DRAWN);
    const first = nodes.find((n) => n.id === 'first')!;
    const second = nodes.find((n) => n.id === 'second')!;
    expect(first.x).toBeLessThan(0);
    expect(second.x).toBeGreaterThan(0);
    expect(Math.abs(first.y) + Math.abs(second.y)).toBeLessThan(1);
  });

  it('first draws a branch fanned away from its parent, so the line between them crosses no mark', () => {
    const trees = [
      hub('root', [hub('a', many('a', 2)), hub('b', many('b', 2))]),
      hub('root', [hub('a', many('a', 14)), hub('b', [hub('c', many('c', 11)), ...many('b', 3)]), leaf('d')]),
    ];
    for (const tree of trees) {
      const { nodes } = layoutMap(tree, DRAWN);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      for (const child of nodes) {
        const parent = child.parentId ? byId.get(child.parentId) : undefined;
        if (!parent) continue;
        /* How near each sibling's centre comes to the segment child → parent. */
        for (const other of nodes) {
          if (other.id === child.id || other.id === parent.id) continue;
          const dx = parent.x - child.x;
          const dy = parent.y - child.y;
          const along = Math.max(0, Math.min(1,
            ((other.x - child.x) * dx + (other.y - child.y) * dy) / (dx * dx + dy * dy)));
          const gap = Math.hypot(other.x - (child.x + along * dx), other.y - (child.y + along * dy));
          expect(gap, `${child.id} → ${parent.id} runs through ${other.id}`).toBeGreaterThan(other.r);
        }
      }
    }
  });

  it('lands the same tree in the same place every time', () => {
    const tree = () => hub('root', [hub('a', many('a', 11)), hub('b', many('b', 6)), ...many('c', 3)]);
    expect(layoutMap(tree(), OPTIONS)).toEqual(layoutMap(tree(), OPTIONS));
  });

  it('reports bounds that hold every mark and its label room', () => {
    const { nodes, bounds } = layoutMap(hub('root', [hub('a', many('a', 9)), ...many('b', 4)]), OPTIONS);
    for (const node of nodes) {
      expect(node.x - clear(node)).toBeGreaterThanOrEqual(bounds.x0 - 0.001);
      expect(node.x + clear(node)).toBeLessThanOrEqual(bounds.x1 + 0.001);
      expect(node.y - clear(node)).toBeGreaterThanOrEqual(bounds.y0 - 0.001);
      expect(node.y + clear(node)).toBeLessThanOrEqual(bounds.y1 + 0.001);
    }
  });
});

describe('bubbleRadius', () => {
  it('grows with the area, not the radius', () => {
    const one = bubbleRadius(25, 100, { min: 0, max: 40, floor: 0 });
    const four = bubbleRadius(100, 100, { min: 0, max: 40, floor: 0 });
    expect(four).toBeCloseTo(one * 2);
  });

  it('keeps an empty project visible and the largest inside the range', () => {
    expect(bubbleRadius(0, 80)).toBe(7);
    expect(bubbleRadius(80, 80)).toBe(54);
    expect(bubbleRadius(500, 80)).toBe(54);
  });

  it('does not blow up a map of small projects', () => {
    expect(bubbleRadius(3, 3)).toBeLessThan(25);
  });
});

describe('fitTransform', () => {
  it('centres the layout and scales it to the smaller side', () => {
    const fit = fitTransform({ x0: -200, y0: -100, x1: 200, y1: 100 }, 800, 800, { margin: 0, maxScale: 10 });
    expect(fit.k).toBeCloseTo(2);
    expect(fit.x).toBeCloseTo(400);
    expect(fit.y).toBeCloseTo(400);
  });

  it('does not magnify a small map past the limit', () => {
    expect(fitTransform({ x0: -10, y0: -10, x1: 10, y1: 10 }, 1000, 1000).k).toBe(1.5);
  });
});

describe('arcPath', () => {
  it('draws nothing for no progress, and stops short of closing on itself', () => {
    expect(arcPath(10, 14, 0)).toBe('');
    expect(arcPath(10, 14, 1)).toContain('A 14 14 0 1 1');
    expect(arcPath(10, 14, 0.25)).toContain('A 14 14 0 0 1 14.00 -0.00');
  });
});
