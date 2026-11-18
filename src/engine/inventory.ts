// Carry weight (design doc 5.1; 0005 item 18).
//
// Plain counting (how many of an item, add, remove) is in state.ts. This
// module is the carry limit on top of it. It is implemented here, in the
// skeleton, because mining and pick-up (task 4) and crafting (task 5) all
// need it. What is still task 4's is what to do with a yield that does not
// fit (see actions/mine.ts).

import { AVATAR, itemDef } from '../data';
import { inventoryEntries } from './state';
import type { GameState } from './state';

/** The weight of `count` of `item`. Throws on an unknown item id. */
export function stackWeight(item: string, count: number): number {
  return itemDef(item).weight * count;
}

/**
 * The total weight the avatar carries: for each item, its count times its
 * weight from `ITEMS`. Fuel and lamp oil are gauges and weigh nothing.
 */
export function carriedWeight(state: GameState): number {
  let total = 0;
  for (const entry of inventoryEntries(state)) {
    total += stackWeight(entry.item, entry.count);
  }
  return total;
}

/** The most the avatar can carry. */
export function carryCapacity(): number {
  return AVATAR.carryCapacity;
}

/**
 * True if `count` more of `item` would still fit within the carry capacity.
 * Carrying exactly the capacity is allowed.
 *
 * This answers for adding only. An action that removes items as it adds
 * others (crafting) should compare weights itself:
 * `carriedWeight(state) - weight of inputs + weight of output <= carryCapacity()`.
 */
export function canCarry(state: GameState, item: string, count: number): boolean {
  return carriedWeight(state) + stackWeight(item, count) <= carryCapacity();
}
