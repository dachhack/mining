// Placing an explosive on a square (design doc v0.2 sections 4.1, 5.2 and
// 6.6; issue #103, task T11; decision note 0034).
//
// A placed explosive goes off in step (c) of the cube phase that ends the
// shift it was placed in (cube/gas.ts; the blast itself is explosions.ts). It
// is stored with the square's top block, like a support, and it is also an
// entry of `state.armed`.
//
// Any square may be named: there is no reach. Six things can stop it:
// - no explosive in the stockpile (a camp makes one: 2 coal + 1 iron ingot);
// - a tree stands on the square (nothing is placed on a tree);
// - the square has no block left;
// - the square already holds a structure (at most one a square);
// - lava stands on the square (nothing is placed on lava);
// - a camp stands on the square (nothing is placed on a camp square).
//
// Placing an explosive does NOT make its square a worked square: the crew
// withdraws before a charge goes off (design doc 5.2). So a charge alone
// never hurts the crew; it does if its blast includes a square the crew
// worked this shift in some other way.

import { ACTION_COSTS, NO_STRUCTURE, STRUCTURES } from '../../data';
import type { PlaceExplosiveAction } from '../actionTypes';
import { campAtSquare } from '../camps';
import type { GameEvent } from '../events';
import { structureOnSquare, topCellOf } from '../heightmap';
import { lavaOn } from '../standing';
import { armCharge, countItem, removeItem, setStructure } from '../state';
import type { GameState } from '../state';
import { hasTree, surfaceCellAbove } from '../surface/state';

/** Why an explosive cannot be placed on a square now. */
export type ExplosiveRefusalReason =
  /** There is no explosive to place. */
  | 'noExplosive'
  /** A tree stands on the square. */
  | 'tree'
  /** The square has no block left: it shows the bedrock floor. */
  | 'bottom'
  /** The square already holds a structure. */
  | 'occupied'
  /** Lava stands on the square. */
  | 'lava'
  /** A camp stands on the square. */
  | 'camp';

/** The answer of `explosiveCheck`. */
export interface ExplosiveCheck {
  /** True if the rules let the player place an explosive there (AP is not looked at). */
  allowed: boolean;
  /** Why not; `null` when `allowed` is true. */
  refusal: ExplosiveRefusalReason | null;
  /** What placing it costs in AP; `null` when it is not allowed. */
  ap: number | null;
}

function refused(refusal: ExplosiveRefusalReason): ExplosiveCheck {
  return { allowed: false, refusal, ap: null };
}

/**
 * May the player place an explosive on the square (x, y), and if not, why
 * not? Does not look at the AP left: `legalActions` in index.ts removes what
 * costs too much.
 *
 * Everything read here is something the player sees: the stockpile, the tree,
 * the square's depth, the structure on it, the lava standing on it and the
 * camps. The top block is not read. The checks are those of `supportCheck`,
 * in the same order.
 *
 * Throws if (x, y) is not a square. Does not change `state`.
 */
export function explosiveCheck(state: GameState, x: number, y: number): ExplosiveCheck {
  // First, so that a bad square throws whatever else is true.
  const top = topCellOf(state, x, y);
  if (countItem(state, STRUCTURES.explosive.placedFromItem) < 1) {
    return refused('noExplosive');
  }
  if (hasTree(state, surfaceCellAbove({ x, y, z: 0 }))) {
    return refused('tree');
  }
  if (top === null) {
    return refused('bottom');
  }
  if (structureOnSquare(state, x, y) !== NO_STRUCTURE) {
    return refused('occupied');
  }
  if (lavaOn(state, x, y) > 0) {
    return refused('lava');
  }
  if (campAtSquare(state, x, y) !== null) {
    return refused('camp');
  }
  return { allowed: true, refusal: null, ap: ACTION_COSTS.placeExplosive };
}

/**
 * Every `PlaceExplosiveAction` the player could take now: one for each square
 * `explosiveCheck` allows, row by row (y, then x). Lists actions as if AP
 * were unlimited; the dispatcher removes the ones that cost too much. Does
 * not change `state`.
 */
export function legalPlaceExplosiveActions(state: GameState): PlaceExplosiveAction[] {
  const actions: PlaceExplosiveAction[] = [];
  if (countItem(state, STRUCTURES.explosive.placedFromItem) < 1) {
    return actions; // the same answer for every square: do not ask 1,024 times
  }
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const check = explosiveCheck(state, x, y);
      if (check.allowed && check.ap !== null) {
        actions.push({ type: 'placeExplosive', x, y, ap: check.ap });
      }
    }
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is legal: use
 * up one explosive, put it on the square (with the top block), arm it so that
 * it goes off in step (c) of the coming cube phase, and emit
 * `structurePlaced`.
 *
 * The square is NOT marked worked (design doc 5.2: "the crew withdraws before
 * a charge goes off"). Does not spend the AP; the dispatcher has.
 */
export function applyPlaceExplosive(
  state: GameState,
  action: PlaceExplosiveAction,
  events: GameEvent[],
): void {
  const top = topCellOf(state, action.x, action.y);
  if (top === null) {
    throw new Error(`Square (${action.x}, ${action.y}) has no block to place an explosive on`);
  }
  removeItem(state, STRUCTURES.explosive.placedFromItem, 1);
  setStructure(state, top, STRUCTURES.explosive.code);
  armCharge(state, top, 'explosive');
  events.push({ type: 'structurePlaced', pos: top, structure: STRUCTURES.explosive.code });
}
