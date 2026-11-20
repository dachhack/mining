// The end of a shift: cube phase and upkeep (design doc 4).

import { SHIFT } from '../data';
import type { Vec3 } from '../data';
import { campFuelDue } from './camps';
import { stepCrewEffects } from './cube/crewEffects';
import { stepFluids } from './cube/fluids';
import { stepGas } from './cube/gas';
import { stepSlumps } from './cube/slumps';
import { newCubePhase } from './cube/phase';
import type { CubePhase } from './cube/phase';
import { stepTimers } from './cube/timers';
import type { GameEvent, RunEndCause } from './events';
import { forecastCountdowns, forecastFlows, forecastSlumps } from './forecast';
import type { CountdownForecast } from './forecast';
import { endRun, isRunActive } from './state';
import { forecastRegrowth } from './surface/regrowth';
import type { GameState } from './state';

/**
 * What the coming upkeep will do, for the end-shift preview. Every field is
 * what `endShift` would produce if the player ended the shift now.
 */
export interface UpkeepForecast {
  /** Fuel consumed by the shift: the shift's own and the camps' together. */
  fuelConsumed: number;
  /**
   * The part of `fuelConsumed` that the camps burn (design doc 4: 1 per
   * active camp every 4 shifts). 0 on a shift when no camp is due. A camp
   * that the cube phase destroys first burns nothing, so this can turn out
   * lower.
   */
  campFuelConsumed: number;
  /** Fuel after upkeep. */
  fuelAfter: number;
  /** If ending the shift will end the run, why; otherwise `null`. */
  runEnds: RunEndCause | null;
}

/**
 * Everything `previewCubePhase` reports (0014 item 4). It is a function of
 * what the player sees (0014 item 3) and nothing else.
 */
export interface ShiftForecast {
  /**
   * Part 1, countdowns: every cracked top block the player sees, with the
   * number it shows and whether its countdown is running (design doc 6.1);
   * later also every armed unstable ore and every placed explosive.
   */
  countdowns: CountdownForecast[];
  /**
   * What step (a) of the coming cube phase will do: the events it emits when
   * it is run on `knownCube(state)`. `blockFell` for each block that slumps
   * (from, to), `blockCracked` for each square that cracks, and what a slump
   * destroys. Every input of the slump rule is seen, so this is what will
   * happen, with one exception: a square whose top block slumps shows a new
   * top block, which is not seen yet and is taken to be plain rock here; if
   * it is weaker, that square may crack as well.
   */
  slumps: GameEvent[];
  /**
   * Part 2, flows: the events that step (b) of the cube phase emits when it
   * is run, after step (a), on `knownCube(state)`, the copy of the cube in
   * which every unrevealed cell is plain rock. They are ordinary engine
   * events (`fluidMoved`, `fluidRemoved`, `lavaPoured`, `stoneFormed`,
   * `structureDestroyed`, ...), in the order they would happen. Water and
   * lava stand in the open, so this is what will happen, as exactly as
   * `slumps` is. Gas (step (c)) joins with T11.
   */
  flows: GameEvent[];
  /** What upkeep will do to the gauges. */
  upkeep: UpkeepForecast;
  /**
   * The surface cells where a tree will grow back on a stump at the end of
   * this shift (issue #70; decision note 0020), in the order the surface is
   * stored. The stump, its ground and what stands on it are all seen; the
   * cube phase runs first, so this can turn out differently if it takes the
   * stump's ground.
   */
  regrowth: Vec3[];
}

// ---------------------------------------------------------------------------
// Cube phase
// ---------------------------------------------------------------------------

// The five steps of the cube phase, in the fixed order of design doc 4 and
// 0014 item 1. Each step is one function in its own file under cube/, so that
// the tasks building the hazards do not edit the same file:
//
//   (a) cube/slumps.ts         cracked blocks slump, unstable squares crack
//   (b) cube/fluids.ts         water flows, then lava; water meeting lava makes stone
//   (c) cube/gas.ts            gas spreads, vents, charges go off, ignition
//   (d) cube/timers.ts         crack countdowns tick
//   (e) cube/crewEffects.ts    recorded damage, rest, worked squares cleared
//
// During (a) to (d) the crew is not hurt: damage is recorded in the phase's
// notes (`recordDamage` in cube/phase.ts) when a hazard reaches a worked
// square, and applied in (e), in the order it was met (design doc 5.2).

/** One step of the cube phase: a name (for logs and tests) and what it does. */
export interface CubePhaseStep {
  name: string;
  run: (state: GameState, events: GameEvent[], phase: CubePhase) => void;
}

/** The cube phase's steps, in the order they run (0014 item 1, (a) to (e)). */
export const CUBE_PHASE_STEPS: CubePhaseStep[] = [
  { name: 'slumps', run: stepSlumps },
  { name: 'fluids', run: stepFluids },
  { name: 'gas', run: stepGas },
  { name: 'timers', run: stepTimers },
  { name: 'crewEffects', run: stepCrewEffects },
];

