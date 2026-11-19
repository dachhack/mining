// "Give up": ending the run as entombed (design doc 5.3; 0014 items 23, 24).
//
// A stub until the entombment task (M2-9, issue #59) fills it in. The
// dispatcher in index.ts already calls both functions.

import type { GiveUpAction } from '../actionTypes';
import type { GameEvent } from '../events';
import type { GameState } from '../state';

/**
 * Contract for M2-9: one `GiveUpAction` when a search over revealed cells
 * finds no way out (0014 item 23), otherwise none. The miner has no gravity
 * and there are no ladders (issue #80): a way out is a path of open cells,
 * each a face neighbour of the last, to the surface. `ap` is `ACTION_COSTS.giveUp`. A pure function of the state, and of
 * revealed cells only.
 */
export function legalGiveUpActions(_state: GameState): GiveUpAction[] {
  return [];
}

/**
 * Contract for M2-9: end the run with
 * `endRun(state, 'death', 'entombed', events)`.
 */
export function applyGiveUp(_state: GameState, _action: GiveUpAction, _events: GameEvent[]): void {
  throw new Error('Giving up is not built yet (M2-9)');
}
