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
import type { BlockId, ItemStack } from '../../data';
import { depthAt, depthIn, mayMine, topBlockAt } from '../../engine';
import type { GameState } from '../../engine';
import { labTap, labWorldFromState, newLabWorld } from './labWorld';
import type { LabTap, LabWorld } from './labWorld';
import {
  APPLE_TREE,
  GRASS,
  TREE,
  advanceSurface,
  clearFeatures,
  generateSurface,
  harvest,
  isClay,
} from './surface';
import type { Harvest, Surface } from './surface';

export interface Camp {
  /** A number that names the camp; new camps get the next one. */
  id: number;
  x: number;
  y: number;
  /** 1 is the lowest level. */
  level: number;
}

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

/** What one square looks like to the player. */
export type Sight = 'shown' | 'greyed' | 'fog';

// ----- Levels -----

/** The highest camp level in the data. */
export const MAX_CAMP_LEVEL = LAB_CAMP_LEVELS.length;

/** The data for camp level `level` (1 is the first). Throws for a level the data does not have. */
function levelData(level: number): (typeof LAB_CAMP_LEVELS)[number] {
  const data = LAB_CAMP_LEVELS[level - 1];
  if (data === undefined) {
    throw new Error(`no camp level ${level} in the data`);
  }
  return data;
}

/** How far a camp of `level` sees, in squares. */
export function campRadius(level: number): number {
  return levelData(level).radius;
}

/** The block kinds a camp of `level` can mine: its own level's list and every level's below it. */
export function blocksMinedAt(level: number): BlockId[] {
  const blocks: BlockId[] = [];
  for (let l = 1; l <= level; l += 1) {
    blocks.push(...levelData(l).addsBlocks);
  }
  return blocks;
}

/**
 * The lowest camp level that can mine a block (by its code), or `null` if
 * no level can (bedrock, sealed rock, open space).
 */
export function levelNeededFor(code: number): number | null {
  for (let level = 1; level <= MAX_CAMP_LEVEL; level += 1) {
    for (const id of levelData(level).addsBlocks) {
      if (BLOCKS[id].code === code) {
        return level;
      }
    }
  }
  return null;
}

/** What upgrading a camp of `level` to the next level costs, or `null` at the top level. */
export function upgradeCostFrom(level: number): ItemStack[] | null {
  if (level >= MAX_CAMP_LEVEL) {
    return null;
  }
  return levelData(level + 1).upgradeCost;
}

// ----- Circles and sight -----

/**
 * True if square (x, y) is inside a circle of `radius` around (cx, cy).
 *
 * `r * r + r` rather than `r * r` rounds the circle out a little (it is the
 * circle of radius about r + 0.5), so its edge has no lone squares sticking
 * out at the four points. A radius of 3 covers 37 squares (7 across).
 */
export function inCircle(cx: number, cy: number, radius: number, x: number, y: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius + radius;
}

/** The size of the map, in squares. */
function mapSize(world: CampWorld): { width: number; height: number } {
  return { width: world.lab.depths.width, height: world.lab.depths.height };
}

/**
 * The best level among the camps whose circle covers each square, row by row
 * (index x + width * y); 0 where no camp covers it.
 */
export function coverLevels(camps: Camp[], width: number, height: number): number[] {
  const levels = new Array<number>(width * height).fill(0);
  for (const camp of camps) {
    const r = campRadius(camp.level);
    for (let y = Math.max(0, camp.y - r); y <= Math.min(height - 1, camp.y + r); y += 1) {
      for (let x = Math.max(0, camp.x - r); x <= Math.min(width - 1, camp.x + r); x += 1) {
        const i = x + width * y;
        if (inCircle(camp.x, camp.y, r, x, y) && camp.level > (levels[i] ?? 0)) {
          levels[i] = camp.level;
        }
      }
    }
  }
  return levels;
}

/** The best level of the camps covering square (x, y); 0 if none covers it. */
export function coverLevelAt(world: CampWorld, x: number, y: number): number {
  let best = 0;
  for (const camp of world.camps) {
    if (camp.level > best && inCircle(camp.x, camp.y, campRadius(camp.level), x, y)) {
      best = camp.level;
    }
  }
  return best;
}

/** How square (x, y) looks: shown inside a circle, greyed if it was once, fog if never. */
export function sightAt(world: CampWorld, x: number, y: number): Sight {
  if (coverLevelAt(world, x, y) > 0) {
    return 'shown';
  }
  return world.seen[x + mapSize(world).width * y] === true ? 'greyed' : 'fog';
}

/** Every square's sight, row by row, worked out in one pass (for drawing). */
export function sightMap(world: CampWorld): Sight[] {
  const { width, height } = mapSize(world);
  const levels = coverLevels(world.camps, width, height);
  return levels.map((level, i) => {
    if (level > 0) {
      return 'shown';
    }
    return world.seen[i] === true ? 'greyed' : 'fog';
  });
}

