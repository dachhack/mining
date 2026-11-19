// The coal survey (issue #51): is the starting fuel enough to get to coal and
// come out ahead, on every seed?
//
// `npm run sim -- --survey coal --runs 1000` prints it; tools/sim.ts is the
// command line and this file does the work. For each seed it measures two
// things:
//
// 1. The cube, read whole. How far the nearest coal is from the start, in the
//    top layer and by digging, cutting the trees in the way (issue #70). This
//    looks at blocks a player has not seen (at the start only the top layer
//    outside the forest is in view), so it is a measurement of the generated
//    cubes, not of play.
// 2. A trip, played with the engine by the `coal` policy of tools/policies.ts:
//    walk to the nearest coal in sight, mine it, craft fuel, and stop when the
//    fuel gauge is back to what the run started with; with no coal in sight it
//    digs look-holes and cuts trees to find some. This is what a careful
//    player can do with what it sees.
//
// Everything goes through the engine's public surface.

import {
  ACTION_COSTS,
  BLOCKS,
  FIELD_RECIPES,
  SHIFT,
  SURFACE,
  WORLD,
  findLoadout,
} from '../src/data';
import type { Vec3 } from '../src/data';
import {
  ENGINE_VERSION,
  applyAction,
  blockAt,
  blockDefAt,
  createRun,
  endShift,
  hasTree,
  isRevealed,
  isRunActive,
} from '../src/engine';
import type { GameEvent, GameState } from '../src/engine';
import { FUEL_RECIPE_ID, makeCoalPolicy } from './policies';

/** The fuel a player should still have in hand at the worst moment of the trip (issue #51). */
export const DEFAULT_MARGIN_SHIFTS = 3;

/** How many of the worst seeds the summary lists. */
const WORST_SEEDS_LISTED = 10;

/** What the generated cube of one seed holds, measured from the start cell. */
export interface CoalGeometry {
  /** Coal blocks in the top layer (layer 0). */
  topLayerCoalBlocks: number;
  /**
   * Of those, the ones the player sees at the start: not under a tree
   * (issue #70). The rest show once the tree over them is cut or the ground
   * round them is dug.
   */
  topLayerCoalSeenAtStart: number;
  /**
   * Steps to walk over the surface until a top-layer coal block is beside the
   * miner, in the pick's reach. `null` if the top layer has no coal.
   */
  stepsToReachTopLayerCoal: number | null;
  /**
   * Steps to walk until the miner stands on a top-layer coal block. This is
   * the figure in docs/playtests/m1-r2/evaluation.md finding 3; it is up to 2
   * more than the one above. `null` if the top layer has no coal.
   */
  stepsToStandOnTopLayerCoal: number | null;
  /**
   * Estimated AP to walk to the cheapest top-layer coal block and mine it,
   * cutting the trees in the way (issue #70): each tree walked through costs
   * a cut, and coal under a tree needs that tree cut first. `null` if none.
   */
  topLayerCoalAp: number | null;
  /**
   * Estimated AP to get the cheapest coal block below the top layer: walk,
   * dig a ladder shaft beside it, mine it. See `shaftAp`. `null` if none.
   */
  undergroundCoalAp: number | null;
  /** The layer that block is in. `null` if none. */
  undergroundCoalLayer: number | null;
  /** The smaller of the two AP figures: the cheapest coal by any route. `null` if no coal at all. */
  cheapestCoalAp: number | null;
  /** The layer the cheapest coal is in. `null` if no coal at all. */
  cheapestCoalLayer: number | null;
}

/** What the `coal` policy's trip did on one seed. */
export interface CoalTrip {
  /** True if the fuel gauge got back to at least what the run started with. */
  paidBack: boolean;
  /** How the run ended: 'left', or 'outOfFuel' if the fuel ran out on the way. */
  cause: string;
  /** Steps walked before the first coal was mined (over the whole trip, if none was). */
  stepsWalkedToFirstCoal: number;
  /** The shift the first coal block was mined in. `null` if none was. */
  shiftFirstCoalMined: number | null;
  /** The shift in which the fuel gauge was back to its starting value. `null` if never. */
  shiftPaidBack: number | null;
  coalMined: number;
  /** The lowest the fuel gauge read at any moment of the trip. */
  lowestFuel: number;
  /** Starting fuel minus `lowestFuel`: the most fuel the trip was ever down. */
  mostFuelDown: number;
  fuelAtEnd: number;
  damageTaken: number;
}

