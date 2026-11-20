// Leaving, which ends the run as salvage (0005 item 23; decision note 0026).

import { ACTION_COSTS } from '../../data';
import type { LeaveAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { endRun } from '../state';
import type { GameState } from '../state';

/**
 * Every `LeaveAction` the player could take now: always exactly one.
 *
 * - Leaving used to need the miner on the surface. There is no miner (issue
 *   #86), so until task T6 turns this into "close the mine" it is offered at
 *   any time (decision note 0026). `ap` is `ACTION_COSTS.leave` (0; owner
 *   question 27).
 * - Does not change `state`.
 */
export function legalLeaveActions(_state: GameState): LeaveAction[] {
  return [{ type: 'leave', ap: ACTION_COSTS.leave }];
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list: the run ends with the outcome "salvage" (design doc 9.4).
 *
 * - Changes `state` in place (it is the dispatcher's private copy) and
 *   appends what happened to `events`.
 * - Does not spend the AP: the dispatcher has already taken `action.ap` off.
 */
export function applyLeave(state: GameState, _action: LeaveAction, events: GameEvent[]): void {
  endRun(state, 'salvage', 'left', events);
}
