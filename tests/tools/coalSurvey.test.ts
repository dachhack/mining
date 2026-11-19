// The coal survey and the `coal` policy (tools/coalSurvey.ts, tools/policies.ts;
// issue #51, decision note 0014 item 33).

import { describe, expect, it } from 'vitest';
import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, LOADOUTS } from '../../src/data';
import {
  DEFAULT_MARGIN_SHIFTS,
  distributionOf,
  formatCoalSurvey,
  surveyCoal,
  surveyCoalSeed,
} from '../../tools/coalSurvey';
import type { CoalSurveyOptions } from '../../tools/coalSurvey';
import { makePolicy } from '../../tools/policies';
import { playRun } from '../../tools/simRun';

const CONTRACT = CONTRACT_IDS[0] as string;

function options(firstSeed: number, seeds: number): CoalSurveyOptions {
  return {
    firstSeed,
    seeds,
    contractId: CONTRACT,
    loadoutId: DEFAULT_LOADOUT_ID,
    marginShifts: DEFAULT_MARGIN_SHIFTS,
    maxShifts: 300,
  };
}

describe('the starting fuel (decision note 0014 item 33)', () => {
  // Before the forest (issue #70) the coal policy got the fuel back with 3
  // shifts to spare on every one of seeds 1 to 100, because all the top
  // layer's coal was in sight from the start. Now the trees hide most of the
  // top layer. The policy finds coal with look-holes and by cutting trees on
  // 94 of these seeds; on the 6 below it finds none and leaves, alive, with
  // the fuel it has left. This is reported to the coordinator as a design
  // question in the PR for issue #70; the loadout is not changed here. The
  // list is pinned so that any change to it shows.
  const SEEDS_WITHOUT_COAL = [15, 55, 59, 65, 78, 85];

  it('gets the fuel back, with 3 shifts to spare, on seeds 1 to 100 except where it finds no coal', () => {
    const report = surveyCoal(options(1, 100));
    const startingFuel = LOADOUTS[DEFAULT_LOADOUT_ID].fuel;
    expect(report.survey.startingFuel).toBe(startingFuel);
    expect(report.aggregate.seedsWithoutMargin).toEqual(SEEDS_WITHOUT_COAL);
    expect(report.aggregate.tripsPaidBackWithMargin).toBe(100 - SEEDS_WITHOUT_COAL.length);
    for (const entry of report.seeds) {
      // No trip runs out of fuel.
      expect(entry.trip.cause).toBe('left');
      if (SEEDS_WITHOUT_COAL.includes(entry.seed)) {
        expect(entry.trip.coalMined).toBe(0);
        continue;
      }
      expect(entry.trip.paidBack).toBe(true);
      expect(entry.trip.lowestFuel).toBeGreaterThanOrEqual(DEFAULT_MARGIN_SHIFTS);
      expect(entry.trip.fuelAtEnd).toBeGreaterThanOrEqual(startingFuel);
    }
    // With seeds that never pay back, no starting fuel covers every seed.
    expect(report.aggregate.startingFuelNeededForAll).toBeNull();
    // 100 trips, longer since the forest (look-holes, cutting): about 3 s
    // here, over the default 5 s limit on a slow CI runner.
  }, 30000);
});

