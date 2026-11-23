// UI lab 2 (issue #118): camps, the fog of war around them, and their upgrades.
//
// Built on Lab 1's world (labWorld.ts): the same cube, depth table, counts
// and level rule. Lab 2 adds camps on top of it:
//
// - every camp sees a circle of squares around it (its radius, from its level);
// - a square inside some camp's circle is shown and may be mined, if one of
//   the camps covering it has a level that can mine the square's top block;
// - a square that was inside a circle once but is not any more is shown
//   greyed, and cannot be mined; a square never inside one is fog;
// - a camp stands on a 3 x 3 patch of level ground, which cannot be mined;
// - a new camp costs resources and goes on a level 3 x 3 inside the circles;
// - a camp can be demolished once other camps' circles cover its 3 x 3; its
//   ground can then be mined;
// - upgrading a camp costs resources and widens its circle and what it mines.
//
// Every rule is the engine's now (src/engine/frontier, plans A2 to A4):
// this file keeps Lab 2's names for its screen and tests, and turns a Lab 2
// world into the engine's state and back (`toFrontier`, `fromFrontier`).
// Shifts (A4): every action that does something costs a tap, and End shift
// moves the world on (animals, apples, upkeep, hunger).
//
// No DOM code here, so the unit tests run it in plain Node. Every number
// is in src/data/frontier.ts.
// Like labWorld.ts, nothing here changes a world it is given: every change
// returns a new world.

import { BLOCKS, blockDefByCode } from '../../data';
import { FRONTIER_SHIFT } from '../../data/frontier';
import { LAB_CAMP_LEVELS } from '../../data/labCamps';
import {
  FRONTIER_STATE_VERSION,
  NO_FEATURE,
  createFrontier,
  depthMapOf,
  frontierAct,
  frontierStartSquare,
  isMarketDay,
  nextMarketShift as engineNextMarketShift,
  tradeRefusal as engineTradeRefusal,
  campAt as engineCampAt,
  coverLevelAt as engineCoverLevelAt,
  demolishRefusal as engineDemolishRefusal,
  isLevelPatch as engineIsLevelPatch,
  makeRefusal as engineMakeRefusal,
  smelterRefusal as engineSmelterRefusal,
  lanternRefusal as engineLanternRefusal,
  newlyCovered as engineNewlyCovered,
  placeRefusal as enginePlaceRefusal,
  seenWith,
  sightAt as engineSightAt,
  sightMap as engineSightMap,
  upgradeRefusal as engineUpgradeRefusal,
} from '../../engine';
import type {
  CampGround,
  FrontierAction,
  FrontierCamp,
  FrontierState,
  FrontierStatus,
  GameState,
  PlaceRefusal as EnginePlaceRefusal,
  ShiftReport,
  Sight,
  TradeSide,
} from '../../engine';
import { labWorldFromState } from './labWorld';
import type { LabTap, LabWorld } from './labWorld';
import type { Harvest, Surface } from './surface';

/** A camp: id, centre square and level. The engine's own record (plan A2). */
export type Camp = FrontierCamp;

export interface CampWorld {
  /** Lab 1's world: the cube, the depths, the counts. */
  lab: LabWorld;
  camps: Camp[];
  /**
   * Every square that has ever been inside a camp's circle, row by row
   * (index x + width * y). It only ever gains squares.
   */
  seen: boolean[];
  /** The id the next camp will get. */
  nextCampId: number;
  /** The surface (issue #121): grass, trees, apple trees and animals. */
  surface: Surface;
  /** The shift being played, its taps left, the crew's health, and whether the run goes on (A4). */
  turn: CampTurn;
}

/** Where the run stands (plan A4). */
export interface CampTurn {
  /** The shift being played: 1 is the first. */
  shift: number;
  /** Taps left in this shift. */
  tapsLeft: number;
  /** The crew's health: 0 loses the run. */
  health: number;
  /** 'active', 'lost' (the crew's health reached 0), 'closed' (the mine was closed) or 'finished' (the last shift ended). */
  status: FrontierStatus;
}

