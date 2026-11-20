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
 * Contract for the camps task (T12). Called in step (e) of the cube phase
 * when `state.crew.resting` is true and the crew is alive after damage
 * (design doc 5.1; 0014 items 2 and 27).
 *
 * - Restores crew health to full (`healthRestored`).
 * - Does not clear `state.crew.resting`: `stepCrewEffects` does.
 */
export function applyRest(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet.
}