describe('the coal policy', () => {
  it('fetches coal without leaving the surface, and leaves with the fuel it started with or more', () => {
    const { metrics } = playRun({
      seed: 23,
      contractId: CONTRACT,
      loadoutId: DEFAULT_LOADOUT_ID,
      policy: makePolicy('coal', 23),
      maxShifts: 300,
    });
    expect(metrics.outcome).toBe('salvage');
    expect(metrics.cause).toBe('left');
    expect(metrics.deepestLayer).toBe(-1);
    expect(metrics.damageTaken).toBe(0);
    expect(metrics.recipesUsed['fuel']).toBeGreaterThanOrEqual(1);
    expect(metrics.fuelAtEnd).toBeGreaterThanOrEqual(LOADOUTS[DEFAULT_LOADOUT_ID].fuel);
    // Every coal block it mined became fuel.
    expect(metrics.finalInventory['coal']).toBe(0);
  });

  it('follows a seam one block down from the hole of the coal it mined (seed 26)', () => {
    // Seed 595 showed this before the forest; its one top-layer coal block is
    // now under a tree, so seed 26 took its place (issue #70).
    const entry = surveyCoalSeed(26, options(26, 1));
    expect(entry.geometry.stepsToReachTopLayerCoal).toBe(18);
    // 18 steps at 5 a shift, with no tree in the way: the coal is mined in shift 4.
    expect(entry.trip.stepsWalkedToFirstCoal).toBe(18);
    expect(entry.trip.shiftFirstCoalMined).toBe(4);
    expect(entry.trip.lowestFuel).toBe(LOADOUTS[DEFAULT_LOADOUT_ID].fuel - 4);
    // One coal is 3 fuel, which does not cover 4; the second comes from the hole.
    expect(entry.trip.coalMined).toBe(2);
    expect(entry.trip.paidBack).toBe(true);
    expect(entry.trip.cause).toBe('left');
    expect(entry.trip.damageTaken).toBe(0);
    expect(entry.startingFuelNeeded).toBe(4 + DEFAULT_MARGIN_SHIFTS);
  });

  it('with no coal in sight, digs a look-hole and finds coal below (seed 1148 has none in the top layer)', () => {
    const report = surveyCoal(options(1148, 1));
    const entry = report.seeds[0];
    expect(entry?.geometry.topLayerCoalBlocks).toBe(0);
    expect(entry?.geometry.stepsToReachTopLayerCoal).toBeNull();
    expect(entry?.geometry.cheapestCoalLayer).toBe(1);
    // Before the forest the policy gave up here. Now it digs look-holes
    // (issue #70), and the first shows coal in layer 1.
    expect(entry?.trip.coalMined).toBe(1);
    expect(entry?.trip.shiftFirstCoalMined).toBe(1);
    expect(entry?.trip.paidBack).toBe(true);
    expect(entry?.trip.damageTaken).toBe(0);
  });

  it('gives up and leaves, alive, when look-holes and cut trees show no coal (seed 15)', () => {
    const report = surveyCoal(options(15, 1));
    const entry = report.seeds[0];
    // The top layer holds coal, but all of it is under the trees.
    expect(entry?.geometry.topLayerCoalBlocks).toBeGreaterThan(0);
    expect(entry?.geometry.topLayerCoalSeenAtStart).toBe(0);
    expect(entry?.trip.coalMined).toBe(0);
    expect(entry?.trip.paidBack).toBe(false);
    expect(entry?.trip.cause).toBe('left');
    expect(entry?.startingFuelNeeded).toBeNull();
    expect(report.aggregate.seedsWithoutMargin).toEqual([15]);
    expect(report.aggregate.startingFuelNeededForAll).toBeNull();
    expect(formatCoalSurvey(report)).toContain('did not get the fuel back with the margin: 15');
  });
});

describe('the coal survey', () => {
  it('measures the distances the m1-r2 evaluation gives for its three seeds', () => {
    // docs/playtests/m1-r2/evaluation.md, finding 3: "14 steps from the start
    // on seed 11, 4 on seed 23, 9 on seed 37".
    const standOn = [11, 23, 37].map(
      (seed) => surveyCoalSeed(seed, options(seed, 1)).geometry.stepsToStandOnTopLayerCoal,
    );
    expect(standOn).toEqual([14, 4, 9]);
  });

  it('walks at least as far as it measured, and costs at least the AP it estimated', () => {
    // The measured steps are a straight count over the surface. Since the
    // forest (issue #70) the walk goes round trees, and the AP estimate counts
    // a cut for each tree on the cheapest route. On seed 37 no tree is in the
    // way, so there both are exact, as they were for all three seeds before.
    for (const seed of [11, 23, 37]) {
      const entry = surveyCoalSeed(seed, options(seed, 1));
      const steps = entry.geometry.stepsToReachTopLayerCoal ?? 0;
      expect(entry.trip.stepsWalkedToFirstCoal).toBeGreaterThanOrEqual(steps);
      // Walking is 1 AP a step and coal costs 2 AP to mine.
      expect(entry.geometry.topLayerCoalAp ?? 0).toBeGreaterThanOrEqual(steps + 2);
      if (seed === 37) {
        expect(entry.trip.stepsWalkedToFirstCoal).toBe(steps);
        expect(entry.geometry.topLayerCoalAp).toBe(steps + 2);
      }
      // The cheapest coal by any route is never dearer than the top layer's.
      expect(entry.geometry.cheapestCoalAp ?? Infinity).toBeLessThanOrEqual(
        entry.geometry.topLayerCoalAp ?? Infinity,
      );
    }
  });

  it('gives the same report for the same options, as plain JSON', () => {
    const report = surveyCoal(options(40, 5));
    expect(surveyCoal(options(40, 5))).toEqual(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(report.seeds.map((entry) => entry.seed)).toEqual([40, 41, 42, 43, 44]);
  });

  it('prints a summary with the headline lines and the worst seeds', () => {
    const summary = formatCoalSurvey(surveyCoal(options(40, 5)));
    expect(summary).toContain('coal survey: 5 seeds (40-44), starting fuel 24, margin 3 shifts');
    expect(summary).toContain('trips that got the fuel back:');
    expect(summary).toContain('The 5 worst seeds');
  });

  it('reads points off a list of numbers', () => {
    const oneToHundred = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(distributionOf(oneToHundred)).toEqual({
      mean: 50.5,
      min: 1,
      median: 50,
      p90: 90,
      p99: 99,
      max: 100,
    });
    expect(distributionOf([])).toEqual({ mean: 0, min: 0, median: 0, p90: 0, p99: 0, max: 0 });
  });
});
