// Field crafting (design doc 7.1).

import { ACTION_COSTS, FIELD_RECIPES, findRecipe } from '../../data';
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
 * - The stockpile has no limit (design doc 4.1), so a craft is never refused
 *   for want of room.
 * - `ap` is `ACTION_COSTS.craft`.
 * - Does not change `state`.
 * - Lists actions as if there were unlimited AP; the dispatcher in
 *   index.ts removes the ones that cost more than the AP left.
 * - The order depends only on `FIELD_RECIPES`, so it is the same for any two
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
  const recipe = findRecipe(action.recipe);
  if (recipe === undefined) {
    throw new Error(`Unknown field recipe: ${action.recipe}`);
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
