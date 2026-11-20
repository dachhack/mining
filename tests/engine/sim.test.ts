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

/** One run of the named policy on `seed`, measured. */
function run(policyName: string, seed: number, maxDecisions?: number): RunMetrics {
  const playOptions: PlayOptions = {
    seed,
    contractId: CONTRACT,
    loadoutId: DEFAULT_LOADOUT_ID,
    policy: makePolicy(policyName, seed),
    maxShifts: 300,
  };
  // Set only when given: an optional field may be left out, not set to `undefined`.
  if (maxDecisions !== undefined) {
    playOptions.maxDecisions = maxDecisions;
  }
  return playRun(playOptions).metrics;
}

describe('simulate', () => {
  // Run in `beforeAll`, not while the file is loaded, so that a crash in the
  // simulator is reported under this name.
  let report: SimReport;
  beforeAll(() => {
    report = simulate(options('random', 6));
  });

  it('gives the same report for the same options', () => {
    expect(simulate(options('random', 6))).toEqual(report);
  });

  it('reports one entry per run, in seed order', () => {
    expect(report.runs.map((entry) => entry.seed)).toEqual([40, 41, 42, 43, 44, 45]);
    expect(report.aggregate.runs).toBe(6);
  });

  it('counts every run under exactly one outcome and one cause', () => {
    const total = (counts: Record<string, number>): number =>
      Object.values(counts).reduce((sum, count) => sum + count, 0);
    expect(total(report.aggregate.outcomes)).toBe(6);
    expect(total(report.aggregate.causes)).toBe(6);
    expect(Object.keys(report.aggregate.outcomes)).toEqual(['salvage', 'lost', 'unfinished']);
    expect(Object.keys(report.aggregate.causes)).toEqual(['mineClosed', 'outOfFuel', 'shiftCap']);
  });

  it('lists every recipe and every item, so unused ones show as 0', () => {
    const recipeIds = FIELD_RECIPES.map((recipe) => recipe.id);
    expect(Object.keys(report.aggregate.recipesUsed)).toEqual(recipeIds);
    expect(Object.keys(report.aggregate.finalStockpileMean)).toEqual(Object.keys(ITEMS));
    for (const entry of report.runs) {
      expect(Object.keys(entry.recipesUsed)).toEqual(recipeIds);
      expect(Object.keys(entry.finalStockpile)).toEqual(Object.keys(ITEMS));
    }
  });

  it('adds the runs up', () => {
    const pit = simulate(options('pit', 2));
    const crafts = pit.runs.reduce((sum, entry) => sum + (entry.recipesUsed['fuel'] ?? 0), 0);
    expect(crafts).toBeGreaterThan(0);
    expect(pit.aggregate.recipesUsed['fuel']?.crafts).toBe(crafts);
    // Each fuel craft makes 3 fuel (design doc 7.1).
    expect(pit.aggregate.itemsCrafted['fuel']).toBe(3 * crafts);
    const shifts = pit.runs.map((entry) => entry.shiftsPlayed);
    expect(pit.aggregate.shiftsPlayed.min).toBe(Math.min(...shifts));
    expect(pit.aggregate.shiftsPlayed.max).toBe(Math.max(...shifts));
    const depths = pit.runs.map((entry) => entry.deepestSquare);
    expect(pit.aggregate.deepestSquare.max).toBe(Math.max(...depths));
  });

  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('prints a summary that names the policy and the outcomes', () => {
    const summary = formatSummary(report);
    expect(summary).toContain('6 runs, policy random, seeds 40-45');
    expect(summary).toContain('outcomes:');
    expect(summary).toContain('deepest square:');
    expect(summary).toContain('trees cut:');
    expect(summary).toContain('recipes used');
    expect(summary).toContain('mineral traces:');
  });
});

