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
// - a new camp costs resources and goes on a square inside a circle;
// - upgrading a camp costs resources and widens its circle and what it mines.
//
// No DOM code here, so the unit tests run it in plain Node. Every number
// (radii, costs, which level mines which block) is in src/data/labCamps.ts.
// Like labWorld.ts, nothing here changes a world it is given: every change
// returns a new world.

import { BLOCKS, blockDefByCode } from '../../data';
import { LAB_CAMP_LEVELS, LAB_NEW_CAMP_COST } from '../../data/labCamps';
import type { BlockId, ItemStack } from '../../data';
import { mayMine, topBlockAt } from '../../engine';
import type { GameState } from '../../engine';
import { labTap, labWorldFromState, newLabWorld } from './labWorld';
import type { LabTap, LabWorld } from './labWorld';

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

/** The camp on square (x, y), or `null`. */
export function campAt(world: CampWorld, x: number, y: number): Camp | null {
  return world.camps.find((camp) => camp.x === x && camp.y === y) ?? null;
}

// ----- Making a world -----

/** A camp world on any cube, with one level-1 camp at (x, y). The tests pass a small hand-made cube. */
export function campWorldFromLab(lab: LabWorld, x: number, y: number): CampWorld {
  const camps: Camp[] = [{ id: 1, x, y, level: 1 }];
  const { width, height } = lab.depths;
  const seen = seenWith(new Array<boolean>(width * height).fill(false), camps, width, height);
  return { lab, camps, seen, nextCampId: 2 };
}

/** A camp world on a hand-made cube, with the first camp at (x, y). */
export function campWorldFromState(
  seed: number,
  state: GameState,
  x: number,
  y: number,
): CampWorld {
  return campWorldFromLab(labWorldFromState(seed, state), x, y);
}

/**
 * Where the free first camp goes: the dirt square nearest the middle of the
 * map (open ground). If there is no dirt on top anywhere, the middle itself.
 * Ties go to the square met first, row by row, so the choice is the same
 * every time.
 */
export function startSquare(state: GameState): { x: number; y: number } {
  const midX = (state.size.x - 1) / 2;
  const midY = (state.size.y - 1) / 2;
  let best = { x: Math.floor(midX), y: Math.floor(midY) };
  let bestDistance = Infinity;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      if (topBlockAt(state, x, y) !== BLOCKS.dirt.code) {
        continue;
      }
      const distance = (x - midX) ** 2 + (y - midY) ** 2;
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** A new Lab 2 world on `seed`: the game's cube, with one free level-1 camp near the middle. */
export function newCampWorld(seed: number): CampWorld {
  const lab = newLabWorld(seed);
  const start = startSquare(lab.state);
  return campWorldFromLab(lab, start.x, start.y);
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
 * - 'fog': the square is fog, so nothing happened;
 * - 'greyed': the square is outside every camp's circle now, so nothing happened;
 * - 'camp': the square holds a camp, which is never mined;
 * - 'refused': the level rule refused it (`tap.result.refusal` says why);
 * - 'tooHard': the level rule allows it, but the camps covering the square
 *   cannot mine its top block (`needs` says which level can).
 */
export type CampTapKind = 'mined' | 'fog' | 'greyed' | 'camp' | 'tooHard' | 'refused';

export interface CampTap {
  kind: CampTapKind;
  world: CampWorld;
  /** Lab 1's answer, for 'mined' and 'refused'; `null` otherwise. */
  tap: LabTap | null;
  /** For 'tooHard': the lowest camp level that could mine the block, or `null` if none can. */
  needs: number | null;
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
  });
  const sight = sightAt(world, x, y);
  if (sight !== 'shown') {
    return unchanged(sight);
  }
  if (campAt(world, x, y) !== null) {
    return unchanged('camp');
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
    return { kind: 'refused', world, tap: refusal, needs: null };
  }
  const code = topBlockAt(world.lab.state, x, y);
  const needs = levelNeededFor(code);
  if (needs === null || needs > coverLevelAt(world, x, y)) {
    return unchanged('tooHard', needs);
  }
  const tap = labTap(world.lab, x, y);
  if (!tap.result.mined) {
    return { kind: 'refused', world, tap, needs: null };
  }
  return { kind: 'mined', world: { ...world, lab: tap.world }, tap, needs: null };
}

// ----- New camps -----

/**
 * Why a camp cannot go on a square:
 * - 'notShown': the square is not inside any camp's circle;
 * - 'occupied': a camp already stands there;
 * - 'cost': the counts do not cover the cost.
 */
export type PlaceRefusal = 'notShown' | 'occupied' | 'cost';

/** Why a new camp cannot go on (x, y), or `null` if it can. */
export function placeRefusal(world: CampWorld, x: number, y: number): PlaceRefusal | null {
  if (sightAt(world, x, y) !== 'shown') {
    return 'notShown';
  }
  if (campAt(world, x, y) !== null) {
    return 'occupied';
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
  };
}

// ----- Upgrades and packing up -----

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
  };
}

/**
 * Pack up camp `id`: it goes, and gives nothing back. The squares only it
 * covered turn grey. The last camp cannot be packed up (the same world comes
 * back), or nothing could ever be mined again.
 */
export function packUpCamp(world: CampWorld, id: number): CampWorld {
  if (world.camps.length <= 1 || !world.camps.some((c) => c.id === id)) {
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
  | { kind: 'packUp'; id: number };

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
  return packUpCamp(world, step.id);
}

/** A new world on `seed` with `steps` applied in order. */
export function replayCampSteps(seed: number, steps: CampStep[]): CampWorld {
  let world = newCampWorld(seed);
  for (const step of steps) {
    world = applyCampStep(world, step);
  }
  return world;
}
