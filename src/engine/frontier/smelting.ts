// Smelting and crafting in the new game (docs/plans/smelting-and-crafting.md,
// PR 1 of 5): the smelter, and making what the recipe book lists.
//
// - A smelter is built at a camp of level FRONTIER_SMELTER.minLevel or more,
//   for FRONTIER_SMELTER.cost (owner, question 161). One per camp; it goes
//   with the camp when the camp is demolished.
// - A recipe (FRONTIER_RECIPES) is made while a smelter stands somewhere: its
//   inputs leave the store and its output joins it (owner, question 162:
//   2 raw ore + 1 coal make 2 ingots).
// Each costs 1 tap, as every action that does something does; shift.ts
// charges it. The numbers are in src/data/frontier.ts.

import type { ItemStack } from '../../data';
import { FRONTIER_RECIPES, FRONTIER_SMELTER } from '../../data/frontier';
import type { FrontierRecipe } from '../../data/frontier';
import { canAfford, pay } from './camps';
import { gained } from './surface';
import type { FrontierState } from './state';

/**
 * Why a smelter cannot be built at camp `id`, or `null` if it can:
 * - 'missing': there is no such camp;
 * - 'campLevel': the camp's level is below FRONTIER_SMELTER.minLevel;
 * - 'hasSmelter': the camp has one already;
 * - 'cost': the store does not hold FRONTIER_SMELTER.cost.
 */
export type SmelterRefusal = 'missing' | 'campLevel' | 'hasSmelter' | 'cost';

export function smelterRefusal(state: FrontierState, id: number): SmelterRefusal | null {
  const camp = state.camps.find((c) => c.id === id);
  if (camp === undefined) return 'missing';
  if (camp.level < FRONTIER_SMELTER.minLevel) return 'campLevel';
  if (camp.smelter) return 'hasSmelter';
  if (!canAfford(state.inventory, FRONTIER_SMELTER.cost)) return 'cost';
  return null;
}

/** Build a smelter at camp `id` and pay for it. If `smelterRefusal` says no, the very same state comes back. */
export function buildSmelter(state: FrontierState, id: number): FrontierState {
  if (smelterRefusal(state, id) !== null) {
    return state;
  }
  return {
    ...state,
    camps: state.camps.map((c) => (c.id === id ? { ...c, smelter: true } : c)),
    inventory: pay(state.inventory, FRONTIER_SMELTER.cost),
  };
}

/** True if a smelter stands at some camp. */
export function hasSmelter(state: FrontierState): boolean {
  return state.camps.some((c) => c.smelter);
}

/** The recipe called `id`, or `null` if there is none. */
export function frontierRecipe(id: string): FrontierRecipe | null {
  return FRONTIER_RECIPES.find((r) => r.id === id) ?? null;
}

/**
 * Why recipe `id` cannot be made now, or `null` if it can:
 * - 'unknown': there is no such recipe;
 * - 'noSmelter': no camp has a smelter;
 * - 'cost': the store does not hold its inputs.
 */
export type MakeRefusal = 'unknown' | 'noSmelter' | 'cost';

export function makeRefusal(state: FrontierState, id: string): MakeRefusal | null {
  const recipe = frontierRecipe(id);
  if (recipe === null) return 'unknown';
  if (!hasSmelter(state)) return 'noSmelter';
  if (!canAfford(state.inventory, recipe.inputs)) return 'cost';
  return null;
}

/** Make recipe `id` once: its inputs are paid and its output stored. If `makeRefusal` says no, the very same state comes back. */
export function makeRecipe(state: FrontierState, id: string): FrontierState {
  const recipe = frontierRecipe(id);
  if (recipe === null || makeRefusal(state, id) !== null) {
    return state;
  }
  const output: ItemStack = recipe.output;
  return { ...state, inventory: gained(pay(state.inventory, recipe.inputs), output) };
}
