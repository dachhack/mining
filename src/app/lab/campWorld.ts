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
// No DOM code here, so the unit tests run it in plain Node. Every number
// (radii, costs, which level mines which block) is in src/data/labCamps.ts.
// Like labWorld.ts, nothing here changes a world it is given: every change
// returns a new world.

import { BLOCKS, blockDefByCode } from '../../data';
import {
  LAB_CAMP_LEVELS,
  LAB_NEW_CAMP_COST,
  LAB_START_REACH,
  LAB_SURFACE,
} from '../../data/labCamps';
import {
  CAMP_HALF_SIZE,
  FRONTIER_STATE_VERSION,
  createFrontier,
  frontierTap,
  campAt as engineCampAt,
  campRadius,
  canAfford,
  coverLevelAt as engineCoverLevelAt,
  demolishCamp as engineDemolishCamp,
  demolishRefusal as engineDemolishRefusal,
  footprintOf,
  inCircle,
  inFootprint,
  isLevelPatch as engineIsLevelPatch,
  newlyCovered as engineNewlyCovered,
  placeCamp as enginePlaceCamp,
  placeRefusal as enginePlaceRefusal,
  seenWith,
  sightAt as engineSightAt,
  sightMap as engineSightMap,
  topBlockAt,
  upgradeCamp as engineUpgradeCamp,
  upgradeRefusal as engineUpgradeRefusal,
} from '../../engine';
import type {
  CampChange,
  CampGround,
  FrontierCamp,
  FrontierState,
  FrontierTap,
  GameState,
  PlaceRefusal,
  Sight,
} from '../../engine';
import { labWorldFromState } from './labWorld';
import type { LabTap, LabWorld } from './labWorld';
import { APPLE_TREE, GRASS, TREE, advanceSurface, clearFeatures, generateSurface } from './surface';
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
  /** The surface (issue #121): grass, trees, apple trees, animals, clay, and the lab's clock. */
  surface: Surface;
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
  canAfford,
  coverLevels,
  footprintOf,
  inCircle,
  levelNeededFor,
  upgradeCostFrom,
} from '../../engine';
/** What one square looks like to the player: 'shown', 'greyed' or 'fog'. */
export type { PlaceRefusal, Sight };

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

