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
  it('is enough to walk to coal and get the fuel back, with 3 shifts to spare, on seeds 1 to 100', () => {
    const report = surveyCoal(options(1, 100));
    const startingFuel = LOADOUTS[DEFAULT_LOADOUT_ID].fuel;
    expect(report.survey.startingFuel).toBe(startingFuel);
    expect(report.aggregate.seedsWithoutMargin).toEqual([]);
    expect(report.aggregate.tripsPaidBackWithMargin).toBe(100);
    for (const entry of report.seeds) {
      expect(entry.trip.paidBack).toBe(true);
      expect(entry.trip.lowestFuel).toBeGreaterThanOrEqual(DEFAULT_MARGIN_SHIFTS);
      expect(entry.trip.fuelAtEnd).toBeGreaterThanOrEqual(startingFuel);
    }
    // The smallest starting fuel that would still do is a real number, and
    // the loadout's is not below it.
    expect(report.aggregate.startingFuelNeededForAll).not.toBeNull();
    expect(report.aggregate.startingFuelNeededForAll ?? Infinity).toBeLessThanOrEqual(startingFuel);
  });
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

  it('follows a seam one block down when the top layer has a single coal block (seed 595)', () => {
    const entry = surveyCoalSeed(595, options(595, 1));
    expect(entry.geometry.topLayerCoalBlocks).toBe(1);
    expect(entry.geometry.stepsToReachTopLayerCoal).toBe(25);
    // 25 steps at 5 a shift: the coal is mined in shift 6, with 5 fuel gone.
    expect(entry.trip.stepsWalkedToFirstCoal).toBe(25);
    expect(entry.trip.shiftFirstCoalMined).toBe(6);
    expect(entry.trip.lowestFuel).toBe(LOADOUTS[DEFAULT_LOADOUT_ID].fuel - 5);
    // One coal is 3 fuel, which does not cover 5; the second comes from the hole.
    expect(entry.trip.coalMined).toBe(2);
    expect(entry.trip.paidBack).toBe(true);
    expect(entry.trip.cause).toBe('left');
    expect(entry.trip.damageTaken).toBe(0);
    expect(entry.startingFuelNeeded).toBe(5 + DEFAULT_MARGIN_SHIFTS);
  });

  it('gives up and leaves when no coal is in sight (seed 1148 has none in the top layer)', () => {
    const report = surveyCoal(options(1148, 1));
    const entry = report.seeds[0];
    expect(entry?.geometry.topLayerCoalBlocks).toBe(0);
    expect(entry?.geometry.stepsToReachTopLayerCoal).toBeNull();
    // There is coal, but only below the top layer, where a player cannot see it.
    expect(entry?.geometry.cheapestCoalLayer).toBeGreaterThan(0);
    expect(entry?.trip.coalMined).toBe(0);
    expect(entry?.trip.paidBack).toBe(false);
    expect(entry?.trip.cause).toBe('left');
    expect(entry?.startingFuelNeeded).toBeNull();
    expect(report.aggregate.seedsWithoutMargin).toEqual([1148]);
    // With a seed that never pays back, no starting fuel covers every seed.
    expect(report.aggregate.startingFuelNeededForAll).toBeNull();
    expect(formatCoalSurvey(report)).toContain('did not get the fuel back with the margin: 1148');
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

  it('walks exactly as far as it measured, and costs the AP it estimated', () => {
    for (const seed of [11, 23, 37]) {
      const entry = surveyCoalSeed(seed, options(seed, 1));
      expect(entry.trip.stepsWalkedToFirstCoal).toBe(entry.geometry.stepsToReachTopLayerCoal);
      // Walking is 1 AP a step and coal costs 2 AP to mine.
      expect(entry.geometry.topLayerCoalAp).toBe(
        (entry.geometry.stepsToReachTopLayerCoal ?? 0) + 2,
      );
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