/** A fresh run: shift 1, a full shift of taps, full health. */
export function firstTurn(): CampTurn {
  return {
    shift: 1,
    tapsLeft: FRONTIER_SHIFT.taps,
    health: FRONTIER_SHIFT.startHealth,
    status: 'active',
  };
}

// ----- Levels, circles and sight -----
//
// The rules live in the engine now (src/engine/frontier/camps.ts, plan A2).
// These keep Lab 2's names and take a Lab 2 world, so the screen and its
// tests read as before.

export {
  CAMP_HALF_SIZE,
  MAX_CAMP_LEVEL,
  blocksMinedAt,
  campRadius,
  campRing,
  canAfford,
  coverLevels,
  footprintOf,
  inCircle,
  levelNeededFor,
  minesAsLevel,
  upgradeCostFrom,
} from '../../engine';
/** What one square looks like to the player: 'shown', 'greyed' or 'fog'. */
export type { ShiftReport, Sight };

/**
 * Why an action cannot be done now: the engine's camp rule's reason, or
 * 'noTaps' (the shift has none left) or 'over' (the run has ended).
 */
export type TurnRefusal = 'noTaps' | 'over';
export type PlaceRefusal = EnginePlaceRefusal | TurnRefusal;

/** Why nothing at all can be done now ('over' or 'noTaps'), or `null` if an action can be. */
export function turnRefusal(world: CampWorld): TurnRefusal | null {
  if (world.turn.status !== 'active') return 'over';
  return world.turn.tapsLeft <= 0 ? 'noTaps' : null;
}

/** The fields of a Lab 2 world that the engine's camp rules read. Nothing is copied. */
function ground(world: CampWorld): CampGround {
  return {
    cube: world.lab.state,
    camps: world.camps,
    seen: world.seen,
    nextCampId: world.nextCampId,
    inventory: world.lab.counts,
  };
}

/** A Lab 2 world as the engine's state. Nothing big is copied. */
export function toFrontier(world: CampWorld): FrontierState {
  return {
    version: FRONTIER_STATE_VERSION,
    seed: world.lab.seed,
    cube: world.lab.state,
    features: world.surface.features,
    apples: world.surface.apples,
    animals: world.surface.animals,
    nextAnimalId: world.surface.nextAnimalId,
    rng: { s: world.surface.rng },
    camps: world.camps,
    nextCampId: world.nextCampId,
    seen: world.seen,
    inventory: world.lab.counts,
    mined: world.lab.mined,
    regrowIn: world.surface.regrowIn,
    stumps: world.surface.stumps,
    shift: world.turn.shift,
    tapsLeft: world.turn.tapsLeft,
    health: world.turn.health,
    status: world.turn.status,
  };
}

/**
 * `world` brought to the engine's `state`. The depth table is kept when the
 * cube did not change, and worked out again when it did.
 */
export function fromFrontier(world: CampWorld, state: FrontierState): CampWorld {
  const depths = state.cube === world.lab.state ? world.lab.depths : depthMapOf(state.cube);
  return {
    lab: {
      seed: state.seed,
      state: state.cube,
      depths,
      counts: state.inventory,
      mined: state.mined,
    },
    camps: state.camps,
    seen: state.seen,
    nextCampId: state.nextCampId,
    surface: {
      features: state.features,
      apples: state.apples,
      regrowIn: state.regrowIn,
      stumps: state.stumps,
      animals: state.animals,
      nextAnimalId: state.nextAnimalId,
      rng: state.rng.s,
    },
    turn: {
      shift: state.shift,
      tapsLeft: state.tapsLeft,
      health: state.health,
      status: state.status,
    },
  };
}

/** Do `action` in the engine: the world after it (the very same world if it did nothing) and the engine's answer. */
function act(
  world: CampWorld,
  action: FrontierAction,
): { world: CampWorld; done: boolean; report: ShiftReport | null } {
  const outcome = frontierAct(toFrontier(world), action);
  if (!outcome.done) {
    return { world, done: false, report: null };
  }
  return { world: fromFrontier(world, outcome.state), done: true, report: outcome.report };
}

/** The best level of the camps covering square (x, y); 0 if none covers it. */
export function coverLevelAt(world: CampWorld, x: number, y: number): number {
  return engineCoverLevelAt(world.camps, x, y);
}

