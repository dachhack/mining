// Picking up and dropping loose items. STUB: filled in by M1 task 4.
//
// Both follow the same contract as the other action modules:
// - the `legal...` function does not change `state`, lists actions as if the
//   avatar had unlimited AP (the dispatcher in index.ts removes the ones that
//   cost too much), and returns them in an order that depends only on `state`;
// - the `apply...` function changes `state` in place (it is the dispatcher's
//   private copy), appends to `events`, and leaves AP, gravity and reveal to
//   the dispatcher.

import type { DropAction, PickUpAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Every pick-up the player could make now: loose items in the avatar's cell
 * or a face neighbour (0005 item 17) that fit the carry limit. `ap` is
 * `ACTION_COSTS.pickUp`.
 *
 * Stub behaviour: returns an empty list.
 */
export function legalPickUpActions(_state: GameState): PickUpAction[] {
  return [];
}

/**
 * Move the items from `state.looseItems` into the inventory. Emits `itemGained`.
 *
 * Stub behaviour: throws "not implemented".
 */
export function applyPickUp(_state: GameState, _action: PickUpAction, _events: GameEvent[]): void {
  throw new Error('applyPickUp: not implemented');
}

/**
 * Every drop the player could make now: carried items, into the avatar's own
 * cell (0005 item 17). `ap` is `ACTION_COSTS.drop`.
 *
 * Stub behaviour: returns an empty list.
 */
export function legalDropActions(_state: GameState): DropAction[] {
  return [];
}

/**
 * Move the items from the inventory into `state.looseItems` at the avatar's
 * cell. Emits `itemDropped`; if they then fall, that is `settle`'s.
 *
 * Stub behaviour: throws "not implemented".
 */
export function applyDrop(_state: GameState, _action: DropAction, _events: GameEvent[]): void {
  throw new Error('applyDrop: not implemented');
}
