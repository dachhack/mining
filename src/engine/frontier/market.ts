// The market (docs/plans/progression-phases.md, section 3; PR 1).
//
// - A market day is every shift whose number is a multiple of the market's
//   cadence for the player's best camp: every 10 shifts while the best camp
//   is level 1, every 5 at level 2, every 3 at level 3 (the owner; level 4
//   is question 167).
// - The market opens after the night that starts a market day, before the
//   day (owner, after the progression playtest build: "Night scene then
//   market opens. You take your market actions then it closes and the day
//   starts. That's the only time the market is available."). End shift sets
//   `marketOpen`; the player trades, then closes it (closeMarket) and the
//   day's taps begin. While it is open nothing else can be done.
// - While it is open the player sells and buys in lots (FRONTIER_MARKET):
//   each trade is any whole number of one item's lots. Trades cost no taps:
//   they happen before the day.
// - Money is an item, coins (question 170). The coins held when the run
//   ends are its score (plan section 7).
//
// The numbers are in src/data/frontier.ts.

import type { ItemStack } from '../../data';
import { FRONTIER_MARKET, FRONTIER_MINERS } from '../../data/frontier';
import type { FrontierLot } from '../../data/frontier';
import { canAfford, pay } from './camps';
import { gained } from './surface';
import { contractStage } from './contracts';
import type { FrontierState } from './state';

/** The highest level of any camp standing; 1 if none stands. */
export function bestCampLevel(state: FrontierState): number {
  return state.camps.reduce((best, c) => Math.max(best, c.level), 1);
}

/** Every how many shifts the market opens, for the player's best camp now. */
export function marketEvery(state: FrontierState): number {
  const every = FRONTIER_MARKET.everyShifts;
  // The last entry holds for any level past the end of the list.
  const index = Math.min(bestCampLevel(state), every.length) - 1;
  return every[index] ?? every[every.length - 1] ?? 1;
}

/** True if the shift being played is a market day (its market opened after the night before it). */
export function isMarketDay(state: FrontierState): boolean {
  return state.status === 'active' && state.shift % marketEvery(state) === 0;
}

/** True while the market is open: after a market day's night, until the player closes it. */
export function marketIsOpen(state: FrontierState): boolean {
  return state.status === 'active' && state.marketOpen;
}

/**
 * The shift whose market opens next, at today's cadence: this shift while
 * its market is open, else the next market day after it. The cadence can
 * change before then if a camp is upgraded or demolished.
 */
export function nextMarketShift(state: FrontierState): number {
  if (state.marketOpen) return state.shift;
  // The next market day after this shift: its market opens after the night before it.
  const every = marketEvery(state);
  return (Math.floor(state.shift / every) + 1) * every;
}

/** The coins held. */
export function coinsHeld(state: FrontierState): number {
  return state.inventory.get(FRONTIER_MARKET.coin) ?? 0;
}

/** Selling or buying. */
export type TradeSide = 'sell' | 'buy';

/** The lot of `item` the market trades on `side`, or `null` if it does not trade it. */
export function marketLot(side: TradeSide, item: string): FrontierLot | null {
  const lots = side === 'sell' ? FRONTIER_MARKET.sellPrices : FRONTIER_MARKET.buyPrices;
  return lots.find((l) => l.item === item) ?? null;
}

/**
 * Why `lots` lots of `item` cannot be traded on `side` now, or `null` if they can:
 * - 'closed': the market is not open;
 * - 'unknown': the market does not trade that item that way;
 * - 'notYet': it does, but only once the best camp is at the lot's
 *   `fromLevel` (the tools, from level 3), or once a tier-1 contract is
 *   done for a lot `afterTier1` (the camp kit, wood and apples);
 * - 'lots': `lots` is not a whole number of 1 or more, or more than 1 of an
 *   item a second of which adds nothing (FRONTIER_MARKET.uselessWhenHeld);
 * - 'owned': buying, the store already holds an item that makes another of
 *   it useless (FRONTIER_MARKET.uselessWhenHeld: a tool, the sword);
 * - 'cost': the store does not hold what the trade takes (the items to
 *   sell, or the coins to buy).
 */