/** How square (x, y) looks: shown inside a circle, greyed if it was once, fog if never. */
export function sightAt(world: CampWorld, x: number, y: number): Sight {
  return engineSightAt(ground(world), x, y);
}

/** Every square's sight, row by row, worked out in one pass (for drawing). */
export function sightMap(world: CampWorld): Sight[] {
  return engineSightMap(ground(world));
}

/** The camp whose 3 x 3 footprint holds square (x, y), or `null`. */
export function campAt(world: CampWorld, x: number, y: number): Camp | null {
  return engineCampAt(world.camps, x, y);
}

/**
 * True if the 3 x 3 footprint centred on (x, y) is on the map and all nine
 * squares are at the same depth: level ground, as a camp needs.
 */
export function isLevelPatch(lab: LabWorld, x: number, y: number): boolean {
  return engineIsLevelPatch(lab.state, x, y);
}

// ----- Making a world -----

/** A bare surface for a cube: no grass, trees or animals. Hand-made test worlds start with it. */
export function bareSurface(state: GameState): Surface {
  const squares = state.size.x * state.size.y;
  return {
    features: new Array<typeof NO_FEATURE>(squares).fill(NO_FEATURE),
    apples: new Array<number>(squares).fill(0),
    regrowIn: new Array<number>(squares).fill(-1),
    stumps: new Array<typeof NO_FEATURE>(squares).fill(NO_FEATURE),
    animals: [],
    nextAnimalId: 1,
    rng: 1,
  };
}

/**
 * A camp world on any cube, with one level-1 camp at (x, y), and `surface`
 * (bare if not given). The tests pass a small hand-made cube.
 */
export function campWorldFromLab(
  lab: LabWorld,
  x: number,
  y: number,
  surface: Surface = bareSurface(lab.state),
): CampWorld {
  const camps: Camp[] = [{ id: 1, x, y, level: 1, smelter: false, lantern: false }];
  const { width, height } = lab.depths;
  const seen = seenWith(new Array<boolean>(width * height).fill(false), camps, width, height);
  return { lab, camps, seen, nextCampId: 2, surface, turn: firstTurn() };
}

/** A camp world on a hand-made cube, with the first camp at (x, y). */
export function campWorldFromState(
  seed: number,
  state: GameState,
  x: number,
  y: number,
  surface?: Surface,
): CampWorld {
  return campWorldFromLab(labWorldFromState(seed, state), x, y, surface);
}

/**
 * Where the free first camp goes on a level cube with nothing growing on it:
 * the 3 x 3 patch near the middle with the most dirt on top, then the nearest
 * the middle. The engine's choice (`createFrontier`), for hand-made tests.
 */
export function startSquare(state: GameState): { x: number; y: number } {
  const bare = new Array<typeof NO_FEATURE>(state.size.x * state.size.y).fill(NO_FEATURE);
  return frontierStartSquare(state, bare);
}

/**
 * A new Lab 2 world on `seed`: the game's cube (no coal at the surface,
 * question 140; no timber-root, `createFrontier`), its surface (grass, trees,
 * apple trees, animals, clay), and one free level-1 camp near the middle on
 * a patch whose ring pays for the next camp.
 */
export function newCampWorld(seed: number): CampWorld {
  // The world is the engine's (plans A1 to A4): its cube with clay as real
  // blocks, its surface and animals, its first camp, and shift 1.
  return campWorldOf(createFrontier(seed));
}

/** Lab 2's world for any engine state: a new world, or a run loaded from a save (plan B1). */
export function campWorldOf(state: FrontierState): CampWorld {
  const empty: CampWorld = {
    lab: labWorldFromState(state.seed, state.cube),
    camps: [],
    seen: [],
    nextCampId: 1,
    surface: bareSurface(state.cube),
    turn: firstTurn(),
  };
  return fromFrontier(empty, state);
}

// ----- A tap -----

