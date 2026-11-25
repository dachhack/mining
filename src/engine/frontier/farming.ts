// Planting saplings (docs/plans/progression-phases.md, section 6.2; PR 3).
//
// A sapling or an apple sapling from the store is planted on a lit square
// of dirt at the surface with nothing growing on it, or on a stump, for
// 1 tap (shift.ts charges it). It becomes a stump of that kind of tree,
// marked `planted`, and grows like a felled tree grows back (shift.ts): a
// tree after FRONTIER_SAPLINGS.saplingGrowShifts shifts, an apple tree full
// of apples after FRONTIER_SAPLINGS.appleSaplingGrowShifts. It waits under
// an animal or a camp, and it is lost if its square is mined.
//
// Saplings and apple saplings come only from the market (owner).

import { BLOCKS } from '../../data';
import type { ItemId } from '../../data';
import { FRONTIER_SAPLINGS, FRONTIER_SURFACE } from '../../data/frontier';
import { blockAt } from '../state';
import { campAt, pay, sightAt } from './camps';
import { animalAt } from './surface';
import { buildingAt } from './buildings';
import { APPLE_TREE, MAPLE_TREE, NO_FEATURE, TREE } from './state';
import type { Feature, FrontierState } from './state';

/** What each sapling grows into, and in how many shifts. */
const SAPLINGS: Record<string, { tree: Feature; shifts: number }> = {
  sapling: { tree: TREE, shifts: FRONTIER_SAPLINGS.saplingGrowShifts },
  appleSapling: { tree: APPLE_TREE, shifts: FRONTIER_SAPLINGS.appleSaplingGrowShifts },
  mapleSapling: { tree: MAPLE_TREE, shifts: FRONTIER_SAPLINGS.mapleSaplingGrowShifts },
};

/** True if `item` is something that can be planted. */
export function isSapling(item: string): boolean {
  return item in SAPLINGS;
}

/**
 * Why `item` cannot be planted on square (x, y) now, or `null` if it can:
 * - 'unknown': `item` is not a sapling;
 * - 'cost': the store holds none;
 * - 'notShown': the square is off the map, in the fog or greyed;
 * - 'camp': it is a camp's ground;
 * - 'animal': an animal stands on it;
 * - 'ground': its top is not surface dirt (it was mined, or it is rock);
 * - 'occupied': something grows on it, a sapling is planted there already,
 *   or a building stands there (buildings.ts).
 */
export type PlantRefusal =
  'unknown' | 'cost' | 'notShown' | 'camp' | 'animal' | 'ground' | 'occupied';

export function plantRefusal(
  state: FrontierState,
  x: number,
  y: number,
  item: string,
): PlantRefusal | null {
  if (!isSapling(item)) return 'unknown';
  if ((state.inventory.get(item) ?? 0) < 1) return 'cost';
  const width = state.cube.size.x;
  const onMap = x >= 0 && y >= 0 && x < width && y < state.cube.size.y;
  if (!onMap || sightAt(state, x, y) !== 'shown') return 'notShown';
  if (campAt(state.camps, x, y) !== null) return 'camp';
  if (animalAt(state, x, y) !== null) return 'animal';
  // Plants grow only on dirt, and only where the square was never mined.
  const growOn = FRONTIER_SURFACE.plantsGrowOn.map((id) => BLOCKS[id].code);
  if (!growOn.includes(blockAt(state.cube, { x, y, z: 0 }))) return 'ground';
  const i = x + width * y;
  if (
    (state.features[i] ?? NO_FEATURE) !== NO_FEATURE ||
    state.planted[i] === true ||
    state.mushrooms[i] === true ||
    buildingAt(state, x, y) !== null
  ) {
    return 'occupied';
  }
  return null;
}

/** Plant `item` on square (x, y). If `plantRefusal` says no, the very same state comes back. */
export function plant(state: FrontierState, x: number, y: number, item: string): FrontierState {
  const grows = SAPLINGS[item];
  if (grows === undefined || plantRefusal(state, x, y, item) !== null) {
    return state;
  }
  const i = x + state.cube.size.x * y;
  const set = <T>(list: T[], value: T): T[] => {
    const copy = [...list];
    copy[i] = value;
    return copy;
  };
  return {
    ...state,
    // A stump that was there is replaced; cut grass waiting there no longer grows.
    stumps: set(state.stumps, grows.tree),
    regrowIn: set(state.regrowIn, grows.shifts),
    planted: set(state.planted, true),
    grassIn: set(state.grassIn, -1),
    // `as ItemId`: `isSapling` above checked it is one of the sapling items.
    inventory: pay(state.inventory, [{ item: item as ItemId, count: 1 }]),
  };
}
