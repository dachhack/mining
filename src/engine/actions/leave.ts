// Leaving the cube. STUB: filled in by M1 task 5.

import type { LeaveAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Every `LeaveAction` the player could take now.
 *
 * Contract:
 * - A single action while the avatar is on the surface, otherwise none
 *   (0005 item 23). `ap` is `ACTION_COSTS.leave`.
 * - Applying it ends the run: `endRun(state, 'salvage', 'left', events)`.
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP, each with its true `ap`
 *   cost; the dispatcher in index.ts removes the ones that cost more than the
 *   AP left.
 * - The order of the list must be the same for any two states with the same
 *   hash, including a state and its saved-and-loaded copy. Walk cells in a
 *   fixed order, the inventory with `inventoryEntries(state)` and loose
 *   items with `state.looseItems` or `looseItemsAt`; never loop over
 *   `state.inventory` itself, whose key order a save does not keep.
 *
 * Stub behaviour: returns an empty list.
 */
export function legalLeaveActions(_state: GameState): LeaveAction[] {
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
export function applyLeave(_state: GameState, _action: LeaveAction, _events: GameEvent[]): void {
  throw new Error('applyLeave: not implemented');
}
