// Water and lava standing on squares: reading and writing them (design doc
// v0.2 sections 6.3 and 6.4; issue #99, task T10; decision note 0033).
//
// WHERE IT IS STORED. The state keeps water and lava cell by cell. What
// stands ON a square is what the open cells above its top block hold, added
// up (`contentsOn` in breach.ts, which also counts gas). The functions here
// write a square's water or lava in one fixed way: all of it in the open cell
// directly above the top block, and nothing in the cells above that. A breach
// writes the same cell (breach.ts), and so the flow step, the forecast and a
// save all agree on where to look.
//
// A square at ground level (depth 0) has no open cell above its top block,
// so nothing can stand on it: water and lava never stand above ground level
// (design doc 3.1).
//
// WHO ELSE WRITES HERE
// - Pumps take water off squares inside `stepFluids` (cube/fluids.ts).
// - Sealant (actions/campTools.ts) sets a square's water and lava to 0
//   before it places its block; that also stops a lava source, as design doc
//   6.2 says.
//
// HOOK FOR A LATER TASK
// - T11 (gas): lava on a square ignites gas on or beside it. Ask `lavaOn`.

import { contentsOn } from './breach';
import { depthAt } from './heightmap';
import { setLava, setWater } from './state';
import type { GameState } from './state';

/** Units of water standing on the square (x, y). Throws if it is not a square. */
export function waterOn(state: GameState, x: number, y: number): number {
  return contentsOn(state, x, y).water;
}

/** Units of lava standing on the square (x, y). Throws if it is not a square. */
export function lavaOn(state: GameState, x: number, y: number): number {
  return contentsOn(state, x, y).lava;
}

/** True if the lava on the square (x, y) is a source (design doc 6.2). */
export function isLavaSourceOn(state: GameState, x: number, y: number): boolean {
  return contentsOn(state, x, y).lavaSource;
}

/**
 * The layer of the cell that holds what stands on a square `depth` levels
 * down: the open cell directly above its top block. Throws for a square at
 * ground level, which has no such cell.
 */
function storageLayer(depth: number, x: number, y: number, what: string): number {
  if (depth <= 0) {
    throw new Error(`${what} cannot stand on (${x}, ${y}): the square is at ground level`);
  }
  return depth - 1;
}

/**
 * Make the water standing on the square (x, y) exactly `units`. Throws if
 * (x, y) is not a square, if `units` is not a whole number 0 to 255, or if
 * `units` is more than 0 on a square at ground level.
 */
export function setWaterOn(state: GameState, x: number, y: number, units: number): void {
  const depth = depthAt(state, x, y);
  // Empty every open cell above the top first, so that the total is `units`
  // however the water was spread before.
  for (let z = 0; z < depth; z += 1) {
    setWater(state, { x, y, z }, 0);
  }
  if (units === 0) {
    return;
  }
  setWater(state, { x, y, z: storageLayer(depth, x, y, 'Water') }, units);
}

/**
 * Make the lava standing on the square (x, y) exactly `units`. `source` says
 * whether that lava is a source; a square with no lava is never one. Throws
 * as `setWaterOn` does.
 */
export function setLavaOn(
  state: GameState,
  x: number,
  y: number,
  units: number,
  source: boolean,
): void {
  const depth = depthAt(state, x, y);
  for (let z = 0; z < depth; z += 1) {
    setLava(state, { x, y, z }, 0); // also clears the cell's source flag
  }
  if (units === 0) {
    return;
  }
  setLava(state, { x, y, z: storageLayer(depth, x, y, 'Lava') }, units, source);
}
