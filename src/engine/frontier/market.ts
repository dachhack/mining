// The market (docs/plans/progression-phases.md, section 3; PR 1).
//
// - It opens at the start of every shift whose number is a multiple of the
//   market's cadence for the player's best camp: every 10 shifts while the
//   best camp is level 1, every 5 at level 2, every 3 at level 3 (the owner;
//   level 4 is question 167). It stays open for that whole shift
//   (question 169). Nothing about it is stored: it is worked out from the
//   shift and the camps.
// - On a market day the player sells and buys in lots (FRONTIER_MARKET):
//   each trade is any whole number of one item's lots, for 1 tap (shift.ts
//   charges it), since every action that does something costs a tap.
// - Money is an item, coins (question 170). The coins held when the run
//   ends are its score (plan section 7).
//
// The numbers are in src/data/frontier.ts.

import type { ItemStack } from '../../data';
import { FRONTIER_MARKET } from '../../data/frontier';
import type { FrontierLot } from '../../data/frontier';
import { canAfford, pay } from './camps';
import { gained } from './surface';
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

/** True if the market is open in the shift being played. */
export function isMarketDay(state: FrontierState): boolean {
  return state.status === 'active' && state.shift % marketEvery(state) === 0;
}

/**
 * The next shift, from the one being played, on which the market opens at
 * today's cadence: the shift itself if it is a market day. The cadence can
 * change before then if a camp is upgraded or demolished.
 */
export function nextMarketShift(state: FrontierState): number {
  const every = marketEvery(state);
  return Math.ceil(state.shift / every) * every;
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
 * - 'closed': it is not a market day;
 * - 'unknown': the market does not trade that item that way;
 * - 'notYet': it does, but only once the best camp is at the lot's
 *   `fromLevel` (the tools, from level 3);
 * - 'lots': `lots` is not a whole number of 1 or more;
 * - 'cost': the store does not hold what the trade takes (the items to
 *   sell, or the coins to buy).
 */
export type TradeRefusal = 'closed' | 'unknown' | 'notYet' | 'lots' | 'cost';

export function tradeRefusal(
  state: FrontierState,
  side: TradeSide,
  item: string,
  lots: number,
): TradeRefusal | null {
  if (!isMarketDay(state)) return 'closed';
  const lot = marketLot(side, item);
  if (lot === null) return 'unknown';
  if (bestCampLevel(state) < (lot.fromLevel ?? 1)) return 'notYet';
  if (!Number.isInteger(lots) || lots < 1) return 'lots';
  const given = tradeOf(side, lot, lots).give;
  if (!canAfford(state.inventory, [given])) return 'cost';
  return null;
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
  return Math.floor(held / per);
}
