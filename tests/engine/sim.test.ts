// The simulator's run driver and report (tools/simRun.ts, tools/policies.ts).

import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, FIELD_RECIPES, ITEMS } from '../../src/data';
import { POLICY_NAMES, makePolicy } from '../../tools/policies';
import { formatSummary, playRun, simulate } from '../../tools/simRun';
import type { PlayOptions, RunMetrics, SimOptions, SimReport } from '../../tools/simRun';

const CONTRACT = CONTRACT_IDS[0] as string;

function options(policyName: string, runs: number): SimOptions {
  return {
    policyName,
    firstSeed: 40,
    runs,
    maxShifts: 300,
    contractId: CONTRACT,
    loadoutId: DEFAULT_LOADOUT_ID,
    makePolicy,
  };
}

describe('simulate', () => {
  // Run in `beforeAll`, not while the file is loaded, so that a crash in the
  // simulator is reported under this name.
  let report: SimReport;
  beforeAll(() => {
    report = simulate(options('random', 12));
  });

  it('gives the same report for the same options', () => {
    expect(simulate(options('random', 12))).toEqual(report);
  });

  it('reports one entry per run, in seed order', () => {
    expect(report.runs.map((run) => run.seed)).toEqual([
      40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
    ]);
    expect(report.aggregate.runs).toBe(12);
  });

  it('counts every run under exactly one outcome and one cause', () => {
    const total = (counts: Record<string, number>): number =>
      Object.values(counts).reduce((sum, count) => sum + count, 0);
    expect(total(report.aggregate.outcomes)).toBe(12);
    expect(total(report.aggregate.causes)).toBe(12);
    expect(Object.keys(report.aggregate.outcomes)).toEqual(['salvage', 'death', 'unfinished']);
    expect(Object.keys(report.aggregate.causes)).toEqual(['left', 'fell', 'outOfFuel', 'shiftCap']);
  });

  it('lists every recipe and every item, so unused ones show as 0', () => {
    const recipeIds = FIELD_RECIPES.map((recipe) => recipe.id);
    expect(Object.keys(report.aggregate.recipesUsed)).toEqual(recipeIds);
    expect(Object.keys(report.aggregate.finalInventoryMean)).toEqual(Object.keys(ITEMS));
    for (const run of report.runs) {
      expect(Object.keys(run.recipesUsed)).toEqual(recipeIds);
      expect(Object.keys(run.finalInventory)).toEqual(Object.keys(ITEMS));
    }
  });

  it('adds the runs up', () => {
    const crafts = report.runs.reduce((sum, run) => sum + (run.recipesUsed['ladder'] ?? 0), 0);
    expect(report.aggregate.recipesUsed['ladder']?.crafts).toBe(crafts);
    // Each ladder craft makes 3 ladders (design doc 7.1).
    expect(report.aggregate.itemsCrafted['ladder']).toBe(3 * crafts);
    const shifts = report.runs.map((run) => run.shiftsPlayed);
    expect(report.aggregate.shiftsPlayed.min).toBe(Math.min(...shifts));
    expect(report.aggregate.shiftsPlayed.max).toBe(Math.max(...shifts));
  });

  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('prints a summary that names the policy and the outcomes', () => {
    const summary = formatSummary(report);
    expect(summary).toContain('12 runs, policy random, seeds 40-51');
    expect(summary).toContain('outcomes:');
    expect(summary).toContain('recipes used');
  });
});