/** `seen` with every square inside the camps' circles added. */
function seenWith(seen: boolean[], camps: Camp[], width: number, height: number): boolean[] {
  const levels = coverLevels(camps, width, height);
  return seen.map((was, i) => was || (levels[i] ?? 0) > 0);
}

/** How far a camp's footprint reaches from its centre square: 1, so a camp covers 3 x 3 squares. */
export const CAMP_HALF_SIZE = 1;

/** The squares of a camp centred on (x, y): its 3 x 3 footprint, row by row. */
export function footprintOf(x: number, y: number): { x: number; y: number }[] {
  const squares: { x: number; y: number }[] = [];
  for (let dy = -CAMP_HALF_SIZE; dy <= CAMP_HALF_SIZE; dy += 1) {
    for (let dx = -CAMP_HALF_SIZE; dx <= CAMP_HALF_SIZE; dx += 1) {
      squares.push({ x: x + dx, y: y + dy });
    }
  }
  return squares;
}

/** True if square (x, y) is part of the footprint of the camp centred on (cx, cy). */
function inFootprint(cx: number, cy: number, x: number, y: number): boolean {
  return Math.abs(x - cx) <= CAMP_HALF_SIZE && Math.abs(y - cy) <= CAMP_HALF_SIZE;
}

/** The camp whose 3 x 3 footprint holds square (x, y), or `null`. */
export function campAt(world: CampWorld, x: number, y: number): Camp | null {
  return world.camps.find((camp) => inFootprint(camp.x, camp.y, x, y)) ?? null;
}

/**
 * True if the 3 x 3 footprint centred on (x, y) is on the map and all nine
 * squares are at the same depth: level ground, as a camp needs.
 */
