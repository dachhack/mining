// Placing a torch. STUB: filled in by M1 task 4.

import type { PlaceTorchAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Every `PlaceTorchAction` the player could take now.
 *
 * Contract:
 * - One action for each cell a torch may go in (0005 item 19: the same cells
 *   as a ladder), if the avatar carries a torch.
 * - `ap` is `ACTION_COSTS.placeTorch`. Uses up one torch; emits `structurePlaced`.
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP, each with its true `ap`
 *   cost; the dispatcher in index.ts removes the ones that cost more than the
 *   AP left.
 * - The order of the list must depend only on `state`.
 *
 * Stub behaviour: returns an empty list.
 */
export function legalPlaceTorchActions(_state: GameState): PlaceTorchAction[] {
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
export function applyPlaceTorch(
  _state: GameState,
  _action: PlaceTorchAction,
  _events: GameEvent[],
): void {
  throw new Error('applyPlaceTorch: not implemented');
}
