// Surface contracts and lumber (owner, after the 0.22.0 build: "We need more
// surface resource contracts especially early game. Wood, hay, sheep,
// syrup, apples, mushrooms, crops. Let's make lumber productable if you
// have a saw house."). Asked, the owner chose: surface contracts from the
// first market day; one delivered opens tier 2 like any tier-1 contract;
// lumber is 2 wood for 1, at a saw house.
import { describe, expect, it } from 'vitest';
import { FRONTIER_CONTRACTS, FRONTIER_MARKET, FRONTIER_RECIPES } from '../../src/data/frontier';
import { contractBoard, frontierAct, isMarketDay, makeRefusal } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { MID, world } from './frontierHelpers';

/** A world on market day `shift` with its first camp at `level`, contracts done `done`, holding `inventory`. */
function day(
  level: number,
  shift: number,
  inventory: Record<string, number> = {},
  done: number[] = [0, 0, 0],
): FrontierState {
  const w = world({ inventory });
  const s = { ...w, shift, contractsDone: done, camps: w.camps.map((c) => ({ ...c, level })) };
  return { ...s, marketOpen: isMarketDay(s) };
}

const SURFACE_ITEMS = [
  'wood',
  'hay',
  'animal',
  'syrup',
  'apple',
  'mushroom',
  'wheat',
  'corn',
  'carrot',
  'potato',
  'lumber',
];

describe('surface contracts', () => {
  it('ask for wood, hay, sheep, syrup, apples, mushrooms, crops and lumber, at tier 1', () => {
    const surface = FRONTIER_CONTRACTS.filter((c) => c.surface === true);
    for (const item of SURFACE_ITEMS) {
      expect(
        surface.some((c) => c.tier === 1 && c.asks.some((a) => a.item === item)),
        item,
      ).toBe(true);
    }
    // A surface contract asks only for what the surface gives.
    for (const c of surface) {
      for (const a of c.asks) expect(SURFACE_ITEMS, c.id).toContain(a.item);
    }
  });

  it('are on the board from the first market day as stage 1 allows: wood and hay', () => {
    // Since the 0.26.0 stages (frontierContractStages.test.ts), stage 1 is
    // clay, stone, wood and hay: the test world has no clay, and stone waits
    // for a level-2 camp, so wood and hay it is.
    for (let shift = 10; shift <= 100; shift += 10) {
      const board = contractBoard(day(1, shift));
      expect(board.length, `shift ${shift}`).toBeGreaterThan(0);
      for (const c of board) {
        expect(c.stage, c.id).toBe(1);
        for (const a of c.asks) expect(['wood', 'hay'], c.id).toContain(a.item);
      }
    }
  });

  it('are offered even when nothing of theirs stands yet: they grow back, or are bought and made', () => {
    // The test world has no trees, maples or animals, and holds nothing. At
    // stage 3 (a level-3 camp, 5 delivered) syrup and animals are open too.
    const ids = new Set<string>();
    for (let shift = 9; shift <= 300; shift += 3) {
      for (const c of contractBoard(day(3, shift, {}, [5, 0, 0]))) ids.add(c.id);
    }
    const offered = FRONTIER_CONTRACTS.filter((c) => ids.has(c.id));
    for (const item of ['wood', 'syrup', 'animal', 'lumber']) {
      expect(
        offered.some((c) => c.asks.some((a) => a.item === item)),
        item,
      ).toBe(true);
    }
    // Mushrooms still need mushrooms standing or coming (stock.ts).
    expect(offered.some((c) => c.asks.some((a) => a.item === 'mushroom'))).toBe(false);
  });

  it('count as delivered when filled', () => {
    const wood = FRONTIER_CONTRACTS.find((c) => c.id === 't1-firewood');
    if (wood === undefined) throw new Error('the firewood contract');
    let shift = 10;
    while (shift < 1000 && !contractBoard(day(1, shift)).some((c) => c.id === wood.id)) {
      shift += 10;
    }
    expect(shift).toBeLessThan(1000);
    const stock = Object.fromEntries(wood.asks.map((a) => [a.item, a.count]));
    const out = frontierAct(day(1, shift, stock), { kind: 'fillContract', id: wood.id });
    expect(out.done, out.refusal ?? '').toBe(true);
    expect(out.state.contractsDone).toEqual([1, 0, 0]);
  });
});

describe('lumber', () => {
  it('is made from 2 wood at a saw house, for 1 tap, and sells for 2 coins', () => {
    const recipe = FRONTIER_RECIPES.find((r) => r.id === 'lumber');
    expect(recipe?.inputs).toEqual([{ item: 'wood', count: 2 }]);
    expect(recipe?.output).toEqual({ item: 'lumber', count: 1 });
    expect(recipe?.needsSawHouse).toBe(true);
    expect(FRONTIER_MARKET.sellPrices.find((l) => l.item === 'lumber')).toEqual({
      item: 'lumber',
      count: 1,
      coins: 2,
    });
    const w = world({ inventory: { wood: 20, stone: 20 } });
    expect(makeRefusal(w, 'lumber')).toBe('noSawHouse');
    const sawed = frontierAct(w, { kind: 'build', building: 'sawHouse', x: MID + 3, y: MID });
    expect(sawed.done, sawed.refusal ?? '').toBe(true);
    const made = frontierAct(sawed.state, { kind: 'make', recipe: 'lumber' });
    expect(made.done, made.refusal ?? '').toBe(true);
    expect(made.state.inventory.get('lumber')).toBe(1);
    expect(made.state.inventory.get('wood')).toBe((sawed.state.inventory.get('wood') ?? 0) - 2);
    expect(made.state.tapsLeft).toBe(sawed.state.tapsLeft - 1);
  });
});

