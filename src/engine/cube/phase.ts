// What the steps of one cube phase share while it runs (0014 item 2).
//
// The avatar is not hurt at the moment a rock or an explosion hits it: the
// damage is written down here, with its cause, and step (e) applies it all in
// the order it was written (cube/avatarEffects.ts). This object lives only for
// the length of one `endShift` call. It is not part of the game state, so it
// is never saved or hashed.

import type { DamageCause } from '../events';

/** One piece of damage waiting for step (e). */
export interface RecordedDamage {
  amount: number;
  cause: DamageCause;
}

/** The notes of one cube phase. `runCubePhase` makes a fresh one each time. */
export interface CubePhase {
  /** Damage to the avatar, in the order its events happened. */
  damage: RecordedDamage[];
}

export function newCubePhase(): CubePhase {
  return { damage: [] };
}

/**
 * Record that the avatar takes `amount` damage from `cause`. THE way a
 * hazard hurts the avatar during steps (a) to (d): never change
 * `state.avatar.health` there. Call it at the moment of the event (the block
 * passes through the avatar's cell, the cell beside it explodes), so that the
 * order of the list is the order things happened; step (e) applies it.
 *
 * Recording 0 damage does nothing.
 */
export function recordDamage(phase: CubePhase, amount: number, cause: DamageCause): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Cannot record ${amount} damage from "${cause}"`);
  }
  if (amount === 0) {
    return;
  }
  phase.damage.push({ amount, cause });
}
