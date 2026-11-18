// The end of a shift: cube phase and upkeep (design doc 4).

import { SHIFT } from '../data';
import { campFuelDue } from './camps';
import { stepAvatarEffects } from './cube/avatarEffects';
import { stepCaveIns } from './cube/caveIns';
import { stepFluids } from './cube/fluids';
import { stepGas } from './cube/gas';
import { newCubePhase } from './cube/phase';
import type { CubePhase } from './cube/phase';
import { stepTimers } from './cube/timers';
import type { GameEvent, RunEndCause } from './events';
import { forecastCountdowns, forecastFlows } from './forecast';
import type { CountdownForecast } from './forecast';
import { endRun, isRunActive } from './state';
import type { GameState } from './state';

/**
 * What the coming upkeep will do, for the end-shift preview. Every field is
 * what `endShift` would produce if the player ended the shift now.
 */
export interface UpkeepForecast {
  /** Fuel consumed by the shift. */
  fuelConsumed: number;
  /** Fuel after upkeep. */
  fuelAfter: number;
  /** Lamp oil burned. */
  lampOilBurned: number;
  /** Lamp oil after upkeep. */
  lampOilAfter: number;
  /** If ending the shift will end the run, why; otherwise `null`. */
  runEnds: RunEndCause | null;
}

/**
 * Everything `previewCubePhase` reports (0014 item 4). It is a function of
 * what the player sees (0014 item 3) and nothing else.
 */
export interface ShiftForecast {
  /**
   * Part 1, countdowns: every revealed block whose countdown is running and
   * shows 1, every armed unstable ore, and every placed explosive. A
   * countdown cannot turn out differently.
   */
  countdowns: CountdownForecast[];
  /**
   * Part 2, flows: the events that steps (b) and (c) of the cube phase emit
   * when they are run on `knownCube(state)`, the copy of the cube in which
   * every unrevealed cell is plain rock. They are ordinary engine events
   * (`fluidMoved`, `gasMoved`, `exploded`, `structureDestroyed`, ...), in the
   * order they would happen. A flow can turn out differently when something
   * unseen takes part.
   */
  flows: GameEvent[];
  /** What upkeep will do to the gauges. */
  upkeep: UpkeepForecast;
}

// ---------------------------------------------------------------------------
// Cube phase
// ---------------------------------------------------------------------------

// The five steps of the cube phase, in the fixed order of design doc 4 and
// 0014 item 1. Each step is one function in its own file under cube/, so that
// the tasks building the hazards do not edit the same file:
//
//   (a) cube/caveIns.ts        support check and falling blocks
//   (b) cube/fluids.ts         water, then lava, then water beside lava
//   (c) cube/gas.ts            gas spreads, vents, charges go off, ignition
//   (d) cube/timers.ts         crack timers tick
//   (e) cube/avatarEffects.ts  recorded damage, air, rest
//
// During (a) to (d) the avatar does not move and is not hurt: damage is
// recorded in the phase's notes (`recordDamage` in cube/phase.ts) and applied
// in (e), in the order it happened (0014 item 2).

/** One step of the cube phase: a name (for logs and tests) and what it does. */
export interface CubePhaseStep {
  name: string;
  run: (state: GameState, events: GameEvent[], phase: CubePhase) => void;
}

/** The cube phase's steps, in the order they run (0014 item 1, (a) to (e)). */
export const CUBE_PHASE_STEPS: CubePhaseStep[] = [
  { name: 'caveIns', run: stepCaveIns },
  { name: 'fluids', run: stepFluids },
  { name: 'gas', run: stepGas },
  { name: 'timers', run: stepTimers },
  { name: 'avatarEffects', run: stepAvatarEffects },
];

