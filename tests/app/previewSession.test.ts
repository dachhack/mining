// Tests for the early phone preview's run handling (issue #64):
// src/app/previewSession.ts and the shared one-turn helper src/app/text/turn.ts.
// No DOM is needed: storage is a small stand-in for `localStorage`.
import { describe, expect, it } from 'vitest';

import { ENGINE_VERSION, hashState } from '../../src/engine';
import {
  MAX_SEED,
  SAVE_KEY,
  clearSavedRun,
  loadRun,
  parseSeed,
  randomSeed,
  saveRun,
  startRun,
} from '../../src/app/previewSession';
import type { SaveStore } from '../../src/app/previewSession';
import { runCli } from '../../tools/play/cli';
import { tapOutcome } from '../../src/app/map/targets';
import { LOG_FORMAT, menuChoices } from '../../src/app/text/log';
import { takeTurn } from '../../src/app/text/turn';
import { buildView } from '../../src/app/text/view';

/** A stand-in for `localStorage`, backed by a Map. */
function memoryStore(): SaveStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/** A store whose every call throws, like storage turned off in a browser. */
const brokenStore: SaveStore = {
  getItem: () => {
    throw new Error('storage is off');
  },
  setItem: () => {
    throw new Error('storage is off');
  },
  removeItem: () => {
    throw new Error('storage is off');
  },
};

/** Take the listed choice with this name (as the play tool names it): "end", "leave", a craft. */
function take(session: ReturnType<typeof startRun>, name: string): string {
  const view = buildView(session.state, { deepestDepth: session.deepestDepth });
  const choice = view.choices.find((c) => c.name === name);
  if (choice === undefined) {
    throw new Error(`no choice named ${name}`);
  }
  return takeTurn(session, choice.entry);
}

/** Tap the square (x, y) as the screen does: mine it, or cut its tree. */
function tap(session: ReturnType<typeof startRun>, x: number, y: number): string {
  const outcome = tapOutcome(session.state, x, y);
  if (outcome.entry === null) {
    throw new Error(`the tap on (${x}, ${y}) was refused: ${outcome.lines.join(' ')}`);
  }
  return takeTurn(session, outcome.entry);
}

describe('seeds', () => {
  it('a random seed is a whole number the engine takes', () => {
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.999999999999)).toBe(MAX_SEED);
    expect(Number.isInteger(randomSeed(() => 0.5))).toBe(true);
  });

  it('a typed seed must be a whole number from 0 to the largest seed', () => {
    expect(parseSeed(' 7 ')).toBe(7);
    expect(parseSeed('0')).toBe(0);
    expect(parseSeed(String(MAX_SEED))).toBe(MAX_SEED);
    expect(parseSeed(String(MAX_SEED + 1))).toBeNull();
    expect(parseSeed('-1')).toBeNull();
    expect(parseSeed('1.5')).toBeNull();
    expect(parseSeed('seven')).toBeNull();
    expect(parseSeed('')).toBeNull();
  });
});

describe('a turn on the preview', () => {
  it('prints the same "what came of it" lines as npm run play', () => {
    const session = startRun(7);
    // Seed 7: (12, 0) is open ground over stone, (11, 0) has a tree.
    const lines = [tap(session, 12, 0), tap(session, 11, 0), take(session, 'end')];
    const cli = runCli(['--seed', '7', '--do', 'mine 12,0; cut 11,0; end']).output.split('\n');
    for (const line of lines) {
      expect(cli).toContain(line);
    }
  });
});

