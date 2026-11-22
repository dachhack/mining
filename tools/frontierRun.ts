// Playing the new game (Lab 2 becomes the game, plan A3) headlessly: its
// steps, a replay, and a simple policy to record golden runs with. The
// golden test (tests/golden/frontier.test.ts) and `npm run golden --
// --frontier` use it. Everything goes through the engine's public surface.

import { FRONTIER_NEW_CAMP_COST } from '../src/data/frontier';
import {
  ENGINE_VERSION,
  canAfford,
  coverLevels,
  createFrontier,
  demolishFrontierCamp,
  frontierTap,
  hashFrontier,
  newlyCovered,
  placeFrontierCamp,
  placeRefusal,
  upgradeCostFrom,
  upgradeFrontierCamp,
  upgradeRefusal,
} from '../src/engine';
import type { FrontierState } from '../src/engine';
import { NO_FEATURE } from '../src/engine/frontier/state';

/**
 * One step of the new game, as a short text: "tap X,Y", "place X,Y",
 * "upgrade ID" or "demolish ID". (Shifts come in A4.)
 */
export type FrontierStep = string;

/** A recorded run of the new game: tests/golden/frontier/*.json. */
export interface FrontierGolden {
  description: string;
  recordedWith: string;
  engineVersion: string;
  seed: number;
  /** How many steps were taken. */
  stepCount: number;
  expectedHash: string;
  steps: FrontierStep[];
}

/** Read "X,Y" into a square. Throws on anything else. */
function squareOf(text: string): { x: number; y: number } {
  const parts = text.split(',').map(Number);
  const x = parts[0];
  const y = parts[1];
  if (
    parts.length !== 2 ||
    x === undefined ||
    y === undefined ||
    !Number.isInteger(x) ||
    !Number.isInteger(y)
  ) {
    throw new Error(`"${text}" is not a square "X,Y"`);
  }
  return { x, y };
}

/**
 * The state after `step`. A step the rules refuse throws: a recorded run
 * only holds steps that did something, so a refusal means the rules changed.
 */
export function applyFrontierStep(state: FrontierState, step: FrontierStep): FrontierState {
  const [verb, arg] = step.split(' ');
  if (verb === 'tap' && arg !== undefined) {
    const { x, y } = squareOf(arg);
    const tap = frontierTap(state, x, y);
    if (tap.kind !== 'mined' && tap.kind !== 'harvested') {
      throw new Error(`"${step}" did nothing: ${tap.kind}`);
    }
    return tap.state;
  }
  if (verb === 'place' && arg !== undefined) {
    const { x, y } = squareOf(arg);
    const refusal = placeRefusal(state, x, y);
    if (refusal !== null) throw new Error(`"${step}" was refused: ${refusal}`);
    return placeFrontierCamp(state, x, y);
  }
  if ((verb === 'upgrade' || verb === 'demolish') && arg !== undefined) {
    const id = Number(arg);
    const next =
      verb === 'upgrade' ? upgradeFrontierCamp(state, id) : demolishFrontierCamp(state, id);
    if (next === state) throw new Error(`"${step}" was refused`);
    return next;
  }
  throw new Error(`"${step}" is not a step of the new game`);
}

/** A new world on `seed` with `steps` taken in order. */
export function replayFrontier(seed: number, steps: FrontierStep[]): FrontierState {
  let state = createFrontier(seed);
  for (const step of steps) {
    state = applyFrontierStep(state, step);
  }
  return state;
}

/** The gatherer stops placing camps once it has this many. */
const GATHERER_CAMPS = 3;

/**
 * The gatherer: a plain policy for recording golden runs. In order:
 * 1. upgrade the lowest camp it can pay for;
 * 2. with fewer than 3 camps, place one where it lights the most new
 *    ground, if it can pay;
 * 3. catch the lit animal nearest the newest camp;
 * 4. while the next goal (a new camp, or else the lowest camp's upgrade) is
 *    short of wood, grass or apples, take the lit plant nearest the newest camp;
 * 5. mine the block nearest the newest camp that it can mine;
 * 6. failing that, take the nearest plant.
 * Ties go to the square met first, row by row. `null` when nothing is left to do.
 */
export function gathererStep(state: FrontierState): FrontierStep | null {
  const byLevel = [...state.camps].sort((a, b) => a.level - b.level || a.id - b.id);
  for (const camp of byLevel) {
    if (upgradeCostFrom(camp.level) !== null && upgradeRefusal(state, camp.id) === null) {
      return `upgrade ${camp.id}`;
    }
  }
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  const moreCamps = state.camps.length < GATHERER_CAMPS;
  if (moreCamps && canAfford(state.inventory, FRONTIER_NEW_CAMP_COST)) {
    let best: { x: number; y: number; fresh: number } | null = null;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        if (placeRefusal(state, x, y) !== null) continue;
        const fresh = newlyCovered(state, x, y).length;
        if (best === null || fresh > best.fresh) best = { x, y, fresh };
      }
    }
    if (best !== null && best.fresh > 0) {
      return `place ${best.x},${best.y}`;
    }
  }
  const newest = state.camps[state.camps.length - 1];
  if (newest === undefined) return null;
  // The lit squares, nearest the newest camp first (a stable sort: ties stay row by row).
  const lit = coverLevels(state.camps, width, height);
  const squares: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((lit[x + width * y] ?? 0) > 0) {
        squares.push({ x, y, d: (x - newest.x) ** 2 + (y - newest.y) ** 2 });
      }
    }
  }
  squares.sort((a, b) => a.d - b.d);
  const animal = squares.find((s) => state.animals.some((a) => a.x === s.x && a.y === s.y));
  if (animal !== undefined) return `tap ${animal.x},${animal.y}`;
  // A plant the tap would take: not on a camp's ground (`frontierTap` checks the rest).
  const plant = squares.find(
    (s) =>
      state.features[s.x + width * s.y] !== NO_FEATURE &&
      !state.camps.some((c) => Math.abs(c.x - s.x) <= 1 && Math.abs(c.y - s.y) <= 1),
  );
  // Plants give wood, grass and apples: take them while the next goal (a new
  // camp, or else the lowest camp's upgrade) is short of any of those.
  const lowest = byLevel[0];
  const goal = moreCamps
    ? FRONTIER_NEW_CAMP_COST
    : lowest === undefined
      ? []
      : (upgradeCostFrom(lowest.level) ?? []);
  const short = goal.some(
    (stack) =>
      ['wood', 'grass', 'apple'].includes(stack.item) &&
      (state.inventory.get(stack.item) ?? 0) < stack.count,
  );
  if (plant !== undefined && short) return `tap ${plant.x},${plant.y}`;
  for (const s of squares) {
    if (state.features[s.x + width * s.y] !== NO_FEATURE) continue; // a plant must go first
    if (frontierTap(state, s.x, s.y).kind === 'mined') return `tap ${s.x},${s.y}`;
  }
  return plant === undefined ? null : `tap ${plant.x},${plant.y}`;
}

/** Play the gatherer on `seed` for at most `maxSteps` steps. */
export function recordGatherer(
  seed: number,
  maxSteps: number,
  description: string,
): FrontierGolden {
  let state = createFrontier(seed);
  const steps: FrontierStep[] = [];
  while (steps.length < maxSteps) {
    const step = gathererStep(state);
    if (step === null) break;
    state = applyFrontierStep(state, step);
    steps.push(step);
  }
  return {
    description,
    recordedWith: 'gatherer',
    engineVersion: ENGINE_VERSION,
    seed,
    stepCount: steps.length,
    expectedHash: hashFrontier(state),
    steps,
  };
}