describe('playRun', () => {
  // Two whole pit runs, played once and used by several tests below.
  let pit11: RunMetrics;
  let pit31: RunMetrics;
  beforeAll(() => {
    pit11 = run('pit', 11);
    pit31 = run('pit', 31);
  });

  it('measures a pit run', () => {
    const metrics = pit11;
    expect(metrics.outcome).toBe('salvage');
    expect(metrics.cause).toBe('mineClosed');
    // The pit goes down by terraces: several levels, many more blocks. Its
    // level benches (so that no wall slumps: issue #94) keep it shallow.
    expect(metrics.deepestSquare).toBeGreaterThanOrEqual(3);
    expect(metrics.blocksMined).toBeGreaterThan(10 * metrics.deepestSquare);
    expect(metrics.shareOfCubeMined).toBeCloseTo(metrics.blocksMined / 32768, 10);
    expect(metrics.treesCut).toBeGreaterThan(0);
    // It closes the mine with the fuel nearly gone, never having started a shift on 0.
    expect(metrics.fuelAtEnd).toBe(1);
    expect(metrics.shiftsAtZeroFuel).toBe(0);
    expect(metrics.damageTaken).toBe(0);
    // A mine or a cut for almost every one of the 1,024 squares.
    expect(metrics.legalActionsPerPhase.min).toBeGreaterThan(500);
  });

  it('reports 0 for the deepest square when nothing was mined', () => {
    const metrics = run('pit', 11, 0);
    expect(metrics.deepestSquare).toBe(0);
    expect(metrics.blocksMined).toBe(0);
    expect(metrics.outcome).toBe('unfinished');
    expect(metrics.cause).toBe('cutShort');
  });

  it('says whether mineral traces were seen before the first ore was mined', () => {
    // Seed 11: the pit stays too far above the ore to show any traces.
    expect(pit11.oreBlocksMined).toBe(0);
    expect(pit11.tracesSeenBeforeFirstOre).toBe(false);
    // Seed 31 saw traces before pit walls slumped (issue #94). Now the pit's
    // level benches keep it to 3 to 5 levels, too far above the ore (layer 8
    // and below) on every seed tried (1 to 150 on the cubes of issue #95). So no scripted run reaches
    // the "true" answer today; task T15's terracing policy should, and this
    // line is where to check it.
    expect(pit31.oreBlocksMined).toBe(0);
    expect(pit31.tracesSeenBeforeFirstOre).toBe(false);
    // A run stopped before its first decision has seen only the top layer,
    // which is too far above the ore to show any traces.
    expect(run('pit', 31, 0).tracesSeenBeforeFirstOre).toBe(false);
  });

  it('counts the runs that saw traces and the runs that mined ore', () => {
    // Seeds 31 and 32; `...` copies the options, then `firstSeed` replaces one.
    const report = simulate({ ...options('pit', 2), firstSeed: 31 });
    const a = report.aggregate;
    expect(a.runsWithTracesSeenBeforeFirstOre).toBe(
      report.runs.filter((entry) => entry.tracesSeenBeforeFirstOre).length,
    );
    // No pit run sees traces since issue #94 (see the test above).
    expect(a.runsWithTracesSeenBeforeFirstOre).toBe(0);
    expect(a.runsThatMinedOre).toBe(report.runs.filter((entry) => entry.oreBlocksMined > 0).length);
    expect(a.runsThatMinedOreAfterSeeingTraces).toBeLessThanOrEqual(a.runsThatMinedOre);
  });

  it('stops a run at the shift cap and says so', () => {
    const { metrics, finalState } = playRun({
      seed: 2,
      contractId: CONTRACT,
      loadoutId: DEFAULT_LOADOUT_ID,
      policy: makePolicy('random', 2),
      maxShifts: 3,
    });
    expect(metrics.outcome).toBe('unfinished');
    expect(metrics.cause).toBe('shiftCap');
    expect(metrics.shiftsPlayed).toBe(3);
    expect(finalState.status.kind).toBe('active');
  });

  it('counts a shift that begins with no fuel', () => {
    // The random policy on seed 9 crafts nothing. It founds a camp in shift 2
    // and takes it down in shift 16, and the camp's upkeep burns 1 fuel at
    // the end of shifts 5, 9 and 13 (design doc 4). So its 24 fuel last 21
    // shifts, the 22nd begins at 0, and its upkeep ends the run.
    const metrics = run('random', 9);
    expect(metrics.cause).toBe('outOfFuel');
    expect(metrics.recipesUsed['fuel']).toBe(0);
    expect(metrics.fuelAtEnd).toBe(0);
    expect(metrics.shiftsPlayed).toBe(22);
    expect(metrics.shiftsAtZeroFuel).toBe(1);
    // The random policy never closes the mine, and hardly ever goes a second level down.
    expect(metrics.deepestSquare).toBeGreaterThanOrEqual(1);
  });

  it('knows each policy name, and refuses any other', () => {
    expect(POLICY_NAMES).toEqual(['random', 'pit', 'greedy']);
    for (const name of POLICY_NAMES) {
      expect(makePolicy(name, 1).name).toBe(name);
    }
    expect(() => makePolicy('staircase', 1)).toThrow(/Unknown policy/);
  });
});
