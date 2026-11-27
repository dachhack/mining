// Miners, the long-press dig, seeds from a harvest, and pulling up a sapling
// (owner, after the 0.20.0 build).
import { describe, expect, it } from 'vitest';
import {
  FRONTIER_CROPS,
  FRONTIER_MARKET,
  FRONTIER_MINERS,
  FRONTIER_SEED_BACK,
  FRONTIER_SHIFT,
} from '../../src/data/frontier';
import {
  areaCost,
  digAreaRefusal,
  frontierAct,
  previewTap,
  tapsPerShift,
  tradeRefusal,
  upkeepDue,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { MAPLE_TREE, NO_FEATURE } from '../../src/engine/frontier/state';
import { depthAt } from '../../src/engine/heightmap';
import { MID, SIDE, world } from './frontierHelpers';

/** Do `action` and expect it to be done. */
function act(state: FrontierState, action: Parameters<typeof frontierAct>[1]): FrontierState {
  const out = frontierAct(state, action);
  expect(out.done, `${action.kind}: ${out.refusal ?? ''}`).toBe(true);
  return out.state;
}

const withMiners = (n: number, extra: Record<string, number> = {}): FrontierState =>
  world({ inventory: { [FRONTIER_MINERS.item]: n, ...extra } });

describe('miners', () => {
  it('are hired at the market for their salary, up to FRONTIER_MINERS.most', () => {
    const lot = FRONTIER_MARKET.buyPrices.find((l) => l.item === FRONTIER_MINERS.item);
    expect(lot).toBeDefined();
    const market = (n: number): FrontierState => ({
      ...world({ inventory: { coin: 1000, [FRONTIER_MINERS.item]: n } }),
      shift: 10,
      marketOpen: true,
    });
    const hired = act(market(0), { kind: 'buy', item: FRONTIER_MINERS.item, lots: 2 });
    expect(hired.inventory.get(FRONTIER_MINERS.item)).toBe(2);
    expect(hired.inventory.get('coin')).toBe(1000 - 2 * (lot?.coins ?? 0));
    expect(tradeRefusal(market(3), 'buy', FRONTIER_MINERS.item, 2)).toBe('lots');
    expect(tradeRefusal(market(4), 'buy', FRONTIER_MINERS.item, 1)).toBe('owned');
    // Never sold.
    expect(FRONTIER_MARKET.sellPrices.some((l) => l.item === FRONTIER_MINERS.item)).toBe(false);
  });

  it('give 125, 135, 150 and 165 taps a shift from the next shift on', () => {
    expect([0, 1, 2, 3, 4].map((n) => tapsPerShift(new Map([['miner', n]])))).toEqual([
      FRONTIER_SHIFT.taps,
      125,
      135,
      150,
      165,
    ]);
    const night = act(withMiners(3, { wood: 9, apple: 9 }), { kind: 'endShift' });
    expect(night.tapsLeft).toBe(150);
  });

  it('each eat when the crew eats', () => {
    const food = (d: { item: string }[]): number => d.filter((x) => x.item === 'food').length;
    expect(food(upkeepDue(2, 1, 0))).toBe(1);
    expect(food(upkeepDue(2, 1, 3))).toBe(1 + 3 * FRONTIER_MINERS.foodEach);
    expect(food(upkeepDue(1, 1, 3))).toBe(0); // only on the shifts food is due
    const fed = act({ ...withMiners(2, { wood: 9, apple: 9 }), shift: 2 }, { kind: 'endShift' });
    expect(fed.inventory.get('apple')).toBe(9 - 3);
  });
});

describe('the long-press dig of a 3 x 3', () => {
  const C = { x: MID + 4, y: MID };

  it('works without miners too, for 1 tap a square dug (fewer than 2 miners)', () => {
    // Owner, after the 0.21.0 build: "Long press should always be mine
    // everything possible in 3 by 3 at the expense of one move for each square
    // dug unless you have hired miners."
    expect(areaCost(new Map([['miner', 1]]))).toBe(null);
    for (const n of [0, 1]) {
      const w = withMiners(n);
      expect(digAreaRefusal(w, C.x, C.y), `${n} miners`).toBe(null);
      const out = act(w, { kind: 'digArea', ...C });
      expect(out.mined, `${n} miners`).toBe(9);
      expect(out.tapsLeft, `${n} miners`).toBe(w.tapsLeft - 9);
    }
    // Too few taps for every square: refused, as with miners.
    expect(digAreaRefusal({ ...withMiners(0), tapsLeft: 8 }, C.x, C.y)).toBe('noTaps');
  });

  it('digs every diggable square once, for the lesser of the crew cost and the squares dug', () => {
    for (const [n, cost] of [
      [2, 4],
      [3, 3],
      [4, 2],
    ] as const) {
      const w = withMiners(n);
      const out = act(w, { kind: 'digArea', ...C });
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          expect(depthAt(out.cube, C.x + dx, C.y + dy), `${n} miners`).toBe(1);
        }
      }
      expect(out.mined).toBe(9);
      expect(out.tapsLeft, `${n} miners`).toBe(w.tapsLeft - cost);
    }
  });

  it('costs no more taps than squares it dug, and leaves alone what a tap would not mine', () => {
    // Only one square of the 3 x 3 can be dug: the rest are a camp's ground or out of sight.
    const corner = { x: MID + 2, y: MID + 2 }; // its 3 x 3 overlaps the camp's
    const w = withMiners(2);
    const plan = frontierAct(w, { kind: 'digArea', ...corner });
    expect(plan.done).toBe(true);
    const dug = plan.state.mined;
    expect(dug).toBeLessThan(9);
    expect(plan.state.tapsLeft).toBe(w.tapsLeft - Math.min(4, dug));
    expect(depthAt(plan.state.cube, MID + 1, MID + 1)).toBe(0); // the camp's ground
  });

  it('is refused with too few taps left, and where nothing can be dug', () => {
    const w = { ...withMiners(2), tapsLeft: 3 };
    expect(digAreaRefusal(w, C.x, C.y)).toBe('noTaps');
    expect(digAreaRefusal(withMiners(2), MID, MID)).toBe('nothing'); // a camp's own 3 x 3
  });
});

