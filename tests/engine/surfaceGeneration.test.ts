// Growing the forest on a new cube (issue #70 item 2; decision note 0020),
// checked over many seeds, and the surface data table.

import { describe, expect, it } from 'vitest';
import { BLOCKS, ITEMS, SURFACE, WORLD, validateSurfaceData } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { blockAt, createRun, isRevealed, surfaceKindAt } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { generateCube } from '../../src/engine/generation/cube';
import { generateSpaces } from '../../src/engine/generation/spaces';
import { blankState } from '../../src/engine/state';

const SEEDS = Array.from({ length: 150 }, (_, index) => index + 1);
const KINDS = SURFACE.kinds;

/** The kind code of the surface cell over column (x, y). */
function kindAt(state: GameState, x: number, y: number): number {
  return surfaceKindAt(state, { x, y, z: WORLD.surfaceZ });
}

/**
 * The groups of open ground on a surface: each group is the set of surface
 * cells (as "x,y" strings) joined to each other without crossing a tree. A
 * flood fill over the open kinds, started from every open cell not yet in a
 * group.
 */
function openGroundGroups(state: GameState): Set<string>[] {
  const groups: Set<string>[] = [];
  const grouped = new Set<string>();
  for (let startY = 0; startY < state.size.y; startY += 1) {
    for (let startX = 0; startX < state.size.x; startX += 1) {
      const startKey = `${startX},${startY}`;
      if (grouped.has(startKey) || kindAt(state, startX, startY) === KINDS.tree.code) {
        continue;
      }
      const reached = new Set<string>([startKey]);
      let frontier: Vec3[] = [{ x: startX, y: startY, z: WORLD.surfaceZ }];
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
      for (const key of reached) {
        grouped.add(key);
      }
      groups.push(reached);
    }
  }
  return groups;
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

  it('has no start clearing: the middle of the map is forest on some seeds (design doc v0.2)', () => {
    // The old generator cleared the 3 x 3 squares round (16, 16) on every seed.
    const middleX = Math.floor(WORLD.size.x / 2);
    const middleY = Math.floor(WORLD.size.y / 2);
    const withTreeInTheMiddle = runs.filter(
      (state) => kindAt(state, middleX, middleY) === KINDS.tree.code,
    );
    expect(withTreeInTheMiddle.length).toBeGreaterThan(runs.length / 4);
  });

  it('paths join every meadow, and reach at least two edges of the cube', () => {
    for (const [index, state] of runs.entries()) {
      // The meadows and the paths between them are one piece of open ground.
      // (Outcrops are open ground too, scattered in the forest, so they may
      // form small groups of their own.)
      const withMeadow = openGroundGroups(state).filter((group) =>
        [...group].some((key) => {
          const [x, y] = key.split(',').map(Number) as [number, number];
          return kindAt(state, x, y) === KINDS.meadow.code;
        }),
      );
      expect(withMeadow.length, `seed ${SEEDS[index]}: groups holding a meadow`).toBe(1);
      const edges = new Set<string>();
      for (const key of withMeadow[0] ?? []) {
        const [x, y] = key.split(',').map(Number);
        if (y === 0) edges.add('north');
        if (x === state.size.x - 1) edges.add('east');
        if (y === state.size.y - 1) edges.add('south');
        if (x === 0) edges.add('west');
      }
      expect(edges.size, `seed ${SEEDS[index]}`).toBeGreaterThanOrEqual(
        SURFACE.generation.pathEdges,
      );
    }
  });

  it('a path does not wear the ground: some paths lie over stone; an outcrop stands over stone', () => {
    let pathsOverStone = 0;
    for (const state of runs) {
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          const ground = blockAt(state, { x, y, z: 0 });
          if (kindAt(state, x, y) === KINDS.path.code && ground === BLOCKS.stone.code) {
            pathsOverStone += 1;
          }
          if (kindAt(state, x, y) === KINDS.outcrop.code) {
            expect(ground).toBe(BLOCKS.stone.code);
          }
        }
      }
    }
    expect(pathsOverStone).toBeGreaterThan(0);
  });

  it('changes no block of the cube', () => {
    // The surface is laid over the cube `generateCube` and `generateSpaces`
    // made. Coal in sight is gone (question 140), so nothing changes a block.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = createRun(seed, 'none', 'standard');
      const bare = blankState(WORLD.size, seed);
      bare.blocks = generateCube(bare.size, bare.rng);
      generateSpaces(bare);
      expect(Array.from(state.blocks), `seed ${seed}`).toEqual(Array.from(bare.blocks));
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
    bad.cutTree.yields = [{ item: 'plank', count: 2 }];
    bad.regrowShifts = 300;
    bad.generation.pathEdges = 1;
    bad.generation.outcropBlock = 'granite';
    bad.generation.outcropChance = 2;
    const problems = validateSurfaceData(bad, blockIds, itemIds);
    expect(problems).toEqual(
      expect.arrayContaining([
        'a tree must not be open ground',
        'surface kind codes must all differ',
        'cutTree.ap must be a whole number of at least 1, but is 0',
        'cutTree.yields names an unknown item "plank"',
        'regrowShifts must be at most 255, but is 300',
        'generation.pathEdges must be a whole number of at least 2, but is 1',
        'generation.outcropBlock names an unknown block "granite"',
        'generation.outcropChance must be from 0 to 1, but is 2',
      ]),
    );
  });
});