/**
 * The cube phase (design doc 4; 0014 items 1 and 2): hazards advance one step
 * in a fixed order. `endShift` in index.ts calls this first, then `settle`
 * (the one fall the phase may cause), then upkeep.
 *
 * Contract: changes `state` in place and appends to `events`. Nothing in the
 * cube phase uses the RNG (0014 item 1).
 *
 * Runs the steps of `CUBE_PHASE_STEPS` in order, handing each the same
 * `CubePhase` notes. Steps (a) to (d) are empty until their M2 tasks, and
 * with nothing recorded step (e) changes nothing, so the game plays as in M1.
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
  // doc 4; issue #32). So upkeep depends only on the gauges and the shift.

  // 1. No fuel: the run ends and nothing else happens.
  if (state.fuel <= 0) {
    return {
      fuelConsumed: 0,
      fuelAfter: state.fuel,
      lampOilBurned: 0,
      lampOilAfter: state.lampOil,
      runEnds: 'outOfFuel',
    };
  }

  // 2. The shift's fuel: the avatar's own, plus 1 for each active camp whose
  //    turn it is (every 4th shift, counted from the shift it was founded;
  //    design doc 4, 0014 item 28). Never more than there is, so the gauge
  //    cannot go below 0: a miner whose camps take the last of the fuel is at
  //    0 and has one last shift, like any other (design doc 4).
  const fuelConsumed = Math.min(SHIFT.fuelPerShift + campFuelDue(state), state.fuel);

  // 3. Lamp oil burns at the upkeep that ends every Nth shift of the run,
  //    counting the first shift as 1 (owner question 29).
  const shiftsPlayed = state.shift - SHIFT.firstShiftNumber + 1;
  const burnIsDue = shiftsPlayed % SHIFT.lampOilBurnEveryShifts === 0;
  const lampOilBurned = burnIsDue ? Math.min(SHIFT.lampOilPerBurn, state.lampOil) : 0;

  return {
    fuelConsumed,
    fuelAfter: state.fuel - fuelConsumed,
    lampOilBurned,
    lampOilAfter: state.lampOil - lampOilBurned,
    runEnds: null,
  };
}

/**
 * Upkeep (design doc 4; 0005 item 15; issue #32). `endShift` in index.ts
 * calls this after the cube phase, if the run is still going.
 *
 * In this order, with every number from `SHIFT`:
 * 1. If fuel is 0, end the run: `endRun(state, 'death', 'outOfFuel', events)`,
 *    and stop. The shift number and `state.ap` are left as they were. So a
 *    player may finish a shift on 0 fuel and survive only by crafting fuel
 *    before the next upkeep.
 * 2. Otherwise consume the shift's fuel (`fuelChanged`, reason `upkeep`): the
 *    avatar's own and that of each active camp that is due (`campFuelDue` in
 *    camps.ts), as one amount, and never more than there is.
 * 3. Burn lamp oil when it is due (`lampOilChanged`, reason `upkeep`): at the
 *    upkeep that ends every `lampOilBurnEveryShifts`-th shift of the run,
 *    counting the first shift as 1 (so with 4, at the end of the 4th, 8th,
 *    ... shift), and only if there is oil left.
 * 4. Start the next shift: add 1 to `state.shift`, reset `state.ap`, and emit
 *    `shiftEnded`. Unspent AP is lost: it does not carry over and does not
 *    become fuel.
 *
 * Reveal is not this function's job: `endShift` calls `updateReveal` after
 * it, which is how the light shrinks when the oil runs out.
 */
export function runUpkeep(state: GameState, events: GameEvent[]): void {
  const upkeep = computeUpkeep(state);

  // 1. Out of fuel: the run ends here.
  if (upkeep.runEnds !== null) {
    endRun(state, 'death', upkeep.runEnds, events);
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

  // 3. Lamp oil.
  if (upkeep.lampOilBurned > 0) {
    state.lampOil -= upkeep.lampOilBurned;
    events.push({
      type: 'lampOilChanged',
      delta: -upkeep.lampOilBurned,
      lampOil: state.lampOil,
      reason: 'upkeep',
    });
  }

  // 4. The next shift begins, with fresh AP whatever was left unspent.
  const endedShift = state.shift;
  state.shift = endedShift + 1;
  state.ap = SHIFT.apPerShift;
  events.push({ type: 'shiftEnded', shift: endedShift, nextShift: state.shift });
}

/**
 * What ending the shift now would do (0014 item 4): the countdowns and flows
 * the player can work out, and upkeep's effect on the gauges.
 * `previewCubePhase` in index.ts returns this.
 *
 * - Does not change `state`, and is a function of what the player sees
 *   (0014 item 3) and nothing else: changing any unrevealed cell must not
 *   change the result.
 * - `countdowns` and `flows` come from forecast.ts, and are empty until the
 *   tells and forecast task (M2-6, issue #56) fills that file in.
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
    flows: forecastFlows(state),
    upkeep: computeUpkeep(state),
  };
}
