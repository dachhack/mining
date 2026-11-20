// The acceptance check in small (issue #108): the rule checker of
// tools/invariants.ts, a few whole runs of every policy with it switched on,
// and the terracing and random policies' own behaviour.
//
// The full check is `npm run sim -- --acceptance --runs 1000`. It takes
// minutes, so it is a script and not a test; CI runs it on a few seeds.

import { describe, expect, it } from 'vitest';
import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, SHIFT } from '../../src/data';
import { endShift, hashState } from '../../src/engine';
import type { GameState, MineAction, StepResult } from '../../src/engine';
import { BLOCKS } from '../../src/data';
import { setBlock } from '../../src/engine/state';
import { act, buildState, terrainLayers } from '../engine/helpers';
import { makeRuleChecker } from '../../tools/invariants';
import { POLICY_NAMES, makePolicy } from '../../tools/policies';
import { TOOL_KIT } from '../../tools/simKit';
import { playRun, replayDecisions } from '../../tools/simRun';
import type { RunResult } from '../../tools/simRun';
import { setWaterOn } from '../../src/engine/standing';

const CONTRACT = CONTRACT_IDS[0] as string;

/**
 * The time limit for a test that plays whole runs: they take a second or two
 * here and several times that on the CI machine (see sim.test.ts).
 */
const WHOLE_RUNS_TIMEOUT_MS = 30000;

/** Play one whole run with the rule checker on, and replay it. */
function checkedRun(
  policyName: string,
  seed: number,
  kit: boolean,
): { result: RunResult; problems: string[]; replayHash: string } {
  const checker = makeRuleChecker(`${policyName}, seed ${seed}`);
  const extraItems = kit ? TOOL_KIT : undefined;
  const result = playRun({
    seed,
    contractId: CONTRACT,
    loadoutId: DEFAULT_LOADOUT_ID,
    policy: makePolicy(policyName, seed),
    maxShifts: 300,
    extraItems,
    onStep: checker.onStep,
  });
  const replayed = replayDecisions(
    seed,
    CONTRACT,
    DEFAULT_LOADOUT_ID,
    result.decisions,
    extraItems,
  );
  return { result, problems: checker.problems, replayHash: hashState(replayed) };
}

/** The action types in a list of decision keys ("mine 3,4 ap 2" is a 'mine'). */
function typesIn(decisions: string[]): Set<string> {
  return new Set(decisions.map((decision) => decision.split(' ')[0] as string));
}

describe('every policy plays whole runs without breaking a rule', () => {
  for (const policyName of POLICY_NAMES) {
    it(
      `${policyName}: two seeds, no broken rule, and the replay gives the same hash`,
      () => {
        for (const seed of [3, 8]) {
          const { result, problems, replayHash } = checkedRun(policyName, seed, false);
          expect(problems).toEqual([]);
          expect(replayHash).toBe(result.metrics.finalHash);
          // No scripted run is still going after 300 shifts.
          expect(result.finalState.status.kind).toBe('ended');
        }
      },
      WHOLE_RUNS_TIMEOUT_MS,
    );
  }
});

describe('breaking into a cavern on a generated cube (issue #88 item 2)', () => {
  it(
    'the square drops exactly 1 level and the level rule holds, on every mine of the run',
    () => {
      // Seed 24: the pit policy takes the roof off two caverns (the golden
      // run pit-seed-24-caverns). The checker looks at every mine of the run,
      // the two breaches among them.
      const { result, problems } = checkedRun('pit', 24, false);
      expect(result.metrics.hazards.cavernsBroken).toBeGreaterThan(0);
      expect(problems).toEqual([]);
    },
    WHOLE_RUNS_TIMEOUT_MS,
  );
});

describe('the random policy', () => {
  it(
    'uses every kind of action the standard loadout allows',
    () => {
      const seen = new Set<string>();
      for (const seed of [1, 2, 3]) {
        const { result } = checkedRun('random', seed, false);
        for (const type of typesIn(result.decisions)) {
          seen.add(type);
        }
      }
      for (const type of [
        'mine',
        'cutTree',
        'craft',
        'placeSupport',
        'foundCamp',
        'rest',
        'decommissionCamp',
        'endShift',
      ]) {
        expect(seen, type).toContain(type);
      }
      // It never closes the mine: see `makeRandomPolicy`.
      expect(seen).not.toContain('closeMine');
    },
    WHOLE_RUNS_TIMEOUT_MS,
  );

  it(
    'with the tool kit it also blasts, pumps, vents, seals and scans, and still breaks no rule',
    () => {
      const seen = new Set<string>();
      for (const seed of [1, 2, 3]) {
        const { result, problems, replayHash } = checkedRun('random', seed, true);
        expect(problems).toEqual([]);
        expect(replayHash).toBe(result.metrics.finalHash);
        for (const type of typesIn(result.decisions)) {
          seen.add(type);
        }
      }
      for (const type of ['placeExplosive', 'placePump', 'placeVent', 'seal', 'scan']) {
        expect(seen, type).toContain(type);
      }
    },
    WHOLE_RUNS_TIMEOUT_MS,
  );
});

