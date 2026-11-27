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
  noHazards,
  createFrontier,
  depthMapOf,
  frontierAct,
  frontierStartSquare,
  marketIsOpen,
  deliverRefusal as engineDeliverRefusal,
  fillRefusal as engineFillRefusal,
  dropRefusal as engineDropRefusal,
  takeRefusal as engineTakeRefusal,
  penRefusal as enginePenRefusal,
  defenseRefusal as engineDefenseRefusal,
  buildRefusal as engineBuildRefusal,
  fillSquareRefusal as engineFillSquareRefusal,
  digAreaRefusal as engineDigAreaRefusal,
  digAreaPlan as engineDigAreaPlan,
  hireRefusal as engineHireRefusal,
  raidStrength as engineRaidStrength,
  foundationDepth as engineFoundationDepth,
  plantRefusal as enginePlantRefusal,
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
  FrontierBuilding,
  FrontierCamp,
  FrontierHazards,
  FrontierHeldContract,
  FrontierState,
  FrontierStatus,
  GameState,
  PlaceRefusal as EnginePlaceRefusal,
  PenAction,
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
  /** The shift being played, its taps left, and whether the run goes on (A4). */
  turn: CampTurn;
  /** The hazards' marks: flooded squares, pumps (docs/plans/hazards.md). The engine's own record. */
  hazards: FrontierHazards;
  /** The one-square buildings: saw houses and sugar shacks (the engine's buildings.ts). */
  buildings: FrontierBuilding[];
  /** Where mushrooms stand, and the nights until those coming come up (the engine's mushrooms.ts). */
  mushrooms: boolean[];
  mushroomIn: number[];
  /** The crops sown, and the shifts until each is ripe (the engine's crops.ts). */
  crops: number[];
  cropIn: number[];
}

/** Where the run stands (plan A4). */
export interface CampTurn {
  /** The shift being played: 1 is the first. */
  shift: number;
  /** Taps left in this shift. */
  tapsLeft: number;
  /** 'active', 'closed' (the mine was closed) or 'finished' (the last shift ended). */
  status: FrontierStatus;
  /** The contracts held, oldest first (progression PR 5; several since the market-scene build). */
  contracts: FrontierHeldContract[];
  /** Contracts delivered, by tier: [tier 1, tier 2, tier 3]. */
  contractsDone: number[];
  /** The contracts taken or filled from today's board: gone from it until the next market day. */
  boardUsed: string[];
  /** True while the market is open, after a market day's night (progression, market scene). */
  marketOpen: boolean;
}