describe('a harvest gives a seed back half the time', () => {
  it('rolls FRONTIER_SEED_BACK on the world generator', () => {
    expect(FRONTIER_SEED_BACK).toBe(0.5);
    const crop = FRONTIER_CROPS[0];
    if (crop === undefined) throw new Error('a crop');
    const at = { x: MID - 4, y: MID };
    const i = at.x + SIDE * at.y;
    let seeds = 0;
    const tries = 200;
    for (let s = 1; s <= tries; s += 1) {
      const w = world();
      const ripe = {
        ...w,
        rng: { s },
        crops: w.crops.map((k, j) => (j === i ? 1 : k)),
        cropIn: w.cropIn.map((k, j) => (j === i ? 0 : k)),
      };
      const out = act(ripe, { kind: 'tap', ...at });
      expect(out.inventory.get(crop.crop)).toBe(crop.yield);
      seeds += out.inventory.get(crop.seed) ?? 0;
    }
    expect(seeds).toBeGreaterThan(tries * 0.35);
    expect(seeds).toBeLessThan(tries * 0.65);
  });
});

describe('a tap on a planted sapling', () => {
  it('pulls it up, back into the store, and does not dig the ground', () => {
    const at = { x: MID - 4, y: MID };
    const i = at.x + SIDE * at.y;
    const w = act(world({ inventory: { mapleSapling: 1 } }), {
      kind: 'plant',
      ...at,
      item: 'mapleSapling',
    });
    expect(w.stumps[i]).toBe(MAPLE_TREE);
    expect(previewTap(w, at.x, at.y).kind).toBe('uprooted');
    const out = frontierAct(w, { kind: 'tap', ...at });
    expect(out.done).toBe(true);
    expect(out.tap?.kind).toBe('uprooted');
    expect(out.state.tapsLeft).toBe(w.tapsLeft - 1);
    expect(out.state.inventory.get('mapleSapling')).toBe(1);
    expect(out.state.planted[i]).toBe(false);
    expect(out.state.stumps[i]).toBe(NO_FEATURE);
    expect(depthAt(out.state.cube, at.x, at.y)).toBe(0);
    // The next tap digs.
    expect(previewTap(out.state, at.x, at.y).kind).toBe('mined');
  });
});
