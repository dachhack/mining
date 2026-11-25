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
// - upgrading a camp costs items and widens its circle and what it mines;
// - a block no camp level mines is mined with a tool held in the store
//   (FRONTIER_TOOLS: the iron and steel drills), on any camp's lit ground;
// - a camp stands only in the top levels (FRONTIER_CAMP_PLACE.maxDepth).
//
// Every number (radii, costs, which level mines which block) is in
// src/data/frontier.ts. Nothing here changes what it is given: every change
// returns a new record, as the rest of the engine does.

import { BLOCKS } from '../../data';
import type { BlockId, ItemId, ItemStack } from '../../data';
import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_CAMP_PLACE,
  FRONTIER_DEEP_CAMP,
  FRONTIER_LANTERN,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_SHIFT,
  FRONTIER_TOOLS,
} from '../../data/frontier';
import { collapseSpaceUnder } from '../breach';
import { depthAt } from '../heightmap';
import { cloneState, setBlock, setGas, setLava, setWater } from '../state';
import type { GameState } from '../state';
import { APPLE_TREE, NO_FEATURE, TREE } from './state';
import type { FrontierAnimal, FrontierCamp, FrontierHazards, FrontierState } from './state';

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
  /**
   * The hazards' marks (docs/plans/hazards.md): a camp cannot stand on a
   * flooded square. A ground made without them (a hand-made test) has none.
   */
  hazards?: FrontierHazards;
  /** The saw houses (sawHouse.ts): a camp cannot stand on one. A ground made without them has none. */
  sawHouses?: { x: number; y: number }[];
  /**
   * The animals: a deep camp's foundation is not dug where one stands. A
   * ground made without them (a hand-made test) has none.
   */
  animals?: FrontierAnimal[];
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

/** How far a camp of `level` sees, in squares, without a lantern. */
export function campRadius(level: number): number {
  return levelData(level).radius;
}

/**
 * How far this camp sees, in squares: its level's radius, plus
 * FRONTIER_LANTERN.ringBonus if a lantern is hung there (owner, question 163).
 */
export function campRing(camp: FrontierCamp): number {
  // A deep camp's ring is its own (FRONTIER_DEEP_CAMP), not its level's.
  const ring = camp.deep ? FRONTIER_DEEP_CAMP.radius : campRadius(camp.level);
  return ring + (camp.lantern ? FRONTIER_LANTERN.ringBonus : 0);
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
    const r = campRing(camp);
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
    if (camp.level > best && inCircle(camp.x, camp.y, campRing(camp), x, y)) {
      best = camp.level;
    }
  }
  return best;
}

/**
 * The tool that mines a block (by its code): the first in FRONTIER_TOOLS
 * whose list has it, or `null` if no tool mines it (a camp level does, or
 * nothing does).
 */
export function toolNeededFor(code: number): ItemId | null {
  const tool = FRONTIER_TOOLS.find((t) => t.mines.some((id) => BLOCKS[id].code === code));
  return tool?.item ?? null;
}

/** True if `inventory` holds a tool that mines the block with this code. */
export function holdsToolFor(inventory: Map<string, number>, code: number): boolean {
  return FRONTIER_TOOLS.some(
    (t) => (inventory.get(t.item) ?? 0) > 0 && t.mines.some((id) => BLOCKS[id].code === code),
  );
}

/**
 * Whether the block with `code` can be mined on square (x, y) by the camps
 * and tools there, and if not, what it needs:
 * - a block some camp level mines needs a camp of that level covering the
 *   square (`needs`);
 * - a block a tool mines needs a camp covering the square, of any level,
 *   and that tool, or a better one, in the store (`needsTool`);
 * - any other block can never be mined (both `null`).
 */
