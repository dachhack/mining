// Camps (design doc v0.2 section 8; issue #100; decision note 0032).
//
// A camp stands on a flat 3 x 3 patch of squares. This file holds what the
// rest of the engine asks about camps:
//
//   campSquares      which 9 squares a camp covers
//   campAtSquare     the camp standing on a square, if any
//   foundCampCheck   may a camp be founded round this centre square, and if
//                    not, why not?
//   foundCampSites   every centre square where it may
//   mineDiscountAt   how much cheaper is a mine on this square?
//   campFuelDue      what the camps burn at this shift's upkeep
//   applyRest        the rest itself, in step (e) of the cube phase
//
// The three camp actions (found, rest, decommission) are in actions/camp.ts.
//
// Everything read here is something the player sees: depths, trees, what
// stands on a square, structures on top blocks, and the camps themselves
// (design doc 3.4). Nothing below a top block is read.

import { CAMPS, CREW, NO_STRUCTURE } from '../data';
import type { Vec3 } from '../data';
import { contentsOn } from './breach';
import type { GameEvent } from './events';
import { depthAt, depthIn, depthMapOf, isSquare } from './heightmap';
import type { Square } from './heightmap';
import { countItem, structureAt } from './state';
import type { Camp, GameState } from './state';
import { hasTree, surfaceCellAbove } from './surface/state';

// ---------------------------------------------------------------------------
// Where a camp is
// ---------------------------------------------------------------------------

/**
 * The squares of the patch centred on (x, y): `CAMPS.halfWidth` squares to
 * each side (3 x 3 with today's numbers), row by row (y, then x). Some may be
 * off the map; the caller checks.
 */
function patchSquares(x: number, y: number): Square[] {
  const squares: Square[] = [];
  for (let dy = -CAMPS.halfWidth; dy <= CAMPS.halfWidth; dy += 1) {
    for (let dx = -CAMPS.halfWidth; dx <= CAMPS.halfWidth; dx += 1) {
      squares.push({ x: x + dx, y: y + dy });
    }
  }
  return squares;
}

/** The 9 squares a camp stands on, row by row (y, then x). */
export function campSquares(camp: Camp): Square[] {
  return patchSquares(camp.pos.x, camp.pos.y);
}

/** True if the square (x, y) is one of `camp`'s squares. */
function campCovers(camp: Camp, x: number, y: number): boolean {
  return Math.abs(x - camp.pos.x) <= CAMPS.halfWidth && Math.abs(y - camp.pos.y) <= CAMPS.halfWidth;
}

/**
 * The active camp standing on the square (x, y), or `null` if there is none.
 * Camps never overlap (`foundCampCheck` refuses it), so there is at most one.
 */
export function campAtSquare(state: GameState, x: number, y: number): Camp | null {
  for (const camp of state.camps) {
    if (campCovers(camp, x, y)) {
      return camp;
    }
  }
  return null;
}

/**
 * The active camps standing on the square of the cell `pos`, in the order of
 * `state.camps`. Only `pos.x` and `pos.y` are looked at: a camp covers its
 * squares, whatever the layer. `destroyCampsAt` in destroy.ts uses this, so a
 * hazard step may hand it the cell an event happened in.
 */
export function campsAt(state: GameState, pos: Vec3): Camp[] {
  return state.camps.filter((camp) => campCovers(camp, pos.x, pos.y));
}

