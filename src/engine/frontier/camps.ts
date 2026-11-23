// Camps and the fog of war in the new game (plan A2,
// docs/plans/lab2-becomes-the-game.md). These are Lab 2's camp rules
// (src/app/lab/campWorld.ts until now), moved into the engine:
//
// - every camp lights a circle of squares around it (its radius, from its level);
// - a square inside some camp's circle is shown and may be mined, if one of
//   the camps covering it has a level that can mine the square's top block;
// - a square that was inside a circle once but is not any more is greyed,
//   and cannot be mined; a square never inside one is fog;
// - a camp stands on a 3 x 3 patch of level ground, which cannot be mined;
// - a new camp costs items and goes on a level 3 x 3 inside the circles;
// - a camp can be demolished once other camps' circles cover its 3 x 3;
// - upgrading a camp costs items and widens its circle and what it mines.
//
// Every number (radii, costs, which level mines which block) is in
// src/data/frontier.ts. Nothing here changes what it is given: every change
// returns a new record, as the rest of the engine does.

import { BLOCKS } from '../../data';
import type { BlockId, ItemStack } from '../../data';
import { FRONTIER_CAMP_LEVELS, FRONTIER_NEW_CAMP_COST, FRONTIER_SHIFT } from '../../data/frontier';
import { depthAt } from '../heightmap';
import type { GameState } from '../state';
import { APPLE_TREE, NO_FEATURE, TREE } from './state';
import type { FrontierCamp, FrontierState } from './state';

/**
 * What the camp rules read and change. `FrontierState` has all of these
 * fields, so a whole state can be passed; Lab 2 passes the same fields from
 * its own world until its screen moves onto `FrontierState` (A3).
 */
export interface CampGround {
  /** The cube: only its blocks are read (how deep each square is). */
  cube: GameState;
  camps: FrontierCamp[];
  /** Every square a camp has ever lit, row by row (index x + width * y). */
  seen: boolean[];
  /** The id the next camp will get. */
  nextCampId: number;
  /** Items held: item id -> count. Only items with a count above 0 are in it. */
  inventory: Map<string, number>;
}

/** What one square looks like to the player. */
export type Sight = 'shown' | 'greyed' | 'fog';

// ----- Levels -----

/** The highest camp level in the data. */
export const MAX_CAMP_LEVEL = FRONTIER_CAMP_LEVELS.length;

