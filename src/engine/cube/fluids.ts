// Step (b) of the cube phase: fluids flow
// (design doc 6.2 and 6.4; 0014 item 1(b) and items 12 and 16).
//
// Empty until the water and lava task (M2-4, issue #54) fills it in.

import type { GameEvent } from '../events';
import type { GameState } from '../state';
import type { CubePhase } from './phase';

/**
 * Contract for M2-4, in the order 0014 item 1(b) gives:
 * 1. water flows (item 12: Fall, then Level);
 * 2. lava flows by the same rules, in the cube phase of even-numbered shifts
 *    only (item 16);
 * 3. every water cell beside a lava cell, and that lava cell, become stone;
 * 4. damage to the crew (design doc 5.2): `recordDamage(state, phase,
 *    'water', ...)` for each square water enters; for lava, from where it is
 *    at the end of this step (decision note 0015), `recordDamage` with
 *    `CREW.damage.lavaOn` and `recordDamageBeside` with
 *    `CREW.damage.lavaBeside` for each square it stands on.
 *
 * Changes `state` in place and appends to `events`. Uses no randomness.
 * What a fluid destroys on entering a cell goes through the helpers in
 * destroy.ts.
 *
 * The forecast runs this step on a copy of the cube (0014 item 4), so it must
 * read nothing but `state`.
 */
export function stepFluids(_state: GameState, _events: GameEvent[], _phase: CubePhase): void {
  // Nothing yet.
}
