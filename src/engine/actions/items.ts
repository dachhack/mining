// Picking up and dropping loose items. STUB: filled in by M1 task 4.
//
// Both follow the same contract as the other action modules:
// - the `legal...` function does not change `state`, and lists actions as if
//   the avatar had unlimited AP (the dispatcher in index.ts removes the ones
//   that cost too much);
// - its list must be in the same order for any two states with the same hash,
//   including a state and its saved-and-loaded copy: walk the inventory with
//   `inventoryEntries(state)` and loose items with `looseItemsAt`, never
//   `state.inventory` itself;
// - the `apply...` function changes `state` in place (it is the dispatcher's
//   private copy), appends to `events`, and leaves AP, gravity and reveal to
//   the dispatcher;
// - loose items are changed only through `addLooseItems` and
//   `removeLooseItems` in state.ts, which keep one pile per cell and item.

import type { DropAction, PickUpAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Every pick-up the player could make now: loose items in the avatar's cell
 * or a face neighbour (0005 item 17) that fit the carry limit (`canCarry` in
 * inventory.ts). `ap` is `ACTION_COSTS.pickUp`.
 *
 * One action for each pile (a cell and an item): `count` is the whole pile,
 * or, when only part of it fits, as many as fit. A pile of which not even
 * one fits gets no action. Order: the avatar's cell first, then the face
 * neighbours in a fixed order, and within a cell by item id.
 *
 * Stub behaviour: returns an empty list.
 */
export function legalPickUpActions(_state: GameState): PickUpAction[] {
  return [];
}

/**
 * Move the items from the pile into the inventory (`removeLooseItems`, then
 * `addItem`). Emits `itemPickedUp` with the cell they came from.
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
 * For each carried item, in `inventoryEntries` order: one action that drops a
 * single unit and, if more than one is carried, one that drops them all. Not
 * one action for every count in between, so the list stays short.
 *
 * Stub behaviour: returns an empty list.
 */
export function legalDropActions(_state: GameState): DropAction[] {
  return [];
}

/**
 * Move the items from the inventory to the avatar's cell (`removeItem`, then
 * `addLooseItems`). Emits `itemDropped`; if they then fall, that is `settle`'s.
 *
 * Stub behaviour: throws "not implemented".
 */
export function applyDrop(_state: GameState, _action: DropAction, _events: GameEvent[]): void {
  throw new Error('applyDrop: not implemented');
}
