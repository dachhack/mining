// The hazard parts of the end-shift forecast (design doc 11; 0014 item 4).
//
// The cracks and the slumps are built (issue #94), the flows of water and
// lava (issue #99), and gas, charges and ignition (issue #103).
// `forecastShift` in shift.ts calls `forecastHazards` and adds the upkeep
// part.

import type { Vec3 } from '../data';
import { stepFluids } from './cube/fluids';
import { stepGas } from './cube/gas';
import { newCubePhase } from './cube/phase';
import { stepSlumps } from './cube/slumps';
import type { GameEvent } from './events';
import { depthIn, depthMapOf } from './heightmap';
import { knownCube, knownSquare } from './known';
import { stabilityIn } from './slump';
import { isRevealed } from './state';
import type { GameState } from './state';

/**
 * One countdown the player can read. Three kinds:
 *
 * - `slump`: the cracked top block at `pos` (design doc 6.1). `running` is
 *   true while its square is unstable; a stopped countdown keeps its number
 *   and goes on if the square becomes unstable again. `to` is the cell where
 *   the block would come to rest if it fell as the pit stands now (on top of
 *   the foot of its slide path), or `null` while the countdown is stopped.
 * - `unstableOre`: the armed unstable ore block at `pos` (design doc 6.6).
 * - `explosive`: the placed explosive on the top block at `pos`.
 *   Both go off in the coming cube phase: `inShifts` is always 1.
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
 * After the cracks come the armed charges (armed unstable ore and placed
 * explosives), in the order of `state.armed`; only ones on a block the
 * player has seen, which every one is: ore is armed only while known, and an
 * explosive is placed on a top block.
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
  for (const charge of state.armed) {
    if (isRevealed(state, charge.pos)) {
      countdowns.push({ kind: charge.kind, pos: { ...charge.pos }, inShifts: 1 });
    }
  }
  return countdowns;
}

/** The three hazard parts of the forecast: see `ShiftForecast` in shift.ts. */
export interface HazardForecast {
  slumps: GameEvent[];
  flows: GameEvent[];
  gas: GameEvent[];
}

/**
 * What steps (a), (b) and (c) of the coming cube phase will do to what the
 * player sees (design doc 6 and 11): the steps are run in order on
 * `knownCube(state)`, the copy in which every unrevealed cell is plain rock
 * with nothing in it, and the events of each are returned apart.
 *
 * - `slumps`: step (a), `stepSlumps`: `blockFell`, `blockCracked`, what a
 *   slump destroys.
 * - `flows`: step (b), `stepFluids`: `fluidMoved`, `fluidRemoved`,
 *   `lavaPoured`, `stoneFormed`, what water or lava destroys.
 * - `gas`: step (c), `stepGas`: `gasMoved`, `exploded` for each charge, armed
 *   ore and gas explosion, `blockDestroyed`, `treeDestroyed`, `gasRemoved`,
 *   and what an explosion destroys.
 *
 * Each step runs after the ones before it, because a slump changes the pit
 * the water then flows in, and lava that has flowed lights gas.
 *
 * NO DICE. The phase is marked as a forecast (`CubePhase.forecast`), so a
 * relic or keystone in a blast is not rolled for: the forecast says
 * `blockMayBeDestroyed` and nothing is drawn from the RNG, not even from the
 * copy's (decision note 0017 item 3).
 *
 * HOW EXACT. Everything these steps read is seen (depths, tops, what stands
 * on squares, structures, armed charges), so this is what will happen, with
 * one kind of exception: a top block that a slump or a blast removes shows a
 * new top block, which is not seen yet and is taken to be plain rock with
 * solid rock under it. If it is weaker it may crack as well, and if it was
 * the roof of a cavern or pocket, the space collapses and its contents come
 * out, which the forecast cannot know.
 *
 * Does not change `state`.
 */
export function forecastHazards(state: GameState): HazardForecast {
  const copy = knownCube(state);
  const phase = newCubePhase(true);
  const slumps: GameEvent[] = [];
  stepSlumps(copy, slumps, phase);
  const flows: GameEvent[] = [];
  stepFluids(copy, flows, phase);
  const gas: GameEvent[] = [];
  stepGas(copy, gas, phase);
  return { slumps, flows, gas };
}

/**
 * What step (a) of the coming cube phase will do: `forecastHazards(state).slumps`.
 * See `ShiftForecast.slumps` in shift.ts for how exact this is. Does not
 * change `state`.
 */
export function forecastSlumps(state: GameState): GameEvent[] {
  return forecastHazards(state).slumps;
}

/**
 * Part 2 of the forecast, the flows: what step (b) of the coming cube phase
 * will do to the water and lava the player sees: `forecastHazards(state).flows`.
 * Does not change `state`.
 */
export function forecastFlows(state: GameState): GameEvent[] {
  return forecastHazards(state).flows;
}

/**
 * Part 3 of the forecast: what step (c) of the coming cube phase will do: gas
 * spreading, charges and armed ore going off, gas burning:
 * `forecastHazards(state).gas`. Does not change `state`.
 */
export function forecastGas(state: GameState): GameEvent[] {
  return forecastHazards(state).gas;
}
