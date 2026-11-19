// The coal survey and the `coal` policy (tools/coalSurvey.ts, tools/policies.ts;
// issue #51, decision note 0014 item 33).

import { describe, expect, it } from 'vitest';
import { BLOCKS, CONTRACT_IDS, DEFAULT_LOADOUT_ID, LOADOUTS } from '../../src/data';
import { blockAt, cellIndex, createRun, isRevealed } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { cloneState } from '../../src/engine/state';
import {
  DEFAULT_MARGIN_SHIFTS,
  distributionOf,
  formatCoalSurvey,
  playCoalTrip,
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
  // Since the forest (issue #70) the trees hide most of the top layer. On the
  // owner's decision on PR #72 ("Coal visible near start"), generation puts
  // coal in sight within a short walk of the start, so the starting fuel is
  // enough on every seed again.
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
      // Some coal is in sight at the start.
      expect(entry.geometry.topLayerCoalSeenAtStart).toBeGreaterThan(0);
    }
    // The smallest starting fuel that would still do is a real number, and
    // the loadout's is not below it.
    expect(report.aggregate.startingFuelNeededForAll).not.toBeNull();
    expect(report.aggregate.startingFuelNeededForAll ?? Infinity).toBeLessThanOrEqual(startingFuel);
  }, 30000);
});

/**
 * A fresh run of `seed` with the coal the player sees at the start turned to
 * dirt. Built by hand, as a scenario test would, to drive the coal policy's
 * fallbacks (look-holes, cutting trees, following a seam), which a fresh run
 * no longer needs since coal is always in sight at the start.
 */
function withCoalInSightRemoved(seed: number): GameState {
  const state = cloneState(createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID));
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const pos = { x, y, z: 0 };
      if (isRevealed(state, pos) && blockAt(state, pos) === BLOCKS.coalSeam.code) {
        state.blocks[cellIndex(state.size, pos)] = BLOCKS.dirt.code;
      }
    }
  }
  return state;
}

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

  it('follows a seam one block down from the hole of coal it found (seed 54, no coal in sight)', () => {
    // With no coal in sight the policy searches; the first coal it finds is
    // far enough that its 3 fuel do not cover the search, so it steps into
    // the hole that coal left and mines coal below.
    const trip = playCoalTrip(withCoalInSightRemoved(54), 300);
    expect(trip.coalMined).toBe(2);
    expect(trip.paidBack).toBe(true);
    expect(trip.cause).toBe('left');
    expect(trip.damageTaken).toBe(0);
  });

  it('with no coal in sight, digs a look-hole and finds coal below (seed 1148)', () => {
    const trip = playCoalTrip(withCoalInSightRemoved(1148), 300);
    expect(trip.coalMined).toBe(1);
    expect(trip.shiftFirstCoalMined).toBe(1);
    expect(trip.paidBack).toBe(true);
    expect(trip.damageTaken).toBe(0);
  });

  it('gives up and leaves, alive, when look-holes and cut trees show no coal (seed 15)', () => {
    const trip = playCoalTrip(withCoalInSightRemoved(15), 300);
    expect(trip.coalMined).toBe(0);
    expect(trip.paidBack).toBe(false);
    expect(trip.cause).toBe('left');
    expect(trip.lowestFuel).toBeGreaterThan(0);
  });
});

describe('the coal survey', () => {
  it('measures the distances the m1-r2 evaluation gives for its three seeds', () => {
    // docs/playtests/m1-r2/evaluation.md, finding 3: "14 steps from the start
    // on seed 11, 4 on seed 23, 9 on seed 37". Since coal is put in sight near
    // the start where the forest hid it (owner's decision on PR #72), and
    // "in sight" is now what the miner sees from the start cell (owner, after
    // PR #72), all three have coal within 3 steps.
    const standOn = [11, 23, 37].map(
      (seed) => surveyCoalSeed(seed, options(seed, 1)).geometry.stepsToStandOnTopLayerCoal,
    );
    expect(standOn).toEqual([3, 3, 3]);
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