/**
 * What a tap on the map did:
 * - 'mined': the top block was mined (`tap` has the details);
 * - 'harvested': something on the surface was taken: an animal caught, grass
 *   cut, an apple picked or a tree felled (`harvest` has the details);
 * - 'fog': the square is fog, so nothing happened;
 * - 'greyed': the square is outside every camp's circle now, so nothing happened;
 * - 'camp': the square holds a camp, which is never mined;
 * - 'refused': the level rule refused it (`tap.result.refusal` says why);
 * - 'tooHard': the level rule allows it, but the camps covering the square
 *   cannot mine its top block (`needs` says which level can);
 * - 'noTaps': the shift has no taps left (A4);
 * - 'over': the run has ended (A4).
 */
export type CampTapKind =
  'mined' | 'harvested' | 'fog' | 'greyed' | 'camp' | 'tooHard' | 'refused' | 'noTaps' | 'over';

export interface CampTap {
  kind: CampTapKind;
  world: CampWorld;
  /** Lab 1's answer, for 'mined' and 'refused'; `null` otherwise. */
  tap: LabTap | null;
  /** For 'tooHard': the lowest camp level that could mine the block, or `null` if none can. */
  needs: number | null;
  /** For 'harvested': what was taken and what it gave; `null` otherwise. */
  harvest: Harvest | null;
}

/**
 * Tap square (x, y): the engine's `frontierAct` (plan A3, A4). A tap that
 * takes or mines something costs 1 tap; in every other case the very same
 * world comes back.
 */
export function campTap(world: CampWorld, x: number, y: number): CampTap {
  const outcome = frontierAct(toFrontier(world), { kind: 'tap', x, y });
  const tap = outcome.tap;
  const answer = (kind: CampTapKind): CampTap => ({
    kind,
    world,
    tap: null,
    needs: tap?.needs ?? null,
    harvest: null,
  });
  if (tap === null) {
    return answer(outcome.refusal === 'over' ? 'over' : 'noTaps');
  }
  if (tap.kind === 'refused') {
    const result = {
      state: world.lab.state,
      mined: false,
      block: null,
      yields: [],
      refusal: tap.refusal ?? 'bottom', // `refusal` is set for every 'refused' tap
      higherNeighbours: tap.higherNeighbours,
    };
    return { ...answer('refused'), tap: { world: world.lab, result } };
  }
  if (!outcome.done) {
    return answer(tap.kind); // 'fog', 'greyed', 'camp' or 'tooHard': nothing changes
  }
  const after = fromFrontier(world, outcome.state);
  if (tap.kind === 'harvested') {
    const gain = tap.gain[0] ?? { item: 'grass', count: 0 }; // a harvest always gives one stack
    const harvest = { surface: after.surface, gain, kind: tap.harvest ?? 'grass' };
    return { ...answer('harvested'), world: after, harvest };
  }
  const result = {
    state: after.lab.state,
    mined: true,
    block: tap.block,
    yields: tap.gain,
    refusal: null,
    higherNeighbours: [],
  };
  return { ...answer('mined'), world: after, tap: { world: after.lab, result } };
}

// ----- New camps, upgrades and demolishing (the engine's rules) -----

/** Why a new camp cannot be centred on (x, y) now, or `null` if it can. */
export function placeRefusal(world: CampWorld, x: number, y: number): PlaceRefusal | null {
  return turnRefusal(world) ?? enginePlaceRefusal(ground(world), x, y);
}

/**
 * The squares a new level-1 camp on (x, y) would bring out of fog or out of
 * grey: the part of its circle that no camp covers now. Row by row, as indexes.
 */
export function newlyCovered(world: CampWorld, x: number, y: number): number[] {
  return engineNewlyCovered(ground(world), x, y);
}

/**
 * Place a new level-1 camp on (x, y), pay its cost, and spend a tap. What
 * grew on its 3 x 3 is cleared and gives nothing. If `placeRefusal` says
 * no, the very same world comes back.
 */
export function placeCamp(world: CampWorld, x: number, y: number): CampWorld {
  return act(world, { kind: 'place', x, y }).world;
}

/** Why camp `id` cannot be upgraded now, or `null` if it can. */
export function upgradeRefusal(
  world: CampWorld,
  id: number,
): 'missing' | 'top' | 'cost' | TurnRefusal | null {
  return turnRefusal(world) ?? engineUpgradeRefusal(ground(world), id);
}