describe('the terracing policy', () => {
  it(
    'digs its planned pit in a corner, holds the walls with supports, and is never hurt',
    () => {
      const { result, problems } = checkedRun('terrace:5', 4, false);
      expect(problems).toEqual([]);
      const metrics = result.metrics;
      // The plan was finished: the corner is 5 down and the mine was closed.
      expect(metrics.deepestSquare).toBe(5);
      expect(metrics.cause).toBe('mineClosed');
      expect(metrics.structuresPlaced['support']).toBeGreaterThan(0);
      // Nothing slumped, so nothing hurt the crew.
      expect(metrics.hazards.blocksSlumped).toBe(0);
      expect(metrics.damageTaken).toBe(0);
      // The cone of 1-level steps to depth 5 in a corner is 5+4+3+2+1 squares
      // of 5, 4, 3, 2 and 1 levels: 35 blocks. Coal taken elsewhere adds a few.
      expect(metrics.blocksMined).toBeGreaterThanOrEqual(35);
      expect(metrics.blocksMined).toBeLessThan(60);
    },
    WHOLE_RUNS_TIMEOUT_MS,
  );

  it(
    'with a camp it founds one beside the pit',
    () => {
      const { result, problems } = checkedRun('terrace:5:camp', 4, false);
      expect(problems).toEqual([]);
      expect(typesIn(result.decisions)).toContain('foundCamp');
      expect(result.metrics.deepestSquare).toBe(5);
    },
    WHOLE_RUNS_TIMEOUT_MS,
  );

  it('makes the same decisions for the same state: it uses no random numbers', () => {
    const first = playRun({
      seed: 6,
      contractId: CONTRACT,
      loadoutId: DEFAULT_LOADOUT_ID,
      policy: makePolicy('terrace', 6),
      maxShifts: 300,
      maxDecisions: 40,
    });
    const second = playRun({
      seed: 6,
      contractId: CONTRACT,
      loadoutId: DEFAULT_LOADOUT_ID,
      policy: makePolicy('terrace', 99),
      maxShifts: 300,
      maxDecisions: 40,
    });
    expect(second.decisions).toEqual(first.decisions);
  });
});

describe('the rule checker notices a broken rule', () => {
  // Each test hands the checker a step that no working engine would produce,
  // made by changing the state the engine answered.

  /** A 3 x 3 pit floor of stone, 1 level down, with layers to spare below it. */
  const flat = (): GameState =>
    buildState({ layers: terrainLayers(['111', '111', '111'], undefined, 6) });
  /** The mine of the middle square: stone, 2 AP. */
  const MINE_MIDDLE: MineAction = { type: 'mine', x: 1, y: 1, ap: BLOCKS.stone.mineCost as number };

  /** End the shift for real, let `spoil` damage the answer, and ask the checker. */
  function afterEndShift(spoil: (result: StepResult) => void): string {
    const before = flat();
    const result = endShift(before);
    spoil(result);
    const checker = makeRuleChecker('test');
    checker.onStep(before, 'endShift', result);
    return checker.problems.join('\n');
  }

  /** Mine the middle square for real, let `spoil` damage the answer, and ask the checker. */
  function afterMine(spoil: (result: StepResult) => void): string {
    const before = flat();
    const result = act(before, { type: 'mine', x: 1, y: 1 });
    spoil(result);
    const checker = makeRuleChecker('test');
    checker.onStep(before, MINE_MIDDLE, result);
    return checker.problems.join('\n');
  }

  it('says nothing about a sound step', () => {
    expect(afterEndShift(() => undefined)).toBe('');
    expect(afterMine(() => undefined)).toBe('');
  });

  it('the level rule: a mined square more than 1 below a neighbour', () => {
    const text = afterMine((result) => {
      // As if the mine had taken two blocks: the square is now 3 down.
      setBlock(result.state, { x: 1, y: 1, z: 2 }, BLOCKS.air.code);
    });
    expect(text).toMatch(/went from depth 1 to 3/);
    expect(text).toMatch(/level rule is broken/);
  });

  it('conservation: water that no event accounts for', () => {
    const text = afterEndShift((result) => {
      setWaterOn(result.state, 0, 0, 1);
    });
    expect(text).toMatch(/1 units of water stand on the map, but the events/);
  });

  it('ground level: water standing higher than the square is deep', () => {
    const text = afterEndShift((result) => {
      setWaterOn(result.state, 0, 0, 2);
    });
    expect(text).toMatch(/stands above ground level/);
  });

  it('the gauges: AP, fuel, and a crew at 0 health that plays on', () => {
    const text = afterEndShift((result) => {
      result.state.ap = SHIFT.apPerShift + 1;
      result.state.fuel = -1;
      result.state.crew.health = 0;
    });
    expect(text).toMatch(/AP is 6/);
    expect(text).toMatch(/fuel is -1/);
    expect(text).toMatch(/crew health is 0 but the run goes on/);
  });

  it('an action that takes the wrong AP', () => {
    const text = afterMine((result) => {
      result.state.ap = SHIFT.apPerShift; // as if the mine had been free
    });
    expect(text).toMatch(/AP went from 5 to 5/);
  });
});
