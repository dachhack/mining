// Closing the mine, which ends the run alive as salvage (design doc 4.1, 9.3
// and 9.4; owner question 88). It replaces "leave", which needed a miner
// standing on the surface (0005 item 23).

import { ACTION_COSTS } from '../../data';
import type { CloseMineAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { endRun } from '../state';
import type { GameState } from '../state';

/**
 * Every `CloseMineAction` the player could take now: always exactly one.
 *
 * - The mine can be closed at any time while the run is going: there is no
 *   miner who must first reach the surface. `ap` is `ACTION_COSTS.closeMine`
 *   (0), so it is on offer with no AP left too.
 * - Does not change `state`.
 */
export function legalCloseMineActions(_state: GameState): CloseMineAction[] {
  return [{ type: 'closeMine', ap: ACTION_COSTS.closeMine }];
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list: the run ends with the outcome "salvage" and the cause
 * "mineClosed" (design doc 9.3: until contracts exist, closing the mine is
 * always salvage).
 *
 * - Changes `state` in place (it is the dispatcher's private copy) and
 *   appends what happened to `events`.
 * - Does not spend the AP: the dispatcher has already taken `action.ap` off.
 */
export function applyCloseMine(
  state: GameState,
  _action: CloseMineAction,
  events: GameEvent[],
): void {
  endRun(state, 'salvage', 'mineClosed', events);
}