/** Upgrade camp `id` one level, pay for it, and spend a tap. If refused, the same world comes back. */
export function upgradeCamp(world: CampWorld, id: number): CampWorld {
  return act(world, { kind: 'upgrade', id }).world;
}

// ----- Smelting and crafting (docs/plans/smelting-and-crafting.md) -----

/** Why a smelter cannot be built at camp `id` now ('noTaps', 'over', or the engine's reason), or `null` if it can. */
export function smelterRefusal(world: CampWorld, id: number): string | null {
  return turnRefusal(world) ?? engineSmelterRefusal(toFrontier(world), id);
}

/** Build a smelter at camp `id`, for its cost and 1 tap; the very same world if it cannot. */
export function buildCampSmelter(world: CampWorld, id: number): CampWorld {
  return act(world, { kind: 'buildSmelter', id }).world;
}

/** Why recipe `recipe` cannot be made now ('noTaps', 'over', or the engine's reason), or `null` if it can. */
export function makeRefusal(world: CampWorld, recipe: string): string | null {
  return turnRefusal(world) ?? engineMakeRefusal(toFrontier(world), recipe);
}

/** Make recipe `recipe` once, for its inputs and 1 tap; the very same world if it cannot. */
export function makeCampRecipe(world: CampWorld, recipe: string): CampWorld {
  return act(world, { kind: 'make', recipe }).world;
}

/** Why a lantern cannot be hung at camp `id` now ('noTaps', 'over', or the engine's reason), or `null` if it can. */
export function lanternRefusal(world: CampWorld, id: number): string | null {
  return turnRefusal(world) ?? engineLanternRefusal(toFrontier(world), id);
}

/** Hang a lantern from the store at camp `id`, for 1 tap; the very same world if it cannot. */
export function hangCampLantern(world: CampWorld, id: number): CampWorld {
  return act(world, { kind: 'hangLantern', id }).world;
}

// ----- The market (docs/plans/progression-phases.md, PR 1) -----

/** True if the market is open in the shift being played. */
export function marketOpen(world: CampWorld): boolean {
  return isMarketDay(toFrontier(world));
}

/** The shift on which the market opens next at today's cadence (this one, if it is open). */
export function nextMarketShift(world: CampWorld): number {
  return engineNextMarketShift(toFrontier(world));
}

/** Why `lots` lots of `item` cannot be traded now ('noTaps', 'over', or the engine's reason), or `null` if they can. */
export function tradeRefusal(
  world: CampWorld,
  side: TradeSide,
  item: string,
  lots: number,
): string | null {
  return turnRefusal(world) ?? engineTradeRefusal(toFrontier(world), side, item, lots);
}

/** Sell or buy `lots` lots of `item`, for 1 tap; the very same world if it cannot. */
export function tradeCamp(
  world: CampWorld,
  side: TradeSide,
  item: string,
  lots: number,
): CampWorld {
  return act(world, { kind: side, item, lots }).world;
}

/** Why camp `id` cannot be demolished now, or `null` if it can. */
export function demolishRefusal(
  world: CampWorld,
  id: number,
): 'missing' | 'notCovered' | TurnRefusal | null {
  return turnRefusal(world) ?? engineDemolishRefusal(ground(world), id);
}

/**
 * Demolish camp `id` and spend a tap: it goes, and gives nothing back. If
 * `demolishRefusal` says no, the very same world comes back.
 */
export function demolishCamp(world: CampWorld, id: number): CampWorld {
  return act(world, { kind: 'demolish', id }).world;
}

// ----- Shifts (plan A4) -----

/**
 * End the shift: the animals step, apples regrow, upkeep is paid in wood
 * and food, hunger costs health for what cannot be paid, and the next shift
 * starts with a full set of taps. `report` says what happened; `null` if
 * the run has already ended (the world is then the same).
 */
export function endShift(world: CampWorld): { world: CampWorld; report: ShiftReport | null } {
  const result = act(world, { kind: 'endShift' });
  return { world: result.world, report: result.report };
}

