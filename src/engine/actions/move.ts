// Moving the avatar. STUB: filled in by M1 task 3.

import type { MoveAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Every `MoveAction` the player could take now.
 *
 * Contract:
 * - The moves of 0005 item 6 (walk, step up, climb a ladder up or down) and
 *   the chosen drops of item 7, with `drop` set to the blocks fallen.
 * - `ap` is `ACTION_COSTS.move`. Emits `moved`; the fall itself is `settle`'s.
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP, each with its true `ap`
 *   cost; the dispatcher in index.ts removes the ones that cost more than the
 *   AP left.
 * - The order of the list must depend only on `state`.
 *
 * Stub behaviour: returns an empty list.
 */
export function legalMoveActions(_state: GameState): MoveAction[] {
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
export function applyMove(_state: GameState, _action: MoveAction, _events: GameEvent[]): void {
  throw new Error('applyMove: not implemented');
}
