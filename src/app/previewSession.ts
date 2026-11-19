// The early phone preview (issue #64): starting, saving and resuming a run.
//
// This file has no DOM code, so the unit tests can run it in plain Node.
// The screen itself is in preview.ts. A run is kept as its play log (the
// same format `npm run play -- --log FILE` writes): the seed and every
// choice made. Resuming replays the log from the seed; the engine is
// deterministic, so that always arrives at the same state.

import { CONTRACT_IDS, DEFAULT_LOADOUT_ID } from '../data';
import { ENGINE_VERSION } from '../engine';
import { logFromText, logToText, newSession, replayLog } from './text/log';
import type { Session } from './text/log';

/** The `localStorage` key the run is saved under. */
export const SAVE_KEY = 'mining-game.preview.run';

/** The largest seed the engine takes (`createRun` takes 0 to 2**32 - 1). */
export const MAX_SEED = 4294967295;

/**
 * The part of the browser's `localStorage` this file uses. Taking it as a
 * parameter lets the tests pass a stand-in, and lets the screen pass `null`
 * when the browser has no storage at all.
 */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * A fresh seed for a new run. `random` returns a number from 0 (included)
 * to 1 (not included), like `Math.random`; the screen passes `Math.random`.
 * (The engine itself never uses `Math.random`: the seed is chosen here, in
 * the app, and from then on everything comes from the seeded generator.)
 */
export function randomSeed(random: () => number): number {
  return Math.floor(random() * (MAX_SEED + 1));
}

/**
 * Read a seed typed by the player. Returns the seed, or `null` if the text
 * is not a whole number from 0 to `MAX_SEED`.
 */
export function parseSeed(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const seed = Number(trimmed);
  return seed <= MAX_SEED ? seed : null;
}

/** Start a new run on `seed`, with the same contract and loadout as `npm run play`. */
export function startRun(seed: number): Session {
  const contractId = CONTRACT_IDS[0];
  if (contractId === undefined) {
    throw new Error('the data lists no contract');
  }
  return newSession(seed, contractId, DEFAULT_LOADOUT_ID);
}

/**
 * Save the run. Returns false if the browser refused (storage full, or
 * turned off); the game goes on, only unsaved.
 */
export function saveRun(store: SaveStore | null, session: Session): boolean {
  if (store === null) {
    return false;
  }
  try {
    store.setItem(SAVE_KEY, logToText(session.log));
    return true;
  } catch {
    return false;
  }
}

/** Forget the saved run, if any. */
export function clearSavedRun(store: SaveStore | null): void {
  if (store === null) {
    return;
  }
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: if storage cannot be reached, there is nothing to clear.
  }
}

/** What `loadRun` found. */
export interface LoadResult {
  /** The resumed run, or `null` if there was none or it could not be used. */
  session: Session | null;
  /** A line to show the player about what happened, or `null` if nothing to say. */
  note: string | null;
}

/**
 * Resume the saved run. A run saved by another engine version is replayed
 * under this engine's rules, and the note says so. If it no longer replays
 * (the rules changed), it is dropped and the player is told why.
 */
export function loadRun(store: SaveStore | null): LoadResult {
  if (store === null) {
    return { session: null, note: null };
  }
  let text: string | null;
  try {
    text = store.getItem(SAVE_KEY);
  } catch {
    return { session: null, note: null };
  }
  if (text === null) {
    return { session: null, note: null };
  }
  try {
    const log = logFromText(text);
    const session = replayLog(log);
    let note = `Resumed your saved run: seed ${log.seed}.`;
    if (log.engineVersion !== ENGINE_VERSION) {
      // The choices still replay, but under the new rules, so the run the
      // player comes back to may differ from the one they left.
      note +=
        ` It was saved on engine ${log.engineVersion} and replayed on engine ` +
        `${ENGINE_VERSION}: the rules may have changed.`;
    }
    return { session, note };
  } catch {
    clearSavedRun(store);
    return {
      session: null,
      note:
        `Your saved run could not be resumed on this version of the game ` +
        `(engine ${ENGINE_VERSION}), so a new run was started.`,
    };
  }
}
