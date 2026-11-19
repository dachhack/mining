// Why a move is not on the action list (issue #30).
//
// The miner has no gravity (owner, issue #80): it may move into any open
// face neighbour, so a move is missing only where the cell is rock (plain to
// see on the map) or a tree stands in it. The notes made here explain the
// trees. They are worked out from REVEALED CELLS ONLY: each cell is asked "is
// it revealed?" before anything in it is read. (tests/tools/play.test.ts
// changes every unseen cell and checks the text stays the same.)
//
// These notes explain; they do not decide. What may be done is the engine's
// `legalActions` and nothing else.
//
// `tooLittleApNote` (issue #47) is for what costs more AP than is left.

import { ACTION_COSTS, SHIFT } from '../../data';
import { hasTree, isRevealed, legalActions } from '../../engine';
import type { GameState } from '../../engine';
import { choiceName, compass } from './describe';

/** The four sideways steps, in the order the action list uses. */
const SIDEWAYS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** "n", "e", "s" or "w" for a sideways step: the end of the name of a cut choice. */
function choiceSide(step: { x: number; y: number }): string {
  return step.y < 0 ? 'n' : step.y > 0 ? 's' : step.x > 0 ? 'e' : 'w';
}

/**
 * One line for each move the player might look for and not find because a
 * tree is in the way (issue #70): beside the miner on the surface, or over
 * its head in a hole dug under a tree. Empty when there is nothing to
 * explain.
 */
export function missingMoveNotes(state: GameState): string[] {
  // With too little AP no move is on the list at all, and the AP gauge says
  // why. The notes below are about the cube, so they would only mislead.
  if (state.ap < ACTION_COSTS.move) {
    return [];
  }
  const here = state.avatar.pos;
  const notes: string[] = [];
  for (const step of SIDEWAYS) {
    const beside = { x: here.x + step.x, y: here.y + step.y, z: here.z };
    if (isRevealed(state, beside) && hasTree(state, beside)) {
      const side = compass(step.x, step.y);
      notes.push(`No move ${side}: a tree stands there (cut-${choiceSide(step)} cuts it down).`);
    }
  }
  const overhead = { x: here.x, y: here.y, z: here.z - 1 };
  if (isRevealed(state, overhead) && hasTree(state, overhead)) {
    notes.push('No move up: a tree stands over you. It can be cut only from the surface.');
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
