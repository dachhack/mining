// The camp-made tools that are used as actions: pump, vent, safety lamp,
// sealant, scanner (design doc 4.1 and 7.2; 0014 items 12 to 14 and 31).
//
// A stub until the camp tools task (M2-8, issue #58) fills it in. The
// dispatcher in index.ts already calls both functions. (The drill is not an
// action: it changes what mining hard rock costs, in actions/mine.ts.)

import type { CampToolAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Contract for M2-8: every `placePump`, `placeVent`, `placeSafetyLamp`,
 * `seal` and `scan` action the player could take now, in that order.
 *
 * - `ap` comes from `ACTION_COSTS`. Lists actions as if AP were unlimited;
 *   the dispatcher removes the ones that cost too much.
 * - Does not change `state`, and depends on revealed cells only (0014 item 3).
 */
export function legalCampToolActions(_state: GameState): CampToolAction[] {
  return [];
}

/**
 * Contract for M2-8: carry out `action`, which the dispatcher has already
 * checked is legal. Placing a pump or a vent and sealing mark the square
 * worked (`markWorked` in crew.ts; design doc 5.2); scanning does not. Does
 * not spend the AP; the dispatcher has.
 */
export function applyCampToolAction(
  _state: GameState,
  _action: CampToolAction,
  _events: GameEvent[],
): void {
  throw new Error('Camp tools are not built yet (M2-8)');
}