/** The camp whose centre square is (x, y), or `null`. The camp actions name a camp this way. */
export function campCentredAt(state: GameState, x: number, y: number): Camp | null {
  for (const camp of state.camps) {
    if (camp.pos.x === x && camp.pos.y === y) {
      return camp;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Founding (design doc 8: "a camp kit and a flat 3x3 patch of squares: all at
// the same depth, none with a tree, water, lava, gas or a structure on it")
// ---------------------------------------------------------------------------

/** Why a camp cannot be founded round a centre square. */
export type FoundCampRefusal =
  /** The stockpile holds no camp kit. */
  | 'noKit'
  /** The 3 x 3 patch would reach over the edge of the map. */
  | 'offMap'
  /** A tree stands on one of the squares. */
  | 'tree'
  /** The squares are not all at the same depth. */
  | 'notFlat'
  /** One of the squares has no block left: it shows the bedrock floor. */
  | 'bottom'
  /** Water, lava or gas stands on one of the squares. */
  | 'water'
  | 'lava'
  | 'gas'
  /** A support, pump, vent or explosive stands on one of the squares. */
  | 'structure'
  /** One of the squares already belongs to another camp. */
  | 'camp';

/** The answer of `foundCampCheck`. */
export interface FoundCampCheck {
  /** True if the rules let the player found a camp here (AP is not looked at). */
  allowed: boolean;
  /** Why not; `null` when `allowed` is true. Only the first reason found is given. */
  refusal: FoundCampRefusal | null;
  /**
   * The squares of the patch that have the problem named by `refusal`, row by
   * row: the squares with a tree, the squares that are not at the centre's
   * depth, and so on. Empty for 'noKit' and 'offMap', and when `allowed`.
   * This is what a refused tap shows the player.
   */
  squares: Square[];
}

function refuseFounding(refusal: FoundCampRefusal, squares: Square[]): FoundCampCheck {
  return { allowed: false, refusal, squares };
}

/**
 * May the player found a camp whose centre square is (x, y), and if not, why
 * not? Does not look at the AP left: `legalCampActions` does.
 *
 * The checks, in this order (the first that fails is the answer):
 * 1. the stockpile holds a camp kit;
 * 2. the whole 3 x 3 patch is on the map;
 * 3. no square of the patch has a tree (asked before depth and contents, so
 *    that the answer never depends on a block a tree hides);
 * 4. all 9 squares are at the centre square's depth;
 * 5. the squares still have a block to stand on (not the bedrock floor);
 * 6. no water, lava or gas stands on a square;
 * 7. no structure stands on a square;
 * 8. no square belongs to another camp.
 *
 * Throws if (x, y) is not a square. Does not change `state`.
 */
export function foundCampCheck(state: GameState, x: number, y: number): FoundCampCheck {
  if (!isSquare(state, x, y)) {
    throw new Error(`(${x}, ${y}) is not a square of the cube`);
  }
  if (countItem(state, CAMPS.kitItem) < 1) {
    return refuseFounding('noKit', []);
  }
  const patch = patchSquares(x, y);
  if (patch.some((square) => !isSquare(state, square.x, square.y))) {
    return refuseFounding('offMap', []);
  }

  const withTree = patch.filter((square) =>
    hasTree(state, surfaceCellAbove({ x: square.x, y: square.y, z: 0 })),
  );
  if (withTree.length > 0) {
    return refuseFounding('tree', withTree);
  }

  const depth = depthAt(state, x, y);
  const offLevel = patch.filter((square) => depthAt(state, square.x, square.y) !== depth);
  if (offLevel.length > 0) {
    return refuseFounding('notFlat', offLevel);
  }
  if (depth >= state.size.z) {
    return refuseFounding('bottom', patch);
  }

  // What stands on each square. `contentsOn` gives units of water, lava and gas.
  const flooded = patch.filter((square) => contentsOn(state, square.x, square.y).water > 0);
  if (flooded.length > 0) {
    return refuseFounding('water', flooded);
  }
  const underLava = patch.filter((square) => contentsOn(state, square.x, square.y).lava > 0);
  if (underLava.length > 0) {
    return refuseFounding('lava', underLava);
  }
  const gassy = patch.filter((square) => contentsOn(state, square.x, square.y).gas > 0);
  if (gassy.length > 0) {
    return refuseFounding('gas', gassy);
  }

  // A structure is stored with its square's top block.
  const built = patch.filter(
    (square) => structureAt(state, { x: square.x, y: square.y, z: depth }) !== NO_STRUCTURE,
  );
  if (built.length > 0) {
    return refuseFounding('structure', built);
  }

  const taken = patch.filter((square) => campAtSquare(state, square.x, square.y) !== null);
  if (taken.length > 0) {
    return refuseFounding('camp', taken);
  }
  return { allowed: true, refusal: null, squares: [] };
}

/**
 * Every centre square a camp could be founded round now, row by row (y, then
 * x): exactly the squares for which `foundCampCheck` answers "allowed".
 *
 * `legalActions` asks this on every step, for about a thousand centres. So
 * the two commonest reasons for a refusal (a tree on the patch, a patch that
 * is not flat) are ruled out first from two tables made once, and only the
 * patches that pass are given to `foundCampCheck`, which has the last word.
 * The quick test only ever says "no" where `foundCampCheck` would too.
 */
export function foundCampSites(state: GameState): Square[] {
  const sites: Square[] = [];
  if (countItem(state, CAMPS.kitItem) < 1) {
    return sites; // the same answer for every centre
  }
  const depths = depthMapOf(state);
  // One entry per square, row by row: true if a tree stands on it.
  const trees: boolean[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      trees.push(hasTree(state, surfaceCellAbove({ x, y, z: 0 })));
    }
  }

  const half = CAMPS.halfWidth;
  // Centres nearer the edge than `half` have a patch that leaves the map.
  for (let y = half; y < state.size.y - half; y += 1) {
    for (let x = half; x < state.size.x - half; x += 1) {
      const depth = depthIn(depths, x, y);
      let clearAndFlat = true;
      for (let dy = -half; dy <= half && clearAndFlat; dy += 1) {
        for (let dx = -half; dx <= half; dx += 1) {
          const isTree = trees[x + dx + state.size.x * (y + dy)] === true;
          if (isTree || depthIn(depths, x + dx, y + dy) !== depth) {
            clearAndFlat = false;
            break;
          }
        }
      }
      if (clearAndFlat && foundCampCheck(state, x, y).allowed) {
        sites.push({ x, y });
      }
    }
  }
  return sites;
}

// ---------------------------------------------------------------------------
// Mining near a camp is cheaper (design doc 8; owner, question 90)
// ---------------------------------------------------------------------------

/**
 * How many steps the square (x, y) is from the nearest square of `camp`. A
 * step is to a face neighbour (no diagonals), so this is a Manhattan distance
 * to a 3 x 3 patch; it is 0 on a camp square.
 */
export function stepsFromCamp(camp: Camp, x: number, y: number): number {
  // How far outside the patch the square is, along each axis (0 if inside).
  const outsideX = Math.max(0, Math.abs(x - camp.pos.x) - CAMPS.halfWidth);
  const outsideY = Math.max(0, Math.abs(y - camp.pos.y) - CAMPS.halfWidth);
  return outsideX + outsideY;
}

/**
 * How many AP mining the square (x, y) costs less because a camp is near: 0
 * or `CAMPS.mineDiscountAp`.
 *
 * The discount applies when, for at least one active camp, the square is
 * within `CAMPS.mineDiscountSteps` steps of a camp square and no more than
 * `CAMPS.mineDiscountMaxDeeper` levels deeper than the camp. Two camps near
 * the same square give the discount once, not twice.
 *
 * `discountedMineCost` applies it, with the floor of `CAMPS.mineMinAp`.
 * Throws if (x, y) is not a square. Does not change `state`.
 */
export function mineDiscountAt(state: GameState, x: number, y: number): number {
  const depth = depthAt(state, x, y);
  for (const camp of state.camps) {
    const near = stepsFromCamp(camp, x, y) <= CAMPS.mineDiscountSteps;
    // `camp.pos.z` is the depth of the camp's patch.
    const notTooDeep = depth - camp.pos.z <= CAMPS.mineDiscountMaxDeeper;
    if (near && notTooDeep) {
      return CAMPS.mineDiscountAp;
    }
  }
  return 0;
}

/**
 * What a mine of the square (x, y) costs when its block's own cost is
 * `baseCost`: the camp discount off, but never below `CAMPS.mineMinAp`, and
 * never more than `baseCost` (a block that already costs less than the floor
 * keeps its cost).
 */
export function discountedMineCost(
  state: GameState,
  x: number,
  y: number,
  baseCost: number,
): number {
  const discount = mineDiscountAt(state, x, y);
  if (discount === 0) {
    return baseCost;
  }
  return Math.min(baseCost, Math.max(CAMPS.mineMinAp, baseCost - discount));
}

// ---------------------------------------------------------------------------
// Upkeep (design doc 4: "plus 1 per active camp every 4 shifts")
// ---------------------------------------------------------------------------

/**
 * True if `camp` burns fuel at the upkeep that ends the current shift: every
 * `CAMPS.upkeepEveryShifts`-th shift, counting the shift it was founded in as
 * the first. So a camp founded in shift 5 burns at the end of shifts 8, 12,
 * 16 and so on.
 */
export function campUpkeepIsDue(state: GameState, camp: Camp): boolean {
  const shiftsStanding = state.shift - camp.foundedShift + 1;
  return shiftsStanding > 0 && shiftsStanding % CAMPS.upkeepEveryShifts === 0;
}

/**
 * The fuel all active camps together burn at the upkeep that ends the
 * current shift, on top of the shift's own fuel. A destroyed or
 * decommissioned camp is no longer in `state.camps` and burns nothing.
 * Does not change `state`.
 */
export function campFuelDue(state: GameState): number {
  let fuel = 0;
  for (const camp of state.camps) {
    if (campUpkeepIsDue(state, camp)) {
      fuel += CAMPS.upkeepFuel;
    }
  }
  return fuel;
}

// ---------------------------------------------------------------------------
// Rest (design doc 5.1 and 8)
// ---------------------------------------------------------------------------

/**
 * Apply the rest the crew chose this shift. Called in step (e) of the cube
 * phase when `state.crew.restingAt` is set and the crew is alive after the
 * shift's damage.
 *
 * - If the camp the crew rested at still stands, crew health goes back to
 *   full (`healthRestored`; no event if it was full already).
 * - If a hazard destroyed that camp earlier in this cube phase, there is no
 *   rest: the camp is gone (decision note 0032, reading 4).
 * - Does not clear `state.crew.restingAt`: `stepCrewEffects` does.
 */
export function applyRest(state: GameState, events: GameEvent[]): void {
  const at = state.crew.restingAt;
  if (at === null || campCentredAt(state, at.x, at.y) === null) {
    return;
  }
  const amount = CREW.startHealth - state.crew.health;
  if (amount <= 0) {
    return;
  }
  state.crew.health = CREW.startHealth;
  events.push({ type: 'healthRestored', amount, health: state.crew.health });
}
