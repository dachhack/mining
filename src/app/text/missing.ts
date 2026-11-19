// Why a move is not on the action list (issue #30).
//
// The engine offers a move only when it is allowed and every cell it is
// judged by has been seen (decision note 0011). A player who expects a move
// and does not find it could not tell which of those it was: the drop is too
// long, or (with the lamp out) the floor of the cell has not been seen.
//
// The notes made here say which, and they are worked out from REVEALED CELLS
// ONLY. Each cell is asked "is it revealed?" before anything in it is read,
// and at the first unseen cell the answer stops at "you have not seen ...":
// nothing beyond it is looked at. So a note can never say whether an unseen
// cell is rock or open. (tests/tools/play.test.ts changes every unseen cell
// and checks the text stays the same.)
//
// These notes explain; they do not decide. What may be done is the engine's
// `legalActions` and nothing else. A direction gets a note only when the
// engine offers no move that way, with one exception: "No step up north:
// there is no rock there to step onto" is about the step up, and is given
// where the move north on the list is a walk that drops and no move up of
// any kind is on the list.
//
// Added for issue #47 (playtest round m1-r2, finding 8): a cell with no move
// at all (a pit after a fall), the step up that is not there, and
// `tooLittleApNote` for what costs more AP than is left.

import { ACTION_COSTS, AVATAR, NO_STRUCTURE, SHIFT, STRUCTURES } from '../../data';
import type { Vec3 } from '../../data';
import { inGrid, isOpen, isRevealed, isSolid, legalActions, structureAt } from '../../engine';
import type { GameState } from '../../engine';
import { choiceName, compass } from './describe';

/** The four sideways steps, in the order the action list uses. */
const SIDEWAYS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function hasLadder(state: GameState, pos: Vec3): boolean {
  return structureAt(state, pos) === STRUCTURES.ladder.code;
}

/**
 * True if a ladder could be placed in `pos`, which must be a cell already
 * known to be revealed and open: it is inside the grid (nothing can be placed
 * on the surface) and holds no structure yet (a cell holds one thing, so not
 * where a torch is). The advice "a ladder there would hold you" is given
 * only when this is true (issue #46 item 1).
 */
function couldTakeLadder(state: GameState, pos: Vec3): boolean {
  return inGrid(state.size, pos) && structureAt(state, pos) === NO_STRUCTURE;
}

/** What is known about the drop under an open, revealed cell. */
type DropKnowledge =
  // The avatar would be held within the allowed distance: nothing to explain.
  | { kind: 'fine' }
  // Open cells were seen all the way down past the allowed distance.
  | { kind: 'tooLong' }
  // After `seenOpen` open cells under the cell, the next one down is unseen.
  | { kind: 'unseen'; seenOpen: number };

/**
 * Follow the column under `top` downwards, the way the engine judges a drop
 * (`knownFallDistance` in src/engine/footing.ts), and say how it ends.
 * `top` must be revealed and open. `allowed` is the longest drop the move
 * may end in. Stops at the first cell that is not revealed.
 */
function dropUnder(state: GameState, top: Vec3, allowed: number): DropKnowledge {
  let current = top;
  let distance = 0;
  while (distance <= allowed) {
    if (hasLadder(state, current)) {
      return { kind: 'fine' };
    }
    const below = { x: current.x, y: current.y, z: current.z + 1 };
    if (!isRevealed(state, below)) {
      return { kind: 'unseen', seenOpen: distance };
    }
    if (isSolid(state, below)) {
      return { kind: 'fine' };
    }
    current = below;
    distance += 1;
  }
  return { kind: 'tooLong' };
}

/**
 * One line for each move the player might look for and not find, saying why
 * it is not offered. Empty when there is nothing to explain.
 *
 * Explained: a walk into an open cell, a step up onto rock whose top has not
 * been seen, a step up where there is no rock to step onto, a climb up or
 * down from a ladder, and a cell with no move at all and open space overhead
 * (a pit). Not explained: a plain wall (rock beside you with rock on it, or
 * with rock over your head) while some other move is on the list.
 */
