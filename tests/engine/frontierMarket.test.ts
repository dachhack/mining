// Progression, PR 1 (docs/plans/progression-phases.md, sections 1, 3 and 7):
// a run lasts FRONTIER_RUN.shifts shifts, and the market opens every 10, 5
// or 3 shifts by the best camp's level, to sell and buy for coins.
import { describe, expect, it } from 'vitest';
import { FRONTIER_MARKET, FRONTIER_RUN, FRONTIER_SHIFT } from '../../src/data/frontier';
import {
  coinsHeld,
  frontierAct,
  isMarketDay,
  marketEvery,
  mostLots,
  nextMarketShift,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { actLogged, startLog, undoLast } from '../../src/engine/frontier/undo';
import { world } from './frontierHelpers';

/**
 * `state` on shift `shift`, its first camp at `level`, holding `inventory`.
 * On a market day its market is open, as after the night before it.
 */
function at(shift: number, level = 1, inventory: Record<string, number> = {}): FrontierState {
  const w = world({ inventory });
  const s = { ...w, shift, camps: w.camps.map((c) => ({ ...c, level })) };
  return { ...s, marketOpen: isMarketDay(s) };
}

/** `at(...)` with its market closed: the day under way. */
function day(shift: number, level = 1, inventory: Record<string, number> = {}): FrontierState {
  return { ...at(shift, level, inventory), marketOpen: false };
}

/** The lot of `item` in `lots`, which the test expects to be there. */
function lotOf(
  lots: typeof FRONTIER_MARKET.sellPrices,
  item: string,
): { count: number; coins: number } {
  const lot = lots.find((l) => l.item === item);
  if (lot === undefined) throw new Error(`no lot of ${item}`);
  return lot;
}

describe('the length of a run (owner: "100 shifts or crew lost")', () => {
  it('is finished when its last shift ends, and nothing more can be done', () => {
    const last = day(FRONTIER_RUN.shifts, 1, { wood: 10, grass: 30 });
    const before = frontierAct(day(FRONTIER_RUN.shifts - 1, 1, { wood: 10, grass: 30 }), {
      kind: 'endShift',
    });
    expect(before.state.status).toBe('active');
    const ended = frontierAct(last, { kind: 'endShift' });
    expect(ended.done).toBe(true);
    expect(ended.state.status).toBe('finished');
    const after = frontierAct(ended.state, { kind: 'endShift' });
    expect(after.done).toBe(false);
    expect(after.refusal).toBe('over');
  });

  it('ends with resting on the last shift too', () => {
    const rested = frontierAct(day(FRONTIER_RUN.shifts, 1, { wood: 10, grass: 30 }), {
      kind: 'rest',
      id: 1,
    });
    expect(rested.state.status).toBe('finished');
  });

  it('is lost, not finished, if the crew dies in the last End shift', () => {
    const starving = { ...day(FRONTIER_RUN.shifts), health: 1 };
    expect(frontierAct(starving, { kind: 'endShift' }).state.status).toBe('lost');
  });
});

describe('when the market opens (owner: every 10, 5 or 3 shifts by the best camp)', () => {
  it('opens every 10 shifts at level 1, 5 at level 2, 3 at level 3 and 4', () => {
    expect([1, 2, 3, 4].map((level) => marketEvery(at(1, level)))).toEqual(
      FRONTIER_MARKET.everyShifts,
    );
    expect(FRONTIER_MARKET.everyShifts).toEqual([10, 5, 3, 3]);
    const open = (level: number): number[] =>
      [...Array(20).keys()].map((i) => i + 1).filter((s) => isMarketDay(at(s, level)));
    expect(open(1)).toEqual([10, 20]);
    expect(open(2)).toEqual([5, 10, 15, 20]);
    expect(open(3)).toEqual([3, 6, 9, 12, 15, 18]);
  });

  it('follows the best camp standing', () => {
    const w = at(5, 1);
    const second = {
      id: 2,
      x: 2,
      y: 2,
      level: 2,
      smelter: false,
      lantern: false,
      pen: false,
      penned: 0,
      breedIn: 0,
      deep: false,
      defense: 0,
    };
    const two = { ...w, camps: [...w.camps, second] };
    expect(isMarketDay(w)).toBe(false);
    expect(isMarketDay(two)).toBe(true);
  });

  it('says when it opens next', () => {
    expect(nextMarketShift(at(1, 1))).toBe(10);
    expect(nextMarketShift(at(10, 1))).toBe(10); // open now
    expect(nextMarketShift({ ...at(10, 1), marketOpen: false })).toBe(20); // closed for today
    expect(nextMarketShift(at(11, 2))).toBe(15);
  });

  it('opens after the night before a market day, takes only market actions, and closes to start the day', () => {
    const eve = at(9, 1, { wood: 10, grass: 30 });
    const night = frontierAct(eve, { kind: 'endShift' });
    expect(night.state.shift).toBe(10);
    expect(night.state.marketOpen).toBe(true);
    // While it is open: no taps, no End shift.
    const open = { ...night.state, inventory: new Map([['wood', 10]]) };
    expect(frontierAct(open, { kind: 'endShift' }).refusal).toBe('market');
    expect(frontierAct(open, { kind: 'tap', x: 0, y: 0 }).refusal).toBe('market');
    const closed = frontierAct(open, { kind: 'closeMarket' });
    expect(closed.done).toBe(true);
    expect(closed.state.marketOpen).toBe(false);
    expect(closed.state.tapsLeft).toBe(open.tapsLeft);
    // Closed, it does not open again that day.
    expect(frontierAct(closed.state, { kind: 'sell', item: 'wood', lots: 1 }).refusal).toBe(
      'closed',
    );
    expect(frontierAct(closed.state, { kind: 'closeMarket' }).refusal).toBe('closed');
    // Not after the night before an ordinary day.
    expect(
      frontierAct(at(10, 1, { wood: 10, grass: 30 }), { kind: 'closeMarket' }).state.marketOpen,
    ).toBe(false);
    const ordinary = frontierAct(
      { ...at(10, 1, { wood: 10, grass: 30 }), marketOpen: false },
      { kind: 'endShift' },
    );
    expect(ordinary.state.marketOpen).toBe(false);
  });

  it('is announced by the End shift that starts a market day', () => {
    const report = (shift: number): boolean | undefined =>
      frontierAct(day(shift, 1, { wood: 10, grass: 30 }), { kind: 'endShift' }).report?.marketOpens;
    expect(report(9)).toBe(true);
    expect(report(10)).toBe(false);
  });

  it('is closed once the run is over', () => {
    expect(isMarketDay({ ...at(10), status: 'closed' })).toBe(false);
  });
});

describe('selling and buying (plan section 3)', () => {
  const wood = lotOf(FRONTIER_MARKET.sellPrices, 'wood');
  const animal = lotOf(FRONTIER_MARKET.buyPrices, 'animal');

  it('sells whole lots for coins, for no tap: the market comes before the day', () => {
    const w = at(10, 1, { wood: wood.count * 3 + 1 });
    const sold = frontierAct(w, { kind: 'sell', item: 'wood', lots: 3 });
    expect(sold.done).toBe(true);
    expect(sold.state.tapsLeft).toBe(FRONTIER_SHIFT.taps);
    expect(sold.state.inventory.get('wood')).toBe(1);
    expect(coinsHeld(sold.state)).toBe(wood.coins * 3);
  });

  it('buys whole lots with coins', () => {
    const w = at(10, 1, { coin: animal.coins * 2 });
    const bought = frontierAct(w, { kind: 'buy', item: 'animal', lots: 2 });
    expect(bought.done).toBe(true);
    expect(bought.state.inventory.get('animal')).toBe(animal.count * 2);
    expect(coinsHeld(bought.state)).toBe(0);
    expect(bought.state.inventory.has('coin')).toBe(false);
  });

  it('is refused off market days, for items it does not trade, for bad lots, and without the goods or coins', () => {
    const rich = { wood: 100, coin: 100 };
    const cases: [FrontierState, 'sell' | 'buy', string, number, string][] = [
      [at(9, 1, rich), 'sell', 'wood', 1, 'closed'],
      [at(10, 1, rich), 'sell', 'campKit', 1, 'unknown'],
      [at(10, 1, rich), 'buy', 'stone', 1, 'unknown'],
      [at(10, 1, rich), 'sell', 'wood', 0, 'lots'],
      [at(10, 1, rich), 'sell', 'wood', 1.5, 'lots'],
      [at(10, 1, { wood: wood.count - 1 }), 'sell', 'wood', 1, 'cost'],
      [at(10, 1, { coin: animal.coins - 1 }), 'buy', 'animal', 1, 'cost'],
    ];
    for (const [state, kind, item, lots, why] of cases) {
      const out = frontierAct(state, { kind, item, lots });
      expect(out.done, `${kind} ${item} ${lots}`).toBe(false);
      expect(out.refusal).toBe(why);
      expect(out.state).toBe(state);
    }
  });

  it('trades with no taps left: the market comes before the day', () => {
    const w = { ...at(10, 1, { wood: 10 }), tapsLeft: 0 };
    expect(frontierAct(w, { kind: 'sell', item: 'wood', lots: 1 }).done).toBe(true);
  });

  it('says the most lots the store can trade', () => {
    const w = at(1, 1, { wood: wood.count * 4 + 1, coin: animal.coins * 2 + 1 });
    expect(mostLots(w, 'sell', 'wood')).toBe(4);
    expect(mostLots(w, 'buy', 'animal')).toBe(2);
    expect(mostLots(w, 'sell', 'campKit')).toBe(0);
  });

  it('can be undone, like any action that is not a harvest', () => {
    const w = at(10, 1, { wood: wood.count });
    const { log } = actLogged(w, startLog(w), { kind: 'sell', item: 'wood', lots: 1 });
    const undone = undoLast(log);
    expect(undone !== null && 'state' in undone).toBe(true);
    if (undone !== null && 'state' in undone) {
      expect(undone.state.inventory.get('wood')).toBe(wood.count);
      expect(coinsHeld(undone.state)).toBe(0);
    }
  });

  it('prices every lot in whole coins and whole items', () => {
    for (const lot of [...FRONTIER_MARKET.sellPrices, ...FRONTIER_MARKET.buyPrices]) {
      expect(Number.isInteger(lot.count) && lot.count > 0, lot.item).toBe(true);
      expect(Number.isInteger(lot.coins) && lot.coins > 0, lot.item).toBe(true);
    }
    // Nothing can be bought and sold back at a profit.
    for (const buy of FRONTIER_MARKET.buyPrices) {
      const sell = FRONTIER_MARKET.sellPrices.find((l) => l.item === buy.item);
      if (sell !== undefined) {
        expect(sell.coins / sell.count, buy.item).toBeLessThanOrEqual(buy.coins / buy.count);
      }
    }
  });
});
