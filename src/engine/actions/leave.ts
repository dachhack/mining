// Leaving the cube from the surface (0005 item 23).

import { ACTION_COSTS } from '../../data';
import type { LeaveAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { endRun, isSurface } from '../state';
import type { GameState } from '../state';

/**
 * Every `LeaveAction` the player could take now.
 *
 * - A single action while the avatar is on the surface, otherwise none
 *   (0005 item 23). `ap` is `ACTION_COSTS.leave` (0; owner question 27).
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP; the dispatcher in
 *   index.ts removes the ones that cost more than the AP left.
 */
export function legalLeaveActions(state: GameState): LeaveAction[] {
  if (!isSurface(state.size, state.avatar.pos)) {
    return [];
  }
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