export interface SeedCoalSurvey {
  seed: number;
  geometry: CoalGeometry;
  trip: CoalTrip;
  /**
   * The smallest starting fuel with which this trip pays back and the gauge
   * never reads below the margin: `mostFuelDown` plus the margin. `null` if
   * the trip did not pay back, so no figure can be given.
   */
  startingFuelNeeded: number | null;
}

/** Some points of a list of numbers. All 0 for an empty list. */
export interface Distribution {
  mean: number;
  min: number;
  median: number;
  /** The value 90% of the list is at or below. */
  p90: number;
  /** The value 99% of the list is at or below. */
  p99: number;
  max: number;
}

export interface CoalSurveyAggregate {
  seeds: number;
  seedsWithTopLayerCoal: number;
  /** Seeds where some top-layer coal is in sight at the start (not under a tree). */
  seedsWithTopLayerCoalSeenAtStart: number;
  stepsToReachTopLayerCoal: Distribution;
  stepsToStandOnTopLayerCoal: Distribution;
  topLayerCoalAp: Distribution;
  undergroundCoalAp: Distribution;
  cheapestCoalAp: Distribution;
  /** Seeds where digging for coal is estimated cheaper than walking to top-layer coal. */
  seedsWhereUndergroundCoalIsCheaper: number;
  /** Trips that got the fuel gauge back to its starting value. */
  tripsPaidBack: number;
  /** Trips that paid back and never read below the margin on the way. */
  tripsPaidBackWithMargin: number;
  /** Seeds whose trip did not pay back with the margin, in seed order. */
  seedsWithoutMargin: number[];
  shiftFirstCoalMined: Distribution;
  shiftPaidBack: Distribution;
  mostFuelDown: Distribution;
  lowestFuel: Distribution;
  /**
   * The smallest starting fuel that would give the margin on 99% of the seeds,
   * and on all of them. `null` if too many trips did not pay back to say.
   */
  startingFuelNeededFor99Percent: number | null;
  startingFuelNeededForAll: number | null;
}

/** The whole document `npm run sim -- --survey coal --json` prints. */
export interface CoalSurveyReport {
  survey: {
    kind: 'coal';
    engineVersion: string;
    firstSeed: number;
    seeds: number;
    contractId: string;
    loadoutId: string;
    startingFuel: number;
    marginShifts: number;
    maxShifts: number;
  };
  aggregate: CoalSurveyAggregate;
  seeds: SeedCoalSurvey[];
}

export interface CoalSurveyOptions {
  firstSeed: number;
  seeds: number;
  contractId: string;
  loadoutId: string;
  /** Fuel the player should still have at the worst moment of the trip. */
  marginShifts: number;
  /** Stop a trip that has not ended after this many shifts. */
  maxShifts: number;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * The value that the share `fraction` of a sorted list is at or below (the
 * "nearest rank" percentile): for 1,000 values and 0.99, the 990th smallest.
 */
function valueAtShare(sorted: number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1] as number;
}