export function missingMoveNotes(state: GameState): string[] {
  // With too little AP no move is on the list at all, and the AP gauge says
  // why. The notes below are about the cube, so they would only mislead.
  if (state.ap < ACTION_COSTS.move) {
    return [];
  }
  const here = state.avatar.pos;
  const longest = AVATAR.maxChosenDropBlocks;
  const moves = legalActions(state).filter((action) => action.type === 'move');
  const notes: string[] = [];

  const overhead = { x: here.x, y: here.y, z: here.z - 1 };
  // The directions with rock whose top has not been seen. They share one
  // line: in a pit in the dark it can be all four.
  const unseenTops: string[] = [];
  // The directions with an open cell beside the avatar, open space on top of
  // it, and a walk that way that drops: there is nothing to step up onto.
  const noStep: string[] = [];
  // How many of the four sides are rock (or the edge of the cube).
  let rockSides = 0;
  for (const step of SIDEWAYS) {
    const beside = { x: here.x + step.x, y: here.y + step.y, z: here.z };
    if (!isRevealed(state, beside)) {
      continue; // the engine always reveals the cells touching the avatar's
    }
    const side = compass(step.x, step.y);
    const onTop = { x: beside.x, y: beside.y, z: beside.z - 1 };
    // The move this way on the list, if there is one (a walk, or a step up
    // to the cell on top of `beside`). `find` gives `undefined` for none.
    const move = moves.find((m) => m.to.x === beside.x && m.to.y === beside.y);
    if (move !== undefined) {
      // Nothing to explain about the move itself. But where it is a walk off
      // an edge, a player may look for the step up that a block there would
      // give: the way back up a stair whose step has been mined away
      // (playtest m1-r2, Speed-runner 23). Said only when the cell overhead
      // and the cell on top are both seen and open, which is when a block
      // beside the avatar would have made a step up.
      if (
        move.to.z === here.z &&
        move.drop > 0 &&
        isRevealed(state, overhead) &&
        isOpen(state, overhead) &&
        isRevealed(state, onTop) &&
        isOpen(state, onTop)
      ) {
        noStep.push(side);
      }
      continue;
    }
    if (isOpen(state, beside)) {
      const drop = dropUnder(state, beside, longest);
      // The advice is given only where it can be followed: nothing can be
      // placed on the surface, or in a cell that already holds a torch, so
      // there the note stops at the reason.
      const advice = couldTakeLadder(state, beside) ? ' A ladder in that cell would hold you.' : '';
      if (drop.kind === 'tooLong') {
        notes.push(`No move ${side}: the drop there is more than ${longest} blocks.${advice}`);
      } else if (drop.kind === 'unseen') {
        const what =
          drop.seenOpen === 0
            ? 'you have not seen what is under that cell'
            : `there is a drop of at least ${drop.seenOpen} block(s) and you have not seen its bottom`;
        notes.push(`No move ${side}: ${what}.${advice}`);
      }
    } else {
      // Rock beside the avatar. A step up needs the cell overhead and the
      // cell on top of the rock to be open. Only the unseen case is worth a
      // line; with rock in either place it is just a wall.
      rockSides += 1;
      if (isRevealed(state, overhead) && isOpen(state, overhead) && !isRevealed(state, onTop)) {
        unseenTops.push(side);
      }
    }
  }

  if (unseenTops.length > 0) {
    notes.push(
      `No step up ${unseenTops.join(', ')}: you have not seen what is on top of the rock there.`,
    );
  }

  // Said only when the list has no move up at all (no step up any way and no
  // climb). Beside a hole in layer 0, with a step up to the surface on the
  // list in other directions, the line was noise: 29 of the 33 times it
  // printed on the logs of round m1-r2 (review of PR #48). This is a test on
  // the move list; it reads no cell.
  const hasMoveUp = moves.some((move) => move.to.z < here.z);
  if (noStep.length > 0 && !hasMoveUp) {
    notes.push(
      `No step up ${noStep.join(', ')}: there is no rock there to step onto ` +
        '(the cell beside you is open). The move that way on the list walks off an edge and drops.',
    );
  }

  // A pit: no move of any kind, rock on all four sides, open space overhead
  // and no ladder to climb. This is where a fall leaves the miner, and the
  // list alone showed only that n, e, s and w were missing (playtest m1-r2:
  // 9 such cells, no note). With a ladder in the cell the climb notes below
  // say what is missing instead. Every cell read here touches the avatar's
  // and is checked for "revealed" first.
  if (
    moves.length === 0 &&
    rockSides === SIDEWAYS.length &&
    !hasLadder(state, here) &&
    isRevealed(state, overhead) &&
    isOpen(state, overhead)
  ) {
    // The way out is a ladder in the avatar's cell and one in the cell
    // above. Said only when both cells could take one.
    const advice =
      couldTakeLadder(state, here) && couldTakeLadder(state, overhead)
        ? ': a ladder in your cell (ladder-here), then one in the cell above (ladder-up), ' +
          'would let you climb up (up).'
        : '.';
    notes.push(
      'No move at all: there is rock on all four sides of you and no step up out. ' +
        `The cell above you is open${advice}`,
    );
  }

  if (hasLadder(state, here)) {
    if (
      !moves.some((move) => move.to.z < here.z && move.to.x === here.x && move.to.y === here.y) &&
      // Not when the cell above is the surface: nothing can be placed
      // there, and the way out of the top layer is a step up.
      inGrid(state.size, overhead) &&
      isRevealed(state, overhead) &&
      isOpen(state, overhead) &&
      !hasLadder(state, overhead)
    ) {
      notes.push('No climb up: the cell above you has no ladder.');
    }

    const below = { x: here.x, y: here.y, z: here.z + 1 };
    if (
      !moves.some((move) => move.to.z > here.z && move.to.x === here.x && move.to.y === here.y) &&
      isRevealed(state, below) &&
      isOpen(state, below)
    ) {
      // Climbing down one cell is already one block of the drop.
      const drop = dropUnder(state, below, longest - 1);
      // As above: the advice only where a ladder could go (not beside a torch).
      const advice = couldTakeLadder(state, below)
        ? ' A ladder in the cell below would hold you.'
        : '';
      if (drop.kind === 'tooLong') {
        notes.push(
          `No climb down: off the foot of your ladder the drop is more than ${longest} blocks.${advice}`,
        );
      } else if (drop.kind === 'unseen') {
        notes.push(
          `No climb down: you have not seen how far the drop under the cell below goes.${advice}`,
        );
      }
    }
  }
  return notes;
}

