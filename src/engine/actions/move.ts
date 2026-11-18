// Moving the avatar (design doc 4.1; decision note 0005 items 6 and 7; 0010).

import { ACTION_COSTS, AVATAR } from '../../data';
import type { Vec3 } from '../../data';
import type { MoveAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { cellBelow, hasLadder, knownFallDistance } from '../footing';
import { isOpen, isRevealed } from '../state';
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
 * - A move is offered only when every cell it is judged by is revealed
 *   (issue #33; 0010), so the list never depends on a cell the player has
 *   not seen. With the lamp lit, `updateReveal` reveals all of those cells
 *   and this removes nothing. With the lamp out it removes: a walk into a
 *   cell whose floor (or the drop under it) is not revealed, a step up onto
 *   a cell that is not revealed, and a climb down off the foot of a ladder
 *   when the drop under it is not revealed. The cells each move is judged by:
 *   - walk: the neighbour; then, unless it holds a ladder, the cells under it
 *     in turn down to the first solid one, at most
 *     `AVATAR.maxChosenDropBlocks + 1` of them;
 *   - step up: the neighbour, the cell on top of it, the cell overhead;
 *   - climb up: the cell overhead;
 *   - climb down: the cell below; then, unless it holds a ladder, the cells
 *     under it in turn down to the first solid one, at most
 *     `AVATAR.maxChosenDropBlocks` of them.
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

  // The longest drop a walk may end in. A climb down has already gone one
  // block down by the time the avatar lets go of the ladder, so one less.
  const longestWalkDrop = AVATAR.maxChosenDropBlocks;
  const longestClimbDrop = AVATAR.maxChosenDropBlocks - 1;

  for (const step of SIDEWAYS) {
    const beside = { x: here.x + step.x, y: here.y + step.y, z: here.z };
    if (!isRevealed(state, beside)) {
      // Cannot happen in a state the engine produced (the cells touching the
      // avatar's are always revealed), but then nothing may be offered.
      continue;
    }
    if (isOpen(state, beside)) {
      // Walk. `drop` is 0 when the cell has footing, and `null` when the
      // drop cannot be judged from what the player has seen.
      const drop = knownFallDistance(state, beside, longestWalkDrop);
      if (drop !== null && drop <= longestWalkDrop) {
        actions.push(moveTo(beside, drop));
      }
    } else {
      // Step up onto the solid neighbour, if there is room above it and
      // above the avatar's own head. Each cell is tested for "revealed"
      // before its content is read.
      const onTop = cellAbove(beside);
      const overhead = cellAbove(here);
      if (
        isRevealed(state, onTop) &&
        isOpen(state, onTop) &&
        isRevealed(state, overhead) &&
        isOpen(state, overhead)
      ) {
        actions.push(moveTo(onTop, 0));
      }
    }
  }

  if (hasLadder(state, here)) {
    const above = cellAbove(here);
    if (isRevealed(state, above) && isOpen(state, above) && hasLadder(state, above)) {
      actions.push(moveTo(above, 0));
    }

    const below = cellBelow(here);
    if (isRevealed(state, below) && isOpen(state, below)) {
      if (hasLadder(state, below)) {
        // A ladder in the cell below is footing: nothing under it is read.
        actions.push(moveTo(below, 0));
      } else {
        // Stepping off the bottom of a ladder: the one block climbed down
        // counts towards the longest drop a player may choose.
        const drop = knownFallDistance(state, below, longestClimbDrop);
        if (drop !== null && 1 + drop <= AVATAR.maxChosenDropBlocks) {
          actions.push(moveTo(below, drop));
        }
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