export function distributionOf(values: number[]): Distribution {
  if (values.length === 0) {
    return { mean: 0, min: 0, median: 0, p90: 0, p99: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  let total = 0;
  for (const value of sorted) {
    total += value;
  }
  return {
    mean: total / sorted.length,
    min: sorted[0] as number,
    median: valueAtShare(sorted, 0.5),
    p90: valueAtShare(sorted, 0.9),
    p99: valueAtShare(sorted, 0.99),
    max: sorted[sorted.length - 1] as number,
  };
}

/** The numbers in a list, leaving out the `null`s. */
function withoutNulls(values: (number | null)[]): number[] {
  const numbers: number[] = [];
  for (const value of values) {
    if (value !== null) {
      numbers.push(value);
    }
  }
  return numbers;
}

/** The smaller of two numbers either of which may be missing. */
function smallerOf(a: number | null, b: number): number {
  return a === null ? b : Math.min(a, b);
}

// ---------------------------------------------------------------------------
// 1. The cube
// ---------------------------------------------------------------------------

/**
 * Estimated AP to dig a one-cell shaft down the column at (x, y) until the
 * miner stands in layer `standLayer`, the way the m1-r2 playtesters dug:
 * mine the top block from the surface and drop into the hole, then for each
 * further layer put a ladder in the miner's own cell, mine the block
 * underfoot and climb down. -1 is the surface, which needs no digging.
 *
 * An estimate: it counts AP only, and not the AP lost when the next action
 * does not fit into what is left of a shift.
 */
function shaftAp(state: GameState, x: number, y: number, standLayer: number): number {
  let ap = 0;
  for (let layer = 0; layer <= standLayer; layer += 1) {
    ap += blockDefAt(state, { x, y, z: layer }).mineCost ?? 0;
    if (layer > 0) {
      ap += ACTION_COSTS.placeLadder + ACTION_COSTS.move;
    }
  }
  return ap;
}

/**
 * The cheapest AP to walk from the start to every surface cell, cutting the
 * trees on the way (issue #70): a step costs `ACTION_COSTS.move`, and a step
 * into a tree costs a cut as well. Indexed by `x + size.x * y`. At the start
 * there are no holes, so every cell has a floor.
 *
 * This is Dijkstra's shortest-path search, written plainly: the costs are
 * small whole numbers, so instead of a priority queue it keeps one list of
 * cells for each total cost and works through the lists in order.
 */
function surfaceRouteAp(state: GameState, start: Vec3): number[] {
  const width = state.size.x;
  const best: number[] = new Array<number>(state.size.x * state.size.y).fill(Infinity);
  const buckets: Vec3[][] = [];
  best[start.x + width * start.y] = 0;
  buckets[0] = [start];
  for (let cost = 0; cost < buckets.length; cost += 1) {
    for (const cell of buckets[cost] ?? []) {
      if ((best[cell.x + width * cell.y] as number) < cost) {
        continue; // reached more cheaply already
      }
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const) {
        const next = { x: cell.x + dx, y: cell.y + dy, z: cell.z };
        if (next.x < 0 || next.x >= state.size.x || next.y < 0 || next.y >= state.size.y) {
          continue;
        }
        const stepCost = ACTION_COSTS.move + (hasTree(state, next) ? SURFACE.cutTree.ap : 0);
        const total = cost + stepCost;
        if (total < (best[next.x + width * next.y] as number)) {
          best[next.x + width * next.y] = total;
          (buckets[total] ??= []).push(next);
        }
      }
    }
  }
  return best;
}

/**
 * Measure the cube of a fresh run: where the coal is, and what it would cost
 * to get. `state` must be a state `createRun` has just made.
 */
export function measureCoalGeometry(state: GameState): CoalGeometry {
  const start = state.avatar.pos;
  const coalCode = BLOCKS.coalSeam.code;

  let topLayerCoalBlocks = 0;
  let topLayerCoalSeenAtStart = 0;
  const routeAp = surfaceRouteAp(state, start);
  let stepsToReach: number | null = null;
  let stepsToStandOn: number | null = null;
  let topLayerCoalAp: number | null = null;
  let undergroundCoalAp: number | null = null;
  let undergroundCoalLayer: number | null = null;

  for (let z = 0; z < state.size.z; z += 1) {
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const coal: Vec3 = { x, y, z };
        if (blockAt(state, coal) !== coalCode) {
          continue;
        }
        const mineAp = blockDefAt(state, coal).mineCost ?? 0;
        // From the surface, coal under a tree is mined only once the tree is cut.
        const coalUnderTree = z === 0 && hasTree(state, { x, y, z: WORLD.surfaceZ });
        if (z === 0) {
          topLayerCoalBlocks += 1;
          if (isRevealed(state, coal)) {
            topLayerCoalSeenAtStart += 1;
          }
          stepsToStandOn = smallerOf(stepsToStandOn, Math.abs(x - start.x) + Math.abs(y - start.y));
        }
        // The miner works from one layer above the coal, in one of the eight
        // columns around it: from there the block is in the pick's reach, and
        // mining it does not take the miner's own floor away.
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const standX = x + dx;
            const standY = y + dy;
            const isCoalColumn = dx === 0 && dy === 0;
            const inFootprint =
              standX >= 0 && standX < state.size.x && standY >= 0 && standY < state.size.y;
            if (isCoalColumn || !inFootprint) {
              continue;
            }
            // Walking over the surface, one step per cell, no diagonals.
            const steps = Math.abs(standX - start.x) + Math.abs(standY - start.y);
            const walkAp = routeAp[standX + state.size.x * standY] as number;
            const cutAp = coalUnderTree ? SURFACE.cutTree.ap : 0;
            const ap = walkAp + shaftAp(state, standX, standY, z - 1) + cutAp + mineAp;
            if (z === 0) {
              stepsToReach = smallerOf(stepsToReach, steps);
              topLayerCoalAp = smallerOf(topLayerCoalAp, ap);
            } else if (undergroundCoalAp === null || ap < undergroundCoalAp) {
              undergroundCoalAp = ap;
              undergroundCoalLayer = z;
            }
          }
        }
      }
    }
  }

  let cheapestCoalAp = topLayerCoalAp;
  let cheapestCoalLayer: number | null = topLayerCoalAp === null ? null : 0;
  if (
    undergroundCoalAp !== null &&
    (cheapestCoalAp === null || undergroundCoalAp < cheapestCoalAp)
  ) {
    cheapestCoalAp = undergroundCoalAp;
    cheapestCoalLayer = undergroundCoalLayer;
  }

  return {
    topLayerCoalBlocks,
    topLayerCoalSeenAtStart,
    stepsToReachTopLayerCoal: stepsToReach,
    stepsToStandOnTopLayerCoal: stepsToStandOn,
    topLayerCoalAp,
    undergroundCoalAp,
    undergroundCoalLayer,
    cheapestCoalAp,
    cheapestCoalLayer,
  };
}

