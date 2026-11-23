// Undo in the new game (plan A5; owner: "Undo button"; questions 141 and 151).
//
// Undo works within the current shift. A shift log keeps the state at the
// start of the shift and every action since that did something. To undo,
// the newest undoable action is left out and the shift is played again from
// its start. The world moves on only at End shift, so the replay is exact:
// the player's own state comes back as it was before that action, and its
// tap comes back too (an action left out costs nothing).
//
// Catching an animal and picking an apple are never undone (owner: "animal
// and apple harvest cannot be undone"): they stay in the log and are played
// again, so they stay done. Every other action that did something can be
// undone: mining, cutting grass, felling a tree, and placing, upgrading or
// demolishing a camp. End shift, rest and closing the mine start a new log.

import { frontierAct } from './shift';
import type { FrontierAction, FrontierOutcome } from './shift';
import type { FrontierState } from './state';

/** One action of the shift, and whether Undo may take it back. */
export interface LoggedAction {
  action: FrontierAction;
  undoable: boolean;
}

/** The current shift: the state it started from, and every action since that did something. */
export interface ShiftLog {
  start: FrontierState;
  actions: LoggedAction[];
}

/** A log for a shift that starts at `state`. */
export function startLog(state: FrontierState): ShiftLog {
  return { start: state, actions: [] };
}

/** True if Undo may take back an action with this outcome: anything that did something but a catch or an apple pick. */
export function isUndoable(action: FrontierAction, outcome: FrontierOutcome): boolean {
  if (!outcome.done) return false;
  if (
    action.kind === 'endShift' ||
    action.kind === 'rest' ||
    action.kind === 'close' ||
    action.kind === 'closeMarket'
  )
    return false;
  const harvest = outcome.tap?.harvest ?? null;
  return harvest !== 'caught' && harvest !== 'apple';
}

/**
 * Do `action` on `state`, keeping `log` up to date: an action that did
 * something is added to it; End shift, rest and closing the mine start a new
 * log from the state after them.
 */
export function actLogged(
  state: FrontierState,
  log: ShiftLog,
  action: FrontierAction,
): { outcome: FrontierOutcome; log: ShiftLog } {
  const outcome = frontierAct(state, action);
  if (!outcome.done) {
    return { outcome, log };
  }
  // Closing the market starts the day: the market's trades cannot be undone after it.
  if (
    action.kind === 'endShift' ||
    action.kind === 'rest' ||
    action.kind === 'close' ||
    action.kind === 'closeMarket'
  ) {
    return { outcome, log: startLog(outcome.state) };
  }
  const entry = { action, undoable: isUndoable(action, outcome) };
  return { outcome, log: { start: log.start, actions: [...log.actions, entry] } };
}

/** How many actions of the shift Undo can take back. */
export function undoCount(log: ShiftLog): number {
  return log.actions.filter((a) => a.undoable).length;
}

/**
 * Undo the newest undoable action of the shift: the state with it left out,
 * the log without it, and the action. `null` if there is nothing to undo.
 * If playing the shift again without it fails (an action after it no longer
 * does what it did), Undo is refused, with the action that failed.
 */
export function undoLast(
  log: ShiftLog,
):
  | { state: FrontierState; log: ShiftLog; undone: FrontierAction }
  | { refused: FrontierAction }
  | null {
  let index = -1;
  for (let i = log.actions.length - 1; i >= 0; i -= 1) {
    if (log.actions[i]?.undoable === true) {
      index = i;
      break;
    }
  }
  const undone = log.actions[index];
  if (undone === undefined) {
    return null;
  }
  const kept = log.actions.filter((_, i) => i !== index);
  let state = log.start;
  for (const entry of kept) {
    const outcome = frontierAct(state, entry.action);
    if (!outcome.done) {
      return { refused: entry.action };
    }
    state = outcome.state;
  }
  return { state, log: { start: log.start, actions: kept }, undone: undone.action };
}
