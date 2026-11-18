// The end of a shift: cube phase and upkeep. STUB: filled in by M1 task 5.

import type { Vec3 } from '../data';
import type { GameEvent } from './events';
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
 *    `bankedApRefund`).
 * 2. If fuel is 0, end the run: `endRun(state, 'death', 'outOfFuel', events)`,
 *    and stop.
 * 3. Otherwise consume the shift's fuel (`fuelChanged`, reason `upkeep`).
 * 4. Burn lamp oil when it is due (`lampOilChanged`, reason `upkeep`).
 * 5. Start the next shift: add 1 to `state.shift`, reset `state.ap`, and emit
 *    `shiftEnded`.
 *
 * Stub behaviour: does nothing.
 */
export function runUpkeep(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet.
}

/**
 * What the coming cube phase will do to hazards the player knows about.
 * Must not change `state`, and must not reveal anything the player could not
 * know.
 *
 * Stub behaviour: returns an empty list.
 */
export function forecastCubePhase(_state: GameState): HazardForecast[] {
  return [];
}