// ---------------------------------------------------------------------------
// 2. The trip
// ---------------------------------------------------------------------------

/**
 * Play the `coal` policy from the fresh run `start` until it leaves, the fuel
 * runs out, or `maxShifts` shifts have been played, and report the trip.
 */
export function playCoalTrip(start: GameState, maxShifts: number): CoalTrip {
  const policy = makeCoalPolicy();
  const fuelAtStart = start.fuel;
  let state = start;

  let stepsWalkedToFirstCoal = 0;
  let shiftFirstCoalMined: number | null = null;
  let shiftPaidBack: number | null = null;
  let coalMined = 0;
  let hasCraftedFuel = false;
  let lowestFuel = start.fuel;
  let damageTaken = 0;

  /** Count what one step's events say happened. `shift` is the shift the step was taken in. */
  function record(events: GameEvent[], shift: number): void {
    for (const event of events) {
      if (event.type === 'moved' && coalMined === 0) {
        stepsWalkedToFirstCoal += 1;
      } else if (event.type === 'blockMined' && event.block === BLOCKS.coalSeam.code) {
        coalMined += 1;
        if (shiftFirstCoalMined === null) {
          shiftFirstCoalMined = shift;
        }
      } else if (event.type === 'crafted' && event.recipe === FUEL_RECIPE_ID) {
        hasCraftedFuel = true;
      } else if (event.type === 'damageTaken') {
        damageTaken += event.amount;
      }
    }
  }

  while (isRunActive(state) && state.shift - SHIFT.firstShiftNumber < maxShifts) {
    const shift = state.shift;
    const decision = policy.decide(state);
    const result = decision === 'endShift' ? endShift(state) : applyAction(state, decision);
    state = result.state;
    record(result.events, shift);
    lowestFuel = Math.min(lowestFuel, state.fuel);
    if (shiftPaidBack === null && hasCraftedFuel && state.fuel >= fuelAtStart) {
      shiftPaidBack = shift;
    }
  }

  return {
    paidBack: shiftPaidBack !== null,
    cause: state.status.kind === 'ended' ? state.status.cause : 'shiftCap',
    stepsWalkedToFirstCoal,
    shiftFirstCoalMined,
    shiftPaidBack,
    coalMined,
    lowestFuel,
    mostFuelDown: fuelAtStart - lowestFuel,
    fuelAtEnd: state.fuel,
    damageTaken,
  };
}

// ---------------------------------------------------------------------------
// Many seeds
// ---------------------------------------------------------------------------

export function surveyCoalSeed(seed: number, options: CoalSurveyOptions): SeedCoalSurvey {
  const start = createRun(seed, options.contractId, options.loadoutId);
  const geometry = measureCoalGeometry(start);
  const trip = playCoalTrip(start, options.maxShifts);
  return {
    seed,
    geometry,
    trip,
    // The policy never looks at how much fuel is left, so with a different
    // starting fuel the trip is the same and the gauge reads the same amount
    // below its start at every moment. (Only a trip that ran out is cut off.)
    startingFuelNeeded: trip.paidBack ? trip.mostFuelDown + options.marginShifts : null,
  };
}

