// Saving and loading a run of the new game (plan B1, question 152).
import { describe, expect, it } from 'vitest';
import {
  FRONTIER_STATE_VERSION,
  createFrontier,
  frontierAct,
  hashFrontier,
  loadFrontier,
  saveFrontier,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { actionOf, gathererStep } from '../../tools/frontierRun';

/** `seed` played by the gatherer for `steps` steps. */
function played(seed: number, steps: number): FrontierState {
  let state = createFrontier(seed);
  for (let i = 0; i < steps; i += 1) {
    const step = gathererStep(state);
    if (step === null) break;
    state = frontierAct(state, actionOf(step)).state;
  }
  return state;
}

describe('saving a run (plan B1)', () => {
  it('loads back exactly what was saved, at the start and after many shifts', () => {
    for (const state of [createFrontier(3), played(3, 150)]) {
      const loaded = loadFrontier(saveFrontier(state));
      expect(loaded).not.toBeNull();
      if (loaded === null) return;
      expect(hashFrontier(loaded)).toBe(hashFrontier(state));
      expect(loaded.inventory).toEqual(state.inventory);
    }
  });

  it('plays on the same after a load as without one', () => {
    const state = played(7, 80);
    const loaded = loadFrontier(saveFrontier(state));
    if (loaded === null) throw new Error('not loaded');
    let a = state;
    let b = loaded;
    for (let i = 0; i < 40; i += 1) {
      const step = gathererStep(a);
      if (step === null) break;
      a = frontierAct(a, actionOf(step)).state;
      b = frontierAct(b, actionOf(step)).state;
    }
    expect(hashFrontier(b)).toBe(hashFrontier(a));
  });

  it('reads nothing from no save, a broken one, or one of another version', () => {
    expect(loadFrontier(null)).toBeNull();
    expect(loadFrontier('not json')).toBeNull();
    const old = JSON.parse(saveFrontier(createFrontier(1))) as { version: number };
    old.version = FRONTIER_STATE_VERSION - 1;
    expect(loadFrontier(JSON.stringify(old))).toBeNull();
  });
});
