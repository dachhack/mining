// The hazard parts of the end-shift forecast (design doc 11; 0014 item 4).
//
// The cracks and the slumps are built (issue #94). The flows are empty until
// water, lava and gas are (T10, T11). `forecastShift` in shift.ts calls these
// functions and adds the upkeep part.

import type { Vec3 } from '../data';
import { newCubePhase } from './cube/phase';
import { stepSlumps } from './cube/slumps';
import type { GameEvent } from './events';
import { depthIn, depthMapOf } from './heightmap';
import { knownCube, knownSquare } from './known';
import { stabilityIn } from './slump';
import type { GameState } from './state';

/**
 * One countdown the player can read. Three kinds:
 *
 * - `slump`: the cracked top block at `pos` (design doc 6.1). `running` is
 *   true while its square is unstable; a stopped countdown keeps its number
 *   and goes on if the square becomes unstable again. `to` is the cell where
 *   the block would come to rest if it fell as the pit stands now (on top of
 *   the foot of its slide path), or `null` while the countdown is stopped.
 * - `unstableOre`: the armed unstable ore at `pos` (T11).
 * - `explosive`: the placed explosive at `pos` (T11).
 *
 * `inShifts` is how many cube phases from now: 1 means "in the coming cube
 * phase". For a cracked block it is the stored timer plus 1, the number the
 * player is shown on the block.
 *
 * This is a tagged union, like `Action`: `kind` says which fields there are.
 */
export type CountdownForecast =
  | { kind: 'slump'; pos: Vec3; inShifts: number; running: boolean; to: Vec3 | null }
  | { kind: 'unstableOre'; pos: Vec3; inShifts: number }
  | { kind: 'explosive'; pos: Vec3; inShifts: number };

/**
 * Part 1 of the forecast, the countdowns: every cracked top block the player
 * sees, row by row (y, then x).
 *
 * A square is read through `knownSquare`, and whether its countdown is
 * running through `stabilityIn`, which reads depths, trees, supports and
 * seen top blocks only. So the result cannot depend on anything hidden.
 * Armed unstable ore and placed explosives join the list with T11.
 * Does not change `state`.
 */
export function forecastCountdowns(state: GameState): CountdownForecast[] {
  const map = depthMapOf(state);
  const countdowns: CountdownForecast[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const square = knownSquare(state, x, y);
      if (square.top === null || square.top.crackTimer === null) {
        continue;
      }
      const check = stabilityIn(state, map, x, y);
      const footDepth = depthIn(map, check.foot.x, check.foot.y);
      countdowns.push({
        kind: 'slump',
        pos: { x, y, z: square.depth },
        inShifts: square.top.crackTimer + 1,
        running: check.unstable,
        to: check.unstable ? { x: check.foot.x, y: check.foot.y, z: footDepth - 1 } : null,
      });
    }
  }
  return countdowns;
}

/**
 * What step (a) of the coming cube phase will do: run `stepSlumps` on
 * `knownCube(state)`, the copy in which every unseen cell is plain rock with
 * nothing in it, and return the events it emits (`blockFell`, `blockCracked`,
 * `structureDestroyed`, ...). See `ShiftForecast.slumps` in shift.ts for how
 * exact this is. Does not change `state`.
 */
export function forecastSlumps(state: GameState): GameEvent[] {
  const copy = knownCube(state);
  const events: GameEvent[] = [];
  stepSlumps(copy, events, newCubePhase());
  return events;
}

/**
 * Contract for T10 and T11: part 2 of the forecast, the flows.
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
