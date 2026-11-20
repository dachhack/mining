// Crafting: field recipes anywhere (design doc 7.1), and camp recipes while
// at least one camp stands (7.2 and 8: a camp's functions are available from
// anywhere on the map, because the crew is abstract).

import { ACTION_COSTS, CAMP_RECIPES, FIELD_RECIPES, findCampRecipe, findRecipe } from '../../data';
import type { RecipeDef } from '../../data';
import type { CraftAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { addItem, countItem, removeItem } from '../state';
import type { GameState } from '../state';

/** True if the stockpile holds every input of `recipe`. */
function hasInputs(state: GameState, recipe: RecipeDef): boolean {
  for (const input of recipe.inputs) {
    if (countItem(state, input.item) < input.count) {
      return false;
    }
  }
  return true;
}

/**
 * Every `CraftAction` the player could take now.
 *
 * - One action for each recipe in `FIELD_RECIPES` whose inputs are in the
 *   stockpile (design doc 7.1), in `FIELD_RECIPES` order.
 * - Then, only while at least one camp stands, one for each recipe in
 *   `CAMP_RECIPES` whose inputs are in the stockpile (design doc 7.2), in
 *   `CAMP_RECIPES` order, for `ACTION_COSTS.campCraft` AP. A destroyed or
 *   decommissioned camp is not in `state.camps`, so it gives no recipes.
 * - The stockpile has no limit (design doc 4.1), so a craft is never refused
 *   for want of room.
 * - `ap` of a field recipe is `ACTION_COSTS.craft`.
 * - Does not change `state`.
 * - Lists actions as if there were unlimited AP; the dispatcher in
 *   index.ts removes the ones that cost more than the AP left.
 * - The order depends only on the two tables, so it is the same for any two
 *   states with the same hash.
 */
export function legalCraftActions(state: GameState): CraftAction[] {
  const actions: CraftAction[] = [];
  for (const recipe of FIELD_RECIPES) {
    if (!hasInputs(state, recipe)) {
      continue;
    }
    actions.push({ type: 'craft', recipe: recipe.id, ap: ACTION_COSTS.craft });
  }
  if (state.camps.length > 0) {
    for (const recipe of CAMP_RECIPES) {
      if (!hasInputs(state, recipe)) {
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
 * - Takes the inputs from the stockpile, emits `crafted`, then adds the
 *   output: an item into the stockpile (`itemGained`) or an amount on the fuel gauge (`fuelChanged`, reason
 *   `crafted`).
 * - Changes `state` in place (it is the dispatcher's private copy) and
 *   appends what happened to `events`.
 * - Does not spend the AP: the dispatcher has already taken `action.ap` off.
 * - Does not reveal: the dispatcher does that afterwards.
 */
export function applyCraft(state: GameState, action: CraftAction, events: GameEvent[]): void {
  // Recipe ids are unique across the two tables (`validateData` checks), so
  // looking in one and then the other cannot pick the wrong recipe.
  // `a ?? b` is "a, unless a is undefined, then b".
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
  } else {
    // `validateData` rejects a recipe that names any other gauge.
    throw new Error(`Recipe "${recipe.id}" fills an unknown gauge: ${output.gauge}`);
  }
}
