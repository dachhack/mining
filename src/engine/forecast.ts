// The two hazard parts of the end-shift forecast (0014 item 4).
//
// The flows of water and lava are built (issue #99). The countdowns are empty
// until their tasks fill them in. `forecastShift` in shift.ts calls both
// functions and adds the upkeep part.

import type { Vec3 } from '../data';
import { stepFluids } from './cube/fluids';
import { newCubePhase } from './cube/phase';
import type { GameEvent } from './events';
import { knownCube } from './known';
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
 * Part 2 of the forecast, the flows: what step (b) of the coming cube phase
 * will do to the water and lava the player sees (design doc 6 and 11).
 *
 * - Runs `stepFluids` on `knownCube(state)`, the copy in which every
 *   unrevealed cell is plain rock with nothing in it, with a fresh
 *   `newCubePhase()`, and returns the events it emits: `fluidMoved` for each
 *   unit that will move, `fluidRemoved`, `lavaPoured`, `stoneFormed`, and
 *   what lava or water will destroy.
 * - Everything the flow rule reads is seen (depths, and what stands on the
 *   squares), so this is what will happen, unless a slump in step (a) changes
 *   the pit first.
 * - Gas (step (c), `stepGas`) joins with T11.
 * - Does not change `state`.
 */
export function forecastFlows(state: GameState): GameEvent[] {
  const copy = knownCube(state);
  const events: GameEvent[] = [];
  stepFluids(copy, events, newCubePhase());
  return events;
}