export type TradeRefusal = 'closed' | 'unknown' | 'notYet' | 'lots' | 'owned' | 'cost';

export function tradeRefusal(
  state: FrontierState,
  side: TradeSide,
  item: string,
  lots: number,
): TradeRefusal | null {
  if (!marketIsOpen(state)) return 'closed';
  const lot = marketLot(side, item);
  if (lot === null) return 'unknown';
  if (bestCampLevel(state) < (lot.fromLevel ?? 1)) return 'notYet';
  if (lot.afterTier1 === true && (state.contractsDone[0] ?? 0) === 0) return 'notYet';
  if (contractStage(state) < (lot.fromStage ?? 1)) return 'notYet';
  if (!Number.isInteger(lots) || lots < 1) return 'lots';
  if (side === 'buy' && ownsUseful(state, item)) return 'owned';
  if (side === 'buy' && item in FRONTIER_MARKET.uselessWhenHeld && lots > 1) return 'lots';
  // No more miners than the crew holds (FRONTIER_MINERS.most).
  if (
    side === 'buy' &&
    item === FRONTIER_MINERS.item &&
    (state.inventory.get(item) ?? 0) + lots > FRONTIER_MINERS.most
  ) {
    return 'lots';
  }
  const given = tradeOf(side, lot, lots).give;
  if (!canAfford(state.inventory, [given])) return 'cost';
  return null;
}

/**
 * True if the store holds something that makes buying `item` useless: the
 * item itself, for a tool or the sword, or a steel drill for the iron drill
 * (FRONTIER_MARKET.uselessWhenHeld). The market leaves such an item out.
 */
export function ownsUseful(state: FrontierState, item: string): boolean {
  // Miners: no more once the crew is full (FRONTIER_MINERS.most).
  if (item === FRONTIER_MINERS.item) {
    return (state.inventory.get(item) ?? 0) >= FRONTIER_MINERS.most;
  }
  const makesUseless = FRONTIER_MARKET.uselessWhenHeld[item] ?? [];
  return makesUseless.some((held) => (state.inventory.get(held) ?? 0) > 0);
}

/** What a trade of `lots` of `lot` on `side` gives up and gets. */
function tradeOf(
  side: TradeSide,
  lot: FrontierLot,
  lots: number,
): { give: ItemStack; get: ItemStack } {
  const goods = { item: lot.item, count: lot.count * lots };
  const coins = { item: FRONTIER_MARKET.coin, count: lot.coins * lots };
  return side === 'sell' ? { give: goods, get: coins } : { give: coins, get: goods };
}

/**
 * Trade `lots` lots of `item` on `side`. If `tradeRefusal` says no, the very
 * same state comes back.
 */
export function trade(
  state: FrontierState,
  side: TradeSide,
  item: string,
  lots: number,
): FrontierState {
  const lot = marketLot(side, item);
  if (lot === null || tradeRefusal(state, side, item, lots) !== null) {
    return state;
  }
  const { give, get } = tradeOf(side, lot, lots);
  return { ...state, inventory: gained(pay(state.inventory, [give]), get) };
}

/**
 * The most whole lots of `item` the store can trade on `side` now (0 if
 * none, or if the market does not trade it), whether or not it is a market
 * day or the lot is open yet.
 */
export function mostLots(state: FrontierState, side: TradeSide, item: string): number {
  const lot = marketLot(side, item);
  if (lot === null) return 0;
  const per = side === 'sell' ? lot.count : lot.coins;
  const held = side === 'sell' ? (state.inventory.get(item) ?? 0) : coinsHeld(state);
  const most = Math.floor(held / per);
  // One at most of an item a second of which adds nothing, and none once held.
  if (side === 'buy' && item in FRONTIER_MARKET.uselessWhenHeld) {
    return ownsUseful(state, item) ? 0 : Math.min(most, 1);
  }
  if (side === 'buy' && item === FRONTIER_MINERS.item) {
    return Math.max(0, Math.min(most, FRONTIER_MINERS.most - (state.inventory.get(item) ?? 0)));
  }
  return most;
}
