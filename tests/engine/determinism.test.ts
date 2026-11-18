// Determinism (docs/repo-plan.md section 5.3): the same seed and the same
// list of decisions always give the same state.

import { describe, expect, it } from 'vitest';
import { CONTRACT_IDS, DEFAULT_LOADOUT_ID } from '../../src/data';
import {
  actionKey,
  createRun,
  deserialise,
  hashState,
  isRunActive,
  legalActions,
  serialise,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { makePolicy } from '../../tools/policies';
import { applyDecisions, playRun, replayDecisions } from '../../tools/simRun';

const CONTRACT = CONTRACT_IDS[0] as string;

/** Decisions of a fairly busy run: the wander policy mines, crafts, places, drops. */
function recordedRun(seed: number, maxDecisions: number): { decisions: string[]; hash: string } {
  const result = playRun({
    seed,
    contractId: CONTRACT,
    loadoutId: DEFAULT_LOADOUT_ID,
    policy: makePolicy('wander', seed),
    maxShifts: 300,
    maxDecisions,
  });
  return { decisions: result.decisions, hash: result.metrics.finalHash };
}

/** Save to a JSON string and load back, as a real save file would. */
function throughJson(state: GameState): GameState {
  return deserialise(JSON.parse(JSON.stringify(serialise(state))));
}

describe('determinism', () => {
  it('createRun gives the same state for the same seed, and another for another seed', () => {
    const a = hashState(createRun(5, CONTRACT, DEFAULT_LOADOUT_ID));
    const b = hashState(createRun(5, CONTRACT, DEFAULT_LOADOUT_ID));
    const c = hashState(createRun(6, CONTRACT, DEFAULT_LOADOUT_ID));
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it('the same seed and decisions give the same hash, run twice in one process', () => {
    for (const seed of [5, 12]) {
      const recorded = recordedRun(seed, 200);
      expect(recorded.decisions.length).toBe(200);
      const first = replayDecisions(seed, CONTRACT, DEFAULT_LOADOUT_ID, recorded.decisions);
      const second = replayDecisions(seed, CONTRACT, DEFAULT_LOADOUT_ID, recorded.decisions);
      expect(hashState(first)).toBe(recorded.hash);
      expect(hashState(second)).toBe(recorded.hash);
    }
  });

  it('a policy with the same seed makes the same decisions again', () => {
    expect(recordedRun(7, 120)).toEqual(recordedRun(7, 120));
  });

  it('a run saved and loaded part-way, then continued, ends in the same hash', () => {
    const seed = 9;
    // The whole run, to its end (out of fuel, a few hundred decisions).
    const recorded = recordedRun(seed, 100000);
    const total = recorded.decisions.length;
    const start = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
    expect(isRunActive(applyDecisions(start, recorded.decisions))).toBe(false);

    // Cut after the first decision, at a few points in the middle (most of
    // them part-way through a shift), and just before the last.
    for (const cut of [1, 37, Math.floor(total / 2), total - 60, total - 1]) {
      const before = applyDecisions(start, recorded.decisions.slice(0, cut));
      const loaded = throughJson(before);
      expect(hashState(loaded)).toBe(hashState(before));
      // The loaded state offers the same actions in the same order.
      expect(legalActions(loaded).map(actionKey)).toEqual(legalActions(before).map(actionKey));
      const after = applyDecisions(loaded, recorded.decisions.slice(cut));
      expect(hashState(after)).toBe(recorded.hash);
    }
  });

  it('saving and loading after every decision changes nothing', () => {
    const seed = 3;
    const recorded = recordedRun(seed, 80);
    let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
    for (const decision of recorded.decisions) {
      state = throughJson(applyDecisions(state, [decision]));
    }
    expect(hashState(state)).toBe(recorded.hash);
  });
});
