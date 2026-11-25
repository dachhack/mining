// Mushrooms (owner, after the 0.17.0 build: "If a (non-maple) tree is
// standing when rain happens, 3-7 days later a mushroom has a chance of
// emerging. The chance increases for every adjacent space where there is
// another tree. Contracts for mushrooms in the market and mushrooms sell for
// gold.").
//
// At End shift, after the rain (`nightOfMushrooms`):
// 1. every mushroom coming counts down a night; one that reaches 0 comes up
//    if its square is still ground never dug with no camp or building on
//    it, and is lost otherwise;
// 2. on a night it rained, every square with a plain tree (not a maple, nor
//    an apple tree: owner, after the 0.18.0 build: "Let's omit apple trees
//    from mushroom generation"), no mushroom on it and none coming, gets one coming with a
//    chance of FRONTIER_MUSHROOM.chance plus FRONTIER_MUSHROOM.perTreeBeside
//    for each of the 8 squares round it with a tree of any kind (at most
//    FRONTIER_MUSHROOM.most), in a whole number of nights drawn from
//    FRONTIER_MUSHROOM.nights. Squares are rolled row by row, with the
//    state's generator.
// A tap on a square with a mushroom picks it first (tap.ts, surface.ts).
//
// The numbers are in src/data/frontier.ts.

import { BLOCKS } from '../../data';
import { FRONTIER_MUSHROOM, FRONTIER_SURFACE } from '../../data/frontier';
import { nextFloat, nextInt } from '../rng';
import type { RngState } from '../rng';
import { blockAt } from '../state';
import { buildingAt } from './buildings';
import { campAt } from './camps';
import { TREE, isTree } from './state';
import type { FrontierState } from './state';

/** True if a mushroom stands on square (x, y). */
export function mushroomAt(state: FrontierState, x: number, y: number): boolean {
  return state.mushrooms[x + state.cube.size.x * y] === true;
}

/** The chance that a tree on square (x, y) gets a mushroom coming on a rainy night. */
export function mushroomChance(state: FrontierState, x: number, y: number): number {
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  let beside = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (isTree(state.features[nx + width * ny])) beside += 1;
    }
  }
  const { chance, perTreeBeside, most } = FRONTIER_MUSHROOM;
  return Math.min(most, chance + perTreeBeside * beside);
}

/** What the mushrooms did in a night. */
export interface MushroomNight {
  state: FrontierState;
  /** Mushrooms that came up. */
  came: number;
  /** Mushrooms set coming by the rain. */
  coming: number;
}

/** The night's mushrooms on `state`, rolled with `rng` (which it advances): see the top of this file. */
export function nightOfMushrooms(
  state: FrontierState,
  rained: boolean,
  rng: RngState,
): MushroomNight {
  const width = state.cube.size.x;
  const surface = new Set<number>(FRONTIER_SURFACE.plantsGrowOn.map((id) => BLOCKS[id].code));
  const mushrooms = [...state.mushrooms];
  const mushroomIn = [...state.mushroomIn];
  let came = 0;
  let counted = false;
  // 1. Those coming count down, and come up where they still can.
  mushroomIn.forEach((left, i) => {
    if (left < 0) return;
    counted = true;
    if (left > 1) {
      mushroomIn[i] = left - 1;
      return;
    }
    mushroomIn[i] = -1;
    const x = i % width;
    const y = Math.floor(i / width);
    const undug = surface.has(blockAt(state.cube, { x, y, z: 0 }));
    if (undug && campAt(state.camps, x, y) === null && buildingAt(state, x, y) === null) {
      mushrooms[i] = true;
      came += 1;
    }
  });
  // 2. The rain sets new ones coming under the plain trees.
  let coming = 0;
  if (rained) {
    const [low, high] = FRONTIER_MUSHROOM.nights;
    for (let i = 0; i < state.features.length; i += 1) {
      const f = state.features[i];
      if (f !== TREE) continue; // plain trees only: not maples or apple trees
      if (mushrooms[i] === true || (mushroomIn[i] ?? -1) >= 0) continue;
      const x = i % width;
      const y = Math.floor(i / width);
      if (nextFloat(rng) >= mushroomChance(state, x, y)) continue;
      mushroomIn[i] = low + nextInt(rng, high - low + 1);
      coming += 1;
    }
  }
  if (!counted && coming === 0) return { state, came, coming };
  return { state: { ...state, mushrooms, mushroomIn }, came, coming };
}

/** `state` with the mushroom on square index `i` picked or gone. */
export function withoutMushroom(state: FrontierState, i: number): FrontierState {
  if (state.mushrooms[i] !== true) return state;
  const mushrooms = [...state.mushrooms];
  mushrooms[i] = false;
  return { ...state, mushrooms };
}