describe('one of each a market day', () => {
  it('leaves the board once filled or taken, until the next market day', () => {
    // The simulator found it: buy wood, fill the firewood contract, buy wood,
    // fill it again, all day long.
    const wood = FRONTIER_CONTRACTS.find((c) => c.id === 't1-firewood');
    if (wood === undefined) throw new Error('the firewood contract');
    let shift = 10;
    while (shift < 1000 && !contractBoard(day(1, shift)).some((c) => c.id === wood.id)) {
      shift += 10;
    }
    const w = day(1, shift, { wood: 200 });
    const once = frontierAct(w, { kind: 'fillContract', id: wood.id });
    expect(once.done).toBe(true);
    expect(once.state.boardUsed).toEqual([wood.id]);
    expect(contractBoard(once.state).some((c) => c.id === wood.id)).toBe(false);
    expect(frontierAct(once.state, { kind: 'fillContract', id: wood.id }).refusal).toBe('unknown');
    // Taken, delivered, and not to be taken again that day.
    const taken = frontierAct(w, { kind: 'takeContract', id: wood.id });
    expect(taken.done).toBe(true);
    const delivered = frontierAct(taken.state, { kind: 'deliver', id: wood.id });
    expect(delivered.done).toBe(true);
    expect(frontierAct(delivered.state, { kind: 'takeContract', id: wood.id }).refusal).toBe(
      'unknown',
    );
    // The night clears it.
    const closed = frontierAct(once.state, { kind: 'closeMarket' }).state;
    const night = frontierAct(closed, { kind: 'endShift' }).state;
    expect(night.boardUsed).toEqual([]);
  });

  it('never pays more than buying everything it asks for would cost', () => {
    const cost = (item: string, count: number): number | null => {
      const lot = FRONTIER_MARKET.buyPrices.find((l) => l.item === item);
      return lot === undefined ? null : Math.ceil(count / lot.count) * lot.coins;
    };
    for (const c of FRONTIER_CONTRACTS) {
      const costs = c.asks.map((a) => cost(a.item, a.count));
      if (costs.some((k) => k === null)) continue; // something it asks is not sold
      const total = costs.reduce((sum: number, k) => sum + (k ?? 0), 0);
      expect(c.pays, c.id).toBeLessThanOrEqual(total);
    }
  });
});

describe('small clay and stone contracts', () => {
  // Owner, after the 0.24.0 build: "Let's make sure we have some clay and
  // stone contracts in the early mix." Asked: new small ones; stone once a
  // level-2 camp stands. Since the 0.26.0 stages they are stage 1, with the
  // other clay, stone, wood and hay contracts.
  const kiln = FRONTIER_CONTRACTS.find((c) => c.id === 't1-kiln');
  const hearth = FRONTIER_CONTRACTS.find((c) => c.id === 't1-hearth');

  it('are small stage-1 contracts: 20 clay for 20 coins, 30 stone for 20, stone from a level-2 camp', () => {
    expect(kiln).toMatchObject({
      tier: 1,
      stage: 1,
      asks: [{ item: 'clay', count: 20 }],
      pays: 20,
    });
    expect(kiln?.fromLevel ?? 1).toBe(1);
    expect(hearth).toMatchObject({
      tier: 1,
      stage: 1,
      fromLevel: 2,
      asks: [{ item: 'stone', count: 30 }],
      pays: 20,
    });
  });

  it('are offered from the first market day; stone only from a level-2 camp', () => {
    // The test world has stone in the ground but no clay: the store holds some.
    let kilns = 0;
    let hearths = 0;
    for (let shift = 10; shift <= 200; shift += 10) {
      const one = contractBoard(day(1, shift, { clay: 30 }));
      if (one.some((c) => c.id === 't1-kiln')) kilns += 1;
      for (const c of one) {
        for (const a of c.asks) expect(['clay', 'wood', 'hay'], c.id).toContain(a.item);
      }
      if (contractBoard(day(2, shift, { clay: 30 })).some((c) => c.id === 't1-hearth'))
        hearths += 1;
    }
    expect(kilns).toBeGreaterThan(0);
    expect(hearths).toBeGreaterThan(0);
  });

  it('can be delivered', () => {
    let shift = 10;
    while (
      shift < 1000 &&
      !contractBoard(day(1, shift, { clay: 20 })).some((c) => c.id === 't1-kiln')
    )
      shift += 10;
    const out = frontierAct(day(1, shift, { clay: 20 }), { kind: 'fillContract', id: 't1-kiln' });
    expect(out.done, out.refusal ?? '').toBe(true);
    expect(out.state.inventory.get('clay') ?? 0).toBe(0);
    expect(out.state.contractsDone).toEqual([1, 0, 0]);
  });
});
