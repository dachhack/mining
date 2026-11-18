// Camp actions: found, rest, stash, decommission (design doc 8; 0014 items
// 26 to 28). Camp recipes are crafted with the ordinary `craft` action
// (actions/craft.ts).
//
// A stub until the camps task (M2-7, issue #57) fills it in; that task may
// split it into several actions/camp*.ts files. The dispatcher in index.ts
// already calls both functions.

import type { CampAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Contract for M2-7: every `foundCamp`, `rest`, `stashPut`, `stashTake` and
 * `decommissionCamp` action the player could take now, in that order.
 *
 * - Founding and resting cost all the AP left in the shift (at least
 *   `CAMPS.foundMinAp` / `CAMPS.restMinAp`), so their `ap` is `state.ap`; the
 *   others take theirs from `ACTION_COSTS`.
 * - Does not change `state`, and depends on revealed cells only (0014 item 3).
 */
export function legalCampActions(_state: GameState): CampAction[] {
  return [];
}

/**
 * Contract for M2-7: carry out `action`, which the dispatcher has already
 * checked is legal. Does not spend the AP; the dispatcher has. Resting sets
 * `state.avatar.resting`; the rest itself is applied in step (e) of the cube
 * phase (`applyRest` in camps.ts).
 */
export function applyCampAction(
  _state: GameState,
  _action: CampAction,
  _events: GameEvent[],
): void {
  throw new Error('Camps are not built yet (M2-7)');
}