export function frontierMineCheck(
  camps: FrontierCamp[],
  inventory: Map<string, number>,
  x: number,
  y: number,
  code: number,
): { ok: boolean; needs: number | null; needsTool: ItemId | null } {
  const level = coverLevelAt(camps, x, y);
  const needs = levelNeededFor(code);
  if (needs !== null) {
    return { ok: level >= needs, needs, needsTool: null };
  }
  const needsTool = toolNeededFor(code);
  if (needsTool !== null) {
    return { ok: level > 0 && holdsToolFor(inventory, code), needs: null, needsTool };
  }
  return { ok: false, needs: null, needsTool: null };
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
 * - 'occupied': its footprint overlaps another camp's, or a saw house;
 * - 'notLevel': the nine squares are not all at the same depth;
 * - 'tooDeep': they are deeper than FRONTIER_CAMP_PLACE.maxDepth (owner:
 *   camps only in the top three levels);
 * - 'tooShallow': a deep camp, on ground shallower than
 *   FRONTIER_DEEP_CAMP.minDepth (question 178);
 * - 'flooded': some square of it is flooded (water.ts);
 * - 'animal': a deep camp's foundation would dig a square an animal stands on;
 * - 'cost': the inventory does not cover the cost.
 */
export type PlaceRefusal =
  'notShown' | 'occupied' | 'notLevel' | 'tooDeep' | 'tooShallow' | 'flooded' | 'animal' | 'cost';

/**
 * Why a new camp cannot be centred on (x, y), or `null` if it can. With
 * `deep`, a deep camp (FRONTIER_DEEP_CAMP): deep ground only, and its own cost.
 */
export function placeRefusal(
  ground: CampGround,
  x: number,
  y: number,
  deep = false,
): PlaceRefusal | null {
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
  const saws = ground.sawHouses ?? [];
  if (footprint.some((s) => saws.some((h) => h.x === s.x && h.y === s.y))) {
    return 'occupied';
  }
  // A deep camp comes with a concrete foundation that levels its 3 x 3
  // (owner, on the hazards build): no flat ground needed (`layFoundation`).
  if (!deep && !isLevelPatch(ground.cube, x, y)) {
    return 'notLevel';
  }
  if (!deep && depthAt(ground.cube, x, y) > FRONTIER_CAMP_PLACE.maxDepth) {
    return 'tooDeep';
  }
  if (deep && foundationDepth(ground.cube, x, y) < FRONTIER_DEEP_CAMP.minDepth) {
    return 'tooShallow';
  }
  const flooded = ground.hazards?.flooded;
  if (flooded !== undefined && footprint.some((s) => flooded[s.x + width * s.y] === true)) {
    return 'flooded';
  }
  if (deep) {
    const level = foundationDepth(ground.cube, x, y);
    const dug = footprint.filter((s) => depthAt(ground.cube, s.x, s.y) < level);
    if (dug.some((s) => (ground.animals ?? []).some((a) => a.x === s.x && a.y === s.y))) {
      return 'animal';
    }
  }
  if (!canAfford(ground.inventory, deep ? FRONTIER_DEEP_CAMP.cost : FRONTIER_NEW_CAMP_COST)) {
    return 'cost';
  }
  return null;
}

/**
 * The depth a deep camp's concrete foundation levels its 3 x 3 centred on
 * (x, y) to: the deepest of its nine squares (owner, on the hazards build:
 * "The deep mine should come with a concrete foundation that levels any spot
 * you place it into 3by3"). The others are dug down to it. Squares off the
 * map count as depth 0 (placeRefusal refuses them anyway).
 */
export function foundationDepth(cube: GameState, x: number, y: number): number {
  let deepest = 0;
  for (const s of footprintOf(x, y)) {
    if (s.x < 0 || s.y < 0 || s.x >= cube.size.x || s.y >= cube.size.y) continue;
    deepest = Math.max(deepest, depthAt(cube, s.x, s.y));
  }
  return deepest;
}

/**
 * `cube` with the 3 x 3 centred on (x, y) dug down to `foundationDepth`: a
 * copy; `cube` is unchanged. The blocks dug give nothing (the builders take
 * them). A space opened under a dug block collapses to rubble, as under a
 * mine, and any water, lava or gas it held is gone. Also the squares that
 * were dug.
 */
export function layFoundation(
  cube: GameState,
  x: number,
  y: number,
): { cube: GameState; dug: { x: number; y: number }[] } {
  const level = foundationDepth(cube, x, y);
  const next = cloneState(cube);
  const dug: { x: number; y: number }[] = [];
  for (const s of footprintOf(x, y)) {
    if (depthAt(next, s.x, s.y) >= level) continue;
    dug.push(s);
    while (depthAt(next, s.x, s.y) < level) {
      const top = { x: s.x, y: s.y, z: depthAt(next, s.x, s.y) };
      setBlock(next, top, BLOCKS.air.code);
      collapseSpaceUnder(next, top, []);
      setWater(next, top, 0);
      setLava(next, top, 0, false);
      setGas(next, top, 0);
    }
  }
  return { cube: next, dug };
}

/**
 * The squares a new level-1 camp on (x, y) would bring out of fog or out of
 * grey: the part of its circle that no camp covers now. Row by row, as
 * indexes. With `deep`, a deep camp's circle instead.
 */
export function newlyCovered(ground: CampGround, x: number, y: number, deep = false): number[] {
  const width = ground.cube.size.x;
  const height = ground.cube.size.y;
  const now = coverLevels(ground.camps, width, height);
  const after = coverLevels(
    [
      {
        id: 0,
        x,
        y,
        level: deep ? FRONTIER_DEEP_CAMP.level : 1,
        smelter: false,
        lantern: false,
        pen: false,
        penned: 0,
        breedIn: 0,
        deep,
        defense: 0,
      },
    ],
    width,
    height,
  );
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
export function placeCamp(ground: CampGround, x: number, y: number, deep = false): CampChange {
  if (placeRefusal(ground, x, y, deep) !== null) {
    return unchanged(ground);
  }
  const camps = [
    ...ground.camps,
    {
      id: ground.nextCampId,
      x,
      y,
      // A deep camp mines as FRONTIER_DEEP_CAMP.level, and is never upgraded.
      level: deep ? FRONTIER_DEEP_CAMP.level : 1,
      smelter: false,
      lantern: false,
      pen: false,
      penned: 0,
      breedIn: 0,
      deep,
      defense: 0,
    },
  ];
  return {
    camps,
    seen: seenWith(ground.seen, camps, ground.cube.size.x, ground.cube.size.y),
    nextCampId: ground.nextCampId + 1,
    inventory: pay(ground.inventory, deep ? FRONTIER_DEEP_CAMP.cost : FRONTIER_NEW_CAMP_COST),
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
  if (cost === null || camp.deep) {
    return 'top'; // a deep camp is never upgraded
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
    others.some((o) => inCircle(o.x, o.y, campRing(o), s.x, s.y)),
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
export function placeFrontierCamp(
  state: FrontierState,
  x: number,
  y: number,
  deep = false,
): FrontierState {
  const change = placeCamp(state, x, y, deep);
  if (change.camps === state.camps) {
    return state; // refused
  }
  // A deep camp's concrete foundation levels its 3 x 3 (`layFoundation`).
  const foundation = deep ? layFoundation(state.cube, x, y) : { cube: state.cube, dug: [] };
  const features = [...state.features];
  const apples = [...state.apples];
  const regrowIn = [...state.regrowIn];
  const stumps = [...state.stumps];
  const planted = [...state.planted];
  const grassIn = [...state.grassIn];
  const fires = [...state.hazards.fires];
  for (const s of foundation.dug) {
    // Dug out: nothing grows back there (as under a mine).
    const i = s.x + state.cube.size.x * s.y;
    stumps[i] = NO_FEATURE;
    regrowIn[i] = -1;
    planted[i] = false;
    grassIn[i] = -1;
    features[i] = NO_FEATURE;
    fires[i] = false;
  }
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
  return {
    ...state,
    ...change,
    cube: foundation.cube,
    features,
    apples,
    regrowIn,
    stumps,
    planted,
    grassIn,
    hazards: { ...state.hazards, fires },
  };
}

/** `upgradeCamp` on a whole state. A refused upgrade returns the very same state. */
export function upgradeFrontierCamp(state: FrontierState, id: number): FrontierState {
  const change = upgradeCamp(state, id);
  return change.camps === state.camps ? state : { ...state, ...change };
}

/** `demolishCamp` on a whole state. A refused demolish returns the very same state. */
export function demolishFrontierCamp(state: FrontierState, id: number): FrontierState {
  const change = demolishCamp(state, id);
  if (change.camps === state.camps) {
    return state; // refused
  }
  // A pen goes with its camp; its animals go to the store (progression plan section 6.3).
  const penned = state.camps.find((c) => c.id === id)?.penned ?? 0;
  const inventory =
    penned > 0
      ? new Map([...change.inventory, ['animal', (change.inventory.get('animal') ?? 0) + penned]])
      : change.inventory;
  return { ...state, ...change, inventory };
}