/** The data for camp level `level` (1 is the first). Throws for a level the data does not have. */
function levelData(level: number): (typeof FRONTIER_CAMP_LEVELS)[number] {
  const data = FRONTIER_CAMP_LEVELS[level - 1];
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

/**
 * The best level among the camps whose circle covers each square, row by row
 * (index x + width * y); 0 where no camp covers it.
 */
export function coverLevels(camps: FrontierCamp[], width: number, height: number): number[] {
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

/** The best level of `camps` covering square (x, y); 0 if none covers it. */
export function coverLevelAt(camps: FrontierCamp[], x: number, y: number): number {
  let best = 0;
  for (const camp of camps) {
    if (camp.level > best && inCircle(camp.x, camp.y, campRadius(camp.level), x, y)) {
      best = camp.level;
    }
  }
  return best;
}

/** How square (x, y) looks: shown inside a circle, greyed if it was once, fog if never. */
export function sightAt(ground: CampGround, x: number, y: number): Sight {
  if (coverLevelAt(ground.camps, x, y) > 0) {
    return 'shown';
  }
  return ground.seen[x + ground.cube.size.x * y] === true ? 'greyed' : 'fog';
}

/** Every square's sight, row by row, worked out in one pass (for drawing). */
export function sightMap(ground: CampGround): Sight[] {
  const levels = coverLevels(ground.camps, ground.cube.size.x, ground.cube.size.y);
  return levels.map((level, i) => {
    if (level > 0) {
      return 'shown';
    }
    return ground.seen[i] === true ? 'greyed' : 'fog';
  });
}

/** `seen` with every square inside the camps' circles added. */
export function seenWith(
  seen: boolean[],
  camps: FrontierCamp[],
  width: number,
  height: number,
): boolean[] {
  const levels = coverLevels(camps, width, height);
  return seen.map((was, i) => was || (levels[i] ?? 0) > 0);
}

// ----- Footprints -----

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
export function inFootprint(cx: number, cy: number, x: number, y: number): boolean {
  return Math.abs(x - cx) <= CAMP_HALF_SIZE && Math.abs(y - cy) <= CAMP_HALF_SIZE;
}

/** The camp whose 3 x 3 footprint holds square (x, y), or `null`. */
export function campAt(camps: FrontierCamp[], x: number, y: number): FrontierCamp | null {
  return camps.find((camp) => inFootprint(camp.x, camp.y, x, y)) ?? null;
}

/**
 * True if the 3 x 3 footprint centred on (x, y) is on the map and all nine
 * squares are at the same depth: level ground, as a camp needs.
 */
export function isLevelPatch(cube: GameState, x: number, y: number): boolean {
  const onMap = (sx: number, sy: number): boolean =>
    sx >= 0 && sy >= 0 && sx < cube.size.x && sy < cube.size.y;
  if (!onMap(x, y)) {
    return false;
  }
  const depth = depthAt(cube, x, y);
  return footprintOf(x, y).every((s) => onMap(s.x, s.y) && depthAt(cube, s.x, s.y) === depth);
}

// ----- Costs -----

/** True if `inventory` holds at least every stack of `cost`. */
export function canAfford(inventory: Map<string, number>, cost: ItemStack[]): boolean {
  return cost.every((stack) => (inventory.get(stack.item) ?? 0) >= stack.count);
}

/** `inventory` with `cost` taken away. Only call it when `canAfford` is true. */
export function pay(inventory: Map<string, number>, cost: ItemStack[]): Map<string, number> {
  const left = new Map(inventory);
  for (const stack of cost) {
    const now = (left.get(stack.item) ?? 0) - stack.count;
    if (now > 0) {
      left.set(stack.item, now);
    } else {
      left.delete(stack.item); // the inventory holds only items with a count above 0
    }
  }
  return left;
}

// ----- New camps -----

/**
 * Why a camp cannot be centred on a square:
 * - 'notShown': some square of its 3 x 3 footprint is off the map or not lit by a camp;
 * - 'occupied': its footprint overlaps another camp's;
 * - 'notLevel': the nine squares are not all at the same depth;
 * - 'cost': the inventory does not cover the cost.
 */
export type PlaceRefusal = 'notShown' | 'occupied' | 'notLevel' | 'cost';

/** Why a new camp cannot be centred on (x, y), or `null` if it can. */
export function placeRefusal(ground: CampGround, x: number, y: number): PlaceRefusal | null {
  const width = ground.cube.size.x;
  const height = ground.cube.size.y;
  const footprint = footprintOf(x, y);
  for (const s of footprint) {
    const onMap = s.x >= 0 && s.y >= 0 && s.x < width && s.y < height;
    if (!onMap || sightAt(ground, s.x, s.y) !== 'shown') {
      return 'notShown';
    }
  }
  if (footprint.some((s) => campAt(ground.camps, s.x, s.y) !== null)) {
    return 'occupied';
  }
  if (!isLevelPatch(ground.cube, x, y)) {
    return 'notLevel';
  }
  if (!canAfford(ground.inventory, FRONTIER_NEW_CAMP_COST)) {
    return 'cost';
  }
  return null;
}

/**
 * The squares a new level-1 camp on (x, y) would bring out of fog or out of
 * grey: the part of its circle that no camp covers now. Row by row, as indexes.
 */
export function newlyCovered(ground: CampGround, x: number, y: number): number[] {
  const width = ground.cube.size.x;
  const height = ground.cube.size.y;
  const now = coverLevels(ground.camps, width, height);
  const after = coverLevels([{ id: 0, x, y, level: 1, smelter: false }], width, height);
  const fresh: number[] = [];
  for (let i = 0; i < after.length; i += 1) {
    if ((after[i] ?? 0) > 0 && (now[i] ?? 0) === 0) {
      fresh.push(i);
    }
  }
  return fresh;
}

/** The camp fields after a change: what `placeCamp`, `upgradeCamp` and `demolishCamp` return. */
export interface CampChange {
  camps: FrontierCamp[];
  seen: boolean[];
  nextCampId: number;
  inventory: Map<string, number>;
}

/** The camp fields of `ground`, unchanged. */
function unchanged(ground: CampGround): CampChange {
  return {
    camps: ground.camps,
    seen: ground.seen,
    nextCampId: ground.nextCampId,
    inventory: ground.inventory,
  };
}

/**
 * Place a new level-1 camp on (x, y) and pay its cost. If `placeRefusal`
 * says no, the same fields come back. (What grows on its 3 x 3 is cleared
 * by `placeFrontierCamp`, which knows the surface.)
 */
export function placeCamp(ground: CampGround, x: number, y: number): CampChange {
  if (placeRefusal(ground, x, y) !== null) {
    return unchanged(ground);
  }
  const camps = [...ground.camps, { id: ground.nextCampId, x, y, level: 1, smelter: false }];
  return {
    camps,
    seen: seenWith(ground.seen, camps, ground.cube.size.x, ground.cube.size.y),
    nextCampId: ground.nextCampId + 1,
    inventory: pay(ground.inventory, FRONTIER_NEW_CAMP_COST),
  };
}

// ----- Upgrades and demolishing -----

/** Why camp `id` cannot be upgraded ('missing', 'top' level, or 'cost'), or `null` if it can. */
export function upgradeRefusal(ground: CampGround, id: number): 'missing' | 'top' | 'cost' | null {
  const camp = ground.camps.find((c) => c.id === id);
  if (camp === undefined) {
    return 'missing';
  }
  const cost = upgradeCostFrom(camp.level);
  if (cost === null) {
    return 'top';
  }
  return canAfford(ground.inventory, cost) ? null : 'cost';
}

/** Upgrade camp `id` one level and pay for it. If `upgradeRefusal` says no, the same fields come back. */
export function upgradeCamp(ground: CampGround, id: number): CampChange {
  const camp = ground.camps.find((c) => c.id === id);
  const cost = camp === undefined ? null : upgradeCostFrom(camp.level);
  if (camp === undefined || cost === null || upgradeRefusal(ground, id) !== null) {
    return unchanged(ground);
  }
  const camps = ground.camps.map((c) => (c.id === id ? { ...c, level: c.level + 1 } : c));
  return {
    camps,
    seen: seenWith(ground.seen, camps, ground.cube.size.x, ground.cube.size.y),
    nextCampId: ground.nextCampId,
    inventory: pay(ground.inventory, cost),
  };
}

/**
 * Why camp `id` cannot be demolished, or `null` if it can:
 * - 'missing': there is no such camp;
 * - 'notCovered': some square of its footprint is not inside another camp's ring
 *   (owner, question 134: "your area would need to be covered by a second camp first").
 */
export function demolishRefusal(ground: CampGround, id: number): 'missing' | 'notCovered' | null {
  const camp = ground.camps.find((c) => c.id === id);
  if (camp === undefined) {
    return 'missing';
  }
  const others = ground.camps.filter((c) => c.id !== id);
  const covered = footprintOf(camp.x, camp.y).every((s) =>
    others.some((o) => inCircle(o.x, o.y, campRadius(o.level), s.x, s.y)),
  );
  return covered ? null : 'notCovered';
}

/**
 * Demolish camp `id`: it goes, and gives nothing back. Its footprint, which
 * other camps cover, can then be mined; what only it lit turns grey. If
 * `demolishRefusal` says no, the same fields come back.
 */
export function demolishCamp(ground: CampGround, id: number): CampChange {
  if (demolishRefusal(ground, id) !== null) {
    return unchanged(ground);
  }
  return { ...unchanged(ground), camps: ground.camps.filter((c) => c.id !== id) };
}

// ----- On a whole state -----

/**
 * `placeCamp` on a whole state: the camp is built over whatever grew on its
 * 3 x 3, which is cleared and gives nothing. A tree there leaves a stump,
 * and a stump stays: it grows back once the camp is gone (owner: "Trees grow
 * back as long as you don't mine the ground directly under them"). A refused place returns the
 * very same state.
 */
export function placeFrontierCamp(state: FrontierState, x: number, y: number): FrontierState {
  const change = placeCamp(state, x, y);
  if (change.camps === state.camps) {
    return state; // refused
  }
  const features = [...state.features];
  const apples = [...state.apples];
  const regrowIn = [...state.regrowIn];
  const stumps = [...state.stumps];
  for (const s of footprintOf(x, y)) {
    const i = s.x + state.cube.size.x * s.y;
    const feature = features[i] ?? NO_FEATURE;
    if (feature === TREE || feature === APPLE_TREE) {
      // Cleared for the camp: it leaves a stump, as felling does.
      stumps[i] = feature;
      regrowIn[i] = FRONTIER_SHIFT.treeRegrowShifts;
    } else if ((stumps[i] ?? NO_FEATURE) === NO_FEATURE) {
      regrowIn[i] = -1;
    }
    features[i] = NO_FEATURE;
    apples[i] = 0;
  }
  return { ...state, ...change, features, apples, regrowIn, stumps };
}

/** `upgradeCamp` on a whole state. A refused upgrade returns the very same state. */
export function upgradeFrontierCamp(state: FrontierState, id: number): FrontierState {
  const change = upgradeCamp(state, id);
  return change.camps === state.camps ? state : { ...state, ...change };
}

/** `demolishCamp` on a whole state. A refused demolish returns the very same state. */
export function demolishFrontierCamp(state: FrontierState, id: number): FrontierState {
  const change = demolishCamp(state, id);
  return change.camps === state.camps ? state : { ...state, ...change };
}
