// Step (c) of the cube phase: gas, vents, charges, ignition
// (design doc 6.3 and 6.5; 0014 item 1(c) and items 13 to 15 and 17).
//
// Empty until the gas and explosions task (M2-5, issue #55) fills it in.

import type { GameEvent } from '../events';
import type { GameState } from '../state';
import type { CubePhase } from './phase';

/**
 * Contract for M2-5, in the order 0014 item 1(c) gives:
 * 1. gas spreads (item 13);
 * 2. vents act;
 * 3. every entry of `state.armed` goes off (armed unstable ore and placed
 *    explosives; items 15 and 17), and the list is emptied;
 * 4. ignition (item 14), repeated until nothing new explodes.
 *
 * Changes `state` in place and appends to `events`. Uses no randomness.
 * An explosion's damage to the avatar goes through `recordDamage(phase, ...)`,
 * once for each explosion; what it destroys goes through the helpers in
 * destroy.ts. Never moves the avatar (0014 item 2).
 *
 * The forecast runs this step on a copy of the cube (0014 item 4), so it must
 * read nothing but `state`.
 */
export function stepGas(_state: GameState, _events: GameEvent[], _phase: CubePhase): void {
  // Nothing yet.
}