function aggregateCoalSurvey(seeds: SeedCoalSurvey[], marginShifts: number): CoalSurveyAggregate {
  const geometries = seeds.map((entry) => entry.geometry);
  const trips = seeds.map((entry) => entry.trip);

  const hasMargin = (entry: SeedCoalSurvey): boolean =>
    entry.trip.paidBack && entry.trip.lowestFuel >= marginShifts;

  // The starting fuel each seed needs, smallest first. A seed whose trip did
  // not pay back has no figure; it counts as needing more than any number.
  const needed = withoutNulls(seeds.map((entry) => entry.startingFuelNeeded)).sort((a, b) => a - b);
  const rankFor99Percent = Math.max(1, Math.ceil(0.99 * seeds.length));
  const neededFor99Percent = needed[rankFor99Percent - 1];
  const neededForAll = needed.length === seeds.length ? needed[needed.length - 1] : undefined;

  return {
    seeds: seeds.length,
    seedsWithTopLayerCoal: geometries.filter((g) => g.topLayerCoalBlocks > 0).length,
    seedsWithTopLayerCoalSeenAtStart: geometries.filter((g) => g.topLayerCoalSeenAtStart > 0)
      .length,
    stepsToReachTopLayerCoal: distributionOf(
      withoutNulls(geometries.map((g) => g.stepsToReachTopLayerCoal)),
    ),
    stepsToStandOnTopLayerCoal: distributionOf(
      withoutNulls(geometries.map((g) => g.stepsToStandOnTopLayerCoal)),
    ),
    topLayerCoalAp: distributionOf(withoutNulls(geometries.map((g) => g.topLayerCoalAp))),
    undergroundCoalAp: distributionOf(withoutNulls(geometries.map((g) => g.undergroundCoalAp))),
    cheapestCoalAp: distributionOf(withoutNulls(geometries.map((g) => g.cheapestCoalAp))),
    seedsWhereUndergroundCoalIsCheaper: geometries.filter(
      (g) => g.cheapestCoalLayer !== null && g.cheapestCoalLayer > 0,
    ).length,
    tripsPaidBack: trips.filter((trip) => trip.paidBack).length,
    tripsPaidBackWithMargin: seeds.filter(hasMargin).length,
    seedsWithoutMargin: seeds.filter((entry) => !hasMargin(entry)).map((entry) => entry.seed),
    shiftFirstCoalMined: distributionOf(
      withoutNulls(trips.map((trip) => trip.shiftFirstCoalMined)),
    ),
    shiftPaidBack: distributionOf(withoutNulls(trips.map((trip) => trip.shiftPaidBack))),
    mostFuelDown: distributionOf(trips.map((trip) => trip.mostFuelDown)),
    lowestFuel: distributionOf(trips.map((trip) => trip.lowestFuel)),
    startingFuelNeededFor99Percent: neededFor99Percent ?? null,
    startingFuelNeededForAll: neededForAll ?? null,
  };
}

/**
 * Survey the seeds `firstSeed`, `firstSeed + 1`, ... The same options always
 * give the same report.
 */
export function surveyCoal(options: CoalSurveyOptions): CoalSurveyReport {
  const loadout = findLoadout(options.loadoutId);
  if (loadout === undefined) {
    throw new Error(`Unknown loadout id: ${options.loadoutId}`);
  }
  const seeds: SeedCoalSurvey[] = [];
  for (let i = 0; i < options.seeds; i += 1) {
    seeds.push(surveyCoalSeed(options.firstSeed + i, options));
  }
  return {
    survey: {
      kind: 'coal',
      engineVersion: ENGINE_VERSION,
      firstSeed: options.firstSeed,
      seeds: options.seeds,
      contractId: options.contractId,
      loadoutId: options.loadoutId,
      startingFuel: loadout.fuel,
      marginShifts: options.marginShifts,
      maxShifts: options.maxShifts,
    },
    aggregate: aggregateCoalSurvey(seeds, options.marginShifts),
    seeds,
  };
}

// ---------------------------------------------------------------------------
// The human-readable summary
// ---------------------------------------------------------------------------

function distributionLine(d: Distribution): string {
  return `mean ${d.mean.toFixed(1)}, median ${d.median}, 90% within ${d.p90}, 99% within ${d.p99}, min ${d.min}, max ${d.max}`;
}

function orDash(value: number | null): string {
  return value === null ? '-' : String(value);
}

/** One row of the worst-seeds table: each value right-aligned under its heading. */
function tableRow(cells: string[], widths: number[]): string {
  return cells.map((cell, index) => cell.padStart(widths[index] ?? 0)).join('  ');
}

