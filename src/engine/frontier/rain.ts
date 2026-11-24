// Rain (docs/plans/hazards.md, section 1; hazards PR 1).
//
// The owner: "Rain overnight washes clay and soil into low areas and covers
// them."
//
// - At End shift it rains with a chance of FRONTIER_RAIN.chance.
// - Rain fills low spots. A low spot is a dug square (depth 1 or more) that
//   no face neighbour is deeper than and that at least one face neighbour is
//   shallower than. Each one is filled with a chance of
//   FRONTIER_RAIN.fillChance: one block goes back on top of it (clay with a
//   chance of clayChance, else dirt), so it is 1 shallower.
// - What was the top block is buried, not lost: dig the new block off and it
//   is there again.
// - A camp's ground is never filled.
//
// Why the level rule still holds: every square differs from each face
// neighbour by at most 1 level. A low spot at depth d has every neighbour
// at depth d - 1 or d, so after filling it (depth d - 1) it still differs by
// at most 1. Two neighbours filled in the same night are fine too: a
// neighbour at depth d - 1 is not a low spot, because the low spot beside it
// is deeper; so filled neighbours were both at depth d and both end at d - 1.
//
// The rolls use the state's own generator (`rng`), so the same seed and the
// same actions give the same rain. The numbers are in src/data/frontier.ts.

import { BLOCKS } from '../../data';
import { FRONTIER_RAIN } from '../../data/frontier';
import { depthAt } from '../heightmap';
import { nextFloat } from '../rng';
import type { RngState } from '../rng';
import { cloneState, setBlock } from '../state';
import type { GameState } from '../state';
import { campAt } from './camps';
import type { FrontierCamp } from './state';

/** A square, by its x and y. */
export interface Square {
  x: number;
  y: number;
}

/**
 * The low spots of `cube`, row by row: dug squares that no face neighbour is
 * deeper than and that at least one face neighbour is shallower than. The
 * map's edge is not a neighbour.
 */
export function lowSpots(cube: GameState): Square[] {
  const width = cube.size.x;
  const height = cube.size.y;
  // Every square's depth once, row by row (index x + width * y).
  const depth: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      depth.push(depthAt(cube, x, y));
    }
  }
  const spots: Square[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d = depth[x + width * y] ?? 0;
      if (d < 1) continue;
      let deeper = false;
      let shallower = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = depth[nx + width * ny] ?? 0;
        if (n > d) deeper = true;
        if (n < d) shallower = true;
      }
      if (!deeper && shallower) spots.push({ x, y });
    }
  }
  return spots;
}

/** What a night's rain did: the cube after it, and the squares it filled. */
export interface Rainfall {
  cube: GameState;
  /** True if it rained this night. */
  rained: boolean;
  /** The squares filled, row by row. */
  filled: Square[];
}

/**
 * The night's rain on `cube`, rolled with `rng` (which it advances). Every
 * low spot not under a camp is rolled for, row by row, so the rolls taken
 * depend only on the ground. `blocked(x, y)` names other squares rain does
 * not fill (flooded or burning squares, in later hazards). If it does not
 * rain, or fills nothing, the very same cube comes back.
 */
export function rainfall(
  cube: GameState,
  camps: FrontierCamp[],
  rng: RngState,
  blocked: (x: number, y: number) => boolean = () => false,
): Rainfall {
  if (nextFloat(rng) >= FRONTIER_RAIN.chance) {
    return { cube, rained: false, filled: [] };
  }
  const filled: Square[] = [];
  const blocks: number[] = [];
  for (const spot of lowSpots(cube)) {
    if (campAt(camps, spot.x, spot.y) !== null || blocked(spot.x, spot.y)) continue;
    if (nextFloat(rng) >= FRONTIER_RAIN.fillChance) continue;
    const clay = nextFloat(rng) < FRONTIER_RAIN.clayChance;
    filled.push(spot);
    blocks.push(BLOCKS[clay ? FRONTIER_RAIN.clayBlock : FRONTIER_RAIN.fillBlock].code);
  }
  if (filled.length === 0) {
    return { cube, rained: true, filled };
  }
  const next = cloneState(cube);
  filled.forEach((spot, k) => {
    // The block goes in the empty cell just above the square's top block.
    const z = depthAt(next, spot.x, spot.y) - 1;
    setBlock(next, { x: spot.x, y: spot.y, z }, blocks[k] ?? BLOCKS.dirt.code);
  });
  return { cube: next, rained: true, filled };
}
