// The surface in the new game (plan A3): taking what is on a square at
// ground level. Lab 2's harvests (src/app/lab/surface.ts), in the engine:
//
// - an animal standing on the square is caught (1 animal);
// - a mushroom is picked (1 mushroom; mushrooms.ts);
// - grass is cut (grass);
// - an apple tree with apples gives one apple a tap, and a maple tree with
//   sap one sap a tap (`cropOf`);
// - a tree, or an apple or maple tree with nothing left, is felled (wood:
//   more with an axe or near a saw house, buildings.ts).
//
// Only then can the block under the square be mined. Animals moving, and
// apples, felled trees and cut grass growing back, happen at the end of a
// shift (shift.ts). Saplings come only from the market (market.ts). The
// numbers are in src/data/frontier.ts.

import type { ItemStack } from '../../data';
import { FRONTIER_SHIFT, FRONTIER_SURFACE } from '../../data/frontier';
import { woodFromTree } from './buildings';
import { GRASS, NO_FEATURE, cropOf, isTree } from './state';
import type { FrontierAnimal, FrontierState } from './state';

/** What a harvest was: an animal 'caught', 'grass' cut, an 'apple' picked, 'sap' tapped or a tree 'felled'. */
export type HarvestKind = 'caught' | 'mushroom' | 'grass' | 'apple' | 'sap' | 'felled';

/** What `harvestAt` did: the state after it, what it gave and what it was. */
export interface FrontierHarvest {
  state: FrontierState;
  gain: ItemStack;
  /** A sapling that came with a felled tree, or `null`. */
  extra: ItemStack | null;
  kind: HarvestKind;
}

/** What a tree of kind `feature` holds when full: apples or sap (`cropOf`); 0 for any other kind. */
export function fullCrop(feature: number | undefined): number {
  const crop = cropOf(feature);
  if (crop === 'apple') return FRONTIER_SURFACE.applesPerTree;
  if (crop === 'sap') return FRONTIER_SURFACE.sapPerTree;
  return 0;
}

/** The animal on square (x, y), or `null`. */
export function animalAt(state: FrontierState, x: number, y: number): FrontierAnimal | null {
  return state.animals.find((a) => a.x === x && a.y === y) ?? null;
}

/** `list` with item `i` set to `value`, as a new list. */
function replaced<T>(list: T[], i: number, value: T): T[] {
  const copy = [...list];
  copy[i] = value;
  return copy;
}

/** `inventory` with `gain` added, as a new map. */
export function gained(inventory: Map<string, number>, gain: ItemStack): Map<string, number> {
  const next = new Map(inventory);
  next.set(gain.item, (next.get(gain.item) ?? 0) + gain.count);
  return next;
}

/**
 * Take what is on square (x, y): catch the animal there; or else cut the
 * grass, pick an apple, or fell the tree. What it gives goes into the
 * inventory. `null` if there is nothing to take (the block under it may then
 * be mined). This does not check the square is lit or free of camps:
 * `frontierTap` does.
 */
export function harvestAt(state: FrontierState, x: number, y: number): FrontierHarvest | null {
  const take = (
    next: FrontierState,
    gain: ItemStack,
    kind: HarvestKind,
    extra: ItemStack | null = null,
  ): FrontierHarvest => {
    const inventory = gained(state.inventory, gain);
    return {
      state: { ...next, inventory: extra === null ? inventory : gained(inventory, extra) },
      gain,
      extra,
      kind,
    };
  };
  const animal = animalAt(state, x, y);
  if (animal !== null) {
    const animals = state.animals.filter((a) => a.id !== animal.id);
    return take({ ...state, animals }, { item: 'animal', count: 1 }, 'caught');
  }
  const i = x + state.cube.size.x * y;
  // A mushroom is picked before what grows under it (mushrooms.ts).
  if (state.mushrooms[i] === true) {
    const mushrooms = replaced(state.mushrooms, i, false);
    return take({ ...state, mushrooms }, { item: 'mushroom', count: 1 }, 'mushroom');
  }
  const feature = state.features[i];
  if (feature === GRASS) {
    const features = replaced(state.features, i, NO_FEATURE);
    // It grows back some shifts later, if grass grows beside it then (shift.ts).
    const grassIn = replaced(state.grassIn, i, FRONTIER_SHIFT.grassRegrowShifts);
    return take(
      { ...state, features, grassIn },
      { item: 'grass', count: FRONTIER_SURFACE.grassPerTuft },
      'grass',
    );
  }
  const held = state.apples[i] ?? 0;
  const crop = cropOf(feature);
  if (crop !== null && held > 0) {
    // Picked bare (or tapped dry), the tree fills again some shifts later (A4).
    const regrowIn =
      held === 1 ? replaced(state.regrowIn, i, FRONTIER_SHIFT.appleRegrowShifts) : state.regrowIn;
    return take(
      { ...state, apples: replaced(state.apples, i, held - 1), regrowIn },
      { item: crop, count: 1 },
      crop,
    );
  }
  if (isTree(feature)) {
    const features = replaced(state.features, i, NO_FEATURE);
    // The stump grows the same kind of tree back some shifts later (question
    // 157). An apple tree's wait for its apples ends with it: it comes back full.
    const stumps = replaced(state.stumps, i, feature);
    const regrowIn = replaced(state.regrowIn, i, FRONTIER_SHIFT.treeRegrowShifts);
    // Counted, for the record; saplings come only from the market.
    const treesFelled = state.treesFelled + 1;
    return take(
      { ...state, features, stumps, regrowIn, treesFelled },
      // More with an axe, and near a saw house (buildings.ts).
      { item: 'wood', count: woodFromTree(state, x, y) },
      'felled',
    );
  }

  return null;
}
