// Growing the forest on a new cube (issue #70 item 2; decision note 0020),
// checked over many seeds, and the surface data table.

import { describe, expect, it } from 'vitest';
import { BLOCKS, ITEMS, SURFACE, WORLD, validateSurfaceData } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { blockAt, createRun, isRevealed, surfaceKindAt } from '../../src/engine';
import type { GameState } from '../../src/engine';

const SEEDS = Array.from({ length: 150 }, (_, index) => index + 1);
const KINDS = SURFACE.kinds;

/** The kind code of the surface cell over column (x, y). */
function kindAt(state: GameState, x: number, y: number): number {
  return surfaceKindAt(state, { x, y, z: WORLD.surfaceZ });
}

/**
 * The surface cells a miner can walk to from the start without cutting a
 * tree, as "x,y" strings: a flood fill over the open kinds.
 */
function openGroundFromStart(state: GameState): Set<string> {
  const start = WORLD.startPosition;
  const reached = new Set<string>([`${start.x},${start.y}`]);
  let frontier: Vec3[] = [start];
  while (frontier.length > 0) {
    const next: Vec3[] = [];
    for (const cell of frontier) {
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        const key = `${x},${y}`;
        const inside = x >= 0 && x < state.size.x && y >= 0 && y < state.size.y;
        if (!inside || reached.has(key) || kindAt(state, x, y) === KINDS.tree.code) {
          continue;
        }
        reached.add(key);
        next.push({ x, y, z: WORLD.surfaceZ });
      }
    }
    frontier = next;
  }
  return reached;
}

describe('surface generation (issue #70 item 2)', () => {
  const runs = SEEDS.map((seed) => createRun(seed, 'none', 'standard'));

  it('the same seed grows the same forest; other seeds grow other forests', () => {
    const again = createRun(17, 'none', 'standard');
    expect(Array.from(again.surface)).toEqual(Array.from(runs[16]?.surface ?? []));
    expect(Array.from(again.blocks)).toEqual(Array.from(runs[16]?.blocks ?? []));
    const distinct = new Set(runs.map((state) => Array.from(state.surface).join('')));
    expect(distinct.size).toBe(runs.length);
  });

  it('the start cell and its eight neighbours are open meadow', () => {
    const start = WORLD.startPosition;
    for (const state of runs) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          expect(kindAt(state, start.x + dx, start.y + dy)).toBe(KINDS.meadow.code);
        }
      }
    }
  });

  it('paths join the start to at least two edges of the cube, and to every meadow', () => {
    for (const [index, state] of runs.entries()) {
      const reached = openGroundFromStart(state);
      const edges = new Set<string>();
      for (const key of reached) {
        const [x, y] = key.split(',').map(Number);
        if (y === 0) edges.add('north');
        if (x === state.size.x - 1) edges.add('east');
        if (y === state.size.y - 1) edges.add('south');
        if (x === 0) edges.add('west');
      }
      expect(edges.size, `seed ${SEEDS[index]}`).toBeGreaterThanOrEqual(
        SURFACE.generation.pathEdges,
      );
      // Every meadow cell is reached without cutting a tree.
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          if (kindAt(state, x, y) === KINDS.meadow.code) {
            expect(reached.has(`${x},${y}`), `seed ${SEEDS[index]}, meadow x${x} y${y}`).toBe(true);
          }
        }
      }
    }
  });

  it('a path is worn into dirt (ore is left as it is); an outcrop stands over stone', () => {
    for (const state of runs) {
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          const ground = blockAt(state, { x, y, z: 0 });
          if (kindAt(state, x, y) === KINDS.path.code) {
            expect(ground).not.toBe(BLOCKS.stone.code);
          }
          if (kindAt(state, x, y) === KINDS.outcrop.code) {
            expect(ground).toBe(BLOCKS.stone.code);
          }
        }
      }
    }
  });

  it('is mostly trees: about 65% on average, and never all forest or all open', () => {
    let total = 0;
    for (const state of runs) {
      const trees = Array.from(state.surface).filter((code) => code === KINDS.tree.code).length;
      const share = trees / state.surface.length;
      expect(share).toBeGreaterThan(0.4);
      expect(share).toBeLessThan(0.9);
      total += share;
    }
    const mean = total / runs.length;
    expect(mean).toBeGreaterThan(0.6);
    expect(mean).toBeLessThan(0.72);
  });

  it('every cell starts as one of the four kinds (no stumps yet), and no count has started', () => {
    for (const state of runs) {
      for (const code of state.surface) {
        expect([KINDS.tree.code, KINDS.meadow.code, KINDS.path.code, KINDS.outcrop.code]).toContain(
          code,
        );
      }
      expect(Array.from(state.stumpAge).every((age) => age === 0)).toBe(true);
    }
  });

  it('shows coal at the start on every seed (owner, PR #72)', () => {
    // 1,000 seeds. Some coal is among the top blocks the player sees at the
    // start: the layer-0 blocks on open ground (design doc 3.2).
    for (let seed = 1; seed <= 1000; seed += 1) {
      const state =
        seed <= runs.length ? (runs[seed - 1] as GameState) : createRun(seed, 'none', 'standard');
      let coalSeen = false;
      for (let y = 0; y < state.size.y && !coalSeen; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          const ground = { x, y, z: 0 };
          if (isRevealed(state, ground) && blockAt(state, ground) === BLOCKS.coalSeam.code) {
            coalSeen = true;
            break;
          }
        }
      }
      expect(coalSeen, `seed ${seed}`).toBe(true);
    }
  }, 60000);

  it('at the start every top block is known, except under a tree', () => {
    // Owner, issue #82: "Whole surface". Design doc v0.2 section 3.4.
    for (const state of runs.slice(0, 20)) {
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          const underTree = kindAt(state, x, y) === KINDS.tree.code;
          expect(isRevealed(state, { x, y, z: 0 }), `(${x}, ${y})`).toBe(!underTree);
          // Nothing below a top block is known.
          expect(isRevealed(state, { x, y, z: 1 })).toBe(false);
        }
      }
    }
  });
});

describe('the surface data (src/data/surface.ts)', () => {
  const blockIds = Object.keys(BLOCKS);
  const itemIds = Object.keys(ITEMS);

  it('is valid', () => {
    expect(validateSurfaceData(SURFACE, blockIds, itemIds)).toEqual([]);
  });

  it('reports what is wrong', () => {
    const bad = structuredClone(SURFACE);
    bad.kinds.tree.open = true;
    bad.kinds.stump.code = bad.kinds.path.code;
    bad.cutTree.ap = 0;
    bad.cutTree.yields = [{ item: 'wood', count: 2 }];
    bad.regrowShifts = 300;
    bad.generation.pathEdges = 1;
    bad.generation.outcropBlock = 'granite';
    bad.generation.outcropChance = 2;
    bad.generation.coalInSightBlock = 'peat';
    const problems = validateSurfaceData(bad, blockIds, itemIds);
    expect(problems).toEqual(
      expect.arrayContaining([
        'a tree must not be open ground',
        'surface kind codes must all differ',
        'cutTree.ap must be a whole number of at least 1, but is 0',
        'cutTree.yields names an unknown item "wood"',
        'regrowShifts must be at most 255, but is 300',
        'generation.pathEdges must be a whole number of at least 2, but is 1',
        'generation.outcropBlock names an unknown block "granite"',
        'generation.outcropChance must be from 0 to 1, but is 2',
        'generation.coalInSightBlock names an unknown block "peat"',
      ]),
    );
  });
});
