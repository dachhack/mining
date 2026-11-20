// Placing a support on a square (design doc v0.2 sections 4.1 and 6.1; owner
// question 82; issue #94).
//
// A support holds the top block of its own square, and only that: the square
// does not crack, and a crack already on it stops counting down (slump.ts).
// It is stored with the square's top block (`structureOnSquare` in
// heightmap.ts), so mining the square takes the support with the block and it
// is lost, and rubble that slumps onto the square buries it.
//
// Any square may be named: there is no reach. Five things can stop it:
// - no support in the stockpile (craft one: 1 timber + 1 stone);
// - a tree stands on the square (nothing is placed on a tree, and a tree
//   holds its square anyway);
// - the square has no block left (bedrock never slumps);
// - the square already holds a structure (at most one a square);
// - a camp stands on the square (design doc 4.1: nothing is placed on a camp
//   square; issue #100).
//
// Not here yet, because it is not built: nothing is placed on lava (task T10).

import { ACTION_COSTS, NO_STRUCTURE, STRUCTURES } from '../../data';
import type { PlaceSupportAction } from '../actionTypes';
import { campAtSquare } from '../camps';
import { markWorked } from '../crew';
import type { GameEvent } from '../events';
import { structureOnSquare, topCellOf } from '../heightmap';
import { countItem, removeItem, setStructure } from '../state';
import type { GameState } from '../state';
import { hasTree, surfaceCellAbove } from '../surface/state';

/** Why a support cannot be placed on a square now. */
export type SupportRefusalReason =
  /** There is no support to place. */
  | 'noSupport'
  /** A tree stands on the square. */
  | 'tree'
  /** The square has no block left: it shows the bedrock floor. */
  | 'bottom'
  /** The square already holds a structure. */
  | 'occupied'
  /** A camp stands on the square. */
  | 'camp';

/** The answer of `supportCheck`. */
export interface SupportCheck {
  /** True if the rules let the player place a support there (AP is not looked at). */
  allowed: boolean;
  /** Why not; `null` when `allowed` is true. */
  refusal: SupportRefusalReason | null;
  /** What placing it costs in AP; `null` when it is not allowed. */
  ap: number | null;
}

function refused(refusal: SupportRefusalReason): SupportCheck {
  return { allowed: false, refusal, ap: null };
}

/**
 * May the player place a support on the square (x, y), and if not, why not?
 * Does not look at the AP left: `legalActions` in index.ts removes what costs
 * too much.
 *
 * Everything read here is something the player sees: the stockpile, the tree,
 * the square's depth, the structure on it and the camps. The top block is not
 * read.
 *
 * Throws if (x, y) is not a square. Does not change `state`.
 */
export function supportCheck(state: GameState, x: number, y: number): SupportCheck {
  // First, so that a bad square throws whatever else is true.
  const top = topCellOf(state, x, y);
  if (countItem(state, STRUCTURES.support.placedFromItem) < 1) {
    return refused('noSupport');
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
  if (campAtSquare(state, x, y) !== null) {
    return refused('camp');
  }
  return { allowed: true, refusal: null, ap: ACTION_COSTS.placeSupport };
}

/**
 * Every `PlaceSupportAction` the player could take now: one for each square
 * `supportCheck` allows, row by row (y, then x). Empty without a support to
 * place. Lists actions as if AP were unlimited; the dispatcher removes the
 * ones that cost too much. Does not change `state`.
 */
export function legalPlaceSupportActions(state: GameState): PlaceSupportAction[] {
  const actions: PlaceSupportAction[] = [];
  if (countItem(state, STRUCTURES.support.placedFromItem) < 1) {
    return actions; // the same answer for every square: do not ask 1,024 times
  }
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const check = supportCheck(state, x, y);
      if (check.allowed && check.ap !== null) {
        actions.push({ type: 'placeSupport', x, y, ap: check.ap });
      }
    }
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is legal: use
 * up one support, put it on the square, emit `structurePlaced`, and mark the
 * square worked (design doc 5.2: the crew built there this shift, so a hazard
 * that reaches the square in the coming cube phase hurts it). Does not spend
 * the AP; the dispatcher has.
 */
export function applyPlaceSupport(
  state: GameState,
  action: PlaceSupportAction,
  events: GameEvent[],
): void {
  const top = topCellOf(state, action.x, action.y);
  if (top === null) {
    throw new Error(`Square (${action.x}, ${action.y}) has no block to support`);
  }
  removeItem(state, STRUCTURES.support.placedFromItem, 1);
  setStructure(state, top, STRUCTURES.support.code);
  events.push({ type: 'structurePlaced', pos: top, structure: STRUCTURES.support.code });
  markWorked(state, action.x, action.y);
}
