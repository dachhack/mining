// Cutting a tree for timber (issue #70 item 3; decision note 0020; any square
// since issue #86).
//
// The same contract as the other action modules: the `legal...` function does
// not change `state` and lists actions as if AP were unlimited; the
// `apply...` function changes the dispatcher's private copy in place, appends
// to `events`, and leaves AP and reveal to the dispatcher.

import { SURFACE, WORLD } from '../../data';
import type { CutTreeAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { addItem } from '../state';
import type { GameState } from '../state';
import { hasTree, setStumpAge, setSurfaceKind } from '../surface/state';

/**
 * Every `CutTreeAction` the player could take now: one for each square with a
 * tree on it, row by row (y, then x). There is no reach: any tree may be cut
 * (design doc 4.1). `ap` is `SURFACE.cutTree.ap`.
 *
 * Only the surface is read, and the surface is always seen, so nothing here
 * depends on the ground under a tree (issue #70 item 7).
 */
export function legalCutTreeActions(state: GameState): CutTreeAction[] {
  const actions: CutTreeAction[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      if (hasTree(state, { x, y, z: WORLD.surfaceZ })) {
        actions.push({ type: 'cutTree', x, y, ap: SURFACE.cutTree.ap });
      }
    }
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is legal.
 *
 * - The tree becomes a stump, which is open ground, and its regrowth count
 *   starts at 0. Emits `treeCut`.
 * - Puts the timber into the stockpile (`itemGained`).
 * - The dispatcher's `updateReveal` then reveals the block under the stump:
 *   it is now the square's top block.
 */
export function applyCutTree(state: GameState, action: CutTreeAction, events: GameEvent[]): void {
  const cell = { x: action.x, y: action.y, z: WORLD.surfaceZ };
  setSurfaceKind(state, cell, SURFACE.kinds.stump.code);
  setStumpAge(state, cell, 0);
  events.push({ type: 'treeCut', pos: { ...cell } });

  for (const stack of SURFACE.cutTree.yields) {
    addItem(state, stack.item, stack.count);
    events.push({ type: 'itemGained', item: stack.item, count: stack.count });
  }
}
