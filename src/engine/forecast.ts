// The two hazard parts of the end-shift forecast (0014 item 4).
//
// Empty until the tells and forecast task (M2-6, issue #56) fills it in.
// `forecastShift` in shift.ts already calls both functions and adds the
// upkeep part, so that task does not need to edit shift.ts.

import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import type { GameState } from './state';

/**
 * One countdown the player can read (0014 item 4, part 1): something that is
 * certain to happen in a coming cube phase, because nothing unseen can change
 * it. Three kinds:
 *
 * - `fallingBlock`: the revealed, cracked block at `pos` whose countdown is
 *   running. `path` is the cells it will fall through and the cell it stops
 *   in, top first, down to the first unrevealed cell and no further;
 *   `pathEndsUnseen` is true if the path was cut short there.
 * - `unstableOre`: the armed unstable ore at `pos`.
 * - `explosive`: the placed explosive at `pos`.
 *
 * `inShifts` is how many shifts from now: 1 means "in the coming cube phase".
 * For a cracked block it is the stored timer plus 1, the number the player
 * is shown on the block (0014 item 7).
 *
 * This is a tagged union, like `Action`: `kind` says which fields there are.
 */
export type CountdownForecast =
  | { kind: 'fallingBlock'; pos: Vec3; inShifts: number; path: Vec3[]; pathEndsUnseen: boolean }
  | { kind: 'unstableOre'; pos: Vec3; inShifts: number }
  | { kind: 'explosive'; pos: Vec3; inShifts: number };

/**
 * Contract for M2-6: part 1 of the forecast, the countdowns.
 *
 * - Every revealed block whose countdown is running and shows 1 (stored timer
 *   0), every armed unstable ore, and every placed explosive, in cell order
 *   (z, then y, then x).
 * - A falling block's path is reported down to the first unrevealed cell and
 *   no further.
 * - Read cells only through `knownCell` (known.ts), so that the result cannot
 *   depend on an unrevealed cell. New cracks are not forecast.
 * - Does not change `state`.
 */
export function forecastCountdowns(_state: GameState): CountdownForecast[] {
  return [];
}

/**
 * Contract for M2-6: part 2 of the forecast, the flows.
 *
 * - Run steps (b) and (c) of the cube phase (`stepFluids`, then `stepGas`) on
 *   `knownCube(state)`, the copy in which every unrevealed cell is plain rock
 *   with nothing in it, with a fresh `newCubePhase()`, and return the events
 *   they emit.
 * - Does not change `state`.
 */
export function forecastFlows(_state: GameState): GameEvent[] {
  return [];
}
