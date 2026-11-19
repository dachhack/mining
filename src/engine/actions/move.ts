// Moving the avatar (design doc 4.1 and 5.2; owner, issue #80: no gravity).

import { ACTION_COSTS } from '../../data';
import type { MoveAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { FACE_OFFSETS, offsetPosition } from '../neighbours';
import { isOpen, isRevealed } from '../state';
import type { GameState } from '../state';
import { hasTree } from '../surface/state';

/**
 * Every `MoveAction` the player could take now.
 *
 * The miner has no gravity (owner, issue #80; decision note 0023). The rules:
 * - Move 1 block into any open face neighbour: north, east, south, west, up
 *   or down. Nothing under or over the cell matters: the miner never falls,
 *   and needs no footing, ladder or step to climb.
 * - A surface cell with a tree in it is never moved into (issue #70): cut it
 *   first. This covers moving up out of a hole dug under a tree.
 * - The edges of the surface and of the cube need no check of their own:
 *   `blockAt` answers "bedrock" for everything beyond them, so nothing above
 *   the surface or outside the grid is open.
 * - A move is offered only into a revealed cell. The six face neighbours of
 *   the avatar's cell are always revealed (by touch, decision note 0022), so
 *   this removes nothing in a state the engine produced; it is kept so that
 *   the list can never depend on a cell the player has not seen.
 *
 * Contract:
 * - `ap` is `ACTION_COSTS.move`. Emits `moved`.
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP, each with its true `ap`
 *   cost; the dispatcher in index.ts removes the ones that cost more than the
 *   AP left.
 * - The order of the list is fixed: the order of `FACE_OFFSETS` (north, east,
 *   south, west, up, down).
 */
export function legalMoveActions(state: GameState): MoveAction[] {
  const here = state.avatar.pos;
  const actions: MoveAction[] = [];
  for (const offset of FACE_OFFSETS) {
    const to = offsetPosition(here, offset);
    if (!isRevealed(state, to) || !isOpen(state, to) || hasTree(state, to)) {
      continue;
    }
    actions.push({ type: 'move', to, ap: ACTION_COSTS.move });
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list.
 *
 * Contract:
 * - Changes `state` in place (it is the dispatcher's private copy) and
 *   appends what happened to `events`.
 * - Does not spend the AP: the dispatcher has already taken `action.ap` off.
 * - Does not reveal: the dispatcher calls `updateReveal` afterwards.
 */
export function applyMove(state: GameState, action: MoveAction, events: GameEvent[]): void {
  const from = { ...state.avatar.pos };
  const to = { ...action.to };
  state.avatar.pos = to;
  events.push({ type: 'moved', from, to: { ...to } });
}
