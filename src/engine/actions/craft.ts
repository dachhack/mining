// Crafting: field recipes anywhere (design doc 7.1), and camp recipes in any
// cell of an active camp (design doc 7.2 and 8; 0014 item 27). Both use the
// one `craft` action, which names a recipe by its id; ids are unique across
// the two tables.

import { ACTION_COSTS, CAMP_RECIPES, FIELD_RECIPES, findCampRecipe, findRecipe } from '../../data';
import type { RecipeDef } from '../../data';
import type { CraftAction } from '../actionTypes';
import { campOfAvatar, kitLimitRoomFor } from '../camps';
import type { GameEvent } from '../events';
import { carriedWeight, carryCapacity, stackWeight } from '../inventory';
import { addItem, countItem, removeItem } from '../state';
import type { GameState } from '../state';

/** True if the avatar carries every input of `recipe`. */
function hasInputs(state: GameState, recipe: RecipeDef): boolean {
  for (const input of recipe.inputs) {
    if (countItem(state, input.item) < input.count) {
      return false;
    }
  }
  return true;
}

/**
 * The weight the avatar would carry after crafting `recipe` once: what it
 * carries now, less the inputs, plus the output. Fuel and lamp oil are gauges
 * and weigh nothing (0005 item 18).
 */
function weightAfterCraft(state: GameState, recipe: RecipeDef): number {
  let weight = carriedWeight(state);
  for (const input of recipe.inputs) {
    weight -= stackWeight(input.item, input.count);
  }
  if (recipe.output.kind === 'item') {
    weight += stackWeight(recipe.output.item, recipe.output.count);
  }
  return weight;
}

/**
 * True if crafting `recipe` once would leave the avatar with more camp kits
 * than it may carry (design doc 8: "the avatar can carry only one kit"). Only
 * the camp-kit recipe can; for every other recipe this is false.
 */
function breaksKitLimit(state: GameState, recipe: RecipeDef): boolean {
  if (recipe.output.kind !== 'item') {
    return false;
  }
  return recipe.output.count > kitLimitRoomFor(state, recipe.output.item);
}

/**
 * Every `CraftAction` the player could take now.
 *
 * - One action for each recipe in `FIELD_RECIPES` whose inputs the avatar
 *   carries (design doc 7.1), in `FIELD_RECIPES` order.
 * - Only if the result fits the carry limit, counting the inputs as gone.
 *   The same test is applied to every recipe, including the two that fill a
 *   gauge. With the M1 recipes and weights no craft makes the load heavier,
 *   so this only ever refuses a craft when the avatar is already over the
 *   limit.
 * - `ap` is `ACTION_COSTS.craft`.
 * - Then, only if the avatar is in a cell of an active camp: one action for
 *   each recipe in `CAMP_RECIPES` (design doc 7.2), in that table's order,
 *   by the same two tests, at `ACTION_COSTS.campCraft`. The camp-kit recipe
 *   is not offered while the avatar already carries a kit (design doc 8).
 *   Inputs come from the inventory, not from the stash.
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP; the dispatcher in
 *   index.ts removes the ones that cost more than the AP left.
 * - The order depends only on the two recipe tables, so it is the same for
 *   any two states with the same hash.
 */
export function legalCraftActions(state: GameState): CraftAction[] {
  const actions: CraftAction[] = [];
  for (const recipe of FIELD_RECIPES) {
    if (!hasInputs(state, recipe)) {
      continue;
    }
    if (weightAfterCraft(state, recipe) > carryCapacity()) {
      continue;
    }
    actions.push({ type: 'craft', recipe: recipe.id, ap: ACTION_COSTS.craft });
  }
  if (campOfAvatar(state) !== null) {
    for (const recipe of CAMP_RECIPES) {
      if (!hasInputs(state, recipe)) {
        continue;
      }
      if (weightAfterCraft(state, recipe) > carryCapacity()) {
        continue;
      }
      if (breaksKitLimit(state, recipe)) {
        continue;
      }
      actions.push({ type: 'craft', recipe: recipe.id, ap: ACTION_COSTS.campCraft });
    }
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list.
 *
 * - Removes the inputs, emits `crafted`, then adds the output: an item
 *   (`itemGained`) or an amount on a gauge (`fuelChanged` or
 *   `lampOilChanged`, reason `crafted`).
 * - Changes `state` in place (it is the dispatcher's private copy) and
 *   appends what happened to `events`.
 * - Does not spend the AP: the dispatcher has already taken `action.ap` off.
 * - Does not apply gravity or reveal: the dispatcher does that afterwards.
 */
export function applyCraft(state: GameState, action: CraftAction, events: GameEvent[]): void {
  // A field recipe, or else a camp recipe. (`??` means "or, if missing".)
  const recipe = findRecipe(action.recipe) ?? findCampRecipe(action.recipe);
  if (recipe === undefined) {
    throw new Error(`Unknown recipe: ${action.recipe}`);
  }

  for (const input of recipe.inputs) {
    removeItem(state, input.item, input.count);
  }
  events.push({ type: 'crafted', recipe: recipe.id });

  const output = recipe.output;
  if (output.kind === 'item') {
    addItem(state, output.item, output.count);
    events.push({ type: 'itemGained', item: output.item, count: output.count });
  } else if (output.gauge === 'fuel') {
    state.fuel += output.amount;
    events.push({ type: 'fuelChanged', delta: output.amount, fuel: state.fuel, reason: 'crafted' });
  } else if (output.gauge === 'lampOil') {
    state.lampOil += output.amount;
    events.push({
      type: 'lampOilChanged',
      delta: output.amount,
      lampOil: state.lampOil,
      reason: 'crafted',
    });
  } else {
    // `validateData` rejects a recipe that names any other gauge.
    throw new Error(`Recipe "${recipe.id}" fills an unknown gauge: ${output.gauge}`);
  }
}
