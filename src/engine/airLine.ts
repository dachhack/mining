// A camp's air line (design doc 8; 0014 item 29).
//
// A stub until the camps task (M2-7, issue #57) fills it in. It is in a file
// of its own because two tasks meet here: M2-7 writes the rule, and the air
// task (M2-4, issue #54) only calls it from `updateAir` in air.ts (0014 item
// 20: "or to an active camp whose air line is intact"). So each task edits
// its own file and neither waits for the other.

import type { Camp, GameState } from './state';

/**
 * Contract for M2-7: true if the camp's air line is intact (0014 item 29): a
 * path of open cells joins one of the camp's cells (`campCells` in camps.ts)
 * to the surface, on which every stretch that is flooded or gassy is at most
 * `CAMPS.airLineMaxBadStretch` cells long and has a vent at each end.
 *
 * Reads the true cube, like the air rule itself (0014 item 21). Does not
 * change `state`.
 *
 * Until M2-7 fills it in, no camp has an air line.
 */
export function campAirLineIntact(_state: GameState, _camp: Camp): boolean {
  return false;
}
