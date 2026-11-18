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

import { SHIFT } from '../../src/data';
import type { ItemStack } from '../../src/data';
import {
  ENGINE_VERSION,
  applyAction,
  createRun,
  endShift,
  hashState,
  inventoryEntries,
  isRunActive,
  legalActions,
} from '../../src/engine';
import type { Action, GameEvent, GameState } from '../../src/engine';

/** Bumped if the shape of the log file ever changes. */
export const LOG_FORMAT = 1;

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
  /** The deepest layer the avatar stood on; -1 means it never left the surface. */
  deepestLayer: number;
  inventory: ItemStack[];
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

/** A run in progress: its log, the state the log leads to, and the deepest layer reached. */
export interface Session {
  log: PlayLog;
  state: GameState;
  deepestZ: number;
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
    deepestZ: state.avatar.pos.z,
  };
}

/**
 * What the player may choose now, in menu order: the engine's legal actions,
 * then "end shift". Empty once the run has ended.
 */
export function menuChoices(state: GameState): LogEntry[] {
  if (!isRunActive(state)) {
    return [];
  }
  return [...legalActions(state), END_SHIFT];
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
  session.deepestZ = Math.max(session.deepestZ, result.state.avatar.pos.z);

  const status = result.state.status;
  if (status.kind === 'ended') {
    session.log.outcome = {
      outcome: status.outcome,
      cause: status.cause,
      shiftsPlayed: result.state.shift - SHIFT.firstShiftNumber + 1,
      deepestLayer: session.deepestZ,
      inventory: inventoryEntries(result.state),
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
