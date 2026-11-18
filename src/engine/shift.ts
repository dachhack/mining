// The end of a shift: cube phase and upkeep. STUB: filled in by M1 task 5.

import type { Vec3 } from '../data';
import type { GameEvent, RunEndCause } from './events';
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

/**
 * The cube phase (design doc 4): hazards advance one step in a fixed order.
 * `endShift` in index.ts calls this first.
 *
 * Contract: changes `state` in place and appends to `events`. Must use only
 * `state.rng` for randomness.
 *
 * Stub behaviour: does nothing. M1 has no hazards, so this stays empty until
 * M2 adds them; it exists so that the order of an end of shift is fixed now.
 */
export function runCubePhase(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet.
}

/**
 * Upkeep (design doc 4; 0005 items 15, 20 and 21). `endShift` in index.ts
 * calls this after the cube phase, if the run is still going.
 *
 * Contract, in this order, with every number from `SHIFT`:
 * 1. Add the unspent `state.ap` to `state.bankedAp`; for each full refund
 *    step in the counter, take it off and add fuel (`fuelChanged`, reason
 *    `bankedApRefund`). Then emit `apBanked` with the AP added and the
 *    counter as it now stands, even when the amount is 0.
 * 2. If fuel is 0, end the run: `endRun(state, 'death', 'outOfFuel', events)`,
 *    and stop.
 * 3. Otherwise consume the shift's fuel (`fuelChanged`, reason `upkeep`).
 * 4. Burn lamp oil when it is due (`lampOilChanged`, reason `upkeep`): at the
 *    upkeep that ends every `lampOilBurnEveryShifts`-th shift of the run,
 *    counting the first shift as 1 (so with 4, at the end of the 4th, 8th,
 *    ... shift), and only if there is oil left.
 * 5. Start the next shift: add 1 to `state.shift`, reset `state.ap`, and emit
 *    `shiftEnded`.
 *
 * Reveal is not this function's job: `endShift` calls `updateReveal` after
 * it, which is how the light shrinks when the oil runs out.
 *
 * Stub behaviour: does nothing.
 */
export function runUpkeep(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet.
}

/**
 * What ending the shift now would do: the cube phase's effect on hazards the
 * player knows about, and upkeep's effect on the gauges. `previewCubePhase`
 * in index.ts returns this.
 *
 * Contract:
 * - Must not change `state`, and must not reveal anything the player could
 *   not know.
 * - `upkeep` must agree with what `runUpkeep` then does.
 * - `hazards` is empty in M1.
 *
 * Stub behaviour: no hazards, and an upkeep that changes nothing.
 */
export function forecastShift(state: GameState): ShiftForecast {
  return {
    hazards: [],
    upkeep: {
      apBanked: 0,
      bankedApAfter: state.bankedAp,
      fuelRefunded: 0,
      fuelConsumed: 0,
      fuelAfter: state.fuel,
      lampOilBurned: 0,
      lampOilAfter: state.lampOil,
      runEnds: null,
    },
  };
}