/**
 * One line naming what is in reach but costs more AP than the avatar has
 * left, or `null` if there is nothing of the kind (issue #47 item 2). Without
 * it, an action missing for want of AP looks exactly like one missing because
 * of a rule.
 *
 * How it is worked out: the engine's `legalActions` is asked twice, once for
 * the state as it is and once for the same state with a full shift's AP. The
 * engine leaves an action out for too little AP and for nothing else that
 * depends on AP, so what the second list has and the first has not is exactly
 * what the player could do with more AP. Nothing here reads the cube: both
 * lists are the engine's, and the engine's list never depends on a cell the
 * player has not seen (tests/engine/properties.test.ts).
 *
 * The actions are given by their names, grouped by cost, cheapest first:
 * "these cost more than the 2 AP you have left: [3] mine-e, mine-e-down."
 */
export function tooLittleApNote(state: GameState): string | null {
  const fullShift = Math.max(SHIFT.apPerShift, state.ap);
  // `{ ...state, ap }` is a copy of the state with one field changed (like
  // Python's `dataclasses.replace`). The cube arrays are shared, not copied;
  // `legalActions` does not change the state it is given.
  const withFullAp = legalActions({ ...state, ap: fullShift });
  const tooDear = withFullAp.filter((action) => action.ap > state.ap);
  if (tooDear.length === 0) {
    return null;
  }
  if (state.ap <= 0) {
    // Everything that costs AP is missing: a list of it all would be long
    // and say no more than this.
    return 'everything that costs AP: you have 0 AP left.';
  }
  const costs = [...new Set(tooDear.map((action) => action.ap))].sort((a, b) => a - b);
  const groups = costs.map((cost) => {
    const names = tooDear
      .filter((action) => action.ap === cost)
      .map((action) => choiceName(state, action));
    return `[${cost}] ${names.join(', ')}`;
  });
  return `these cost more than the ${state.ap} AP you have left: ${groups.join('; ')}.`;
}
