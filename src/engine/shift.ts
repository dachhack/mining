// The end of a shift: cube phase and upkeep (design doc 4).

import { SHIFT } from '../data';
import type { Vec3 } from '../data';
import type { GameEvent, RunEndCause } from './events';
import { endRun, isRunActive } from './state';
import type { GameState } from './state';

/**
 * One thing the cube phase is going to do to a hazard the player knows about,
 * shown by the end-shift preview (design doc 11). M1 has no hazards, so
 * nothing produces one yet; M2 will extend this.
 */
export interface HazardForecast {
  /** What kind of hazard, e.g. "caveIn". */
  kind: string;
  /** The cells it will affect. */
  cells: Vec3[];
  /** How many shifts from now: 1 means "in the coming cube phase". */
  inShifts: number;
}

/**
 * What the coming upkeep will do, for the end-shift preview. Every field is
 * what `endShift` would produce if the player ended the shift now.
 */
export interface UpkeepForecast {
  /** Unspent AP that will go into the banked counter. */
  apBanked: number;
  /** The banked counter after upkeep. */
  bankedApAfter: number;
  /** Fuel refunded from banked AP. */
  fuelRefunded: number;
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
 * Everything `previewCubePhase` reports: what the cube phase will do to known
 * hazards, and what upkeep will do to the gauges.
 */
export interface ShiftForecast {
  hazards: HazardForecast[];
  upkeep: UpkeepForecast;
}

// ---------------------------------------------------------------------------
// Cube phase
// ---------------------------------------------------------------------------

// The five steps of the cube phase, in the order design doc 4 gives them.
// M1 has no hazards, so each is an empty hook: it exists so that M2 has one
// obvious place for each hazard and the order is already fixed.

/** (a) Support check and falling blocks. Empty until M2. */
function stepSupportAndFallingBlocks(_state: GameState, _events: GameEvent[]): void {
  // Nothing in M1.
}

/** (b) Fluids flow. Empty until M2. */
function stepFluidsFlow(_state: GameState, _events: GameEvent[]): void {
  // Nothing in M1.
}

/** (c) Gas spreads. Empty until M2. */
function stepGasSpreads(_state: GameState, _events: GameEvent[]): void {
  // Nothing in M1.
}

/** (d) Timers tick. Empty until M2. */
function stepTimersTick(_state: GameState, _events: GameEvent[]): void {
  // Nothing in M1.
}

/** (e) Damage is applied to the avatar and structures. Empty until M2. */
function stepApplyDamage(_state: GameState, _events: GameEvent[]): void {
  // Nothing in M1.
}

/** One step of the cube phase: a name (for logs and tests) and what it does. */
export interface CubePhaseStep {
  name: string;
  run: (state: GameState, events: GameEvent[]) => void;
}

/** The cube phase's steps, in the order they run (design doc 4, (a) to (e)). */
export const CUBE_PHASE_STEPS: CubePhaseStep[] = [
  { name: 'supportAndFallingBlocks', run: stepSupportAndFallingBlocks },
  { name: 'fluidsFlow', run: stepFluidsFlow },
  { name: 'gasSpreads', run: stepGasSpreads },
  { name: 'timersTick', run: stepTimersTick },
  { name: 'applyDamage', run: stepApplyDamage },
];

/**
 * The cube phase (design doc 4): hazards advance one step in a fixed order.
 * `endShift` in index.ts calls this first.
 *
 * Contract: changes `state` in place and appends to `events`. Must use only
 * `state.rng` for randomness.
 *
 * Runs the steps of `CUBE_PHASE_STEPS` in order. All five are empty in M1, so
 * nothing happens yet.
 */
export function runCubePhase(state: GameState, events: GameEvent[]): void {
  for (const step of CUBE_PHASE_STEPS) {
    step.run(state, events);
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
  // 1. Unspent AP goes into the banked counter; every full `bankedApPerRefund`
  //    in the counter comes off it and refunds fuel (0005 item 20).
  const apBanked = state.ap;
  const counter = state.bankedAp + apBanked;
  const refundSteps = Math.floor(counter / SHIFT.bankedApPerRefund);
  const bankedApAfter = counter - refundSteps * SHIFT.bankedApPerRefund;
  const fuelRefunded = refundSteps * SHIFT.fuelPerRefund;
  const fuelAfterRefund = state.fuel + fuelRefunded;

  // 2. No fuel even after the refund: the run ends and nothing else happens
  //    (0005 item 21).
  if (fuelAfterRefund <= 0) {
    return {
      apBanked,
      bankedApAfter,
      fuelRefunded,
      fuelConsumed: 0,
      fuelAfter: fuelAfterRefund,
      lampOilBurned: 0,
      lampOilAfter: state.lampOil,
      runEnds: 'outOfFuel',
    };
  }

  // 3. The shift's fuel. Never more than there is, so the gauge cannot go
  //    below 0 if `fuelPerShift` is ever tuned above 1.
  const fuelConsumed = Math.min(SHIFT.fuelPerShift, fuelAfterRefund);

  // 4. Lamp oil burns at the upkeep that ends every Nth shift of the run,
  //    counting the first shift as 1 (owner question 29).
  const shiftsPlayed = state.shift - SHIFT.firstShiftNumber + 1;
  const burnIsDue = shiftsPlayed % SHIFT.lampOilBurnEveryShifts === 0;
  const lampOilBurned = burnIsDue ? Math.min(SHIFT.lampOilPerBurn, state.lampOil) : 0;

  return {
    apBanked,
    bankedApAfter,
    fuelRefunded,
    fuelConsumed,
    fuelAfter: fuelAfterRefund - fuelConsumed,
    lampOilBurned,
    lampOilAfter: state.lampOil - lampOilBurned,
    runEnds: null,
  };
}

/**
 * Upkeep (design doc 4; 0005 items 15, 20 and 21). `endShift` in index.ts
 * calls this after the cube phase, if the run is still going.
 *
 * In this order, with every number from `SHIFT`:
 * 1. Add the unspent `state.ap` to `state.bankedAp`; for each full refund
 *    step in the counter, take it off and add fuel. All the refund steps of
 *    one upkeep are reported as a single `fuelChanged` (reason
 *    `bankedApRefund`). Then emit `apBanked` with the AP added and the
 *    counter as it now stands, even when the amount is 0.
 * 2. If fuel is 0, end the run: `endRun(state, 'death', 'outOfFuel', events)`,
 *    and stop. The shift number and `state.ap` are left as they were.
 * 3. Otherwise consume the shift's fuel (`fuelChanged`, reason `upkeep`).
 * 4. Burn lamp oil when it is due (`lampOilChanged`, reason `upkeep`): at the
 *    upkeep that ends every `lampOilBurnEveryShifts`-th shift of the run,
 *    counting the first shift as 1 (so with 4, at the end of the 4th, 8th,
 *    ... shift), and only if there is oil left.
 * 5. Start the next shift: add 1 to `state.shift`, reset `state.ap`, and emit
 *    `shiftEnded`. Unspent AP is not carried over as AP.
 *
 * Reveal is not this function's job: `endShift` calls `updateReveal` after
 * it, which is how the light shrinks when the oil runs out.
 */
export function runUpkeep(state: GameState, events: GameEvent[]): void {
  const upkeep = computeUpkeep(state);

  // 1. Bank the unspent AP and pay any refund.
  state.bankedAp = upkeep.bankedApAfter;
  if (upkeep.fuelRefunded > 0) {
    state.fuel += upkeep.fuelRefunded;
    events.push({
      type: 'fuelChanged',
      delta: upkeep.fuelRefunded,
      fuel: state.fuel,
      reason: 'bankedApRefund',
    });
  }
  events.push({ type: 'apBanked', amount: upkeep.apBanked, bankedAp: state.bankedAp });

  // 2. Out of fuel: the run ends here.
  if (upkeep.runEnds !== null) {
    endRun(state, 'death', upkeep.runEnds, events);
    return;
  }

  // 3. The shift's fuel.
  if (upkeep.fuelConsumed > 0) {
    state.fuel -= upkeep.fuelConsumed;
    events.push({
      type: 'fuelChanged',
      delta: -upkeep.fuelConsumed,
      fuel: state.fuel,
      reason: 'upkeep',
    });
  }

  // 4. Lamp oil.
  if (upkeep.lampOilBurned > 0) {
    state.lampOil -= upkeep.lampOilBurned;
    events.push({
      type: 'lampOilChanged',
      delta: -upkeep.lampOilBurned,
      lampOil: state.lampOil,
      reason: 'upkeep',
    });
  }

  // 5. The next shift begins.
  const endedShift = state.shift;
  state.shift = endedShift + 1;
  state.ap = SHIFT.apPerShift;
  events.push({ type: 'shiftEnded', shift: endedShift, nextShift: state.shift });
}

/**
 * What ending the shift now would do: the cube phase's effect on hazards the
 * player knows about, and upkeep's effect on the gauges. `previewCubePhase`
 * in index.ts returns this.
 *
 * - Does not change `state`, and reveals nothing the player could not know.
 * - `upkeep` agrees with what `runUpkeep` then does (both use
 *   `computeUpkeep`). This holds in M1 because the cube phase is empty; once
 *   M2's hazards can change the gauges or end the run first, the forecast
 *   must take them into account.
 * - `hazards` is empty in M1.
 * - Throws if the run has already ended, as `endShift` does.
 */
export function forecastShift(state: GameState): ShiftForecast {
  if (!isRunActive(state)) {
    throw new Error('The run has ended; there is no shift to forecast');
  }
  return { hazards: [], upkeep: computeUpkeep(state) };
}
