// Cutting a tree for timber (issue #70 item 3; decision note 0020).
//
// The same contract as the other action modules: the `legal...` function does
// not change `state` and lists actions as if the avatar had unlimited AP; the
// `apply...` function changes the dispatcher's private copy in place, appends
// to `events`, and leaves AP, gravity and reveal to the dispatcher.

import { SURFACE } from '../../data';
import type { Vec3 } from '../../data';
import type { CutTreeAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { canCarry } from '../inventory';
import { addItem, addLooseItems, isSurface } from '../state';
import type { GameState } from '../state';
import { hasTree, setStumpAge, setSurfaceKind } from '../surface/state';

/**
 * The four sideways directions, in the order the move list uses (north, east,
 * south, west), so that "cut" sits beside "walk" in every list.
 */
const SIDEWAYS: readonly Vec3[] = [
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
];

/**
 * Every `CutTreeAction` the player could take now: one for each tree in a
 * surface cell beside the avatar's (the four directions, like walking), while
 * the avatar is on the surface. `ap` is `SURFACE.cutTree.ap`.
 *
 * Only the surface is read, and the surface is always seen, so nothing here
 * depends on the ground under a tree (issue #70 item 7).
 */
export function legalCutTreeActions(state: GameState): CutTreeAction[] {
  const here = state.avatar.pos;
  if (!isSurface(state.size, here)) {
    return [];
  }
  const actions: CutTreeAction[] = [];
  for (const step of SIDEWAYS) {
    const target = { x: here.x + step.x, y: here.y + step.y, z: here.z };
    if (hasTree(state, target)) {
      actions.push({ type: 'cutTree', target, ap: SURFACE.cutTree.ap });
    }
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is legal.
 *
 * - The tree becomes a stump, open ground the miner can walk on, and its
 *   regrowth count starts at 0. Emits `treeCut`.
 * - Gives the timber as mining gives a yield (0005 item 16): a stack that fits
 *   the carry limit goes into the inventory (`itemGained`); one that does not
 *   is left loose on the stump (`itemLeft`), where it keeps the tree from
 *   growing back until it is picked up.
 * - The dispatcher's `updateReveal` then reveals the layer-0 block under the
 *   stump, because daylight now reaches it.
 */
export function applyCutTree(state: GameState, action: CutTreeAction, events: GameEvent[]): void {
  const target = action.target;
  setSurfaceKind(state, target, SURFACE.kinds.stump.code);
  setStumpAge(state, target, 0);
  events.push({ type: 'treeCut', pos: { ...target } });

  for (const stack of SURFACE.cutTree.yields) {
    if (canCarry(state, stack.item, stack.count)) {
      addItem(state, stack.item, stack.count);
      events.push({ type: 'itemGained', item: stack.item, count: stack.count });
    } else {
      addLooseItems(state, target, stack.item, stack.count);
      events.push({ type: 'itemLeft', pos: { ...target }, item: stack.item, count: stack.count });
    }
  }
}
