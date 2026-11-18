// Carry weight. STUB: filled in by M1 task 4.
//
// Plain counting (how many of an item, add, remove) is already in state.ts.
// This module is for the rule on top of it: the carry limit.

import type { GameState } from './state';

/**
 * The total weight the avatar carries: for each item, its count times its
 * weight from `ITEMS` (0005 item 18). Fuel and lamp oil weigh nothing.
 *
 * Stub behaviour: returns 0.
 */
export function carriedWeight(_state: GameState): number {
  return 0;
}

/**
 * True if `count` more of `item` would still fit within the carry capacity
 * in `AVATAR` (design doc 5.1).
 *
 * Stub behaviour: returns true.
 */
export function canCarry(_state: GameState, _item: string, _count: number): boolean {
  return true;
}