describe('saving and resuming', () => {
  it('a saved run resumes to the same state', () => {
    const store = memoryStore();
    const session = startRun(7);
    tap(session, 12, 0);
    tap(session, 11, 0);
    expect(saveRun(store, session)).toBe(true);

    const loaded = loadRun(store);
    expect(loaded.session).not.toBeNull();
    expect(loaded.note).toBe('Resumed your saved run: seed 7.');
    expect(hashState(loaded.session?.state ?? session.state)).toBe(hashState(session.state));
    expect(loaded.session?.log.actions).toEqual(session.log.actions);
  });

  it('a save from another engine version is resumed with a note saying so', () => {
    const store = memoryStore();
    const session = startRun(7);
    tap(session, 12, 0);
    saveRun(store, session);
    const log = JSON.parse(store.data.get(SAVE_KEY) ?? '{}') as { engineVersion: string };
    log.engineVersion = '0.0.1';
    store.data.set(SAVE_KEY, JSON.stringify(log));

    const loaded = loadRun(store);
    expect(loaded.session).not.toBeNull();
    expect(loaded.note).toBe(
      'Resumed your saved run: seed 7. It was saved on engine 0.0.1 and replayed on engine ' +
        `${ENGINE_VERSION}: the rules may have changed.`,
    );
  });

  it('with nothing saved there is nothing to resume', () => {
    expect(loadRun(memoryStore())).toEqual({ session: null, note: null });
    expect(loadRun(null)).toEqual({ session: null, note: null });
  });

  it('clearing forgets the saved run', () => {
    const store = memoryStore();
    saveRun(store, startRun(7));
    clearSavedRun(store);
    expect(store.data.has(SAVE_KEY)).toBe(false);
  });

  it('a saved run that no longer replays is dropped, with a note', () => {
    const store = memoryStore();
    const session = startRun(7);
    saveRun(store, session);
    // Change the saved log so its first choice is not legal on this seed.
    const log = JSON.parse(store.data.get(SAVE_KEY) ?? '{}') as { actions: unknown[] };
    log.actions = [{ type: 'mine', x: -5, y: -5, ap: 1 }];
    store.data.set(SAVE_KEY, JSON.stringify(log));

    const loaded = loadRun(store);
    expect(loaded.session).toBeNull();
    expect(loaded.note).toContain('could not be resumed');
    expect(store.data.has(SAVE_KEY)).toBe(false);
  });

  it('a save in the old log format (from before mining by square) is dropped, with a note', () => {
    // What a version-0.3.0 build left on the phone: log format 1, with a move.
    const store = memoryStore();
    saveRun(store, startRun(7));
    const log = JSON.parse(store.data.get(SAVE_KEY) ?? '{}') as Record<string, unknown>;
    expect(log['format']).toBe(LOG_FORMAT);
    log['format'] = LOG_FORMAT - 1;
    log['engineVersion'] = '0.3.0';
    log['actions'] = [{ type: 'move', to: { x: 17, y: 16, z: -1 }, ap: 1 }];
    store.data.set(SAVE_KEY, JSON.stringify(log));

    const loaded = loadRun(store);
    expect(loaded.session).toBeNull();
    expect(loaded.note).toContain('could not be resumed');
    expect(store.data.has(SAVE_KEY)).toBe(false);
  });

  it('text that is not a play log at all is dropped too', () => {
    const store = memoryStore();
    store.data.set(SAVE_KEY, 'not json');
    expect(loadRun(store).session).toBeNull();
    expect(store.data.has(SAVE_KEY)).toBe(false);
  });

  it('a store that throws never stops the game', () => {
    const session = startRun(7);
    expect(saveRun(brokenStore, session)).toBe(false);
    expect(saveRun(null, session)).toBe(false);
    expect(() => {
      clearSavedRun(brokenStore);
    }).not.toThrow();
    expect(loadRun(brokenStore)).toEqual({ session: null, note: null });
  });

  it('the menu after resuming is the menu before saving', () => {
    const store = memoryStore();
    const session = startRun(7);
    tap(session, 12, 0);
    saveRun(store, session);
    const resumed = loadRun(store).session;
    expect(resumed).not.toBeNull();
    if (resumed !== null) {
      expect(menuChoices(resumed.state)).toEqual(menuChoices(session.state));
    }
  });
});
