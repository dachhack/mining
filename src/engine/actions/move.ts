// Moving the avatar (design doc 4.1; decision note 0005 items 6 and 7).

import { ACTION_COSTS, AVATAR } from '../../data';
import type { Vec3 } from '../../data';
import type { MoveAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { avatarFallDistance, cellBelow, hasLadder } from '../footing';
import { isOpen } from '../state';
import type { GameState } from '../state';

/**
 * The four sideways steps, in the fixed order the action list uses.
 * These are directions, not gameplay numbers, so they live here.
 */
const SIDEWAYS: Vec3[] = [
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
];

/** The cell directly above `pos`. Depth grows with z, so "up" is z - 1. */
function cellAbove(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y, z: pos.z - 1 };
}

function moveTo(to: Vec3, drop: number): MoveAction {
  return { type: 'move', to, drop, ap: ACTION_COSTS.move };
}

/**
 * Every `MoveAction` the player could take now.
 *
 * The rules (0005 items 6 and 7, and the coordinator's notes on issue #5):
 * - Walk to a sideways neighbour that is open. If that cell has no footing
 *   the avatar will drop; the walk is legal only if the drop is at most
 *   `AVATAR.maxChosenDropBlocks`.
 * - Step up 1, to the cell above a sideways neighbour: that cell must be
 *   open, the neighbour under it solid, and the cell above the avatar open.
 * - With a ladder in the avatar's cell: climb to the cell above if it is open
 *   and has a ladder; climb to the cell below if it is open and either has a
 *   ladder or the avatar would end at most `AVATAR.maxChosenDropBlocks` below
 *   the cell it started in.
 * - No diagonal moves. The edge of the surface and of the cube need no check
 *   of their own: `blockAt` answers "bedrock" for everything beyond them.
 *
 * Contract:
 * - `drop` is the number of blocks the avatar falls after arriving in `to`
 *   (0 for none), so `to.z + drop` is the level it ends on.
 * - `ap` is `ACTION_COSTS.move`. Emits `moved`; the fall itself is `settle`'s.
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP, each with its true `ap`
 *   cost; the dispatcher in index.ts removes the ones that cost more than the
 *   AP left.
 * - The order of the list is fixed: for each sideways direction in turn the
 *   walk or the step up (never both: the neighbour is open or solid), then
 *   the climb up, then the climb down.
 */
export function legalMoveActions(state: GameState): MoveAction[] {
  const here = state.avatar.pos;
  const actions: MoveAction[] = [];

  for (const step of SIDEWAYS) {
    const beside = { x: here.x + step.x, y: here.y + step.y, z: here.z };
    if (isOpen(state, beside)) {
      // Walk. `drop` is 0 when the cell has footing.
      const drop = avatarFallDistance(state, beside);
      if (drop <= AVATAR.maxChosenDropBlocks) {
        actions.push(moveTo(beside, drop));
      }
    } else {
      // Step up onto the solid neighbour, if there is room above it and
      // above the avatar's own head.
      const onTop = cellAbove(beside);
      if (isOpen(state, onTop) && isOpen(state, cellAbove(here))) {
        actions.push(moveTo(onTop, 0));
      }
    }
  }

  if (hasLadder(state, here)) {
    const above = cellAbove(here);
    if (isOpen(state, above) && hasLadder(state, above)) {
      actions.push(moveTo(above, 0));
    }

    const below = cellBelow(here);
    if (isOpen(state, below)) {
      // Stepping off the bottom of a ladder: the one block climbed down
      // counts towards the longest drop a player may choose.
      const drop = avatarFallDistance(state, below);
      // A ladder below is footing, so `drop` is then 0 and the second test
      // is already true with today's data. The first test is kept because it
      // is how 0005 item 6 words the rule, and it would decide if
      // `maxChosenDropBlocks` were ever set to 0.
      if (hasLadder(state, below) || 1 + drop <= AVATAR.maxChosenDropBlocks) {
        actions.push(moveTo(below, drop));
      }
    }
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
 * - Does not apply gravity or reveal: the dispatcher calls `settle` and
 *   `updateReveal` afterwards. So a move into a drop leaves the avatar in
 *   `action.to`, and `settle` then makes it fall.
 */
export function applyMove(state: GameState, action: MoveAction, events: GameEvent[]): void {
  const from = { ...state.avatar.pos };
  const to = { ...action.to };
  state.avatar.pos = to;
  events.push({ type: 'moved', from, to: { ...to } });
}
