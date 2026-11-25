// The axe and the saw house (owner, after the 0.17.0 build: "Let's add an axe
// that gets you 3 wood from trees instead of 2. And you can build a
// one-square building saw house that increases the harvest of all trees
// within a camp level 1 radius by 1.").
//
// - Felling a tree (or an apple tree picked bare) gives
//   FRONTIER_SURFACE.woodPerTree wood, or FRONTIER_AXE.woodPerTree while the
//   store holds an axe, plus FRONTIER_SAW_HOUSE.bonus if a saw house stands
//   within the circle of a level-1 camp's radius round the tree (once, however
//   many saw houses reach it). `woodFromTree` works it out.
// - A saw house is built for FRONTIER_SAW_HOUSE.cost and 1 tap (shift.ts
//   charges the tap) on one lit square of ground never mined, with nothing
//   on it: no camp, plant, stump or planted sapling, animal, water, fire,
//   dragon, or other saw house. Its square is then never mined (tap.ts), a
//   blast passes it by (gas.ts), and nothing grows or is planted on it.
//
// The numbers are in src/data/frontier.ts.

import { BLOCKS } from '../../data';
import { FRONTIER_AXE, FRONTIER_SAW_HOUSE, FRONTIER_SURFACE } from '../../data/frontier';
import { blockAt } from '../state';
import { campAt, campRadius, canAfford, inCircle, pay, sightAt } from './camps';
import { NO_FEATURE } from './state';
import type { FrontierState } from './state';

/** How far a saw house reaches: a level-1 camp's radius (FRONTIER_SAW_HOUSE.radiusOfLevel). */
export function sawHouseReach(): number {
  return campRadius(FRONTIER_SAW_HOUSE.radiusOfLevel);
}

/** True if a saw house stands on square (x, y). */
export function sawHouseAt(
  state: { sawHouses: { x: number; y: number }[] },
  x: number,
  y: number,
): boolean {
  return state.sawHouses.some((s) => s.x === x && s.y === y);
}

/** True if a saw house reaches square (x, y): it is inside the circle round one. */
export function sawHouseReaches(
  state: { sawHouses: { x: number; y: number }[] },
  x: number,
  y: number,
): boolean {
  const reach = sawHouseReach();
  return state.sawHouses.some((s) => inCircle(s.x, s.y, reach, x, y));
}

/** The wood a tree felled on square (x, y) gives now: see the top of this file. */
export function woodFromTree(state: FrontierState, x: number, y: number): number {
  const axe = (state.inventory.get(FRONTIER_AXE.item) ?? 0) > 0;
  const base = axe ? FRONTIER_AXE.woodPerTree : FRONTIER_SURFACE.woodPerTree;
  return base + (sawHouseReaches(state, x, y) ? FRONTIER_SAW_HOUSE.bonus : 0);
}

/**
 * Why a saw house cannot be built on square (x, y) now, or `null` if it can:
 * - 'notShown': the square is off the map, in the fog or greyed;
 * - 'camp': it is a camp's ground;
 * - 'occupied': a saw house stands there already;
 * - 'ground': it was mined (only ground never dug will do);
 * - 'growing': grass, a tree, a stump or a planted sapling is on it;
 * - 'animal': an animal stands on it;
 * - 'hazard': it is flooded, burning, or a dragon is on it;
 * - 'cost': the store does not hold FRONTIER_SAW_HOUSE.cost.
 */
export type SawHouseRefusal =
  'notShown' | 'camp' | 'occupied' | 'ground' | 'growing' | 'animal' | 'hazard' | 'cost';

export function sawHouseRefusal(
  state: FrontierState,
  x: number,
  y: number,
): SawHouseRefusal | null {
  const width = state.cube.size.x;
  const onMap = x >= 0 && y >= 0 && x < width && y < state.cube.size.y;
  if (!onMap || sightAt(state, x, y) !== 'shown') return 'notShown';
  if (campAt(state.camps, x, y) !== null) return 'camp';
  if (sawHouseAt(state, x, y)) return 'occupied';
  // Ground never mined: its top block is still the surface's dirt.
  const surface = FRONTIER_SURFACE.plantsGrowOn.map((id) => BLOCKS[id].code);
  if (!surface.includes(blockAt(state.cube, { x, y, z: 0 }))) return 'ground';
  const i = x + width * y;
  if (
    (state.features[i] ?? NO_FEATURE) !== NO_FEATURE ||
    (state.stumps[i] ?? NO_FEATURE) !== NO_FEATURE ||
    state.planted[i] === true
  ) {
    return 'growing';
  }
  if (state.animals.some((a) => a.x === x && a.y === y)) return 'animal';
  const h = state.hazards;
  if (
    h.flooded[i] === true ||
    h.fires[i] === true ||
    h.dragons.some((d) => d.x === x && d.y === y)
  ) {
    return 'hazard';
  }
  if (!canAfford(state.inventory, FRONTIER_SAW_HOUSE.cost)) return 'cost';
  return null;
}

/** Build a saw house on square (x, y). If `sawHouseRefusal` says no, the very same state comes back. */
export function buildSawHouse(state: FrontierState, x: number, y: number): FrontierState {
  if (sawHouseRefusal(state, x, y) !== null) return state;
  const i = x + state.cube.size.x * y;
  // Cut grass waiting to grow back there never will.
  const grassIn = [...state.grassIn];
  grassIn[i] = -1;
  return {
    ...state,
    grassIn,
    sawHouses: [...state.sawHouses, { x, y }],
    inventory: pay(state.inventory, FRONTIER_SAW_HOUSE.cost),
  };
}
