// Miners (owner, after the 0.20.0 build: "Let's add miners to the market.
// You can hire a miner to add to the crew. You just pay them a annual salary
// when you hire them. They just need food upkeep.").
//
// A miner is hired at the market (FRONTIER_MARKET, lot 'miner': its price is
// the salary, paid once) and held as the item FRONTIER_MINERS.item, never
// sold or stolen, up to FRONTIER_MINERS.most. The miners held set:
// - the taps of every shift after they are hired (`tapsPerShift`);
// - the food the crew eats: FRONTIER_MINERS.foodEach more for each miner,
//   whenever food is due (shift.ts, `upkeepDue`);
// - from 2 miners, a cheaper long-press dig of a 3 x 3 (dig.ts, `areaCost`;
//   without them it costs a tap a square).
//
// The numbers are in src/data/frontier.ts.

import { FRONTIER_MINERS, FRONTIER_SHIFT } from '../../data/frontier';

/** The miners in the store `inventory`, at most FRONTIER_MINERS.most. */
export function minersHeld(inventory: Map<string, number>): number {
  return Math.min(FRONTIER_MINERS.most, inventory.get(FRONTIER_MINERS.item) ?? 0);
}

/** The taps a shift gives with the miners in `inventory`. */
export function tapsPerShift(inventory: Map<string, number>): number {
  const n = minersHeld(inventory);
  return n === 0
    ? FRONTIER_SHIFT.taps
    : (FRONTIER_MINERS.levels[n - 1]?.taps ?? FRONTIER_SHIFT.taps);
}

/** The most a long-press dig of a 3 x 3 costs with the miners in `inventory`, or `null` for no cap (a tap a square). */
export function areaCost(inventory: Map<string, number>): number | null {
  const n = minersHeld(inventory);
  return n === 0 ? null : (FRONTIER_MINERS.levels[n - 1]?.areaCost ?? null);
}
