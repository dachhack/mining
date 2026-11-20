// What the steps of one cube phase share while it runs (design doc v0.2
// sections 4 and 5.2; 0014 item 2; issue #90).
//
// The crew is not hurt at the moment a slump or an explosion reaches it: the
// damage is written down here, with its cause, and step (e) applies it all in
// the order it was written (cube/crewEffects.ts). This object lives only for
// the length of one `endShift` call. It is not part of the game state, so it
// is never saved or hashed.

import { isBesideWorked, isWorked } from '../crew';
import type { DamageCause } from '../events';
import type { GameState } from '../state';

/** One piece of damage waiting for step (e). */
export interface RecordedDamage {
  amount: number;
  cause: DamageCause;
}

/** The notes of one cube phase. `runCubePhase` makes a fresh one each time. */
export interface CubePhase {
  /**
   * Damage to the crew, in the order the cube phase first met each kind of
   * hazard. At most one entry for a kind (design doc 5.2: "each kind of
   * hazard hurts the crew at most once per shift, by its largest amount").
   */
  damage: RecordedDamage[];
}

export function newCubePhase(): CubePhase {
  return { damage: [] };
}

/** Throws unless `amount` is a whole number, 0 or more. */
function requireDamageAmount(amount: number, cause: DamageCause): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Cannot record ${amount} damage from "${cause}"`);
  }
}

/**
 * Write `amount` damage of kind `cause` into the notes. A kind is in the list
 * once: if it is there already, its entry keeps its place and takes the
 * larger of the two amounts. Recording 0 damage does nothing.
 */
function noteDamage(phase: CubePhase, cause: DamageCause, amount: number): void {
  if (amount === 0) {
    return;
  }
  const already = phase.damage.find((entry) => entry.cause === cause);
  if (already === undefined) {
    phase.damage.push({ amount, cause });
  } else if (amount > already.amount) {
    already.amount = amount;
  }
}

/**
 * A hazard of kind `cause` has reached the square (x, y): the crew takes
 * `amount` damage if that square was worked this shift, and nothing
 * otherwise. Returns true if the square was worked.
 *
 * THE way a hazard hurts the crew during steps (a) to (d): never change
 * `state.crew.health` there. Call it at the moment of the event (the block
 * slumps from the square, the water enters it), for every square the hazard
 * reaches, so that the order of the list is the order things happened; step
 * (e) applies it. `amount` comes from `CREW.damage` in src/data.
 *
 * Each kind of hazard hurts at most once a shift, by its largest amount: a
 * second slump onto a worked square adds nothing, and lava on a worked
 * square (5) outweighs lava beside one (1).
 *
 * Throws if (x, y) is off the map or `amount` is not a whole number 0 or more.
 */
export function recordDamage(
  state: GameState,
  phase: CubePhase,
  cause: DamageCause,
  amount: number,
  x: number,
  y: number,
): boolean {
  requireDamageAmount(amount, cause);
  if (!isWorked(state, x, y)) {
    return false;
  }
  noteDamage(phase, cause, amount);
  return true;
}

/**
 * As `recordDamage`, for a hazard that also hurts from the next square: the
 * crew takes `amount` damage if one of the four squares that share a side
 * with (x, y) was worked this shift. The square (x, y) itself is not looked
 * at: call `recordDamage` for that.
 *
 * So lava on (x, y) is two calls: `recordDamage` with `CREW.damage.lavaOn`
 * and `recordDamageBeside` with `CREW.damage.lavaBeside`; an exploding gas
 * square is two calls with `CREW.damage.gasExplosion`.
 */
export function recordDamageBeside(
  state: GameState,
  phase: CubePhase,
  cause: DamageCause,
  amount: number,
  x: number,
  y: number,
): boolean {
  requireDamageAmount(amount, cause);
  if (!isBesideWorked(state, x, y)) {
    return false;
  }
  noteDamage(phase, cause, amount);
  return true;
}
