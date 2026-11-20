// The crew's worked squares (design doc v0.2 section 5.2; issue #90).
//
// There is no avatar. The crew has no position; what it has is the list of
// squares it worked this shift: every square the player mined, cut a tree on,
// or built on (a support, pump, vent or sealant) in the shift that is ending.
// A hazard hurts the crew only when it reaches one of those squares
// (`recordDamage` in cube/phase.ts), and the list is emptied at the end of
// every cube phase (cube/crewEffects.ts).
//
// Placing an explosive does NOT make its square worked: the crew withdraws
// before a charge goes off (5.2). A camp's squares count while the crew rests
// there; that comes with resting (task T12).
//
// Only this file knows how `GameState.worked` is laid out.

import { SQUARE_STEPS, isSquare } from './heightmap';
import type { Square } from './heightmap';
import type { GameState } from './state';

/** Where square (x, y) lives in `state.worked`: row by row. Throws off the map. */
function workedIndex(state: GameState, x: number, y: number): number {
  if (!isSquare(state, x, y)) {
    throw new Error(`(${x}, ${y}) is not a square of the cube`);
  }
  return x + state.size.x * y;
}

/**
 * Note that the crew worked on square (x, y) this shift. Every action that
 * mines, cuts or builds on a square calls this. Marking a square twice is the
 * same as marking it once.
 */
export function markWorked(state: GameState, x: number, y: number): void {
  state.worked[workedIndex(state, x, y)] = 1;
}

/** True if the crew worked on square (x, y) this shift. Throws off the map. */
export function isWorked(state: GameState, x: number, y: number): boolean {
  return state.worked[workedIndex(state, x, y)] === 1;
}

/**
 * True if at least one of the four squares that share a side with (x, y) was
 * worked this shift. The square itself does not count, and neither do
 * diagonals. A neighbour off the map is simply not there.
 */
export function isBesideWorked(state: GameState, x: number, y: number): boolean {
  workedIndex(state, x, y); // only to throw if (x, y) is off the map
  for (const step of SQUARE_STEPS) {
    const nx = x + step.dx;
    const ny = y + step.dy;
    if (isSquare(state, nx, ny) && isWorked(state, nx, ny)) {
      return true;
    }
  }
  return false;
}

/** The squares worked this shift, row by row (y, then x). */
export function workedSquares(state: GameState): Square[] {
  const squares: Square[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      if (isWorked(state, x, y)) {
        squares.push({ x, y });
      }
    }
  }
  return squares;
}

/** Forget the worked squares: a new shift starts with none. */
export function clearWorked(state: GameState): void {
  state.worked.fill(0);
}