/** `world` after a camp change from the engine: new camps, sight and counts. */
function withChange(world: CampWorld, change: CampChange): CampWorld {
  return {
    ...world,
    lab: { ...world.lab, counts: change.inventory },
    camps: change.camps,
    seen: change.seen,
    nextCampId: change.nextCampId,
  };
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

/** A bare surface for a cube: no grass, trees, animals or clay. Hand-made test worlds start with it. */
export function bareSurface(state: GameState): Surface {
  const squares = state.size.x * state.size.y;
  return {
    features: new Array<0>(squares).fill(0),
    apples: new Array<number>(squares).fill(0),
    regrowAt: new Array<number>(squares).fill(-1),
    clay: new Set<number>(),
    animals: [],
    nextAnimalId: 1,
    nextSpawnAt: Infinity,
    rng: 1,
    time: 0,
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
  const camps: Camp[] = [{ id: 1, x, y, level: 1 }];
  const { width, height } = lab.depths;
  const seen = seenWith(new Array<boolean>(width * height).fill(false), camps, width, height);
  return { lab, camps, seen, nextCampId: 2, surface };
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
 * What the surface inside a ring of `radius` around (x, y) gives when all
 * of it is taken, leaving out the 3 x 3 a camp would stand on: wood from
 * trees and apple trees, grass from tufts. For choosing the first camp.
 */
function surfaceGains(
  surface: Surface,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): Map<string, number> {
  let trees = 0;
  let tufts = 0;
  for (let sy = Math.max(0, y - radius); sy <= Math.min(height - 1, y + radius); sy += 1) {
    for (let sx = Math.max(0, x - radius); sx <= Math.min(width - 1, x + radius); sx += 1) {
      if (!inCircle(x, y, radius, sx, sy) || inFootprint(x, y, sx, sy)) {
        continue;
      }
      const feature = surface.features[sx + width * sy];
      if (feature === TREE || feature === APPLE_TREE) trees += 1;
      if (feature === GRASS) tufts += 1;
    }
  }
  return new Map([
    ['wood', trees * LAB_SURFACE.woodPerTree],
    ['grass', tufts * LAB_SURFACE.grassPerTuft],
  ]);
}

/**
 * Where the free first camp goes: among the 3 x 3 patches centred within
 * `LAB_START_REACH` squares of the middle of the map, first those whose
 * ring holds enough wood and grass for a new camp (issue #121), then the one
 * with the most dirt on top (open ground), then the nearest the middle. A
 * new world is level everywhere, so every patch is level. Ties go to the
 * patch met first, row by row, so the choice is the same every time.
 */
export function startSquare(state: GameState, surface?: Surface): { x: number; y: number } {
  const midX = (state.size.x - 1) / 2;
  const midY = (state.size.y - 1) / 2;
  const h = CAMP_HALF_SIZE;
  const radius = campRadius(1);
  let best = { x: Math.floor(midX), y: Math.floor(midY) };
  let bestPays = -1;
  let bestDirt = -1;
  let bestDistance = Infinity;
  for (let y = h; y < state.size.y - h; y += 1) {
    for (let x = h; x < state.size.x - h; x += 1) {
      const distance = (x - midX) ** 2 + (y - midY) ** 2;
      if (distance > LAB_START_REACH ** 2) {
        continue; // only patches near the middle
      }
      const pays =
        surface === undefined ||
        canAfford(
          surfaceGains(surface, state.size.x, state.size.y, x, y, radius),
          LAB_NEW_CAMP_COST,
        )
          ? 1
          : 0;
      const dirt = footprintOf(x, y).filter(
        (s) => topBlockAt(state, s.x, s.y) === BLOCKS.dirt.code,
      ).length;
      // Better means: pays for a camp; then more dirt; then nearer the middle.
      const better =
        pays > bestPays ||
        (pays === bestPays && (dirt > bestDirt || (dirt === bestDirt && distance < bestDistance)));
      if (better) {
        best = { x, y };
        bestPays = pays;
        bestDirt = dirt;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**

/**
 * A new Lab 2 world on `seed`: the game's cube (no coal at the surface,
 * question 140; no timber-root, `createFrontier`), its surface (grass, trees,
 * apple trees, animals, clay), and one free level-1 camp near the middle on
 * a patch whose ring pays for the next camp.
 */
export function newCampWorld(seed: number): CampWorld {
  // The world is the engine's (plans A1 and A3): its cube, with clay as real
  // blocks, and its first camp.
  const frontier = createFrontier(seed);
  const lab = labWorldFromState(seed, frontier.cube);
  const start = frontier.camps[0] ?? { x: 0, y: 0 }; // a new world always has its first camp
  // Lab 2's surface keeps its clock (animals' step times, apples regrowing)
  // until shifts come (A4), so it is drawn here as before: on the same cube
  // and seed, in the same order, it has the engine's plants and animals
  // (tests/app/frontierMatchesLab.test.ts). Clay is in the cube now, so its
  // own clay set is left empty.
  const ring: { x: number; y: number }[] = [];
  const r = campRadius(1);
  for (let y = start.y - r; y <= start.y + r; y += 1) {
    for (let x = start.x - r; x <= start.x + r; x += 1) {
      if (inCircle(start.x, start.y, r, x, y)) ring.push({ x, y });
    }
  }
  const drawn = generateSurface(lab.state, seed, footprintOf(start.x, start.y), ring);
  return campWorldFromLab(lab, start.x, start.y, { ...drawn, clay: new Set<number>() });
}

/** The world at lab time `now` (milliseconds): animals have moved, apples have regrown. */
export function advanceWorld(world: CampWorld, now: number): CampWorld {
  const surface = advanceSurface(world.surface, world.lab.state, now);
  return surface === world.surface ? world : { ...world, surface };
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
 *   cannot mine its top block (`needs` says which level can).
 */
export type CampTapKind = 'mined' | 'harvested' | 'fog' | 'greyed' | 'camp' | 'tooHard' | 'refused';

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
 * Tap square (x, y). It is mined only if a camp covers it, no camp stands on
 * it, the level rule allows it, and a covering camp's level can mine its top
 * block (checked in that order). In every other case the very same world
 * comes back.
 */
export function campTap(world: CampWorld, x: number, y: number): CampTap {
  // The rules are the engine's (plan A3): `frontierTap` on the fields of
  // this world. What follows only turns its answer back into Lab 2's world.
  const tap = frontierTap(frontierView(world), x, y);
  const answer = (kind: CampTapKind): CampTap => ({
    kind,
    world,
    tap: null,
    needs: tap.needs,
    harvest: null,
  });
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
  if (tap.kind === 'harvested') {
    return harvested(world, tap, x, y);
  }
  if (tap.kind === 'mined') {
    // Only the mined square's depth changed, and by exactly 1 (a cavern
    // under it collapses to rubble, so it never drops further).
    const depths = { ...world.lab.depths, depths: [...world.lab.depths.depths] };
    const i = x + depths.width * y;
    depths.depths[i] = (depths.depths[i] ?? 0) + 1;
    const lab: LabWorld = {
      seed: world.lab.seed,
      state: tap.state.cube,
      depths,
      counts: tap.state.inventory,
      mined: tap.state.mined,
    };
    const result = {
      state: tap.state.cube,
      mined: true,
      block: tap.block,
      yields: tap.gain,
      refusal: null,
      higherNeighbours: [],
    };
    return { ...answer('mined'), world: { ...world, lab }, tap: { world: lab, result } };
  }
  return answer(tap.kind); // 'fog', 'greyed', 'camp' or 'tooHard': nothing changes
}

/**
 * The fields of a Lab 2 world as an engine state, for `frontierTap`. Lab 2's
 * animals also carry their step times; the engine ignores them.
 */
function frontierView(world: CampWorld): FrontierState {
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
  };
}

/**
 * The engine took something from the surface of (x, y): Lab 2's world with
 * its counts and surface after it. Lab 2's clock is kept here until shifts
 * come (A4): an apple tree picked bare regrows its apples after a while,
 * and a felled tree regrows nothing.
 */
function harvested(world: CampWorld, tap: FrontierTap, x: number, y: number): CampTap {
  const i = x + world.lab.state.size.x * y;
  const kind = tap.harvest ?? 'grass'; // `harvest` is set for every 'harvested' tap
  const regrowAt = [...world.surface.regrowAt];
  if (kind === 'apple' && (tap.state.apples[i] ?? 0) === 0) {
    regrowAt[i] = world.surface.time + LAB_SURFACE.appleRegrowMs;
  } else if (kind === 'felled') {
    regrowAt[i] = -1;
  }
  const kept = new Set(tap.state.animals.map((a) => a.id));
  const surface: Surface = {
    ...world.surface,
    features: tap.state.features,
    apples: tap.state.apples,
    regrowAt,
    animals: world.surface.animals.filter((a) => kept.has(a.id)),
  };
  const gain = tap.gain[0] ?? { item: 'grass', count: 0 };
  return {
    kind: 'harvested',
    world: { ...world, lab: { ...world.lab, counts: tap.state.inventory }, surface },
    tap: null,
    needs: null,
    harvest: { surface, gain, kind },
  };
}

// ----- New camps, upgrades and demolishing (the engine's rules) -----

/** Why a new camp cannot be centred on (x, y), or `null` if it can. */
export function placeRefusal(world: CampWorld, x: number, y: number): PlaceRefusal | null {
  return enginePlaceRefusal(ground(world), x, y);
}

/**
 * The squares a new level-1 camp on (x, y) would bring out of fog or out of
 * grey: the part of its circle that no camp covers now. Row by row, as indexes.
 */
export function newlyCovered(world: CampWorld, x: number, y: number): number[] {
  return engineNewlyCovered(ground(world), x, y);
}

/**
 * Place a new level-1 camp on (x, y) and pay its cost. If `placeRefusal`
 * says no, the very same world comes back.
 */
export function placeCamp(world: CampWorld, x: number, y: number): CampWorld {
  const change = enginePlaceCamp(ground(world), x, y);
  if (change.camps === world.camps) {
    return world; // refused
  }
  const placed = withChange(world, change);
  // The camp is built over whatever grew on its 3 x 3: that is cleared, and gives nothing.
  const width = world.lab.state.size.x;
  return { ...placed, surface: clearFeatures(world.surface, width, footprintOf(x, y)) };
}

/** Why camp `id` cannot be upgraded ('missing', 'top' level, or 'cost'), or `null` if it can. */
export function upgradeRefusal(world: CampWorld, id: number): 'missing' | 'top' | 'cost' | null {
  return engineUpgradeRefusal(ground(world), id);
}

/** Upgrade camp `id` one level and pay for it. If `upgradeRefusal` says no, the same world comes back. */
export function upgradeCamp(world: CampWorld, id: number): CampWorld {
  const change = engineUpgradeCamp(ground(world), id);
  return change.camps === world.camps ? world : withChange(world, change);
}

/** Why camp `id` cannot be demolished ('missing' or 'notCovered'), or `null` if it can. */
export function demolishRefusal(world: CampWorld, id: number): 'missing' | 'notCovered' | null {
  return engineDemolishRefusal(ground(world), id);
}

/**
 * Demolish camp `id`: it goes, and gives nothing back. If `demolishRefusal`
 * says no, the very same world comes back.
 */
export function demolishCamp(world: CampWorld, id: number): CampWorld {
  const change = engineDemolishCamp(ground(world), id);
  return change.camps === world.camps ? world : withChange(world, change);
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
  // Let the lab clock run to `until` milliseconds: animals move, apples regrow.
  | { kind: 'wait'; until: number };

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
  if (step.kind === 'wait') {
    return advanceWorld(world, step.until);
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
