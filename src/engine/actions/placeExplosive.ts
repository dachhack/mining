// Placing an explosive (design doc 7.2; 0014 item 15).
//
// A stub until the gas and explosions task (M2-5, issue #55) fills it in. The
// dispatcher in index.ts already calls both functions.

import type { PlaceExplosiveAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Contract for M2-5: every `PlaceExplosiveAction` the player could take now.
 *
 * - One action for each cell an explosive may go in, if the stockpile holds
 *   one: its own cell or an open face neighbour, inside the grid, holding no
 *   structure (0014 item 15).
 * - `ap` is `ACTION_COSTS.placeExplosive`. Lists actions as if AP were
 *   unlimited; the dispatcher removes the ones that cost too much.
 * - Does not change `state`, and depends on revealed cells only (0014 item 3).
 */
export function legalPlaceExplosiveActions(_state: GameState): PlaceExplosiveAction[] {
  return [];
}

/**
 * Contract for M2-5: carry out `action`: use up one explosive, put the
 * explosive structure in the cell, call `armCharge(state, target,
 * 'explosive')` so that it goes off in step (c) of the coming cube phase,
 * and emit `structurePlaced`. The square is NOT marked worked: the crew
 * withdraws before a charge goes off (design doc 5.2). Does not spend the AP;
 * the dispatcher has.
 */
export function applyPlaceExplosive(
  _state: GameState,
  _action: PlaceExplosiveAction,
  _events: GameEvent[],
): void {
  throw new Error('Placing an explosive is not built yet (M2-5)');
}
