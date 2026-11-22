// UI lab 2: Undo (owner, after the PR #126 playtest: "Undo button"; question
// 141: "animal and apple harvest cannot be undone"; question 151: within the
// current shift only).
//
// The rules are the engine's (src/engine/frontier/undo.ts, plan A5): the
// history is the shift's log (the state the shift started from, and every
// action since that did something), and Undo plays the shift again without
// the newest undoable action. The world moves on only at End shift, so this
// is exact, and the undone action's tap comes back.
//
// - Undoable: digging a block, cutting grass, felling a tree (an empty apple
//   tree too), placing, upgrading and demolishing a camp.
// - Not undoable: catching an animal and picking an apple. They stay in the
//   log and are played again, so they stay done; Undo steps past them.
// - End shift, rest and closing the mine start a new history.
//
// No DOM code here, so the unit tests run it in plain Node.

import { startLog, shiftUndoCount, undoLastAction } from '../../engine';
import type { ShiftLog } from '../../engine';
import { fromFrontier, toFrontier } from './campWorld';
import type { CampStep, CampWorld } from './campWorld';

export interface UndoHistory {
  /** The shift's log, as the engine keeps it. */
  log: ShiftLog;
}

/** A new history, for a shift that starts at `world` (a new world, or a new shift). */
export function emptyHistory(world: CampWorld): UndoHistory {
  return { log: startLog(toFrontier(world)) };
}

/** How many actions can be undone. */
export function undoCount(history: UndoHistory): number {
  return shiftUndoCount(history.log);
}

/**
 * `history` with one more action that did something. `undoable` is false for
 * a catch or an apple pick (question 141). End shift, rest and closing the
 * mine are not noted: they start a new history (`emptyHistory`).
 */
export function noteAction(history: UndoHistory, step: CampStep, undoable: boolean): UndoHistory {
  if (step.kind === 'endShift' || step.kind === 'rest' || step.kind === 'close') {
    throw new Error(`${step.kind} starts a new history; it is not noted`);
  }
  return {
    log: {
      start: history.log.start,
      actions: [...history.log.actions, { action: step, undoable }],
    },
  };
}

/**
 * Undo the newest undoable action: the world without it, the history
 * without it, and the step. `null` if there is nothing to undo; a hint if it
 * cannot be undone (the history stays as it is). `world` gives the parts of
 * the world the engine does not keep (the depth table, kept or worked out again).
 */
export function undoLast(
  history: UndoHistory,
  world: CampWorld,
): { world: CampWorld; history: UndoHistory; undone: CampStep } | { refused: string } | null {
  const result = undoLastAction(history.log);
  if (result === null) {
    return null;
  }
  if ('refused' in result) {
    return { refused: 'That cannot be undone now: what came after it depends on it.' };
  }
  return {
    world: fromFrontier(world, result.state),
    history: { log: result.log },
    undone: result.undone as CampStep,
  };
}
