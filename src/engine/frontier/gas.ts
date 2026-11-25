// Gas and blasts (docs/plans/hazards.md, section 3; hazards PR 3).
//
// The owner: "Pockets of gas can explode starting at level 4. This blows
// away blocks and starts fires on combustable squares."
//
// - The cube holds the old game's gas pockets, in its middle band (depth 4
//   and down). Mining the block over one collapses it (breach.ts) and puts
//   its gas on the square. If the square is then at depth
//   FRONTIER_GAS.fromDepth or more, the gas explodes with a chance of
//   FRONTIER_GAS.explodeChance, rolled on the state's generator; otherwise it
//   vents. Either way the gas units are cleared from the cube.
// - A blast takes the top block off every other square within
//   FRONTIER_GAS.blastRadius of the mined square, row by row, wherever the
//   level rule allows it at that moment (the mined square itself has just
//   gone down 1, as every mine does). It
//   gives nothing. A camp's ground, a building, a flooded square, and a square with
//   something growing on it or a stump are not dug. A blast that opens a
//   water pocket floods as a mine would (water.ts).
// - Then every combustible square (fire.ts) within FRONTIER_GAS.fireRadius
//   of the mined square catches fire.
//
// The numbers are in src/data/frontier.ts.

import { FRONTIER_GAS } from '../../data/frontier';
import { depthAt } from '../heightmap';
import { labMine } from '../lab';
import { nextFloat } from '../rng';
import { gasAt, setGas } from '../state';
import type { GameState } from '../state';
import { campAt } from './camps';
import { buildingAt } from './buildings';
import { isCombustible, withFires } from './fire';
import { NO_FEATURE } from './state';
import type { FrontierState } from './state';
import { takeWaterOpened, withFlood } from './water';

/** What a gas pocket did when it was opened. */
export type GasOutcome = 'exploded' | 'vented' | null;

/** A blast: the state after it, the squares it dug, and the squares it set on fire. */
export interface Blast {
  state: FrontierState;
  gas: GasOutcome;
  blown: { x: number; y: number }[];
  fires: { x: number; y: number }[];
}

/**
 * If mining square (x, y) from layer `z` opened a gas pocket, what came of
 * it, on `state` (the state after the mine, whose cube is the mine's own copy
 * and is changed here). If no gas was opened, the very same state comes back.
 */
export function gasOpened(state: FrontierState, x: number, y: number, z: number): Blast {
  const cube = state.cube;
  const opened = { x, y, z };
  if (gasAt(cube, opened) <= 0) {
    return { state, gas: null, blown: [], fires: [] };
  }
  setGas(cube, opened, 0);
  if (depthAt(cube, x, y) < FRONTIER_GAS.fromDepth) {
    return { state, gas: null, blown: [], fires: [] };
  }
  // The roll is on a copy of the state's generator, kept in the new state.
  const rng = { ...state.rng };
  const explodes = nextFloat(rng) < FRONTIER_GAS.explodeChance;
  const rolled = { ...state, rng };
  if (!explodes) {
    return { state: rolled, gas: 'vented', blown: [], fires: [] };
  }
  return explode(rolled, x, y);
}

/** The blast centred on (x, y): see the top of this file. */
function explode(state: FrontierState, x: number, y: number): Blast {
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  const r = FRONTIER_GAS.blastRadius;
  const order: { x: number; y: number }[] = [];
  for (let yy = y - r; yy <= y + r; yy += 1) {
    for (let xx = x - r; xx <= x + r; xx += 1) {
      if (xx === x && yy === y) continue;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      order.push({ x: xx, y: yy });
    }
  }
  let cube: GameState = state.cube;
  let hazards = state.hazards;
  const blown: { x: number; y: number }[] = [];
  for (const sq of order) {
    const i = sq.x + width * sq.y;
    if (campAt(state.camps, sq.x, sq.y) !== null) continue;
    if (buildingAt(state, sq.x, sq.y) !== null) continue;
    if (state.mushrooms[i] === true) continue;
    if (hazards.flooded[i] === true) continue;
    if ((state.features[i] ?? NO_FEATURE) !== NO_FEATURE) continue;
    if ((state.stumps[i] ?? NO_FEATURE) !== NO_FEATURE) continue;
    const z = depthAt(cube, sq.x, sq.y);
    const mined = labMine(cube, sq.x, sq.y); // refused where the level rule forbids it
    if (!mined.mined) continue;
    cube = mined.state;
    blown.push(sq);
    // What the blast opens: water floods; more gas only vents.
    setGas(cube, { x: sq.x, y: sq.y, z }, 0);
    const wet = takeWaterOpened(cube, state.camps, hazards.flooded, sq.x, sq.y, z);
    hazards = withFlood(hazards, width, wet);
  }
  const fires: { x: number; y: number }[] = [];
  const f = FRONTIER_GAS.fireRadius;
  for (let yy = Math.max(0, y - f); yy <= Math.min(height - 1, y + f); yy += 1) {
    for (let xx = Math.max(0, x - f); xx <= Math.min(width - 1, x + f); xx += 1) {
      if (isCombustible(state, xx, yy)) fires.push({ x: xx, y: yy });
    }
  }
  const after = withFires({ ...state, cube, hazards }, fires);
  return { state: after, gas: 'exploded', blown, fires };
}
