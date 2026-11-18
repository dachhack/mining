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
// engine offers no move that way.

import { ACTION_COSTS, AVATAR, STRUCTURES } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { inGrid, isOpen, isRevealed, isSolid, legalActions, structureAt } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { compass } from './describe';

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
 * been seen, and a climb up or down from a ladder. Not explained: a plain
 * wall (rock beside you with rock on it, or with rock over your head).
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
  for (const step of SIDEWAYS) {
    const beside = { x: here.x + step.x, y: here.y + step.y, z: here.z };
    // A move this way is on the list (a walk, or a step up to the cell on
    // top of `beside`): nothing to explain.
    if (moves.some((move) => move.to.x === beside.x && move.to.y === beside.y)) {
      continue;
    }
    if (!isRevealed(state, beside)) {
      continue; // the engine always reveals the cells touching the avatar's
    }
    const side = compass(step.x, step.y);
    if (isOpen(state, beside)) {
      const drop = dropUnder(state, beside, longest);
      if (drop.kind === 'tooLong') {
        notes.push(
          `No move ${side}: the drop there is more than ${longest} blocks. ` +
            'A ladder in that cell would hold you.',
        );
      } else if (drop.kind === 'unseen') {
        const what =
          drop.seenOpen === 0
            ? 'you have not seen what is under that cell'
            : `there is a drop of at least ${drop.seenOpen} block(s) and you have not seen its bottom`;
        notes.push(`No move ${side}: ${what}. A ladder in that cell would hold you.`);
      }
    } else {
      // Rock beside the avatar. A step up needs the cell overhead and the
      // cell on top of the rock to be open. Only the unseen case is worth a
      // line; with rock in either place it is just a wall.
      const onTop = { x: beside.x, y: beside.y, z: beside.z - 1 };
      if (isRevealed(state, overhead) && isOpen(state, overhead) && !isRevealed(state, onTop)) {
        notes.push(`No step up ${side}: you have not seen the cell on top of that rock.`);
      }
    }
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
      if (drop.kind === 'tooLong') {
        notes.push(
          `No climb down: off the foot of your ladder the drop is more than ${longest} blocks. ` +
            'A ladder in the cell below would hold you.',
        );
      } else if (drop.kind === 'unseen') {
        notes.push(
          'No climb down: you have not seen how far the drop under the cell below goes. ' +
            'A ladder in the cell below would hold you.',
        );
      }
    }
  }
  return notes;
}
