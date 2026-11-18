// Step (d) of the cube phase: crack timers tick (0014 item 1(d) and item 7).
//
// Empty until the cave-ins task (M2-3, issue #53) fills it in: which
// countdowns are running is that task's rule (its support.ts).

import type { GameEvent } from '../events';
import type { GameState } from '../state';
import type { CubePhase } from './phase';

/**
 * Contract for M2-3: every crack timer whose countdown is running goes down
 * by 1, including one set earlier in this phase, and never below 0. A
 * stopped countdown keeps its timer.
 *
 * Changes `state` in place and appends to `events` (`blockCracked` with the
 * new timer). Uses no randomness.
 */
export function stepTimers(_state: GameState, _events: GameEvent[], _phase: CubePhase): void {
  // Nothing yet.
}
