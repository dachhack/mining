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
// HOOKS FOR LATER TASKS
// - Gas (T11, cube/gas.ts) is stored the same way: `gasOn`, `setGasOn`.
// - T13 (vents): take gas off a square with `setGasOn(state, x, y, 0)` and
//   emit `gasRemoved` with the reason 'vented'. `stepGas` (cube/gas.ts) marks
//   where vents should act.
// - T13 (pumps): take water off a square with `setWaterOn(state, x, y,
//   waterOn(state, x, y) - units)` and emit `fluidRemoved` with the reason
//   'pumped'. `stepFluids` (cube/fluids.ts) marks where pumps should act.
// - T13 (sealant): sealing a square puts a block on it. Before placing the
//   block, set the square's water and lava to 0 (`fluidRemoved`, reason
//   'sealed'); that also stops a lava source, as design doc 6.2 says.

import { contentsOn } from './breach';
import { depthAt } from './heightmap';
import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import { gasAt, setGas, setLava, setWater } from './state';
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

/** Units of gas standing on the square (x, y). Throws if it is not a square. */
export function gasOn(state: GameState, x: number, y: number): number {
  return contentsOn(state, x, y).gas;
}

/**
 * Make the gas standing on the square (x, y) exactly `units`. Throws as
 * `setWaterOn` does: gas cannot stand on a square at ground level, where it
 * blows away (design doc 6.5).
 */
export function setGasOn(state: GameState, x: number, y: number, units: number): void {
  const depth = depthAt(state, x, y);
  for (let z = 0; z < depth; z += 1) {
    setGas(state, { x, y, z }, 0);
  }
  if (units === 0) {
    return;
  }
  setGas(state, { x, y, z: storageLayer(depth, x, y, 'Gas') }, units);
}

/**
 * A block is about to form in the open cell `cell`, the lowest open cell of
 * its square (water meeting lava makes stone there). Gas in that cell would
 * end up inside the block, out of sight and out of reach of every rule. So it
 * is lifted to the cell above, where it stands on the new block. If there is
 * no cell above (the square comes up to ground level), the gas blows away:
 * `gasRemoved`, reason 'reachedSurface' (design doc 6.5).
 *
 * A slump does the same for rubble with `liftContents` (cube/slumps.ts),
 * which never reaches ground level.
 */
export function liftGasOutOf(state: GameState, cell: Vec3, events: GameEvent[]): void {
  const units = gasAt(state, cell);
  if (units === 0) {
    return;
  }
  setGas(state, cell, 0);
  const above = { x: cell.x, y: cell.y, z: cell.z - 1 };
  if (above.z < 0) {
    events.push({ type: 'gasRemoved', pos: above, units, reason: 'reachedSurface' });
    return;
  }
  // `Math.min` only guards the byte a cell stores, as in breach.ts.
  setGas(state, above, Math.min(255, gasAt(state, above) + units));
}
