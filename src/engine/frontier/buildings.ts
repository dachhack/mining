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
  FRONTIER_WORK_CAMPS,
} from '../../data/frontier';
import { blockAt } from '../state';
import { campAt, campRadius, canAfford, inCircle, pay, sightAt } from './camps';
import { NO_FEATURE, buildingFootprint, isWorkCamp } from './state';

export { buildingFootprint, isWorkCamp };
import type { BuildingKind, FrontierBuilding, FrontierState } from './state';

/** What each kind of building costs. */
export const BUILDING_COSTS: Record<BuildingKind, ItemStack[]> = {
  sawHouse: FRONTIER_SAW_HOUSE.cost,
  sugarShack: FRONTIER_SUGAR_SHACK.cost,
  lumberCamp: FRONTIER_WORK_CAMPS.lumberCamp.cost,
  farmCamp: FRONTIER_WORK_CAMPS.farmCamp.cost,
  hermitCamp: FRONTIER_WORK_CAMPS.hermitCamp.cost,
};

/** True if `kind` names a kind of building. */
export function isBuildingKind(kind: string): kind is BuildingKind {
  return kind in BUILDING_COSTS;
}

/** The building standing on square (x, y) (any square of its footprint), or `null`. */
export function buildingAt(
  state: { buildings: FrontierBuilding[] },
  x: number,
  y: number,
): FrontierBuilding | null {
  return (
    state.buildings.find((b) =>
      buildingFootprint(b.kind, b.x, b.y).some((s) => s.x === x && s.y === y),
    ) ?? null
  );
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
 * - 'sawHouse': a lumberjack camp that touches no saw house;
 * - 'cost': the store does not hold its cost.
 * For a 2 x 2 work camp, every square of it is checked.
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
  | 'sawHouse'
  | 'cost';

export function buildRefusal(
  state: FrontierState,
  kind: string,
  x: number,
  y: number,
): BuildRefusal | null {
  if (!isBuildingKind(kind)) return 'unknown';
  const width = state.cube.size.x;
  const surface = FRONTIER_SURFACE.plantsGrowOn.map((id) => BLOCKS[id].code);
  // Every square of its footprint must do (a work camp is 2 x 2).
  for (const sq of buildingFootprint(kind, x, y)) {
    const onMap = sq.x >= 0 && sq.y >= 0 && sq.x < width && sq.y < state.cube.size.y;
    if (!onMap || sightAt(state, sq.x, sq.y) !== 'shown') return 'notShown';
    if (campAt(state.camps, sq.x, sq.y) !== null) return 'camp';
    if (buildingAt(state, sq.x, sq.y) !== null) return 'occupied';
    // Ground never mined: its top block is still the surface's dirt.
    if (!surface.includes(blockAt(state.cube, { x: sq.x, y: sq.y, z: 0 }))) return 'ground';
    const i = sq.x + width * sq.y;
    if (
      (state.features[i] ?? NO_FEATURE) !== NO_FEATURE ||
      (state.stumps[i] ?? NO_FEATURE) !== NO_FEATURE ||
      state.planted[i] === true ||
      state.mushrooms[i] === true ||
      (state.crops[i] ?? 0) > 0
    ) {
      return 'growing';
    }
    if (state.animals.some((a) => a.x === sq.x && a.y === sq.y)) return 'animal';
    const h = state.hazards;
    if (
      h.flooded[i] === true ||
      h.fires[i] === true ||
      h.dragons.some((d) => d.x === sq.x && d.y === sq.y)
    ) {
      return 'hazard';
    }
  }
  // A lumberjack camp stands next to a saw house (owner, after the 0.20.0 build).
  if (kind === 'lumberCamp' && !besideSawHouse(state, x, y)) return 'sawHouse';
  if (!canAfford(state.inventory, BUILDING_COSTS[kind])) return 'cost';
  return null;
}

/** True if a 2 x 2 at (x, y) touches a saw house: a saw house on one of the squares round it, corners too. */
export function besideSawHouse(
  state: { buildings: FrontierBuilding[] },
  x: number,
  y: number,
): boolean {
  return state.buildings.some(
    (b) => b.kind === 'sawHouse' && b.x >= x - 1 && b.x <= x + 2 && b.y >= y - 1 && b.y <= y + 2,
  );
}

/** Build a `kind` on square (x, y). If `buildRefusal` says no, the very same state comes back. */
export function build(state: FrontierState, kind: string, x: number, y: number): FrontierState {
  if (!isBuildingKind(kind) || buildRefusal(state, kind, x, y) !== null) return state;
  // Cut grass waiting to grow back there never will.
  const grassIn = [...state.grassIn];
  for (const sq of buildingFootprint(kind, x, y)) grassIn[sq.x + state.cube.size.x * sq.y] = -1;
  return {
    ...state,
    grassIn,
    buildings: [...state.buildings, { kind, x, y, workers: 0, horses: 0 }],
    inventory: pay(state.inventory, BUILDING_COSTS[kind]),
  };
}
