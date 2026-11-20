// Step (a) of the cube phase: support check and falling blocks
// (design doc 6.1; 0014 item 1(a) and items 5 to 11).
//
// Empty until the cave-ins task (M2-3, issue #53) fills it in.

import type { GameEvent } from '../events';
import type { GameState } from '../state';
import type { CubePhase } from './phase';

/**
 * Contract for M2-3, in the order 0014 item 1(a) gives:
 * 1. supports with no hold are destroyed (`destroyStructure`, cause `noHold`);
 * 2. blocks whose stored timer is 0 and whose countdown is running fall, from
 *    the bottom layer up;
 * 3. newly unsupported blocks crack.
 *
 * Changes `state` in place and appends to `events`. Uses no randomness.
 * Damage to the avatar goes through `recordDamage(phase, ...)`; structures
 * and camps in a falling block's way go through the helpers in destroy.ts. Never moves the avatar (0014 item 2).
 */
export function stepCaveIns(_state: GameState, _events: GameEvent[], _phase: CubePhase): void {
  // Nothing yet.
}
