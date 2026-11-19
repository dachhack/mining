// Step (e) of the cube phase: effects on the avatar (0014 item 1(e), item 2).
//
// The order is fixed by 0014 item 2 and built here, in the M2 skeleton:
// 1. the damage recorded during steps (a) to (d), in the order it happened;
// 2. air;
// 3. rest, only if the avatar is still alive.
// Loose items that lost their floor fall straight after (`settle`, in the
// dispatcher in index.ts). The avatar never falls (issue #80).
//
// Steps 2 and 3 call one function each from air.ts (M2-4) and camps.ts
// (M2-7), which do nothing until those tasks fill them in.

import { updateAir } from '../air';
import { applyRest } from '../camps';
import type { DamageCause, GameEvent, RunEndCause } from '../events';
import { endRun, isRunActive, waterAt } from '../state';
import type { GameState } from '../state';
import type { CubePhase, RecordedDamage } from './phase';

/**
 * The death each cause of damage is recorded as (design doc 5.3; 0014 item
 * 22): a falling block crushes, lava and explosions burn.
 *
 * `Record<DamageCause, RunEndCause>` is a dict with exactly one entry for
 * each damage cause: the compiler rejects this table if one is missing.
 */
const DEATH_BY_DAMAGE: Record<DamageCause, RunEndCause> = {
  rockfall: 'crushed',
  lava: 'burned',
  explosion: 'burned',
};

/**
 * Apply recorded damage to the avatar, in order (0014 item 2).
 *
 * - Each entry takes its amount off the avatar's health and emits
 *   `damageTaken`. An entry never takes more than
 *   the health that is left, so a dead avatar has exactly 0 health.
 * - The first entry that brings health to 0 ends the run as a death, with the
 *   cause that entry maps to. The entries after it are not applied: the
 *   avatar is already dead.
 * - With an empty list nothing happens. Health is not otherwise looked at:
 *   this function ends the run only through damage it applies itself.
 */
export function applyRecordedDamage(
  state: GameState,
  events: GameEvent[],
  damage: RecordedDamage[],
): void {
  for (const entry of damage) {
    if (!isRunActive(state)) {
      return;
    }
    const amount = Math.min(entry.amount, state.avatar.health);
    if (amount > 0) {
      state.avatar.health -= amount;
      events.push({
        type: 'damageTaken',
        amount,
        cause: entry.cause,
        health: state.avatar.health,
      });
    }
    if (state.avatar.health <= 0) {
      endRun(state, 'death', DEATH_BY_DAMAGE[entry.cause], events);
    }
  }
}

/**
 * End the run if the air has run out (0014 item 20): drowned if the avatar's
 * cell is flooded, suffocated otherwise. This reads the true cube, like the
 * air rule itself (0014 item 21).
 */
function checkAir(state: GameState, events: GameEvent[]): void {
  if (state.avatar.air > 0) {
    return;
  }
  const cause: RunEndCause = waterAt(state, state.avatar.pos) > 0 ? 'drowned' : 'suffocated';
  endRun(state, 'death', cause, events);
}

/**
 * Step (e). Changes `state` in place and appends to `events`.
 *
 * Health is settled before air is looked at, so an avatar that a rockfall
 * kills in a flooded tunnel was crushed, not drowned.
 */
export function stepAvatarEffects(state: GameState, events: GameEvent[], phase: CubePhase): void {
  // 1. Recorded damage; the first cause to bring health to 0 names the death.
  applyRecordedDamage(state, events, phase.damage);
  phase.damage = [];

  // 2. Air: lost or refilled, then checked.
  if (isRunActive(state)) {
    updateAir(state, events);
    checkAir(state, events);
  }

  // 3. Rest, for an avatar that chose it this shift and is still alive.
  if (isRunActive(state) && state.avatar.resting) {
    applyRest(state, events);
  }
  // Rest lasts one shift, whether or not the avatar lived to take it.
  state.avatar.resting = false;
}
