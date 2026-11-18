// Mining a block. STUB: filled in by M1 task 4.

import type { MineAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Every `MineAction` the player could take now.
 *
 * Contract:
 * - One action for each mineable block within reach (0005 items 10 to 12),
 *   with `ap` set to the block's mine cost from `BLOCKS`.
 * - Applying it opens the cell (`blockMined`) and gives the yield: into the
 *   inventory if it fits (`itemGained`), otherwise loose in the mined cell
 *   (`itemLeft`; 0005 item 16).
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP, each with its true `ap`
 *   cost; the dispatcher in index.ts removes the ones that cost more than the
 *   AP left.
 * - The order of the list must depend only on `state`.
 *
 * Stub behaviour: returns an empty list.
 */
export function legalMineActions(_state: GameState): MineAction[] {
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
export function applyMine(_state: GameState, _action: MineAction, _events: GameEvent[]): void {
  throw new Error('applyMine: not implemented');
}
