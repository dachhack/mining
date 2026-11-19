// Mining a block (design doc 4.1; 0005 items 10 to 12 and 16; decision note
// 0022: Minecraft-style, face neighbours only).

import { BLOCKS, STRUCTURES } from '../../data';
import type { MineAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { MINE_REACH_OFFSETS, MINE_UP_OFFSET, offsetPosition } from '../neighbours';
import { canCarry } from '../inventory';
import {
  addItem,
  addLooseItems,
  blockAt,
  blockDefAt,
  inGrid,
  isRevealed,
  isSurface,
  samePosition,
  setBlock,
  structureAt,
} from '../state';
import type { GameState } from '../state';
import { isUnderTree } from '../surface/state';

/**
 * Every `MineAction` the player could take now.
 *
 * Minecraft-style reach (owner, issue #75; decision note 0022): the pick
 * reaches the avatar's face neighbours only.
 * - North, east, south, west on the avatar's level, and the block below
 *   (mining it moves the avatar down into its cell: see `applyMine`). No
 *   diagonals.
 * - The block overhead only with a support in the avatar's own cell, which
 *   holds up what is above (0014 item 9). Supports cannot be placed yet
 *   (M2-3, #53), so today this is never offered in play.
 * - One action for each mineable block, in the order of `MINE_REACH_OFFSETS`
 *   and then overhead, with `ap` set to the block's mine cost from `BLOCKS`.
 * - A block is mineable if it is inside the grid, is revealed, and has a mine
 *   cost. Open space and bedrock (everything outside the grid) have none.
 * - Only revealed blocks can be mined, so an action's AP cost can never give
 *   away a block the player cannot see. A face neighbour of the avatar is
 *   revealed whenever the avatar's own cell is (it is always lit or touched),
 *   so in practice every block in reach is known.
 * - From the surface the only block in reach is the one underfoot; a layer-0
 *   block with a tree over it is never that one, and the check is kept so
 *   that the rule of issue #70 ("mining down from the surface is not offered
 *   under a tree") holds whatever the reach.
 * - Does not change `state`. Lists actions as if the avatar had unlimited AP;
 *   the dispatcher in index.ts removes the ones that cost too much, which is
 *   what makes a block that costs more than the AP left not mineable this
 *   shift (0005 item 12).
 * - The drill (`mineCostWithDrill`) is not in M1, so the plain cost is used.
 *
 * For the paused M2 tasks (#53 cave-ins, #55 arming unstable ore): the
 * targets are exactly the cells listed here; arming checks "a block beside
 * unstable ore was mined", and a block underfoot is beside the ore around it.
 */
export function legalMineActions(state: GameState): MineAction[] {
  const actions: MineAction[] = [];
  const onSurface = isSurface(state.size, state.avatar.pos);
  const targets = MINE_REACH_OFFSETS.map((offset) => offsetPosition(state.avatar.pos, offset));
  if (structureAt(state, state.avatar.pos) === STRUCTURES.support.code) {
    targets.push(offsetPosition(state.avatar.pos, MINE_UP_OFFSET));
  }
  for (const target of targets) {
    if (!inGrid(state.size, target) || !isRevealed(state, target)) {
      continue;
    }
    // From the surface, the ground under a tree is not mined: cut the tree
    // first (issue #70). A regrown tree stands over ground the player knows,
    // so this is checked as well as "revealed".
    if (onSurface && isUnderTree(state, target)) {
      continue;
    }
    const cost = blockDefAt(state, target).mineCost;
    if (cost === null) {
      continue;
    }
    actions.push({ type: 'mine', target, ap: cost });
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list.
 *
 * - Opens the cell and emits `blockMined`.
 * - Gives the yield, one stack at a time: a stack that fits the carry limit
 *   goes into the inventory (`itemGained`); a stack that does not is left
 *   loose in the mined cell (`itemLeft`; 0005 item 16). A stack is never
 *   split. Every yield in the data is a single item today, so there is
 *   nothing to split.
 * - Digging down (the block below the avatar; `isDigDown`): the avatar then
 *   moves into the cell it dug, and `moved` follows the yield's events. So
 *   digging down stays one action (owner, issue #75). The avatar has no
 *   gravity (owner, issue #80), so it goes no further: if the cell under the
 *   dug one is open, it stays where it now is (decision note 0024).
 * - Changes `state` in place (it is the dispatcher's private copy). Does not
 *   spend the AP, settle loose items or reveal: the dispatcher does those, in
 *   that order. So a yield left in a cell with no floor falls.
 */
export function applyMine(state: GameState, action: MineAction, events: GameEvent[]): void {
  const target = action.target;
  // Asked before the block is opened: `isDigDown` only compares positions,
  // but reading it here keeps the order of the rule plain.
  const digDown = isDigDown(state, action);
  const minedCode = blockAt(state, target);
  const yields = blockDefAt(state, target).yields;

  setBlock(state, target, BLOCKS.air.code);
  events.push({ type: 'blockMined', pos: { ...target }, block: minedCode });

  for (const stack of yields) {
    if (canCarry(state, stack.item, stack.count)) {
      addItem(state, stack.item, stack.count);
      events.push({ type: 'itemGained', item: stack.item, count: stack.count });
    } else {
      addLooseItems(state, target, stack.item, stack.count);
      events.push({ type: 'itemLeft', pos: { ...target }, item: stack.item, count: stack.count });
    }
  }

  if (digDown) {
    const from = { ...state.avatar.pos };
    state.avatar.pos = { ...target };
    events.push({ type: 'moved', from, to: { ...target } });
  }
}

/**
 * True if `action` mines the block directly below the avatar: digging down
 * (issue #75). Digging down moves the avatar into the dug cell.
 */
export function isDigDown(state: GameState, action: MineAction): boolean {
  const below = offsetPosition(state.avatar.pos, { x: 0, y: 0, z: 1 });
  return samePosition(action.target, below);
}
