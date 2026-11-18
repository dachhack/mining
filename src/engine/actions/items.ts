// Picking up and dropping loose items (design doc 4.1; 0005 item 17; owner
// question 30).
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

import { ACTION_COSTS } from '../../data';
import type { Vec3 } from '../../data';
import type { DropAction, PickUpAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { canCarry } from '../inventory';
import { FACE_OFFSETS, offsetPosition } from '../neighbours';
import {
  addItem,
  addLooseItems,
  inventoryEntries,
  looseItemsAt,
  removeItem,
  removeLooseItems,
} from '../state';
import type { GameState } from '../state';

/**
 * The most of `item`, up to `available`, that still fits the carry limit.
 * 0 if not even one fits.
 */
function countThatFits(state: GameState, item: string, available: number): number {
  let count = available;
  while (count > 0 && !canCarry(state, item, count)) {
    count -= 1;
  }
  return count;
}

/**
 * Every pick-up the player could make now: loose items in the avatar's cell
 * or a face neighbour (0005 item 17) that fit the carry limit. `ap` is
 * `ACTION_COSTS.pickUp`.
 *
 * One action for each pile (a cell and an item): `count` is the whole pile,
 * or, when only part of it fits, as many as fit. A pile of which not even
 * one fits gets no action. Order: the avatar's cell first, then the six face
 * neighbours in the order of `FACE_OFFSETS`, and within a cell by item id.
 */
export function legalPickUpActions(state: GameState): PickUpAction[] {
  const cells: Vec3[] = [state.avatar.pos];
  for (const offset of FACE_OFFSETS) {
    cells.push(offsetPosition(state.avatar.pos, offset));
  }

  const actions: PickUpAction[] = [];
  for (const cell of cells) {
    // `looseItemsAt` gives the piles of one cell sorted by item id.
    for (const pile of looseItemsAt(state, cell)) {
      const count = countThatFits(state, pile.item, pile.count);
      if (count > 0) {
        actions.push({
          type: 'pickUp',
          from: { ...cell },
          item: pile.item,
          count,
          ap: ACTION_COSTS.pickUp,
        });
      }
    }
  }
  return actions;
}

/** Move the items from the pile into the inventory. Emits `itemPickedUp`. */
export function applyPickUp(state: GameState, action: PickUpAction, events: GameEvent[]): void {
  removeLooseItems(state, action.from, action.item, action.count);
  addItem(state, action.item, action.count);
  events.push({
    type: 'itemPickedUp',
    from: { ...action.from },
    item: action.item,
    count: action.count,
  });
}

/**
 * Every drop the player could make now: carried items, into the avatar's own
 * cell (0005 item 17). `ap` is `ACTION_COSTS.drop`.
 *
 * For each carried item, in `inventoryEntries` order: one action that drops a
 * single unit and, if more than one is carried, one that drops them all. Not
 * one action for every count in between, so the list stays short.
 */
export function legalDropActions(state: GameState): DropAction[] {
  const actions: DropAction[] = [];
  for (const entry of inventoryEntries(state)) {
    actions.push({ type: 'drop', item: entry.item, count: 1, ap: ACTION_COSTS.drop });
    if (entry.count > 1) {
      actions.push({ type: 'drop', item: entry.item, count: entry.count, ap: ACTION_COSTS.drop });
    }
  }
  return actions;
}

/**
 * Move the items from the inventory to the avatar's cell. Emits
 * `itemDropped`; if they then fall, that is `settle`'s.
 */
export function applyDrop(state: GameState, action: DropAction, events: GameEvent[]): void {
  const pos = { ...state.avatar.pos };
  removeItem(state, action.item, action.count);
  addLooseItems(state, pos, action.item, action.count);
  events.push({ type: 'itemDropped', pos, item: action.item, count: action.count });
}
