// Mining a block (design doc 4.1; 0005 items 10 to 12 and 16).

import { BLOCKS } from '../../data';
import type { MineAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { MINE_REACH_OFFSETS, offsetPosition } from '../neighbours';
import { canCarry } from '../inventory';
import {
  addItem,
  addLooseItems,
  blockAt,
  blockDefAt,
  inGrid,
  isRevealed,
  setBlock,
} from '../state';
import type { GameState } from '../state';

/**
 * Every `MineAction` the player could take now.
 *
 * - One action for each mineable block within reach, in the order of
 *   `MINE_REACH_OFFSETS`, with `ap` set to the block's mine cost from `BLOCKS`.
 * - A block is mineable if it is inside the grid, is revealed, and has a mine
 *   cost. Open space and bedrock (everything outside the grid) have none.
 *   There is no line-of-sight test: a diagonal is mineable even when both
 *   cells it shares an edge with are solid (0005 item 10).
 * - Only revealed blocks can be mined, so an action's AP cost can never give
 *   away a block the player cannot see. With the lamp lit `updateReveal`
 *   reveals every cell in reach (0005 item 10) and this test removes nothing.
 *   With the lamp out the miner knows only the six cells it touches (issue
 *   #33; decision note 0011), so the diagonals and the 8 cells around the one
 *   below are mineable only if something else has revealed them: an earlier
 *   visit with the lamp lit, a torch, or daylight.
 * - Does not change `state`. Lists actions as if the avatar had unlimited AP;
 *   the dispatcher in index.ts removes the ones that cost too much, which is
 *   what makes a block that costs more than the AP left not mineable this
 *   shift (0005 item 12).
 * - The drill (`mineCostWithDrill`) is not in M1, so the plain cost is used.
 */
export function legalMineActions(state: GameState): MineAction[] {
  const actions: MineAction[] = [];
  for (const offset of MINE_REACH_OFFSETS) {
    const target = offsetPosition(state.avatar.pos, offset);
    if (!inGrid(state.size, target) || !isRevealed(state, target)) {
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
 * - Changes `state` in place (it is the dispatcher's private copy). Does not
 *   spend the AP, apply gravity or reveal: the dispatcher does those, in that
 *   order. So if the avatar mined its own floor, `settle` makes it fall; and
 *   a yield left in a cell with no floor falls too.
 */
export function applyMine(state: GameState, action: MineAction, events: GameEvent[]): void {
  const target = action.target;
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
}
