// Air (design doc 5.1; 0014 items 20 and 21).
//
// The M2 skeleton only fixes where air sits in step (e) of the cube phase
// (cube/avatarEffects.ts). The rule itself is the water, lava and air task
// (M2-4, issue #54), which fills in this file.

import type { GameEvent } from './events';
import type { GameState } from './state';

/**
 * Contract for M2-4. Called once in step (e) of every cube phase, after the
 * recorded damage, while the run is still going.
 *
 * - With connected air the avatar's air refills fully; without it, or in a
 *   flooded or gassy cell, it loses `HAZARDS.air.lossPerShift` (0014 item 20).
 * - "Connected" is a path of breathable open cells to the surface, or to a
 *   cell of an active camp for which `campAirLineIntact(state, camp)`
 *   (camps.ts, filled in by M2-7) is true.
 * - Changes `state.avatar.air` (never below 0) and emits `airChanged` when it
 *   changed.
 * - Does NOT end the run: `stepAvatarEffects` checks for air at 0 straight
 *   after, and decides between drowned and suffocated.
 * - Reads the true cube (0014 item 21).
 */
export function updateAir(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet: air stays where it is.
}
