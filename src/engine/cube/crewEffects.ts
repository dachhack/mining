// Step (e) of the cube phase: effects on the crew (design doc v0.2 sections
// 4 and 5; 0014 item 1(e); issue #90).
//
// In this order:
// 1. the damage recorded during steps (a) to (d), in the order it was met;
// 2. rest, only if the crew is still alive;
// 3. the worked squares are forgotten: the next shift starts with none.
//
// There is no air: water and gas hurt the crew directly, through the same
// recorded damage as everything else (design doc 5.2).
//
// Step 2 calls `applyRest` in camps.ts, which does nothing until the camps
// task (T12) fills it in.

import { applyRest } from '../camps';
import { clearWorked } from '../crew';
import type { DamageCause, GameEvent, RunEndCause } from '../events';
import { endRun, isRunActive } from '../state';
import type { GameState } from '../state';
import type { CubePhase, RecordedDamage } from './phase';

/**
 * The loss each kind of damage is recorded as (design doc 5.3): buried
 * (slump), drowned (water), burned (lava or an explosion), poisoned (gas).
 *
 * `Record<DamageCause, RunEndCause>` is a dict with exactly one entry for
 * each damage cause: the compiler rejects this table if one is missing.
 */
export const LOSS_BY_DAMAGE: Record<DamageCause, RunEndCause> = {
  slump: 'buried',
  water: 'drowned',
  lava: 'burned',
  gas: 'poisoned',
  gasExplosion: 'burned',
  explosion: 'burned',
};

/**
 * Apply recorded damage to the crew, in order (design doc 5.2).
 *
 * - Each entry takes its amount off crew health and emits `damageTaken`. An
 *   entry never takes more than the health that is left, so a lost crew has
 *   exactly 0 health.
 * - The first entry that brings health to 0 ends the run as lost, with the
 *   cause that entry maps to. The entries after it are not applied.
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
    const amount = Math.min(entry.amount, state.crew.health);
    if (amount > 0) {
      state.crew.health -= amount;
      events.push({
        type: 'damageTaken',
        amount,
        cause: entry.cause,
        health: state.crew.health,
      });
    }
    if (state.crew.health <= 0) {
      endRun(state, 'lost', LOSS_BY_DAMAGE[entry.cause], events);
    }
  }
}

/** Step (e). Changes `state` in place and appends to `events`. */
export function stepCrewEffects(state: GameState, events: GameEvent[], phase: CubePhase): void {
  // 1. Recorded damage; the first cause to bring health to 0 names the loss.
  applyRecordedDamage(state, events, phase.damage);
  phase.damage = [];

  // 2. Rest, for a crew that chose it this shift and is still alive.
  if (isRunActive(state) && state.crew.resting) {
    applyRest(state, events);
  }
  // Rest lasts one shift, whether or not the crew lived to take it.
  state.crew.resting = false;

  // 3. The shift's work is over: no square is a worked square any more.
  clearWorked(state);
}
