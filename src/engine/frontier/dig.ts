// Digging a 3 x 3 with one long press (owner, after the 0.20.0 build: with
// 2 miners, "long press allows you to dig all dig able squares in 3 by 3 and
// it takes the lesser of 4 or the number of squares dug moves"; 3 with 3
// miners, 2 with 4).
//
// `digArea` mines every square of the 3 x 3 centred on (x, y) whose tap
// would mine its top block, row by row, each once, exactly as a tap would
// (tap.ts: its yields, the pickaxe, water, gas, the dragons' flight). A
// square whose tap would do anything else (take a plant, catch an animal,
// put out a fire, ...) is left alone. It needs as many taps as it costs:
// 1 for each square mined, or with 2 or more miners the lesser of the crew's
// `areaCost` (crew.ts) and the squares mined (owner, after the 0.21.0 build:
// "Long press should always be mine everything possible in 3 by 3 at the
// expense of one move for each square dug unless you have hired miners").
//
// The numbers are in src/data/frontier.ts.

import { areaCost } from './crew';
import { frontierTap, previewTap } from './tap';
import type { FrontierState } from './state';

/** The squares of the 3 x 3 centred on (x, y), row by row. */
function threeByThree(x: number, y: number): { x: number; y: number }[] {
  const squares: { x: number; y: number }[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) squares.push({ x: x + dx, y: y + dy });
  }
  return squares;
}

/** What digging the 3 x 3 round (x, y) would do: the state after, the squares mined, and the taps it costs. */
export function digAreaPlan(
  state: FrontierState,
  x: number,
  y: number,
): { state: FrontierState; dug: { x: number; y: number }[]; cost: number } {
  // Without the miners' discount, a tap a square.
  const most = areaCost(state.inventory) ?? Infinity;
  let next = state;
  const dug: { x: number; y: number }[] = [];
  for (const sq of threeByThree(x, y)) {
    if (previewTap(next, sq.x, sq.y).kind !== 'mined') continue;
    const tap = frontierTap(next, sq.x, sq.y);
    if (tap.kind !== 'mined') continue;
    next = tap.state;
    dug.push(sq);
  }
  return { state: next, dug, cost: Math.min(most, dug.length) };
}

/**
 * Why the 3 x 3 round (x, y) cannot be dug now, or `null` if it can:
 * - 'nothing': no square of it can be mined now;
 * - 'noTaps': fewer taps are left than it would cost.
 */
export type DigAreaRefusal = 'nothing' | 'noTaps';

export function digAreaRefusal(state: FrontierState, x: number, y: number): DigAreaRefusal | null {
  const plan = digAreaPlan(state, x, y);
  if (plan.dug.length === 0) return 'nothing';
  return state.tapsLeft < plan.cost ? 'noTaps' : null;
}

/** Dig the 3 x 3 round (x, y), paying its taps. If `digAreaRefusal` says no, the very same state comes back. */
export function digArea(state: FrontierState, x: number, y: number): FrontierState {
  if (digAreaRefusal(state, x, y) !== null) return state;
  const plan = digAreaPlan(state, x, y);
  return { ...plan.state, tapsLeft: state.tapsLeft - plan.cost };
}