/** A fresh run: shift 1, a full shift of taps. */
export function firstTurn(): CampTurn {
  return {
    shift: 1,
    tapsLeft: FRONTIER_SHIFT.taps,
    status: 'active',
    contracts: [],
    contractsDone: [0, 0, 0],
    boardUsed: [],
    marketOpen: false,
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
  toolNeededFor,
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
    hazards: world.hazards,
    buildings: world.buildings,
    animals: world.surface.animals,
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
    grassIn: world.surface.grassIn,
    planted: world.surface.planted,
    treesFelled: world.surface.treesFelled,
    shift: world.turn.shift,
    tapsLeft: world.turn.tapsLeft,
    status: world.turn.status,
    contracts: world.turn.contracts,
    contractsDone: world.turn.contractsDone,
    boardUsed: world.turn.boardUsed,
    marketOpen: world.turn.marketOpen,
    hazards: world.hazards,
    buildings: world.buildings,
    mushrooms: world.mushrooms,
    mushroomIn: world.mushroomIn,
    crops: world.crops,
    cropIn: world.cropIn,
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
      grassIn: state.grassIn,
      planted: state.planted,
      treesFelled: state.treesFelled,
      animals: state.animals,
      nextAnimalId: state.nextAnimalId,
      rng: state.rng.s,
    },
    turn: {
      shift: state.shift,
      tapsLeft: state.tapsLeft,
      status: state.status,
      contracts: state.contracts,
      contractsDone: state.contractsDone,
      boardUsed: state.boardUsed,
      marketOpen: state.marketOpen,
    },
    hazards: state.hazards,
    buildings: state.buildings,
    mushrooms: state.mushrooms,
    mushroomIn: state.mushroomIn,
    crops: state.crops,
    cropIn: state.cropIn,
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
    grassIn: new Array<number>(squares).fill(-1),
    planted: new Array<boolean>(squares).fill(false),
    treesFelled: 0,
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
  const camps: Camp[] = [
    {
      id: 1,
      x,
      y,
      level: 1,
      smelter: false,
      lantern: false,
      pen: false,
      penned: 0,
      breedIn: 0,
      deep: false,
      defense: 0,
    },
  ];
  const { width, height } = lab.depths;
  const seen = seenWith(new Array<boolean>(width * height).fill(false), camps, width, height);
  return {
    lab,
    camps,
    seen,
    nextCampId: 2,
    surface,
    turn: firstTurn(),
    hazards: noHazards(width * height),
    buildings: [],
    mushrooms: new Array<boolean>(width * height).fill(false),
    mushroomIn: new Array<number>(width * height).fill(-1),
    crops: new Array<number>(width * height).fill(0),
    cropIn: new Array<number>(width * height).fill(-1),
  };
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
    hazards: state.hazards,
    buildings: state.buildings,
    mushrooms: state.mushrooms,
    mushroomIn: state.mushroomIn,
    crops: state.crops,
    cropIn: state.cropIn,
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
 * - 'building': the square holds a saw house or a sugar shack, which is never mined;
 * - 'growing': a crop grows on the square and is not ripe yet;
 * - 'uprooted': a planted sapling was pulled up, back into the store;
 * - 'refused': the level rule refused it (`tap.result.refusal` says why);
 * - 'tooHard': the level rule allows it, but the camps covering the square
 *   cannot mine its top block (`needs` says which level can, `needsTool`
 *   which tool);
 * - 'flooded': the square is flooded and no pump is held (hazards PR 2);
 * - 'pump': a pump was set on the flooded square, or picked up (`pump` says which);
 * - 'fire': the fire on the square was put out (hazards PR 3);
 * - 'dragon': the dragon on the square was driven off with a sword (hazards PR 4);
 * - 'needsSword': a dragon is on the square and no sword is held;
 * - 'noTaps': the shift has no taps left (A4);
 * - 'over': the run has ended (A4).
 */
export type CampTapKind =
  | 'mined'
  | 'harvested'
  | 'fog'
  | 'greyed'
  | 'camp'
  | 'building'
  | 'growing'
  | 'uprooted'
  | 'tooHard'
  | 'refused'
  | 'flooded'
  | 'pump'
  | 'fire'
  | 'dragon'
  | 'needsSword'
  | 'noTaps'
  | 'over';

export interface CampTap {
  kind: CampTapKind;
  world: CampWorld;
  /** Lab 1's answer, for 'mined' and 'refused'; `null` otherwise. */
  tap: LabTap | null;
  /** For 'tooHard': the lowest camp level that could mine the block, or `null` if none can. */
  needs: number | null;
  /** For 'tooHard': the tool that mines the block (an iron or steel drill), if a tool does. */
  needsTool: string | null;
  /** For 'harvested': what was taken and what it gave; `null` otherwise. */
  harvest: Harvest | null;
  /** For 'pump': whether a pump was set or picked up; `null` otherwise. */
  pump: 'set' | 'taken' | null;
  /** For 'mined': the squares its water flooded (hazards PR 2), nearest first. */
  flooded: { x: number; y: number }[];
  /** For 'mined': what gas it let out did (hazards PR 3): 'exploded', 'vented' or `null`. */
  gas: 'exploded' | 'vented' | null;
  /** For 'mined': the squares a blast dug, and the squares it set on fire. */
  blown: { x: number; y: number }[];
  fires: { x: number; y: number }[];
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
    needsTool: tap?.needsTool ?? null,
    harvest: null,
    pump: null,
    flooded: [],
    gas: null,
    blown: [],
    fires: [],
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
    return answer(tap.kind); // 'fog', 'greyed', 'camp', 'building', 'growing', 'tooHard' or 'flooded': nothing changes
  }
  const after = fromFrontier(world, outcome.state);
  if (tap.kind === 'pump') {
    return { ...answer('pump'), world: after, pump: tap.pump };
  }
  if (tap.kind === 'fire' || tap.kind === 'dragon' || tap.kind === 'uprooted') {
    return { ...answer(tap.kind), world: after };
  }
  if (tap.kind === 'harvested') {
    const gain = tap.gain[0] ?? { item: 'grass', count: 0 }; // a harvest always gives one stack
    const extra = tap.gain[1] ?? null; // a sapling with a felled tree
    const harvest = { surface: after.surface, gain, extra, kind: tap.harvest ?? 'grass' };
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
  return {
    ...answer('mined'),
    world: after,
    tap: { world: after.lab, result },
    flooded: tap.flooded,
    gas: tap.gas,
    blown: tap.blown,
    fires: tap.fires,
  };
}

// ----- New camps, upgrades and demolishing (the engine's rules) -----

/** Why a new camp cannot be centred on (x, y) now, or `null` if it can. */
export function placeRefusal(
  world: CampWorld,
  x: number,
  y: number,
  deep = false,
): PlaceRefusal | null {
  return turnRefusal(world) ?? enginePlaceRefusal(ground(world), x, y, deep);
}

/**
 * The squares a new level-1 camp on (x, y) would bring out of fog or out of
 * grey: the part of its circle that no camp covers now. Row by row, as indexes.
 */
export function newlyCovered(world: CampWorld, x: number, y: number, deep = false): number[] {
  return engineNewlyCovered(ground(world), x, y, deep);
}

/**
 * Place a new level-1 camp on (x, y), pay its cost, and spend a tap. What
 * grew on its 3 x 3 is cleared and gives nothing. If `placeRefusal` says
 * no, the very same world comes back.
 */
export function placeCamp(world: CampWorld, x: number, y: number, deep = false): CampWorld {
  return act(world, { kind: deep ? 'placeDeep' : 'place', x, y }).world;
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

/** Why a pen action cannot be done at camp `id` now ('noTaps', 'over', or the engine's reason), or `null` if it can. */
export function penRefusal(world: CampWorld, kind: PenAction, id: number): string | null {
  return turnRefusal(world) ?? enginePenRefusal(toFrontier(world), kind, id);
}

/** Build a pen at camp `id`, or put an animal in or take one out, for 1 tap; the very same world if it cannot. */
export function penCamp(world: CampWorld, kind: PenAction, id: number): CampWorld {
  return act(world, { kind, id }).world;
}

/** Why camp `id` cannot build its next defenses now ('noTaps', 'over', or the engine's reason), or `null` if it can. */
export function defenseRefusal(world: CampWorld, id: number): string | null {
  return turnRefusal(world) ?? engineDefenseRefusal(toFrontier(world), id);
}

/** The depth a deep camp's concrete foundation would level the 3 x 3 on (x, y) to. */
export function foundationDepthOf(world: CampWorld, x: number, y: number): number {
  return engineFoundationDepth(world.lab.state, x, y);
}

/** How strong marauders would come now: from the deepest square dug (hazards PR 5). */
export function raidStrengthOf(world: CampWorld): number {
  return engineRaidStrength(toFrontier(world));
}

/** Build camp `id`'s next level of defenses (hazards PR 5), for 1 tap; the very same world if it cannot. */
export function buildCampDefense(world: CampWorld, id: number): CampWorld {
  return act(world, { kind: 'buildDefense', id }).world;
}

// ----- The market (docs/plans/progression-phases.md, PR 1) -----

/** True while the market is open: after a market day's night, until it is closed. */
export function marketOpen(world: CampWorld): boolean {
  return marketIsOpen(toFrontier(world));
}

/** Close the market: the day starts. The very same world if it is not open. */
export function closeCampMarket(world: CampWorld): CampWorld {
  return act(world, { kind: 'closeMarket' }).world;
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

// ----- Contracts (docs/plans/progression-phases.md, PR 5) -----

/** Why a contract action cannot be done now ('noTaps', 'over', or the engine's reason), or `null` if it can. */
export function contractRefusal(
  world: CampWorld,
  action:
    | { kind: 'takeContract'; id: string }
    | { kind: 'fillContract'; id: string }
    | { kind: 'deliver'; id: string }
    | { kind: 'dropContract'; id: string },
): string | null {
  // Delivering and dropping cost no tap (owner, after the 0.20.0 build: "Free,
  // any time"): only a run that has ended stops them.
  const free = action.kind === 'deliver' || action.kind === 'dropContract';
  const turn = turnRefusal(world);
  if (turn !== null && !(free && turn === 'noTaps')) return turn;
  const state = toFrontier(world);
  if (action.kind === 'takeContract') return engineTakeRefusal(state, action.id);
  if (action.kind === 'fillContract') return engineFillRefusal(state, action.id);
  return action.kind === 'deliver'
    ? engineDeliverRefusal(state, action.id)
    : engineDropRefusal(state, action.id);
}

/** Take, fill, deliver or drop a contract, for no tap; the very same world if it cannot. */
export function contractCamp(
  world: CampWorld,
  action:
    | { kind: 'takeContract'; id: string }
    | { kind: 'fillContract'; id: string }
    | { kind: 'deliver'; id: string }
    | { kind: 'dropContract'; id: string },
): CampWorld {
  return act(world, action).world;
}

// ----- Planting (docs/plans/progression-phases.md, PR 3) -----

/** Why `item` cannot be planted on (x, y) now ('noTaps', 'over', or the engine's reason), or `null` if it can. */
export function plantRefusal(world: CampWorld, x: number, y: number, item: string): string | null {
  return turnRefusal(world) ?? enginePlantRefusal(toFrontier(world), x, y, item);
}

/** Plant `item` on (x, y), for 1 tap; the very same world if it cannot. */
export function plantCamp(world: CampWorld, x: number, y: number, item: string): CampWorld {
  return act(world, { kind: 'plant', x, y, item }).world;
}

// ----- One-square buildings: the saw house and the sugar shack (owner, after the 0.17.0 build) -----

/** Why a `building` cannot be built on (x, y) now ('noTaps', 'over', or the engine's reason), or `null` if it can. */
export function buildRefusal(
  world: CampWorld,
  building: string,
  x: number,
  y: number,
): string | null {
  return turnRefusal(world) ?? engineBuildRefusal(toFrontier(world), building, x, y);
}

/** Build a `building` on (x, y), for 1 tap; the very same world if it cannot. */
export function buildCampBuilding(
  world: CampWorld,
  building: string,
  x: number,
  y: number,
): CampWorld {
  return act(world, { kind: 'build', building, x, y }).world;
}

// ----- Digging a 3 x 3 with miners (owner, after the 0.20.0 build) -----

/** Why the 3 x 3 round (x, y) cannot be dug now ('over', or the engine's reason), or `null` if it can. */
export function digAreaRefusal(world: CampWorld, x: number, y: number): string | null {
  if (world.turn.status !== 'active') return 'over';
  return engineDigAreaRefusal(toFrontier(world), x, y);
}

/** The squares a dig of the 3 x 3 round (x, y) would dig, and what it would cost, for the long-press preview. */
export function digAreaPreview(
  world: CampWorld,
  x: number,
  y: number,
): { dug: { x: number; y: number }[]; cost: number } {
  const plan = engineDigAreaPlan(toFrontier(world), x, y);
  return { dug: plan.dug, cost: plan.cost };
}

/** Dig the 3 x 3 round (x, y), for its taps; the very same world if it cannot. */
export function digCampArea(world: CampWorld, x: number, y: number): CampWorld {
  return act(world, { kind: 'digArea', x, y }).world;
}

// ----- Work camps (owner, after the 0.20.0 build) -----

/** Why `who` cannot be hired at the work camp on (x, y) now ('noTaps', 'over', or the engine's reason), or `null`. */
export function hireCampRefusal(
  world: CampWorld,
  x: number,
  y: number,
  who: 'worker' | 'horse',
): string | null {
  return turnRefusal(world) ?? engineHireRefusal(toFrontier(world), x, y, who);
}

/** Hire `who` at the work camp on (x, y), for its coins and 1 tap; the very same world if it cannot. */
export function hireAtCamp(
  world: CampWorld,
  x: number,
  y: number,
  who: 'worker' | 'horse',
): CampWorld {
  return act(world, { kind: 'hire', x, y, who }).world;
}

// ----- Filling a square with dirt (owner, after the 0.17.0 build) -----

/** Why (x, y) cannot be filled now ('noTaps', 'over', or the engine's reason), or `null` if it can. */
export function fillSquareRefusal(world: CampWorld, x: number, y: number): string | null {
  return turnRefusal(world) ?? engineFillSquareRefusal(toFrontier(world), x, y);
}

/** Fill (x, y) with one block of dirt, for 1 tap; the very same world if it cannot. */
export function fillCampSquare(world: CampWorld, x: number, y: number): CampWorld {
  return act(world, { kind: 'fillSquare', x, y }).world;
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
 * and food, each item that cannot be paid costs taps of the next shift,
 * and the next shift starts. `report` says what happened; `null` if
 * the run has already ended (the world is then the same).
 */
export function endShift(world: CampWorld): { world: CampWorld; report: ShiftReport | null } {
  const result = act(world, { kind: 'endShift' });
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
  // A deep camp (progression PR 6).
  | { kind: 'placeDeep'; x: number; y: number }
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
  // Close the market and start the day.
  | { kind: 'closeMarket' }
  // Take, deliver or drop a contract (progression PR 5).
  | { kind: 'takeContract'; id: string }
  | { kind: 'fillContract'; id: string }
  | { kind: 'deliver'; id: string }
  | { kind: 'dropContract'; id: string }
  // A pen at a camp, and an animal into it or out of it (progression PR 4).
  | { kind: 'buildPen'; id: number }
  | { kind: 'penIn'; id: number }
  | { kind: 'penOut'; id: number }
  // Plant a sapling (progression PR 3).
  | { kind: 'plant'; x: number; y: number; item: string }
  // Build a camp's next defenses (hazards PR 5).
  | { kind: 'buildDefense'; id: number }
  // Build a saw house or a sugar shack (owner, after the 0.17.0 build).
  | { kind: 'build'; building: string; x: number; y: number }
  // Fill a square with dirt (owner, after the 0.17.0 build).
  | { kind: 'fillSquare'; x: number; y: number }
  // Dig a 3 x 3 with miners (owner, after the 0.20.0 build).
  | { kind: 'digArea'; x: number; y: number }
  // Hire a worker or a horse at a work camp (owner, after the 0.20.0 build).
  | { kind: 'hire'; x: number; y: number; who: 'worker' | 'horse' }
  // End the shift or close the mine (A4).
  | { kind: 'endShift' }
  | { kind: 'close' };

/** The world after one step. A step that is not allowed changes nothing, as on screen. */
export function applyCampStep(world: CampWorld, step: CampStep): CampWorld {
  if (step.kind === 'tap') {
    return campTap(world, step.x, step.y).world;
  }
  if (step.kind === 'place' || step.kind === 'placeDeep') {
    return placeCamp(world, step.x, step.y, step.kind === 'placeDeep');
  }
  if (step.kind === 'upgrade') {
    return upgradeCamp(world, step.id);
  }
  if (step.kind === 'endShift') {
    return endShift(world).world;
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
  if (step.kind === 'plant') {
    return plantCamp(world, step.x, step.y, step.item);
  }
  if (step.kind === 'closeMarket') {
    return closeCampMarket(world);
  }
  if (
    step.kind === 'takeContract' ||
    step.kind === 'fillContract' ||
    step.kind === 'deliver' ||
    step.kind === 'dropContract'
  ) {
    return contractCamp(world, step);
  }
  if (step.kind === 'buildPen' || step.kind === 'penIn' || step.kind === 'penOut') {
    return penCamp(world, step.kind, step.id);
  }
  if (step.kind === 'buildDefense') {
    return buildCampDefense(world, step.id);
  }
  if (step.kind === 'hire') {
    return hireAtCamp(world, step.x, step.y, step.who);
  }
  if (step.kind === 'digArea') {
    return digCampArea(world, step.x, step.y);
  }
  if (step.kind === 'fillSquare') {
    return fillCampSquare(world, step.x, step.y);
  }
  if (step.kind === 'build') {
    return buildCampBuilding(world, step.building, step.x, step.y);
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