/**
 * Rest at camp `id` (question 156: "Only at a camp"): the crew's health is
 * restored, then the shift ends as with `endShift`. `report` is `null` if
 * there is no such camp or the run has ended (the world is then the same).
 */
export function restCrew(
  world: CampWorld,
  id: number,
): { world: CampWorld; report: ShiftReport | null } {
  const result = act(world, { kind: 'rest', id });
  return { world: result.world, report: result.report };
}

/** Close the mine: the run ends, kept as it is. */
export function closeMine(world: CampWorld): CampWorld {
  return act(world, { kind: 'close' }).world;
}

/** The display names of the block kinds that level `level` adds to the level below it. */
export function addedNamesAt(level: number): string[] {
  return (LAB_CAMP_LEVELS[level - 1]?.addsBlocks ?? []).map(
    (id) => blockDefByCode(BLOCKS[id].code).name,
  );
}

/**
 * What a camp of `level` mines, in a few words for the camp panel: the
 * whole list at level 1 ("Dirt, Rubble, Stone, ..."), and what the level
 * adds after that ("Hard rock and everything softer").
 */
export function minesText(level: number): string {
  const added = addedNamesAt(level).join(', ');
  if (added === '') {
    // A level that adds no blocks (level 4): it mines what the level below does.
    return level > 1 ? minesText(level - 1) : '';
  }
  return level === 1 ? added : `${added} and everything softer`;
}

// ----- Replaying steps -----

/**
 * A world already played, for the e2e tests: `{ "seed": 110, "steps": [...] }`
 * in the browser's localStorage under this key opens Lab 2 on that seed with
 * those steps replayed (`replayCampSteps`). "New world" removes it. Nothing
 * in the game writes it, so players never have one.
 */
export const PREPARED_LAB2_KEY = 'mining-game.lab2.prepared';

/**
 * One thing a player did in Lab 2. A list of steps rebuilds a world exactly,
 * because every step is deterministic. The e2e tests use it to open Lab 2
 * on a world that has already been played (see `PREPARED_LAB2_KEY` above); players never need it.
 */
export type CampStep =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'place'; x: number; y: number }
  | { kind: 'upgrade'; id: number }
  | { kind: 'demolish'; id: number }
  // Build a smelter at a camp; make a recipe (smelting and crafting, PR 1).
  | { kind: 'buildSmelter'; id: number }
  | { kind: 'make'; recipe: string }
  // Hang a lantern at a camp (PR 3).
  | { kind: 'hangLantern'; id: number }
  // Sell or buy at the market (progression PR 1).
  | { kind: 'sell'; item: string; lots: number }
  | { kind: 'buy'; item: string; lots: number }
  // End the shift, rest at a camp, or close the mine (A4).
  | { kind: 'endShift' }
  | { kind: 'rest'; id: number }
  | { kind: 'close' };

/** The world after one step. A step that is not allowed changes nothing, as on screen. */
export function applyCampStep(world: CampWorld, step: CampStep): CampWorld {
  if (step.kind === 'tap') {
    return campTap(world, step.x, step.y).world;
  }
  if (step.kind === 'place') {
    return placeCamp(world, step.x, step.y);
  }
  if (step.kind === 'upgrade') {
    return upgradeCamp(world, step.id);
  }
  if (step.kind === 'endShift') {
    return endShift(world).world;
  }
  if (step.kind === 'rest') {
    return restCrew(world, step.id).world;
  }
  if (step.kind === 'close') {
    return closeMine(world);
  }
  if (step.kind === 'buildSmelter') {
    return buildCampSmelter(world, step.id);
  }
  if (step.kind === 'make') {
    return makeCampRecipe(world, step.recipe);
  }
  if (step.kind === 'hangLantern') {
    return hangCampLantern(world, step.id);
  }
  if (step.kind === 'sell' || step.kind === 'buy') {
    return tradeCamp(world, step.kind, step.item, step.lots);
  }
  return demolishCamp(world, step.id);
}

/** A new world on `seed` with `steps` applied in order. */
export function replayCampSteps(seed: number, steps: CampStep[]): CampWorld {
  let world = newCampWorld(seed);
  for (const step of steps) {
    world = applyCampStep(world, step);
  }
  return world;
}