/** The short summary `npm run sim -- --survey coal` prints without `--json`. */
export function formatCoalSurvey(report: CoalSurveyReport): string {
  const s = report.survey;
  const a = report.aggregate;
  const fuelRecipe = FIELD_RECIPES.find((recipe) => recipe.id === FUEL_RECIPE_ID);
  const fuelPerCoal =
    fuelRecipe !== undefined && fuelRecipe.output.kind === 'gauge' ? fuelRecipe.output.amount : 0;
  const start = WORLD.startPosition;

  const lines = [
    `coal survey: ${s.seeds} seeds (${s.firstSeed}-${s.firstSeed + s.seeds - 1}), starting fuel ${s.startingFuel}, margin ${s.marginShifts} shifts`,
    `rules in force: ${SHIFT.apPerShift} AP and ${SHIFT.fuelPerShift} fuel a shift, a step costs ${ACTION_COSTS.move} AP, coal costs ${BLOCKS.coalSeam.mineCost ?? 0} AP to mine and ${ACTION_COSTS.craft} AP to craft into ${fuelPerCoal} fuel; start cell (${start.x}, ${start.y})`,
    '',
    'The cubes, read whole (a player sees only the top layer outside the forest at the start):',
    `  seeds with coal in the top layer:        ${a.seedsWithTopLayerCoal} of ${a.seeds}`,
    `  ... with some of it in sight at the start: ${a.seedsWithTopLayerCoalSeenAtStart} of ${a.seeds}`,
    `  steps until top-layer coal is in reach:  ${distributionLine(a.stepsToReachTopLayerCoal)}`,
    `  steps to stand on top-layer coal:        ${distributionLine(a.stepsToStandOnTopLayerCoal)}`,
    `  AP to walk to top-layer coal and mine it (cutting trees in the way): ${distributionLine(a.topLayerCoalAp)}`,
    `  AP to walk, dig to deeper coal and mine it (est): ${distributionLine(a.undergroundCoalAp)}`,
    `  AP for the cheaper of the two:                   ${distributionLine(a.cheapestCoalAp)}`,
    `  seeds where digging is the cheaper way:  ${a.seedsWhereUndergroundCoalIsCheaper} of ${a.seeds}`,
    '',
    'The trip, played by the coal policy (walk to coal in sight, else dig look-holes and cut trees; mine, craft fuel, until the gauge is back to its start):',
    `  trips that got the fuel back:            ${a.tripsPaidBack} of ${a.seeds}`,
    `  ... and never read below ${s.marginShifts} fuel:        ${a.tripsPaidBackWithMargin} of ${a.seeds}`,
    `  shift the first coal was mined in:       ${distributionLine(a.shiftFirstCoalMined)}`,
    `  shift the fuel was back in:              ${distributionLine(a.shiftPaidBack)}`,
    `  most fuel the trip was ever down:        ${distributionLine(a.mostFuelDown)}`,
    `  lowest reading of the fuel gauge:        ${distributionLine(a.lowestFuel)}`,
    `  smallest starting fuel that keeps the margin: on 99% of seeds ${orDash(a.startingFuelNeededFor99Percent)}, on every seed ${orDash(a.startingFuelNeededForAll)}`,
    `  seeds that did not get the fuel back with the margin: ${a.seedsWithoutMargin.length === 0 ? 'none' : a.seedsWithoutMargin.join(', ')}`,
    '',
    `The ${Math.min(WORST_SEEDS_LISTED, report.seeds.length)} worst seeds (most fuel down first):`,
  ];

  // Trips that did not pay back first, then the ones that were furthest down.
  const worst = [...report.seeds]
    .sort((x, y) => {
      if (x.trip.paidBack !== y.trip.paidBack) {
        return x.trip.paidBack ? 1 : -1;
      }
      if (x.trip.mostFuelDown !== y.trip.mostFuelDown) {
        return y.trip.mostFuelDown - x.trip.mostFuelDown;
      }
      return x.seed - y.seed;
    })
    .slice(0, WORST_SEEDS_LISTED);

  const headings = [
    'seed',
    'steps to coal',
    'first coal in shift',
    'fuel back in shift',
    'coal mined',
    'lowest fuel',
    'fuel needed',
  ];
  const widths = headings.map((heading) => heading.length);
  lines.push(`  ${tableRow(headings, widths)}`);
  for (const entry of worst) {
    const row = [
      String(entry.seed),
      orDash(entry.geometry.stepsToReachTopLayerCoal),
      orDash(entry.trip.shiftFirstCoalMined),
      orDash(entry.trip.shiftPaidBack),
      String(entry.trip.coalMined),
      String(entry.trip.lowestFuel),
      orDash(entry.startingFuelNeeded),
    ];
    lines.push(`  ${tableRow(row, widths)}`);
  }
  return lines.join('\n');
}