describe('playRun', () => {
  it('measures a staircase run', () => {
    const { metrics } = playRun({
      seed: 8,
      contractId: CONTRACT,
      loadoutId: DEFAULT_LOADOUT_ID,
      policy: makePolicy('staircase', 8),
      maxShifts: 300,
    });
    expect(metrics.outcome).toBe('salvage');
    expect(metrics.cause).toBe('left');
    expect(metrics.deepestLayer).toBe(8);
    expect(metrics.blocksMined).toBe(17);
    expect(metrics.shareOfCubeMined).toBeCloseTo(17 / 32768, 10);
    expect(metrics.shiftsPlayed).toBe(10);
    // 24 fuel at the start, 1 used at each of the 9 ends of shift.
    expect(metrics.fuelAtEnd).toBe(15);
    expect(metrics.shiftsAtZeroFuel).toBe(0);
    // 3 lamp oil lasts 12 shifts; the run is over before then.
    expect(metrics.shiftsInTheDark).toBe(0);
    expect(metrics.legalActionsPerPhase.min).toBeGreaterThan(0);
  });

  it('says whether mineral traces were seen before the first ore was mined', () => {
    function staircase(seed: number, maxDecisions?: number): RunMetrics {
      const playOptions: PlayOptions = {
        seed,
        contractId: CONTRACT,
        loadoutId: DEFAULT_LOADOUT_ID,
        policy: makePolicy('staircase', seed),
        maxShifts: 300,
      };
      // Set only when given: an optional field may be left out, not set to `undefined`.
      if (maxDecisions !== undefined) {
        playOptions.maxDecisions = maxDecisions;
      }
      return playRun(playOptions).metrics;
    }
    // The staircase stops in layer 8, the first layer that can hold ore.
    // Seed 8: no rock with traces along the way, and no ore mined.
    expect(staircase(8).oreBlocksMined).toBe(0);
    expect(staircase(8).tracesSeenBeforeFirstOre).toBe(false);
    // Seed 7: traces seen, though the staircase mined no ore.
    expect(staircase(7).oreBlocksMined).toBe(0);
    expect(staircase(7).tracesSeenBeforeFirstOre).toBe(true);
    // Seed 11: traces seen, and then an ore block mined.
    expect(staircase(11).oreBlocksMined).toBe(1);
    expect(staircase(11).tracesSeenBeforeFirstOre).toBe(true);
    // A run stopped before its first decision has seen only the top layer,
    // which is too far above the ore to show any traces.
    expect(staircase(11, 0).tracesSeenBeforeFirstOre).toBe(false);
  });

  it('counts the runs that saw traces and the runs that mined ore', () => {
    const report = simulate(options('staircase', 6));
    const a = report.aggregate;
    expect(a.runsWithTracesSeenBeforeFirstOre).toBe(
      report.runs.filter((run) => run.tracesSeenBeforeFirstOre).length,
    );
    expect(a.runsThatMinedOre).toBe(report.runs.filter((run) => run.oreBlocksMined > 0).length);
    expect(a.runsThatMinedOreAfterSeeingTraces).toBeLessThanOrEqual(a.runsThatMinedOre);
    expect(formatSummary(report)).toContain('mineral traces:');
  });

  it('stops a run at the shift cap and says so', () => {
    const { metrics, finalState } = playRun({
      seed: 2,
      contractId: CONTRACT,
      loadoutId: DEFAULT_LOADOUT_ID,
      policy: makePolicy('wander', 2),
      maxShifts: 3,
    });
    expect(metrics.outcome).toBe('unfinished');
    expect(metrics.cause).toBe('shiftCap');
    expect(metrics.shiftsPlayed).toBe(3);
    expect(finalState.status.kind).toBe('active');
  });

  it('counts a shift that begins with no fuel', () => {
    // The wander policy on seed 9 runs out of fuel; the shift before the
    // last upkeep began at 0.
    const { metrics } = playRun({
      seed: 9,
      contractId: CONTRACT,
      loadoutId: DEFAULT_LOADOUT_ID,
      policy: makePolicy('wander', 9),
      maxShifts: 300,
    });
    expect(metrics.cause).toBe('outOfFuel');
    expect(metrics.fuelAtEnd).toBe(0);
    expect(metrics.shiftsAtZeroFuel).toBeGreaterThanOrEqual(1);
  });

  it('counts the shifts that begin with the lamp out', () => {
    // The same run. It crafts no lamp oil, so the 3 it starts with burn at the
    // ends of shifts 4, 8 and 12, and every shift from 13 on begins in the
    // dark. It lasts 25 shifts: 24 fuel, and the last shift at 0. (Before the
    // forest of issue #70 changed the start, it crafted some fuel and lasted 28.)
    const { metrics } = playRun({
      seed: 9,
      contractId: CONTRACT,
      loadoutId: DEFAULT_LOADOUT_ID,
      policy: makePolicy('wander', 9),
      maxShifts: 300,
    });
    expect(metrics.recipesUsed['lampOil']).toBe(0);
    expect(metrics.shiftsPlayed).toBe(25);
    expect(metrics.shiftsInTheDark).toBe(25 - 12);
    const report = simulate(options('wander', 3));
    expect(report.aggregate.runsWithAShiftInTheDark).toBe(
      report.runs.filter((run) => run.shiftsInTheDark > 0).length,
    );
    expect(formatSummary(report)).toContain('shifts in the dark:');
  });

  it('knows each policy name, and refuses any other', () => {
    for (const name of POLICY_NAMES) {
      expect(makePolicy(name, 1).name).toBe(name);
    }
    expect(() => makePolicy('clever', 1)).toThrow(/Unknown policy/);
  });
});
