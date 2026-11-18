// Field crafting. STUB: filled in by M1 task 5.

import type { CraftAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Every `CraftAction` the player could take now.
 *
 * Contract:
 * - One action for each recipe in `FIELD_RECIPES` whose inputs the avatar
 *   carries (design doc 7.1).
 * - `ap` is `ACTION_COSTS.craft`. Removes the inputs and adds the output: an
 *   item (`itemGained`) or an amount on a gauge (`fuelChanged` or
 *   `lampOilChanged`, reason `crafted`). Emits `crafted`.
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP, each with its true `ap`
 *   cost; the dispatcher in index.ts removes the ones that cost more than the
 *   AP left.
 * - The order of the list must depend only on `state`.
 *
 * Stub behaviour: returns an empty list.
 */
export function legalCraftActions(_state: GameState): CraftAction[] {
  return [];
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list.
 *
 * Contract:
 * - Changes `state` in place (it is the dispatcher's private copy) and
 *   appends what happened to `events`.
 * - Does not spend the AP: the dispatcher has already taken `action.ap` off.
 * - Does not apply gravity or reveal: the dispatcher calls `settle` and
 *   `updateReveal` afterwards.
 *
 * Stub behaviour: throws "not implemented".
 */
export function applyCraft(_state: GameState, _action: CraftAction, _events: GameEvent[]): void {
  throw new Error('applyCraft: not implemented');
}
