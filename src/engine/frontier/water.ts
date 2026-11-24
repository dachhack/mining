// Water and the pump (docs/plans/hazards.md, section 2; hazards PR 2).
//
// The owner: "You can hit water starting at level 3. It fills the area and
// you need to purchase a pump to remove it by clicking it and waiting."
// (Depth 4: question 181.)
//
// - The cube holds the old game's water pockets, in its middle band (depth 4
//   and down). Mining the block over one collapses it (breach.ts) and puts
//   its water on the square. If the square is then at depth
//   FRONTIER_WATER.fromDepth or more, the water floods: that square and the
//   dug squares joined to it through face neighbours at the same depth or
//   deeper, up to FRONTIER_WATER.maxSquares, nearest first. A camp's ground
//   is never flooded. The water units in the cube are cleared: the flood is
//   kept in `hazards.flooded`.
// - A flooded square cannot be mined, a camp cannot stand on it, and rain
//   does not fill it.
// - A tap on a flooded square with a pump in the store sets the pump there;
//   a tap on a pump picks it up again (1 tap each; tap.ts).
// - At End shift each pump drains FRONTIER_PUMP.drainPerShift squares of its
//   flood (the flooded squares joined to its own), the farthest from it first
//   (so what is left stays joined to the pump), its own square last. When its
//   own square is dry, the pump goes back to the store.
//
// The numbers are in src/data/frontier.ts.

import { FRONTIER_PUMP, FRONTIER_WATER } from '../../data/frontier';
import { depthAt } from '../heightmap';
import { setWater, waterAt } from '../state';
import type { GameState } from '../state';
import { campAt } from './camps';
import { gained } from './surface';
import type { FrontierCamp, FrontierHazards, FrontierState } from './state';

/** The four face neighbours of a square, in a fixed order. */
const STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** True if square (x, y) is flooded. */
export function isFlooded(
  state: { hazards: FrontierHazards; cube: GameState },
  x: number,
  y: number,
): boolean {
  return state.hazards.flooded[x + state.cube.size.x * y] === true;
}

/** The index in `hazards.pumps` of the pump on square (x, y), or -1 if none is there. */
export function pumpIndexAt(hazards: FrontierHazards, x: number, y: number): number {
  return hazards.pumps.findIndex((p) => p.x === x && p.y === y);
}

/**
 * If mining square (x, y) from layer `z` opened a water pocket under it
 * (`cube` is the cube after the mine, which it changes: the water units are
 * taken out of it), the squares the water floods, nearest first; else none.
 * `cube` must be a copy the caller owns.
 */
export function takeWaterOpened(
  cube: GameState,
  camps: FrontierCamp[],
  flooded: boolean[],
  x: number,
  y: number,
  z: number,
): { x: number; y: number }[] {
  const opened = { x, y, z };
  if (waterAt(cube, opened) <= 0) return [];
  setWater(cube, opened, 0);
  const depth = depthAt(cube, x, y);
  if (depth < FRONTIER_WATER.fromDepth) return [];
  return floodSquares(cube, camps, flooded, x, y, depth);
}

/**
 * The squares a flood starting at (x, y), at depth `depth`, fills: a
 * breadth-first walk over face neighbours at `depth` or deeper, not a camp's
 * ground, taking up to FRONTIER_WATER.maxSquares squares that are not
 * flooded already (it walks through those).
 */
function floodSquares(
  cube: GameState,
  camps: FrontierCamp[],
  flooded: boolean[],
  x: number,
  y: number,
  depth: number,
): { x: number; y: number }[] {
  const width = cube.size.x;
  const height = cube.size.y;
  const queue = [{ x, y }];
  const visited = new Set<number>([x + width * y]);
  const taken: { x: number; y: number }[] = [];
  for (let k = 0; k < queue.length && taken.length < FRONTIER_WATER.maxSquares; k += 1) {
    const sq = queue[k];
    if (sq === undefined) break;
    if (flooded[sq.x + width * sq.y] !== true) taken.push(sq);
    for (const [dx, dy] of STEPS) {
      const nx = sq.x + dx;
      const ny = sq.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const i = nx + width * ny;
      if (visited.has(i)) continue;
      visited.add(i);
      if (depthAt(cube, nx, ny) < depth || campAt(camps, nx, ny) !== null) continue;
      queue.push({ x: nx, y: ny });
    }
  }
  return taken;
}

/** `hazards` with `squares` flooded too. */
export function withFlood(
  hazards: FrontierHazards,
  width: number,
  squares: { x: number; y: number }[],
): FrontierHazards {
  if (squares.length === 0) return hazards;
  const flooded = [...hazards.flooded];
  for (const sq of squares) flooded[sq.x + width * sq.y] = true;
  return { ...hazards, flooded };
}

/** What the pumps did in a night: the hazards and store after it, the squares drained, the pumps back. */
export interface Pumping {
  hazards: FrontierHazards;
  inventory: Map<string, number>;
  drained: number;
  pumpsBack: number;
}

/**
 * Each pump, in the order they were set, drains up to
 * FRONTIER_PUMP.drainPerShift squares of its flood: the flooded squares
 * joined to its own through face neighbours, the farthest from it first (in
 * steps through the flood; then row by row), its own square last. Draining
 * the farthest first keeps what is left joined to the pump. Then every pump
 * whose square is dry goes back to the store.
 */
export function drainPumps(state: FrontierState, inventory: Map<string, number>): Pumping {
  const { hazards } = state;
  if (hazards.pumps.length === 0) {
    return { hazards, inventory, drained: 0, pumpsBack: 0 };
  }
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  const flooded = [...hazards.flooded];
  const pumps: FrontierHazards['pumps'] = [];
  let store = inventory;
  let drained = 0;
  let pumpsBack = 0;
  for (const pump of hazards.pumps) {
    // The pump's flood: the flooded squares joined to its own.
    const own = pump.x + width * pump.y;
    const region: number[] = [];
    const steps = new Map<number, number>([[own, 0]]);
    const queue = flooded[own] === true ? [own] : [];
    const visited = new Set<number>(queue);
    for (let k = 0; k < queue.length; k += 1) {
      const i = queue[k] ?? 0;
      if (i !== own) region.push(i);
      const x = i % width;
      const y = Math.floor(i / width);
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = nx + width * ny;
        if (visited.has(j) || flooded[j] !== true) continue;
        visited.add(j);
        steps.set(j, (steps.get(i) ?? 0) + 1);
        queue.push(j);
      }
    }
    const far = (i: number): number => steps.get(i) ?? 0;
    region.sort((a, b) => far(b) - far(a) || a - b);
    if (flooded[own] === true) region.push(own);
    for (const i of region.slice(0, FRONTIER_PUMP.drainPerShift)) {
      flooded[i] = false;
      drained += 1;
    }
    pumps.push(pump);
  }
  // A pump whose square is dry now (its own flood is done, or another pump
  // in the same flood drained it) goes back to the store.
  const working = pumps.filter((p) => flooded[p.x + width * p.y] === true);
  for (let k = working.length; k < pumps.length; k += 1) {
    store = gained(store, { item: FRONTIER_PUMP.item, count: 1 });
    pumpsBack += 1;
  }
  return {
    hazards: { ...hazards, flooded, pumps: working },
    inventory: store,
    drained,
    pumpsBack,
  };
}
