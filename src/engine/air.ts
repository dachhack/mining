// Air (design doc 5.1; 0014 items 20 and 21).
//
// The avatar has CONNECTED AIR when a path of breathable cells joins its own
// cell to the surface, or to a cell of an active camp whose air line is
// intact (0014 item 29; airLine.ts, the camps task). A breathable cell is
// open and neither flooded nor gassy. With connected air the avatar's air
// refills fully in step (e) of the cube phase; without it, the avatar loses
// air each shift. An avatar standing in a flooded or gassy cell never has
// connected air, because the path starts in its own cell.
//
// All of this reads the TRUE cube, unrevealed cells included (0014 item 21):
// a miner can feel whether the air is fresh. That makes "the air is fresh /
// stale" one of the few things shown to the player that can depend on cells
// it has not seen. It must never be used to decide which actions are offered
// or what they cost.

import { HAZARDS } from '../data';
import type { Vec3 } from '../data';
import { campAirLineIntact } from './airLine';
import { campCells } from './camps';
import type { GameEvent } from './events';
import { FACE_OFFSETS, offsetPosition } from './neighbours';
import { cellIndex, gasAt, inGrid, isOpen, isSurface, waterAt } from './state';
import type { GameState } from './state';

/**
 * True if air can be breathed in, and pass through, the cell `pos`: it is
 * open, holds no water, and is not gassy (0014 item 13: a cell with 1 or
 * more units of gas is gassy). The surface is always breathable.
 *
 * Lava is not named by item 20 ("neither flooded nor gassy"), and 0014 uses
 * "flooded" for water only, so a cell of lava does not stop air.
 */
export function isBreathable(state: GameState, pos: Vec3): boolean {
  return isOpen(state, pos) && waterAt(state, pos) === 0 && gasAt(state, pos) === 0;
}

/**
 * Does the avatar have connected air (0014 item 20)? Reads the true cube and
 * does not change `state`.
 *
 * The search spreads from the avatar's cell through breathable cells, face
 * to face, and stops as soon as it reaches the surface. If it never does, it
 * asks whether one of the cells it reached belongs to an active camp whose
 * air line is intact.
 */
export function hasConnectedAir(state: GameState): boolean {
  const size = state.size;
  const start = state.avatar.pos;
  if (isSurface(size, start)) {
    return true;
  }
  if (!inGrid(size, start) || !isBreathable(state, start)) {
    return false;
  }

  // `reached` holds the index of every cell the search has been to; `queue`
  // holds the cells whose neighbours are still to be looked at.
  const reached = new Set<number>([cellIndex(size, start)]);
  const queue: Vec3[] = [start];
  while (queue.length > 0) {
    const pos = queue.pop() as Vec3;
    for (const offset of FACE_OFFSETS) {
      const beside = offsetPosition(pos, offset);
      if (isSurface(size, beside)) {
        return true;
      }
      if (!inGrid(size, beside) || !isBreathable(state, beside)) {
        continue;
      }
      const index = cellIndex(size, beside);
      if (!reached.has(index)) {
        reached.add(index);
        queue.push(beside);
      }
    }
  }

  // No way to the surface. A camp with an intact air line will do instead.
  for (const camp of state.camps) {
    const touchesCamp = campCells(camp).some(
      (cell) => inGrid(size, cell) && reached.has(cellIndex(size, cell)),
    );
    if (touchesCamp && campAirLineIntact(state, camp)) {
      return true;
    }
  }
  return false;
}

/** What the miner feels of the air (0014 item 21). */
export type AirTell = 'fresh' | 'stale';

/**
 * The tell "the air is fresh" / "the air is stale": whether the avatar has
 * connected air, worked out on the true cube like damp stone. It is for
 * showing to the player only. It can depend on unrevealed cells, so it must
 * not enter the action list, an action's cost, or the forecast.
 */
export function airTell(state: GameState): AirTell {
  return hasConnectedAir(state) ? 'fresh' : 'stale';
}

/**
 * Called once in step (e) of every cube phase, after the recorded damage,
 * while the run is still going.
 *
 * - With connected air the avatar's air refills fully; without it (which
 *   includes standing in a flooded or gassy cell) it loses
 *   `HAZARDS.air.lossPerShift` (0014 item 20).
 * - Changes `state.avatar.air` (never below 0) and emits `airChanged` when it
 *   changed.
 * - Does NOT end the run: `stepAvatarEffects` checks for air at 0 straight
 *   after, and decides between drowned and suffocated.
 * - Reads the true cube (0014 item 21).
 */
export function updateAir(state: GameState, events: GameEvent[]): void {
  const before = state.avatar.air;
  const connected = hasConnectedAir(state);
  const after = connected ? HAZARDS.air.max : Math.max(0, before - HAZARDS.air.lossPerShift);
  if (after === before) {
    return;
  }
  state.avatar.air = after;
  events.push({
    type: 'airChanged',
    delta: after - before,
    air: after,
    reason: connected ? 'refilled' : 'noAir',
  });
}
