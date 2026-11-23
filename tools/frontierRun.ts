// Playing the new game (Lab 2 becomes the game, plan A3) headlessly: its
// steps, a replay, and a simple policy to record golden runs with. The
// golden test (tests/golden/frontier.test.ts) and `npm run golden --
// --frontier` use it. Everything goes through the engine's public surface.

import {
  FRONTIER_DRILL,
  FRONTIER_LANTERN,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_PICKAXE,
} from '../src/data/frontier';
import {
  canAfford,
  coverLevels,
  createFrontier,
  frontierAct,
  hasSmelter,
  lanternRefusal,
  makeRefusal,
  previewTap,
  newlyCovered,
  placeRefusal,
  smelterRefusal,
  upgradeCostFrom,
  upgradeRefusal,
} from '../src/engine';
import type { FrontierAction, FrontierState } from '../src/engine';
import { NO_FEATURE } from '../src/engine/frontier/state';

/**
 * One step of the new game, as a short text: "tap X,Y", "place X,Y",
 * "upgrade ID", "demolish ID", "endShift", "rest ID" (at camp ID), "close",
 * "buildSmelter ID" (a smelter at camp ID), "make RECIPE" (a recipe id,
 * such as "smelt-iron") or "hangLantern ID" (a lantern at camp ID).
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

/** Rest at the first camp (question 156: rest only at a camp); End shift if no camp stands. */
export function restStep(state: FrontierState): FrontierStep {
  const camp = state.camps[0];
  return camp === undefined ? 'endShift' : `rest ${camp.id}`;
}

/** The engine's action for a step. Throws for text that is not a step. */
export function actionOf(step: FrontierStep): FrontierAction {
  const [verb, arg] = step.split(' ');
  if (verb === 'endShift' || verb === 'close') {
    return { kind: verb };
  }
  if (
    (verb === 'upgrade' ||
      verb === 'demolish' ||
      verb === 'rest' ||
      verb === 'buildSmelter' ||
      verb === 'hangLantern') &&
    arg !== undefined
  ) {
    return { kind: verb, id: Number(arg) };
  }
  if (verb === 'make' && arg !== undefined) {
    return { kind: 'make', recipe: arg };
  }
  if ((verb === 'tap' || verb === 'place') && arg !== undefined) {
    return { kind: verb, ...squareOf(arg) };
  }
  throw new Error(`"${step}" is not a step of the new game`);
}

/**
 * The state after `step`. A step the rules refuse throws: a recorded run
 * only holds steps that did something, so a refusal means the rules changed.
 */
export function applyFrontierStep(state: FrontierState, step: FrontierStep): FrontierState {
  const outcome = frontierAct(state, actionOf(step));
  if (!outcome.done) {
    throw new Error(`"${step}" did nothing: ${outcome.refusal ?? ''}`);
  }
  return outcome.state;
}

/** A new world on `seed` with `steps` taken in order. */
export function replayFrontier(seed: number, steps: FrontierStep[]): FrontierState {
  let state = createFrontier(seed);
  for (const step of steps) {
    state = applyFrontierStep(state, step);
  }
  return state;
}

/** The gatherer rests at the end of a shift when the crew's health is this or lower. */
const GATHERER_REST_AT = 4;

/** The gatherer stops placing camps once it has this many. */
const GATHERER_CAMPS = 3;

/**
 * Smelting and crafting, for the gatherer and the careful policy
 * (docs/plans/smelting-and-crafting.md), in order, the first that can be done:
 * a smelter at the lowest-numbered camp that may have one, if none stands;
 * an iron pickaxe, an iron drill (one each); hang a held lantern at the
 * lowest-numbered camp without one; make a lantern while a camp has none;
 * smelt iron, then copper. `null` if none can be done now.
 */
export function craftStep(state: FrontierState): FrontierStep | null {
  if (!hasSmelter(state)) {
    const at = state.camps.find((c) => smelterRefusal(state, c.id) === null);
    return at === undefined ? null : `buildSmelter ${at.id}`;
  }
  const held = (item: string): boolean => (state.inventory.get(item) ?? 0) > 0;
  if (!held(FRONTIER_PICKAXE.item) && makeRefusal(state, 'iron-pickaxe') === null) {
    return 'make iron-pickaxe';
  }
  if (!held(FRONTIER_DRILL.item) && makeRefusal(state, 'iron-drill') === null) {
    return 'make iron-drill';
  }
  const dark = state.camps.find((c) => !c.lantern);
  if (dark !== undefined && lanternRefusal(state, dark.id) === null) {
    return `hangLantern ${dark.id}`;
  }
  if (
    dark !== undefined &&
    !held(FRONTIER_LANTERN.item) &&
    makeRefusal(state, 'copper-lantern') === null
  ) {
    return 'make copper-lantern';
  }
  for (const recipe of ['smelt-iron', 'smelt-copper']) {
    if (makeRefusal(state, recipe) === null) return `make ${recipe}`;
  }
  return null;
}

/**
 * The gatherer: a plain policy for recording golden runs. In order:
 * 0. with no taps left, end the shift, or rest if the crew's health is at
 *    GATHERER_REST_AT or below (plan A4);
 * 1. smelt and craft what it can (`craftStep`);
 * 2. upgrade the lowest camp it can pay for;
 * 3. with fewer than 3 camps, place one where it lights the most new
 *    ground, if it can pay;
 * 4. catch the lit animal nearest the newest camp;
 * 5. while the next goal (a new camp, or else the lowest camp's upgrade) is
 *    short of wood, grass or apples, take the lit plant nearest the newest camp;
 * 6. mine the block nearest the newest camp that it can mine;
 * 7. failing that, take the nearest plant.
 * Ties go to the square met first, row by row. `null` when nothing is left to do.
 */
export function gathererStep(state: FrontierState): FrontierStep | null {
  if (state.status !== 'active') return null;
  if (state.tapsLeft === 0) {
    return state.health <= GATHERER_REST_AT ? restStep(state) : 'endShift';
  }
  const craft = craftStep(state);
  if (craft !== null) return craft;
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
    if (previewTap(state, s.x, s.y).kind === 'mined') return `tap ${s.x},${s.y}`;
  }
  // Nothing left to take: end the shift, so the animals and apples come round again.
  return plant === undefined ? 'endShift' : `tap ${plant.x},${plant.y}`;
}
