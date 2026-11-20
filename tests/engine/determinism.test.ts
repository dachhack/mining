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

/**
 * The decisions of a run of the named policy, cut after `maxDecisions`. The
 * `random` policy mines and cuts all over the map; the `pit` policy also
 * crafts fuel and leaves.
 */
function recordedRun(
  policyName: string,
  seed: number,
  maxDecisions: number,
): { decisions: string[]; hash: string } {
  const result = playRun({
    seed,
    contractId: CONTRACT,
    loadoutId: DEFAULT_LOADOUT_ID,
    policy: makePolicy(policyName, seed),
    maxShifts: 300,
    maxDecisions,
  });
  return { decisions: result.decisions, hash: result.metrics.finalHash };
}

/** Save to a JSON string and load back, as a real save file would. */
function throughJson(state: GameState): GameState {
  return deserialise(JSON.parse(JSON.stringify(serialise(state))));
}

// These tests play and replay whole runs, which are three times as long since
// the starting fuel went from 24 to 72 (decision note 0040). They take a
// second or two on an idle machine and can pass vitest's default limit of 5
// seconds on a busy one, so the whole group gets the limit of a whole-run
// test. (`{ timeout }` as the second argument applies to every test inside.)
describe('determinism', { timeout: 30000 }, () => {
  it('createRun gives the same state for the same seed, and another for another seed', () => {
    const a = hashState(createRun(5, CONTRACT, DEFAULT_LOADOUT_ID));
    const b = hashState(createRun(5, CONTRACT, DEFAULT_LOADOUT_ID));
    const c = hashState(createRun(6, CONTRACT, DEFAULT_LOADOUT_ID));
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it('the same seed and decisions give the same hash, run twice in one process', () => {
    // A random run lasts 55 to 75 decisions (24 fuel, and it hardly ever
    // crafts more); a pit run goes on longer.
    const runs = [
      { policyName: 'random', seed: 15, maxDecisions: 50 },
      { policyName: 'pit', seed: 49, maxDecisions: 120 },
    ];
    for (const run of runs) {
      const recorded = recordedRun(run.policyName, run.seed, run.maxDecisions);
      expect(recorded.decisions.length).toBe(run.maxDecisions);
      const first = replayDecisions(run.seed, CONTRACT, DEFAULT_LOADOUT_ID, recorded.decisions);
      const second = replayDecisions(run.seed, CONTRACT, DEFAULT_LOADOUT_ID, recorded.decisions);
      expect(hashState(first)).toBe(recorded.hash);
      expect(hashState(second)).toBe(recorded.hash);
    }
  });

  it('a policy with the same seed makes the same decisions again', () => {
    expect(recordedRun('random', 7, 50)).toEqual(recordedRun('random', 7, 50));
    expect(recordedRun('pit', 7, 80)).toEqual(recordedRun('pit', 7, 80));
  });

  it('a run saved and loaded part-way, then continued, ends in the same hash', () => {
    const seed = 9;
    // The whole run, to its end (out of fuel, about sixty decisions).
    const recorded = recordedRun('random', seed, 100000);
    const total = recorded.decisions.length;
    expect(total).toBeGreaterThan(40);
    const start = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
    expect(isRunActive(applyDecisions(start, recorded.decisions))).toBe(false);

    // Cut after the first decision, at a few points in the middle (most of
    // them part-way through a shift), and just before the last.
    for (const cut of [1, 37, Math.floor(total / 2), total - 1]) {
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
    const recorded = recordedRun('pit', seed, 50);
    let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
    for (const decision of recorded.decisions) {
      state = throughJson(applyDecisions(state, [decision]));
    }
    expect(hashState(state)).toBe(recorded.hash);
  });
});
