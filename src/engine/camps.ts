// Camps (design doc 8, [Decided]; 0014 items 25 to 30).
//
// The M2 skeleton holds only what the hazard tasks need before camps exist:
// which cells a camp covers (so that `destroyCampsAt` in destroy.ts can tell
// when a hazard reaches one), and the place where rest is applied in step (e)
// of the cube phase. The rules are the camps task (M2-7, issue #57), which
// fills in the rest of this file.

import { CAMPS } from '../data';
import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import { samePosition } from './state';
import type { Camp, GameState } from './state';

/**
 * The cells of a camp (0014 item 26): `CAMPS.halfWidth` cells to each side of
 * `camp.pos` (3 x 3 with today's numbers), on `CAMPS.height` layers: the
 * layer of `camp.pos` and the ones above it (2 with today's numbers, so 18
 * cells). Listed top layer first, then by row, then by column.
 */
export function campCells(camp: Camp): Vec3[] {
  const cells: Vec3[] = [];
  // "Above" is a smaller z: the top layer of the camp is listed first.
  for (let dz = CAMPS.height - 1; dz >= 0; dz -= 1) {
    for (let dy = -CAMPS.halfWidth; dy <= CAMPS.halfWidth; dy += 1) {
      for (let dx = -CAMPS.halfWidth; dx <= CAMPS.halfWidth; dx += 1) {
        cells.push({ x: camp.pos.x + dx, y: camp.pos.y + dy, z: camp.pos.z - dz });
      }
    }
  }
  return cells;
}

/** The active camps that the cell `pos` belongs to, in the order of `state.camps`. */
export function campsAt(state: GameState, pos: Vec3): Camp[] {
  return state.camps.filter((camp) => campCells(camp).some((cell) => samePosition(cell, pos)));
}

/**
 * Contract for M2-7: true if the camp's air line is intact (0014 item 29): a
 * path of open cells joins one of the camp's cells to the surface, on which
 * every stretch that is flooded or gassy is at most
 * `CAMPS.airLineMaxBadStretch` cells long and has a vent at each end.
 *
 * Two tasks read it: `updateAir` in air.ts (M2-4; item 20, "or to an active
 * camp whose air line is intact") and `applyRest` below (M2-7). It is here
 * so that neither waits for the other. Reads the true cube (0014 item 21).
 *
 * Until M2-7 fills it in, no camp has an air line.
 */
export function campAirLineIntact(_state: GameState, _camp: Camp): boolean {
  return false;
}

/**
 * Contract for M2-7. Called in step (e) of the cube phase when
 * `state.avatar.resting` is true and the avatar is alive after damage and
 * air (0014 items 2 and 27).
 *
 * - Restores health to full (`healthRestored`), and air to full if the
 *   camp's air line is intact (`airChanged`, reason `rested`).
 * - Does not clear `state.avatar.resting`: `stepAvatarEffects` does.
 */
export function applyRest(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet.
}