/**
 * The cube phase (design doc 4; 0014 items 1 and 2): hazards advance one step
 * in a fixed order. `endShift` in index.ts calls this first, then regrowth,
 * then upkeep.
 *
 * Contract: changes `state` in place and appends to `events`. Nothing in the
 * cube phase uses the RNG (0014 item 1).
 *
 * Runs the steps of `CUBE_PHASE_STEPS` in order, handing each the same
 * `CubePhase` notes. Step (c) is empty until its task (T11).
 */
export function runCubePhase(state: GameState, events: GameEvent[]): void {
  const phase = newCubePhase();
  for (const step of CUBE_PHASE_STEPS) {
    step.run(state, events, phase);
  }
}

// ---------------------------------------------------------------------------
// Upkeep
// ---------------------------------------------------------------------------

/**
 * Work out what upkeep would do to `state`, without changing it. Both
 * `runUpkeep` and `forecastShift` use this one function, so the preview cannot
 * disagree with what then happens.
 */
function computeUpkeep(state: GameState): UpkeepForecast {
  // Unspent AP plays no part here: it is lost when the shift ends (design
  // doc 4; issue #32). So upkeep depends only on the fuel gauge.

  // 1. No fuel: the run ends and nothing else happens.
  if (state.fuel <= 0) {
    return {
      fuelConsumed: 0,
      campFuelConsumed: 0,
      fuelAfter: state.fuel,
      runEnds: 'outOfFuel',
    };
  }

  // 2. The shift's fuel, then the fuel of each active camp whose turn it is
  //    (`campFuelDue` in camps.ts). Never more than there is, so the gauge
  //    cannot go below 0: a crew whose camps take the last of the fuel is at
  //    0 and has one last shift, like any other (decision note 0017 item 8).
  const shiftFuel = Math.min(SHIFT.fuelPerShift, state.fuel);
  const campFuelConsumed = Math.min(campFuelDue(state), state.fuel - shiftFuel);
  const fuelConsumed = shiftFuel + campFuelConsumed;

  return {
    fuelConsumed,
    campFuelConsumed,
    fuelAfter: state.fuel - fuelConsumed,
    runEnds: null,
  };
}

/**
 * Upkeep (design doc 4; 0005 item 15; issue #32). `endShift` in index.ts
 * calls this after the cube phase, if the run is still going.
 *
 * In this order, with every number from `SHIFT`:
 * 1. If fuel is 0, end the run: `endRun(state, 'lost', 'outOfFuel', events)`,
 *    and stop. The shift number and `state.ap` are left as they were. So a
 *    player may finish a shift on 0 fuel and survive only by crafting fuel
 *    before the next upkeep.
 * 2. Otherwise consume the shift's fuel and that of each active camp that is
 *    due, as one amount (`fuelChanged`, reason `upkeep`).
 * 3. Start the next shift: add 1 to `state.shift`, reset `state.ap`, and emit
 *    `shiftEnded`. Unspent AP is lost: it does not carry over and does not
 *    become fuel.
 *
 * There is no lamp oil to burn: light is gone (design doc v0.2).
 * Reveal is not this function's job: `endShift` calls `updateReveal` after it.
 */
export function runUpkeep(state: GameState, events: GameEvent[]): void {
  const upkeep = computeUpkeep(state);

  // 1. Out of fuel: the run ends here.
  if (upkeep.runEnds !== null) {
    endRun(state, 'lost', upkeep.runEnds, events);
    return;
  }

  // 2. The shift's fuel.
  if (upkeep.fuelConsumed > 0) {
    state.fuel -= upkeep.fuelConsumed;
    events.push({
      type: 'fuelChanged',
      delta: -upkeep.fuelConsumed,
      fuel: state.fuel,
      reason: 'upkeep',
    });
  }

  // 3. The next shift begins, with fresh AP whatever was left unspent.
  const endedShift = state.shift;
  state.shift = endedShift + 1;
  state.ap = SHIFT.apPerShift;
  events.push({ type: 'shiftEnded', shift: endedShift, nextShift: state.shift });
}

/**
 * What ending the shift now would do (0014 item 4): the countdowns and flows
 * the player can work out, and upkeep's effect on fuel.
 * `previewCubePhase` in index.ts returns this.
 *
 * - Does not change `state`, and is a function of what the player sees
 *   (0014 item 3) and nothing else: changing any unrevealed cell must not
 *   change the result.
 * - `countdowns`, `slumps` and `flows` come from forecast.ts; gas joins
 *   `flows` with T11.
 * - `upkeep` agrees with what `runUpkeep` then does when the cube phase does
 *   not end the run first (both use `computeUpkeep`).
 * - Throws if the run has already ended, as `endShift` does.
 */
export function forecastShift(state: GameState): ShiftForecast {
  if (!isRunActive(state)) {
    throw new Error('The run has ended; there is no shift to forecast');
  }
  return {
    countdowns: forecastCountdowns(state),
    slumps: forecastSlumps(state),
    flows: forecastFlows(state),
    upkeep: computeUpkeep(state),
    regrowth: forecastRegrowth(state),
  };
}
