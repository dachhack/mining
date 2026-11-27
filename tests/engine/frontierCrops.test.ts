// Grains and vegetables (owner, after the 0.19.0 build: "Let's add seeds to
// the market for a few grains and vegetables. You can plant these in soil and
// they grow and you can harvest.").
import { describe, expect, it } from 'vitest';
import { FRONTIER_CROPS, FRONTIER_FOODS, FRONTIER_MARKET } from '../../src/data/frontier';
import { frontierAct, plantRefusal, previewTap } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { GRASS, TREE } from '../../src/engine/frontier/state';
import { depthAt } from '../../src/engine/heightmap';
import { MID, SIDE, world } from './frontierHelpers';

const AT = { x: MID - 4, y: MID };
const i = AT.x + SIDE * AT.y;

/** Do `action` and expect it to be done. */
function act(state: FrontierState, action: Parameters<typeof frontierAct>[1]): FrontierState {
  const out = frontierAct(state, action);
  expect(out.done, `${action.kind}: ${out.refusal ?? ''}`).toBe(true);
  return out.state;
}

/** `state` after `n` End shifts, fed and kept warm so the crew lives. */
function nights(state: FrontierState, n: number): FrontierState {
  let w = state;
  for (let k = 0; k < n; k += 1) {
    w = act(
      { ...w, inventory: new Map([...w.inventory, ['wood', 99], ['grass', 99]]) },
      {
        kind: 'endShift',
      },
    );
    if (w.marketOpen) w = act(w, { kind: 'closeMarket' });
  }
  return w;
}

describe('grains and vegetables', () => {
  it('has four kinds, each with its seed for sale from the start, and its crop food and for sale', () => {
    expect(FRONTIER_CROPS.map((c) => c.crop)).toEqual(['wheat', 'corn', 'carrot', 'potato']);
    for (const c of FRONTIER_CROPS) {
      const lot = FRONTIER_MARKET.buyPrices.find((l) => l.item === c.seed);
      expect(lot, c.seed).toBeDefined();
      expect(lot?.fromLevel ?? 1, c.seed).toBe(1);
      expect(lot?.afterTier1 ?? false, c.seed).toBe(false);
      expect(
        FRONTIER_FOODS.some((f) => f.item === c.crop),
        c.crop,
      ).toBe(true);
      expect(
        FRONTIER_MARKET.sellPrices.some((l) => l.item === c.crop),
        c.crop,
      ).toBe(true);
    }
    const market = { ...world({ inventory: { coin: 100 } }), shift: 10, marketOpen: true };
    expect(
      act(market, { kind: 'buy', item: 'carrotSeed', lots: 2 }).inventory.get('carrotSeed'),
    ).toBe(2);
  });

  it('sows a seed on bare dirt for 1 tap; it ripens after its shifts, and a tap harvests it', () => {
    for (const c of FRONTIER_CROPS) {
      const w = world({ inventory: { [c.seed]: 1 } });
      const sown = act(w, { kind: 'plant', ...AT, item: c.seed });
      expect(sown.tapsLeft).toBe(w.tapsLeft - 1);
      expect(sown.inventory.has(c.seed)).toBe(false);
      expect(sown.cropIn[i]).toBe(c.growShifts);
      // Growing: a tap does nothing, costs nothing, and does not dig.
      const early = frontierAct(sown, { kind: 'tap', ...AT });
      expect(early.done).toBe(false);
      expect(early.refusal).toBe('growing');
      expect(previewTap(sown, AT.x, AT.y).kind).toBe('growing');
      const nearly = nights(sown, c.growShifts - 1);
      expect(frontierAct(nearly, { kind: 'tap', ...AT }).refusal, c.crop).toBe('growing');
      const ripe = nights(nearly, 1);
      expect(ripe.cropIn[i], c.crop).toBe(0);
      expect(previewTap(ripe, AT.x, AT.y).gain).toEqual([{ item: c.crop, count: c.yield }]);
      const harvested = act(ripe, { kind: 'tap', ...AT });
      expect(harvested.inventory.get(c.crop), c.crop).toBe(c.yield);
      expect(harvested.crops[i]).toBe(0);
      expect(harvested.cropIn[i]).toBe(-1);
      expect(depthAt(harvested.cube, AT.x, AT.y)).toBe(0); // bare dirt again, not dug
    }
  });

  it('reports the crops that ripened in the night', () => {
    const w = act(world({ inventory: { wheatSeed: 1 } }), {
      kind: 'plant',
      ...AT,
      item: 'wheatSeed',
    });
    const almost = { ...w, cropIn: w.cropIn.map((n, k) => (k === i ? 1 : n)) };
    const out = frontierAct(
      {
        ...almost,
        inventory: new Map([
          ['wood', 9],
          ['grass', 9],
        ]),
      },
      {
        kind: 'endShift',
      },
    );
    expect(out.report?.cropsRipened).toBe(1);
  });

  it('is sown only on bare surface dirt: not on grass, a tree, a stump, or another crop', () => {
    const w = world({
      inventory: { wheatSeed: 3 },
      features: [
        { x: AT.x, y: AT.y + 1, feature: GRASS },
        { x: AT.x, y: AT.y + 2, feature: TREE },
      ],
    });
    expect(plantRefusal(w, AT.x, AT.y + 1, 'wheatSeed')).toBe('occupied');
    expect(plantRefusal(w, AT.x, AT.y + 2, 'wheatSeed')).toBe('occupied');
    const stump = { ...w, stumps: w.stumps.map((s, k) => (k === i ? TREE : s)) };
    expect(plantRefusal(stump, AT.x, AT.y, 'wheatSeed')).toBe('occupied');
    const sown = act(w, { kind: 'plant', ...AT, item: 'wheatSeed' });
    expect(plantRefusal(sown, AT.x, AT.y, 'wheatSeed')).toBe('occupied');
    const dug = world({ special: [{ ...AT, z: 0, char: '.' }], inventory: { wheatSeed: 1 } });
    expect(plantRefusal(dug, AT.x, AT.y, 'wheatSeed')).toBe('ground');
    expect(plantRefusal(world(), AT.x, AT.y, 'wheatSeed')).toBe('cost');
  });

  it('feeds the crew', () => {
    const w = world({ inventory: { wood: 10, carrot: 3 } });
    const night = act({ ...w, shift: 2 }, { kind: 'endShift' });
    expect(night.inventory.get('carrot') ?? 0).toBeLessThan(3);
  });
});
