// Step (d) of the cube phase: crack countdowns tick (design doc v0.2 sections
// 4 and 6.1; issue #94).
//
// A crack shows a countdown: 1 means "falls in the coming cube phase". Each
// cube phase the countdown of every cracked top block goes down by 1, but
// only while it is RUNNING: while its square is unstable (slump.ts), which
// also means it has no support and no tree. Otherwise the countdown stops,
// and goes on from where it stopped if the square becomes unstable again.
//
// A crack that appeared in step (a) of this same phase is not ticked: it
// shows its full countdown (`HAZARDS.slump.crackCountdown`) through the next
// shift.

import type { GameEvent } from '../events';
import { depthMapOf, topCellOf } from '../heightmap';
import { stabilityIn } from '../slump';
import { blockAt, crackTimerAt, setCrackTimer } from '../state';
import type { GameState } from '../state';
import type { CubePhase } from './phase';

/**
 * Step (d). Every running countdown goes down by 1, never below "1 shown"
 * (a stored timer of 0). Emits `blockCracked` with the new stored timer for
 * each. Squares are visited row by row. Changes `state` in place; uses no
 * randomness.
 */
export function stepTimers(state: GameState, events: GameEvent[], phase: CubePhase): void {
  const map = depthMapOf(state);
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const top = topCellOf(state, x, y);
      if (top === null) {
        continue;
      }
      const timer = crackTimerAt(state, top);
      if (timer === null || timer === 0) {
        continue; // not cracked, or already due
      }
      // `some`: true if any entry of the list passes the test.
      if (phase.newCracks.some((square) => square.x === x && square.y === y)) {
        continue; // cracked in this phase
      }
      if (!stabilityIn(state, map, x, y).unstable) {
        continue; // the countdown has stopped
      }
      setCrackTimer(state, top, timer - 1);
      events.push({ type: 'blockCracked', pos: top, block: blockAt(state, top), timer: timer - 1 });
    }
  }
}
