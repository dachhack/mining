// Filling a square with dirt (owner, after the 0.17.0 build: "Fill any square
// with dirt as a move. No resource restrictions. Height restrictions still
// apply.").
//
// For 1 tap (shift.ts charges it), one FRONTIER_FILL.block goes on top of a
// dug square, from nothing: the square is 1 shallower. What was its top
// block is buried, not lost, as under rain (rain.ts).
//
// The level rule still holds: no square may be more than 1 deeper than a
// face neighbour (heightmap.ts, `mayMine`). Filling a square at depth d
// leaves it at d - 1, so no face neighbour may be deeper than d: fill the
// deeper squares round it first. The map's edge is not a neighbour.
//
// Only a lit square, dug at least once, with nothing on it: no camp,
// building, water, fire or dragon.

import { BLOCKS } from '../../data';
import { FRONTIER_FILL } from '../../data/frontier';
import { SQUARE_STEPS, depthAt } from '../heightmap';
import { cloneState, setBlock } from '../state';
import { buildingAt } from './buildings';
import { campAt, sightAt } from './camps';
import type { FrontierState } from './state';

/**
 * Why square (x, y) cannot be filled now, or `null` if it can:
 * - 'notShown': it is off the map, in the fog or greyed;
 * - 'surface': it was never dug (depth 0): there is no hole to fill;
 * - 'camp': it is a camp's ground;
 * - 'building': a building stands on it;
 * - 'hazard': it is flooded or burning, or a dragon is on it;
 * - 'neighbourDeeper': a face neighbour is deeper than it: filled, it would
 *   stand more than 1 above that neighbour.
 */
export type FillSquareRefusal =
  'notShown' | 'surface' | 'camp' | 'building' | 'hazard' | 'neighbourDeeper';

export function fillSquareRefusal(
  state: FrontierState,
  x: number,
  y: number,
): FillSquareRefusal | null {
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  const onMap = x >= 0 && y >= 0 && x < width && y < height;
  if (!onMap || sightAt(state, x, y) !== 'shown') return 'notShown';
  const depth = depthAt(state.cube, x, y);
  if (depth < 1) return 'surface';
  if (campAt(state.camps, x, y) !== null) return 'camp';
  if (buildingAt(state, x, y) !== null) return 'building';
  const i = x + width * y;
  const h = state.hazards;
  if (
    h.flooded[i] === true ||
    h.fires[i] === true ||
    h.dragons.some((d) => d.x === x && d.y === y)
  ) {
    return 'hazard';
  }
  for (const step of SQUARE_STEPS) {
    const nx = x + step.dx;
    const ny = y + step.dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (depthAt(state.cube, nx, ny) > depth) return 'neighbourDeeper';
  }
  return null;
}

/** Fill square (x, y) with one block of dirt. If `fillSquareRefusal` says no, the very same state comes back. */
export function fillSquare(state: FrontierState, x: number, y: number): FrontierState {
  if (fillSquareRefusal(state, x, y) !== null) return state;
  const cube = cloneState(state.cube);
  // The block goes in the empty cell just above the square's top block.
  setBlock(cube, { x, y, z: depthAt(cube, x, y) - 1 }, BLOCKS[FRONTIER_FILL.block].code);
  return { ...state, cube };
}