export function isLevelPatch(lab: LabWorld, x: number, y: number): boolean {
  const { width, height } = lab.depths;
  const depth = depthIn(lab.depths, x, y);
  return footprintOf(x, y).every(
    (s) =>
      s.x >= 0 &&
      s.y >= 0 &&
      s.x < width &&
      s.y < height &&
      depthIn(lab.depths, s.x, s.y) === depth,
  );
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
 * Lab 2's own cube, made from the game's (Lab 2 only: the cube is copied, so
 * the game's own generation, and Lab 1, are not changed): no timber-root
 * anywhere (owner: "Let's get rid of the roots square"). Every timber-root
 * cell, in any layer, is `LAB_SURFACE.timberRootBecomes` (dirt) instead. In
 * Lab 2, wood comes from trees ("Wood is timber").
 *
 * (Lab 2 used to turn surface coal into stone here too. The game's own
 * generation now does that, question 140, so Lab 2 no longer needs to.)
 */
export function labCube(lab: LabWorld): LabWorld {
  const state = lab.state;
  const root = BLOCKS.timberRoot.code;
  const rootBecomes = BLOCKS[LAB_SURFACE.timberRootBecomes].code;
  // `slice()` copies the typed array, like `list[:]` in Python.
  const blocks = state.blocks.slice();
  for (let i = 0; i < blocks.length; i += 1) {
    if (blocks[i] === root) {
      blocks[i] = rootBecomes;
    }
  }
  return labWorldFromState(lab.seed, { ...state, blocks });
}

/**
 * A new Lab 2 world on `seed`: the game's cube (no coal at the surface,
 * question 140; no timber-root in Lab 2, `labCube`), its surface (grass, trees,
 * apple trees, animals, clay), and one free level-1 camp near the middle on
 * a patch whose ring pays for the next camp.
 */
export function newCampWorld(seed: number): CampWorld {
  const lab = labCube(newLabWorld(seed));
  const start = startSquare(lab.state, generateSurface(lab.state, seed));
  // Generate again, keeping the camp's 3 x 3 clear of features and animals,
  // and starting the first animal inside the camp's ring.
  const ring: { x: number; y: number }[] = [];
  const r = campRadius(1);
  for (let y = start.y - r; y <= start.y + r; y += 1) {
    for (let x = start.x - r; x <= start.x + r; x += 1) {
      if (inCircle(start.x, start.y, r, x, y)) ring.push({ x, y });
    }
  }
  const surface = generateSurface(lab.state, seed, footprintOf(start.x, start.y), ring);
  return campWorldFromLab(lab, start.x, start.y, surface);
}

/** The world at lab time `now` (milliseconds): animals have moved, apples have regrown. */
export function advanceWorld(world: CampWorld, now: number): CampWorld {
  const surface = advanceSurface(world.surface, world.lab.state, now);
  return surface === world.surface ? world : { ...world, surface };
}

// ----- Costs -----

/** True if `counts` holds at least every stack of `cost`. */
export function canAfford(counts: Map<string, number>, cost: ItemStack[]): boolean {
  return cost.every((stack) => (counts.get(stack.item) ?? 0) >= stack.count);
}

/** `counts` with `cost` taken away. Only call it when `canAfford` is true. */
function pay(counts: Map<string, number>, cost: ItemStack[]): Map<string, number> {
  const left = new Map(counts);
  for (const stack of cost) {
    const now = (left.get(stack.item) ?? 0) - stack.count;
    if (now > 0) {
      left.set(stack.item, now);
    } else {
      left.delete(stack.item); // the counts hold only items with a count above 0
    }
  }
  return left;
}

/** `world.lab` with different counts. */
function withCounts(lab: LabWorld, counts: Map<string, number>): LabWorld {
  return { ...lab, counts };
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
  const unchanged = (kind: CampTapKind, needs: number | null = null): CampTap => ({
    kind,
    world,
    tap: null,
    needs,
    harvest: null,
  });
  const sight = sightAt(world, x, y);
  if (sight !== 'shown') {
    return unchanged(sight);
  }
  // An animal is caught wherever it stands, even on a camp's ground.
  const caught = harvest(world.surface, world.lab.state, x, y);
  if (caught !== null && caught.kind === 'caught') {
    return harvested(world, caught);
  }
  if (campAt(world, x, y) !== null) {
    return unchanged('camp');
  }
  // Grass, a tree or an apple tree must be taken before the block under it can be mined.
  if (caught !== null) {
    return harvested(world, caught);
  }
  // The level rule is checked before the hardness gate: a block that is too
  // steep to mine says so, rather than promising that an upgrade would let
  // it be mined (review of PR #119).
  const check = mayMine(world.lab.state, x, y);
  if (!check.allowed) {
    const refusal = {
      world: world.lab,
      result: {
        state: world.lab.state,
        mined: false,
        block: null,
        yields: [],
        refusal: check.refusal ?? 'bottom', // `refusal` is only null when `allowed` is true
        higherNeighbours: check.higherNeighbours,
      },
    };
    return { kind: 'refused', world, tap: refusal, needs: null, harvest: null };
  }
  // A clay cell (a lab-only block) is as soft as dirt: any camp can mine it.
  const z = depthAt(world.lab.state, x, y);
  const clay = isClay(world.surface, world.lab.state, x, y, z);
  const code = topBlockAt(world.lab.state, x, y);
  const needs = clay ? 1 : levelNeededFor(code);
  if (needs === null || needs > coverLevelAt(world, x, y)) {
    return unchanged('tooHard', needs);
  }
  const tap = labTap(world.lab, x, y);
  if (!tap.result.mined) {
    return { kind: 'refused', world, tap, needs: null, harvest: null };
  }
  const mined = clay ? asClay(world.lab, tap) : tap;
  return {
    kind: 'mined',
    world: { ...world, lab: mined.world },
    tap: mined,
    needs: null,
    harvest: null,
  };
}

/** A tap that took something from the surface: its gain is added to the counts. */
function harvested(world: CampWorld, taken: Harvest): CampTap {
  const counts = new Map(world.lab.counts);
  counts.set(taken.gain.item, (counts.get(taken.gain.item) ?? 0) + taken.gain.count);
  return {
    kind: 'harvested',
    world: { ...world, lab: { ...world.lab, counts }, surface: taken.surface },
    tap: null,
    needs: null,
    harvest: taken,
  };
}

/**
 * Lab 1's tap on a clay cell, with clay in place of what the cube's block
 * gave (the cube still holds the game's block there: clay lives only in the
 * lab's surface, so the game's data is unchanged).
 */
function asClay(before: LabWorld, tap: LabTap): LabTap {
  const clay = { item: 'clay', count: LAB_SURFACE.clayPerBlock };
  const counts = new Map(before.counts);
  counts.set(clay.item, (counts.get(clay.item) ?? 0) + clay.count);
  return {
    world: { ...tap.world, counts },
    result: { ...tap.result, yields: [clay] },
  };
}

// ----- New camps -----

/**
 * Why a camp cannot be centred on a square:
 * - 'notShown': some square of its 3 x 3 footprint is off the map or not lit by a camp;
 * - 'occupied': its footprint overlaps another camp's;
 * - 'notLevel': the nine squares are not all at the same depth;
 * - 'cost': the counts do not cover the cost.
 */
export type PlaceRefusal = 'notShown' | 'occupied' | 'notLevel' | 'cost';

/** Why a new camp cannot be centred on (x, y), or `null` if it can. */
export function placeRefusal(world: CampWorld, x: number, y: number): PlaceRefusal | null {
  const { width, height } = mapSize(world);
  const footprint = footprintOf(x, y);
  for (const s of footprint) {
    if (
      s.x < 0 ||
      s.y < 0 ||
      s.x >= width ||
      s.y >= height ||
      sightAt(world, s.x, s.y) !== 'shown'
    ) {
      return 'notShown';
    }
  }
  if (footprint.some((s) => campAt(world, s.x, s.y) !== null)) {
    return 'occupied';
  }
  if (!isLevelPatch(world.lab, x, y)) {
    return 'notLevel';
  }
  if (!canAfford(world.lab.counts, LAB_NEW_CAMP_COST)) {
    return 'cost';
  }
  return null;
}

/**
 * The squares a new level-1 camp on (x, y) would bring out of fog or out of
 * grey: the part of its circle that no camp covers now. Row by row, as indexes.
 */
export function newlyCovered(world: CampWorld, x: number, y: number): number[] {
  const { width, height } = mapSize(world);
  const now = coverLevels(world.camps, width, height);
  const after = coverLevels([{ id: 0, x, y, level: 1 }], width, height);
  const fresh: number[] = [];
  for (let i = 0; i < after.length; i += 1) {
    if ((after[i] ?? 0) > 0 && (now[i] ?? 0) === 0) {
      fresh.push(i);
    }
  }
  return fresh;
}

/**
 * Place a new level-1 camp on (x, y) and pay its cost. If `placeRefusal`
 * says no, the very same world comes back.
 */
export function placeCamp(world: CampWorld, x: number, y: number): CampWorld {
  if (placeRefusal(world, x, y) !== null) {
    return world;
  }
  const camps = [...world.camps, { id: world.nextCampId, x, y, level: 1 }];
  const { width, height } = mapSize(world);
  return {
    lab: withCounts(world.lab, pay(world.lab.counts, LAB_NEW_CAMP_COST)),
    camps,
    seen: seenWith(world.seen, camps, width, height),
    nextCampId: world.nextCampId + 1,
    // The camp is built over whatever grew on its 3 x 3: that is cleared, and gives nothing.
    surface: clearFeatures(world.surface, width, footprintOf(x, y)),
  };
}

// ----- Upgrades and demolishing -----

/** Why camp `id` cannot be upgraded ('missing', 'top' level, or 'cost'), or `null` if it can. */
export function upgradeRefusal(world: CampWorld, id: number): 'missing' | 'top' | 'cost' | null {
  const camp = world.camps.find((c) => c.id === id);
  if (camp === undefined) {
    return 'missing';
  }
  const cost = upgradeCostFrom(camp.level);
  if (cost === null) {
    return 'top';
  }
  return canAfford(world.lab.counts, cost) ? null : 'cost';
}

/** Upgrade camp `id` one level and pay for it. If `upgradeRefusal` says no, the same world comes back. */
export function upgradeCamp(world: CampWorld, id: number): CampWorld {
  const camp = world.camps.find((c) => c.id === id);
  const cost = camp === undefined ? null : upgradeCostFrom(camp.level);
  if (camp === undefined || cost === null || upgradeRefusal(world, id) !== null) {
    return world;
  }
  const camps = world.camps.map((c) => (c.id === id ? { ...c, level: c.level + 1 } : c));
  const { width, height } = mapSize(world);
  return {
    lab: withCounts(world.lab, pay(world.lab.counts, cost)),
    camps,
    seen: seenWith(world.seen, camps, width, height),
    nextCampId: world.nextCampId,
    surface: world.surface,
  };
}

/**
 * Why camp `id` cannot be demolished, or `null` if it can:
 * - 'missing': there is no such camp;
 * - 'notCovered': some square of its footprint is not inside another camp's ring
 *   (owner, question 134: "your area would need to be covered by a second camp first").
 */
export function demolishRefusal(world: CampWorld, id: number): 'missing' | 'notCovered' | null {
  const camp = world.camps.find((c) => c.id === id);
  if (camp === undefined) {
    return 'missing';
  }
  const others = world.camps.filter((c) => c.id !== id);
  const covered = footprintOf(camp.x, camp.y).every((s) =>
    others.some((o) => inCircle(o.x, o.y, campRadius(o.level), s.x, s.y)),
  );
  return covered ? null : 'notCovered';
}

/**
 * Demolish camp `id`: it goes, and gives nothing back. Its footprint, which
 * other camps cover, can then be mined; what only it lit turns grey. If
 * `demolishRefusal` says no, the very same world comes back.
 */
export function demolishCamp(world: CampWorld, id: number): CampWorld {
  if (demolishRefusal(world, id) !== null) {
    return world;
  }
  return { ...world, camps: world.camps.filter((c) => c.id !== id) };
}

/** The display names of the block kinds that level `level` adds to the level below it. */
export function addedNamesAt(level: number): string[] {
  return levelData(level).addsBlocks.map((id) => blockDefByCode(BLOCKS[id].code).name);
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
