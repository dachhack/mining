// Placing a support (design doc 4.1 and 6.1; 0014 item 6).
//
// A stub until the cave-ins task (M2-3, issue #53) fills it in. The dispatcher
// in index.ts already calls both functions.

import type { PlaceSupportAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Contract for M2-3: every `PlaceSupportAction` the player could take now.
 *
 * - One action for each cell a support may go in, if the avatar carries one:
 *   the avatar's own cell or an open face neighbour on its level, inside the
 *   grid, holding no structure (0014 item 6).
 * - `ap` is `ACTION_COSTS.placeSupport`. Lists actions as if AP were
 *   unlimited; the dispatcher removes the ones that cost too much.
 * - Does not change `state`, and depends on revealed cells only (0014 item 3).
 */
export function legalPlaceSupportActions(_state: GameState): PlaceSupportAction[] {
  return [];
}

/**
 * Contract for M2-3: carry out `action`, which the dispatcher has already
 * checked is legal: use up one support, put the structure in the cell, emit
 * `structurePlaced`. Does not spend the AP; the dispatcher has.
 */
export function applyPlaceSupport(
  _state: GameState,
  _action: PlaceSupportAction,
  _events: GameEvent[],
): void {
  throw new Error('Placing a support is not built yet (M2-3)');
}
