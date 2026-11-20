// The play log and the session that replays it.
//
// A play log is a small JSON file: how the run was started and every choice
// the player made since. The engine is deterministic, so replaying the log
// from the start always arrives at the same state. That is how the one-shot
// mode works (each command replays the log, takes one more step and saves),
// and how a playtest finding is reproduced.
//
// The log stores the actions themselves, not menu numbers, so it stays valid
// if the order of the action list ever changes.

import { SHIFT } from '../../data';
import type { ItemStack } from '../../data';
import {
  ENGINE_VERSION,
  applyAction,
  createRun,
  depthAt,
  endShift,
  hashState,
  isRunActive,
  legalActions,
  stockpileEntries,
} from '../../engine';
import type { Action, GameEvent, GameState } from '../../engine';

/**
 * Bumped if the shape of the log file ever changes. 3: the action `leave` is
 * now `closeMine`, and the outcome holds `stockpile` where format 2 held
 * `inventory` (issue #92).
 * 2: mine and cut actions
 * name a square (x, y), and the outcome holds `deepestDepth` where format 1
 * held the miner's `deepestLayer` (issue #86).
 */
export const LOG_FORMAT = 3;

/** "End shift" is not an engine action (it is `endShift`), so the log has its own entry for it. */
export interface EndShiftEntry {
  type: 'endShift';
}

export const END_SHIFT: EndShiftEntry = { type: 'endShift' };

/** One choice the player made: an engine action, or ending the shift. */
export type LogEntry = Action | EndShiftEntry;

/** How the run ended. Written to the log once it has. */
export interface LogOutcome {
  outcome: string;
  cause: string;
  shiftsPlayed: number;
  /** The depth of the deepest square of the map; 0 means nothing was dug. */
  deepestDepth: number;
  /** What the stockpile held when the run ended. */
  stockpile: ItemStack[];
  /** `hashState` of the final state, so a replay can be checked against it. */
  stateHash: string;
}

export interface PlayLog {
  format: number;
  engineVersion: string;
  seed: number;
  contractId: string;
  loadoutId: string;
  actions: LogEntry[];
  /** `null` while the run is still going. */
  outcome: LogOutcome | null;
}

/** A run in progress: its log, the state the log leads to, and the deepest square dug. */
export interface Session {
  log: PlayLog;
  state: GameState;
  /** The greatest depth any square has been mined to in this run. */
  deepestDepth: number;
}

/** Start a new run. Throws (from `createRun`) on a bad seed or unknown id. */
export function newSession(seed: number, contractId: string, loadoutId: string): Session {
  const state = createRun(seed, contractId, loadoutId);
  return {
    log: {
      format: LOG_FORMAT,
      engineVersion: ENGINE_VERSION,
      seed,
      contractId,
      loadoutId,
      actions: [],
      outcome: null,
    },
    state,
    deepestDepth: 0,
  };
}

/**
 * Everything the player may choose now: the engine's legal actions, then
 * "end shift". Empty once the run has ended. On a fresh map this is some
 * 1,700 entries, nearly all of them a mine or a cut of one square.
 */
export function menuChoices(state: GameState): LogEntry[] {
  if (!isRunActive(state)) {
    return [];
  }
  return [...legalActions(state), END_SHIFT];
}

/**
 * The choices that are printed as a list, in menu order: every legal action
 * that is not offered for hundreds of squares (crafting, resting at a camp,
 * decommissioning one, closing the mine), then "end shift". Mines, cuts,
 * supports, explosives and the founding of a camp are named by their square
 * instead ("mine 3,4", "support 3,4", "explosive 3,4", "camp 3,4"; see
 * squares.ts). Empty once the run
 * has ended.
 */
export function listedChoices(state: GameState): LogEntry[] {
  return menuChoices(state).filter((entry) => !isNamedBySquareOnly(entry));
}

/**
 * True for the kinds of choice that are never lines of the list, because
 * there can be hundreds of each: the player names a square instead.
 */
export function isNamedBySquareOnly(entry: LogEntry): boolean {
  return (
    entry.type === 'mine' ||
    entry.type === 'cutTree' ||
    entry.type === 'placeSupport' ||
    entry.type === 'placeExplosive' ||
    entry.type === 'foundCamp'
  );
}

/**
 * Take one step: apply `entry`, add it to the log, and return the events.
 * Throws, changing nothing, if the run has ended or the entry is not legal.
 */
export function step(session: Session, entry: LogEntry): GameEvent[] {
  // Both engine calls return a new state and leave the old one alone, so if
  // one throws, the session is exactly as it was.
  const result =
    entry.type === 'endShift' ? endShift(session.state) : applyAction(session.state, entry);
  session.state = result.state;
  session.log.actions.push(entry);
  if (entry.type === 'mine') {
    // Only the player's own mining is counted: the depth of the square just
    // mined. (A depth is seen by the player, so this reads nothing hidden.)
    session.deepestDepth = Math.max(session.deepestDepth, depthAt(result.state, entry.x, entry.y));
  }

  const status = result.state.status;
  if (status.kind === 'ended') {
    session.log.outcome = {
      outcome: status.outcome,
      cause: status.cause,
      shiftsPlayed: result.state.shift - SHIFT.firstShiftNumber + 1,
      deepestDepth: session.deepestDepth,
      stockpile: stockpileEntries(result.state),
      stateHash: hashState(result.state),
    };
  }
  return result.events;
}

/**
 * Rebuild a session by replaying `log` from its seed. Throws if an entry
 * does not replay, which means the log was edited by hand or was written by
 * an engine with different rules.
 */
export function replayLog(log: PlayLog): Session {
  const session = newSession(log.seed, log.contractId, log.loadoutId);
  log.actions.forEach((entry, index) => {
    try {
      step(session, entry);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `entry ${index + 1} of ${log.actions.length} does not replay (${reason}). ` +
          `The log was written by engine ${log.engineVersion}; this is engine ${ENGINE_VERSION}.`,
        { cause: error },
      );
    }
  });
  return session;
}

/** The log as the text of its file. */
export function logToText(log: PlayLog): string {
  return JSON.stringify(log, null, 1) + '\n';
}

/**
 * Read a log from the text of its file. Checks the shape only; whether the
 * actions are legal is found out by `replayLog`. Throws on anything else.
 */
export function logFromText(text: string): PlayLog {
  // `unknown` means "could be anything": each field is checked before use.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('it is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('it is not a play log');
  }
  const raw = parsed as Record<string, unknown>;
  if (raw.format !== LOG_FORMAT) {
    throw new Error(
      `its format is ${String(raw.format)}, but this tool reads format ${LOG_FORMAT}`,
    );
  }
  if (
    typeof raw.engineVersion !== 'string' ||
    typeof raw.seed !== 'number' ||
    typeof raw.contractId !== 'string' ||
    typeof raw.loadoutId !== 'string' ||
    !Array.isArray(raw.actions)
  ) {
    throw new Error('it is missing the seed, the ids, the engine version or the action list');
  }
  for (const entry of raw.actions as unknown[]) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as { type?: unknown }).type !== 'string'
    ) {
      throw new Error('its action list holds something that is not an action');
    }
  }
  return {
    format: LOG_FORMAT,
    engineVersion: raw.engineVersion,
    seed: raw.seed,
    contractId: raw.contractId,
    loadoutId: raw.loadoutId,
    actions: raw.actions as LogEntry[],
    // The recorded outcome is kept as written, so `--replay` can compare it
    // with what the replay arrives at.
    outcome: (raw.outcome ?? null) as LogOutcome | null,
  };
}
