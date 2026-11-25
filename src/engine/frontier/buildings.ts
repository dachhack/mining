// One-square buildings, and the axe (owner, after the 0.17.0 build).
//
// "Let's add an axe that gets you 3 wood from trees instead of 2. And you can
// build a one-square building saw house that increases the harvest of all
// trees within a camp level 1 radius by 1." Then: "Let's add maple tree
// saplings and a one square sugar shack where you can produce syrup if you
// harvest sap."
//
// - Felling a tree of any kind gives FRONTIER_SURFACE.woodPerTree wood, or
//   FRONTIER_AXE.woodPerTree while the store holds an axe, plus
//   FRONTIER_SAW_HOUSE.bonus if a saw house stands within the circle of a
//   level-1 camp's radius round the tree (once, however many saw houses
//   reach it). `woodFromTree` works it out.
// - A sugar shack lets the recipe book boil sap into syrup while one stands
//   anywhere (smelting.ts, `makeRefusal`).
// - A building of either kind is built for its cost (`BUILDING_COSTS`) and
//   1 tap (shift.ts charges the tap) on one lit square of ground never
//   mined, with nothing on it: no camp, plant, stump or planted sapling,
//   animal, water, fire, dragon, or other building. Its square is then never
//   mined (tap.ts), a blast passes it by (gas.ts), and nothing grows or is
//   planted on it.
//
// The numbers are in src/data/frontier.ts.

import { BLOCKS } from '../../data';
import type { ItemStack } from '../../data';
import {
  FRONTIER_AXE,
  FRONTIER_SAW_HOUSE,
  FRONTIER_SUGAR_SHACK,
  FRONTIER_SURFACE,
} from '../../data/frontier';
import { blockAt } from '../state';
import { campAt, campRadius, canAfford, inCircle, pay, sightAt } from './camps';
import { NO_FEATURE } from './state';
import type { BuildingKind, FrontierBuilding, FrontierState } from './state';

/** What each kind of building costs. */
export const BUILDING_COSTS: Record<BuildingKind, ItemStack[]> = {
  sawHouse: FRONTIER_SAW_HOUSE.cost,
  sugarShack: FRONTIER_SUGAR_SHACK.cost,
};

/** True if `kind` names a kind of building. */
export function isBuildingKind(kind: string): kind is BuildingKind {
  return kind in BUILDING_COSTS;
}

/** The building on square (x, y), or `null`. */
export function buildingAt(
  state: { buildings: FrontierBuilding[] },
  x: number,
  y: number,
): FrontierBuilding | null {
  return state.buildings.find((b) => b.x === x && b.y === y) ?? null;
}

/** True if a building of kind `kind` stands anywhere. */
export function hasBuilding(state: { buildings: FrontierBuilding[] }, kind: BuildingKind): boolean {
  return state.buildings.some((b) => b.kind === kind);
}

/** How far a saw house reaches: a level-1 camp's radius (FRONTIER_SAW_HOUSE.radiusOfLevel). */
export function sawHouseReach(): number {
  return campRadius(FRONTIER_SAW_HOUSE.radiusOfLevel);
}

/** True if a saw house reaches square (x, y): it is inside the circle round one. */
export function sawHouseReaches(
  state: { buildings: FrontierBuilding[] },
  x: number,
  y: number,
): boolean {
  const reach = sawHouseReach();
  return state.buildings.some((b) => b.kind === 'sawHouse' && inCircle(b.x, b.y, reach, x, y));
}

/** The wood a tree felled on square (x, y) gives now: see the top of this file. */
export function woodFromTree(state: FrontierState, x: number, y: number): number {
  const axe = (state.inventory.get(FRONTIER_AXE.item) ?? 0) > 0;
  const base = axe ? FRONTIER_AXE.woodPerTree : FRONTIER_SURFACE.woodPerTree;
  return base + (sawHouseReaches(state, x, y) ? FRONTIER_SAW_HOUSE.bonus : 0);
}

/**
 * Why a building of kind `kind` cannot be built on square (x, y) now, or
 * `null` if it can:
 * - 'unknown': `kind` is not a kind of building;
 * - 'notShown': the square is off the map, in the fog or greyed;
 * - 'camp': it is a camp's ground;
 * - 'occupied': a building stands there already;
 * - 'ground': it was mined (only ground never dug will do);
 * - 'growing': grass, a tree, a stump or a planted sapling is on it;
 * - 'animal': an animal stands on it;
 * - 'hazard': it is flooded, burning, or a dragon is on it;
 * - 'cost': the store does not hold its cost.
 */
export type BuildRefusal =
  | 'unknown'
  | 'notShown'
  | 'camp'
  | 'occupied'
  | 'ground'
  | 'growing'
  | 'animal'
  | 'hazard'
  | 'cost';

export function buildRefusal(
  state: FrontierState,
  kind: string,
  x: number,
  y: number,
): BuildRefusal | null {
  if (!isBuildingKind(kind)) return 'unknown';
  const width = state.cube.size.x;
  const onMap = x >= 0 && y >= 0 && x < width && y < state.cube.size.y;
  if (!onMap || sightAt(state, x, y) !== 'shown') return 'notShown';
  if (campAt(state.camps, x, y) !== null) return 'camp';
  if (buildingAt(state, x, y) !== null) return 'occupied';
  // Ground never mined: its top block is still the surface's dirt.
  const surface = FRONTIER_SURFACE.plantsGrowOn.map((id) => BLOCKS[id].code);
  if (!surface.includes(blockAt(state.cube, { x, y, z: 0 }))) return 'ground';
  const i = x + width * y;
  if (
    (state.features[i] ?? NO_FEATURE) !== NO_FEATURE ||
    (state.stumps[i] ?? NO_FEATURE) !== NO_FEATURE ||
    state.planted[i] === true ||
    state.mushrooms[i] === true ||
    (state.crops[i] ?? 0) > 0
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
  if (!canAfford(state.inventory, BUILDING_COSTS[kind])) return 'cost';
  return null;
}

/** Build a `kind` on square (x, y). If `buildRefusal` says no, the very same state comes back. */
export function build(state: FrontierState, kind: string, x: number, y: number): FrontierState {
  if (!isBuildingKind(kind) || buildRefusal(state, kind, x, y) !== null) return state;
  const i = x + state.cube.size.x * y;
  // Cut grass waiting to grow back there never will.
  const grassIn = [...state.grassIn];
  grassIn[i] = -1;
  return {
    ...state,
    grassIn,
    buildings: [...state.buildings, { kind, x, y }],
    inventory: pay(state.inventory, BUILDING_COSTS[kind]),
  };
}
