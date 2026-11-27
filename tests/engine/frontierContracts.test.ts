// Progression PR 5 (docs/plans/progression-phases.md, sections 1 and 5):
// the contract board, taking, delivering and dropping a contract, tiers
// opening in turn, and the phases of a run.
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import {
  FRONTIER_BOARD,
  FRONTIER_COAL,
  FRONTIER_CONTRACTS,
  FRONTIER_MARKET,
  FRONTIER_TREASURE,
} from '../../src/data/frontier';
import { blockAt } from '../../src/engine/state';
import {
  contractBoard,
  contractLimit,
  createFrontier,
  groundStock,
  worldCanFill,
  worldStock,
  frontierAct,
  heldContracts,
  isMarketDay,
  openTiers,
  runPhase,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { world } from './frontierHelpers';

/**
 * A world on shift `shift` (30 is a market day at every level), first camp
 * at `level`, holding `inventory`; on a market day its market is open, as
 * after the night before it.
 */
function at(
  level: number,
  inventory: Record<string, number> = {},
  done: number[] = [0, 0, 0],
  shift = 30,
): FrontierState {
  const w = world({ inventory });
  const s = { ...w, shift, contractsDone: done, camps: w.camps.map((c) => ({ ...c, level })) };
  return { ...s, marketOpen: isMarketDay(s) };
}

/**
 * A store holding plenty of everything any contract asks for: the test world
 * (dirt and stone, 3 layers) holds no ore, coal, clay or relics, and the
 * board offers only what the world can fill (stock.ts).
 */
const PLENTY: Record<string, number> = {};
for (const c of FRONTIER_CONTRACTS) {
  for (const a of c.asks) PLENTY[a.item] = Math.max(PLENTY[a.item] ?? 0, a.count * 10);
}

describe('the contract board (plan section 5)', () => {
  it('opens tier 1 at once (its mining contracts with a level-3 camp), tier 2 after a tier-1 contract, tier 3 after a tier-2', () => {
    expect(FRONTIER_BOARD.tier1Level).toBe(3);
    // Tier 1's surface contracts are on the board from the first market day
    // (frontierSurfaceContracts.test.ts); the rest wait for a level-3 camp.
    expect(openTiers(at(2))).toEqual([1]);
    expect(contractBoard(at(2, PLENTY)).every((c) => c.surface === true)).toBe(true);
    expect(contractBoard(at(3, PLENTY)).some((c) => c.surface !== true)).toBe(true);
    expect(openTiers(at(3))).toEqual([1]);
    expect(openTiers(at(3, {}, [1, 0, 0]))).toEqual([1, 2]);
    expect(openTiers(at(3, {}, [1, 1, 0]))).toEqual([1, 2, 3]);
  });

  it('shows 3 to 7 on a market day only, every open tier, different ones, the same for the same seed and shift', () => {
    // Owner, after the 0.20.0 build: "Contract management. Only 3-7 available to take."
    const [low, high] = FRONTIER_BOARD.offers;
    expect([low, high]).toEqual([3, 7]);
    const sizes = new Set<number>();
    for (let shift = 30; shift <= 90; shift += 3) {
      const board = contractBoard(at(3, PLENTY, [1, 1, 0], shift));
      expect(board.length, `shift ${shift}`).toBeGreaterThanOrEqual(low);
      expect(board.length, `shift ${shift}`).toBeLessThanOrEqual(high);
      // Every open tier is offered, each contract once, lowest tier first.
      for (const tier of [1, 2, 3]) expect(board.some((c) => c.tier === tier)).toBe(true);
      expect(new Set(board.map((c) => c.id)).size).toBe(board.length);
      expect(board.map((c) => c.tier)).toEqual([...board.map((c) => c.tier)].sort());
      sizes.add(board.length);
    }
    expect(sizes.size).toBeGreaterThan(1); // the size is drawn, not fixed
    const board = contractBoard(at(3, PLENTY, [1, 1, 0]));
    expect(contractBoard(at(3, PLENTY, [1, 1, 0]))).toEqual(board);
    expect(contractBoard(at(3, {}, [0, 0, 0], 31))).toEqual([]); // not a market day
    // Another market day shows another draw (over a few days, at least one differs).
    const days = [33, 36, 39, 42].map((s) =>
      contractBoard(at(3, PLENTY, [0, 0, 0], s))
        .map((c) => c.id)
        .join(),
    );
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('offers nothing that lies far below the deepest square dug', () => {
    // Owner, after the 0.20.0 build: "Gauge on how deep the player has dug, no
    // keystone or relics etc if they are still far away."
    const fresh = createFrontier(3);
    const open = {
      ...fresh,
      shift: 30,
      contractsDone: [1, 1, 0],
      camps: fresh.camps.map((c) => ({ ...c, level: 3 })),
    };
    const day = { ...open, marketOpen: isMarketDay(open) };
    // The whole world holds relics and keystones...
    expect(worldStock(day).get('relic') ?? 0).toBeGreaterThan(0);
    // ...but nothing is dug, so none is within reach, and no contract asks for one.
    expect(worldStock(day, FRONTIER_BOARD.reachBelowDeepest).get('relic') ?? 0).toBe(0);
    for (let shift = 30; shift <= 60; shift += 3) {
      const board = contractBoard({ ...day, shift });
      for (const c of board) {
        for (const a of c.asks) {
          expect(['relic', 'keystone'], `${c.id} on shift ${shift}`).not.toContain(a.item);
        }
      }
    }
  });

  it('pays every contract more than its items fetch at the market, and each tier more than the one below', () => {
    const sale = (item: string, count: number): number => {
      const lot = FRONTIER_MARKET.sellPrices.find((l) => l.item === item);
      return lot === undefined ? 0 : (count / lot.count) * lot.coins;
    };
    for (const c of FRONTIER_CONTRACTS) {
      const fetch = c.asks.reduce((sum, a) => sum + sale(a.item, a.count), 0);
      expect(c.pays, c.id).toBeGreaterThan(fetch);
    }
    const most = (tier: number) =>
      Math.max(...FRONTIER_CONTRACTS.filter((c) => c.tier === tier).map((c) => c.pays));
    const least = (tier: number) =>
      Math.min(...FRONTIER_CONTRACTS.filter((c) => c.tier === tier).map((c) => c.pays));
    expect(least(2)).toBeGreaterThan(least(1));
    expect(least(3)).toBeGreaterThan(most(2));
  });
});

describe('clay contracts (owner: bricks, pottery and roads)', () => {
  it('ask for clay in volume at tiers 1 and 2, and pay more than the market', () => {
    const clay = FRONTIER_CONTRACTS.filter(
      (c) => c.asks.length === 1 && c.asks[0]?.item === 'clay',
    );
    expect(clay.map((c) => c.tier).sort()).toEqual([1, 1, 2, 2]);
    expect(Math.max(...clay.map((c) => c.asks[0]?.count ?? 0))).toBeGreaterThanOrEqual(400);
    const lot = FRONTIER_MARKET.sellPrices.find((l) => l.item === 'clay');
    for (const c of clay) {
      const fetch = ((c.asks[0]?.count ?? 0) / (lot?.count ?? 1)) * (lot?.coins ?? 0);
      expect(c.pays, c.id).toBeGreaterThan(fetch);
    }
  });
});

describe('taking, delivering and dropping contracts', () => {
  it('takes one from the board at the market for no tap, delivers it later for its coins, and counts it done', () => {
    const w = at(3);
    const offer = contractBoard(w)[0];
    if (offer === undefined) throw new Error('no contract on the board');
    const taken = frontierAct(w, { kind: 'takeContract', id: offer.id });
    expect(taken.done).toBe(true);
    expect(taken.state.contracts).toEqual([{ id: offer.id, takenOn: 30 }]);
    expect(taken.state.tapsLeft).toBe(w.tapsLeft);
    // At the market it can be delivered too, but only with everything it asks for.
    expect(frontierAct(taken.state, { kind: 'deliver', id: offer.id }).refusal).toBe('cost');
    const day = frontierAct(taken.state, { kind: 'closeMarket' }).state;
    expect(frontierAct(day, { kind: 'deliver', id: offer.id }).refusal).toBe('cost');
    // Holding everything, on any day: it is delivered.
    const holding = new Map(offer.asks.map((a) => [a.item, a.count + 1] as [string, number]));
    const later = { ...day, shift: 31, inventory: holding };
    const out = frontierAct(later, { kind: 'deliver', id: offer.id });
    expect(out.done).toBe(true);
    expect(out.state.contracts).toEqual([]);
    expect(out.state.inventory.get('coin')).toBe(offer.pays);
    for (const a of offer.asks) expect(out.state.inventory.get(a.item)).toBe(1);
    expect(out.state.contractsDone).toEqual([1, 0, 0]);
    expect(out.state.status).toBe('active'); // a contract never ends the run
    // Delivering costs no tap, even with none left (owner, after the 0.20.0
    // build: Deliver was greyed out at 0 taps; "Free, any time").
    expect(out.state.tapsLeft).toBe(later.tapsLeft);
    const spent = frontierAct({ ...later, tapsLeft: 0 }, { kind: 'deliver', id: offer.id });
    expect(spent.done).toBe(true);
    expect(spent.state.tapsLeft).toBe(0);
    // Nor does dropping one.
    const dropped = frontierAct({ ...later, tapsLeft: 0 }, { kind: 'dropContract', id: offer.id });
    expect(dropped.done).toBe(true);
    expect(dropped.state.contracts).toEqual([]);
  });

  it('holds as many as the best camp’s level (owner), each once, and delivers or drops each by name', () => {
    const w = at(3, PLENTY, [1, 1, 0]); // nine on the board
    expect(contractLimit(w)).toBe(3);
    const offers = contractBoard(w);
    let s = w;
    for (const offer of offers.slice(0, 3)) {
      const out = frontierAct(s, { kind: 'takeContract', id: offer.id });
      expect(out.done, offer.id).toBe(true);
      s = out.state;
    }
    expect(s.contracts.map((c) => c.id)).toEqual(offers.slice(0, 3).map((o) => o.id));
    expect(heldContracts(s).map((c) => c.id)).toEqual(offers.slice(0, 3).map((o) => o.id));
    // A fourth is refused at level 3; a level-4 camp allows it.
    const fourth = offers[3]?.id ?? '';
    expect(frontierAct(s, { kind: 'takeContract', id: fourth }).refusal).toBe('holding');
    const level4 = { ...s, camps: s.camps.map((c) => ({ ...c, level: 4 })) };
    expect(frontierAct(level4, { kind: 'takeContract', id: fourth }).done).toBe(true);
    // The same one twice: refused.
    const one = at(3);
    const first = contractBoard(one)[0]?.id ?? '';
    const once = frontierAct(one, { kind: 'takeContract', id: first }).state;
    expect(frontierAct(once, { kind: 'takeContract', id: first }).refusal).toBe('unknown');
    // A level-1 camp holds one.
    expect(contractLimit(at(1))).toBe(1);
    // Dropping one leaves the others.
    const day = { ...s, marketOpen: false };
    const second = offers[1]?.id ?? '';
    const dropped = frontierAct(day, { kind: 'dropContract', id: second });
    expect(dropped.done).toBe(true);
    expect(dropped.state.contracts.map((c) => c.id)).not.toContain(second);
    expect(dropped.state.contracts).toHaveLength(2);
    expect(dropped.state.contractsDone).toEqual([1, 1, 0]);
  });

  it('takes only while the market is open and only from the board, and refuses one not held', () => {
    const w = at(3);
    const [first] = contractBoard(w);
    if (first === undefined) throw new Error('board empty');
    const closed = { ...w, marketOpen: false };
    expect(frontierAct(closed, { kind: 'takeContract', id: first.id }).refusal).toBe('closed');
    const offTheBoard = FRONTIER_CONTRACTS.find((c) => !contractBoard(w).includes(c));
    expect(frontierAct(w, { kind: 'takeContract', id: offTheBoard?.id ?? 'x' }).refusal).toBe(
      'unknown',
    );
    expect(frontierAct(closed, { kind: 'dropContract', id: first.id }).refusal).toBe('none');
    expect(frontierAct(closed, { kind: 'deliver', id: first.id }).refusal).toBe('none');
  });
});

describe('the phases of a run (plan section 1)', () => {
  it('goes 1 to 5 with the best camp and the contracts done', () => {
    expect(runPhase(at(1))).toBe(1);
    expect(runPhase(at(2))).toBe(2);
    expect(runPhase(at(3))).toBe(3);
    expect(runPhase(at(3, {}, [1, 0, 0]))).toBe(4);
    expect(runPhase(at(4, {}, [2, 1, 0]))).toBe(5);
  });
});

describe('filling a contract at once (owner, on the hazards build)', () => {
  // "Should be able to immediately fill contracts if you have the materials."
  /** The first tier-1 contract on the board at level 3, and a store holding all it asks for. */
  function offerAndRich(): { state: FrontierState; id: string; pays: number } {
    const probe = at(3);
    const offer = contractBoard(probe)[0];
    if (offer === undefined) throw new Error('the board offers a contract');
    const inventory: Record<string, number> = {};
    for (const a of offer.asks) inventory[a.item] = a.count + 5;
    return { state: at(3, inventory), id: offer.id, pays: offer.pays };
  }

  it('delivers a contract from the board at once, for no tap, without holding it', () => {
    const { state, id, pays } = offerAndRich();
    const out = frontierAct(state, { kind: 'fillContract', id });
    expect(out.done).toBe(true);
    expect(out.state.tapsLeft).toBe(state.tapsLeft);
    expect(out.state.contracts).toEqual([]);
    expect(out.state.contractsDone[0]).toBe(1);
    expect(out.state.inventory.get(FRONTIER_MARKET.coin)).toBe(pays);
    const def = FRONTIER_CONTRACTS.find((c) => c.id === id);
    for (const a of def?.asks ?? []) expect(out.state.inventory.get(a.item)).toBe(5);
  });

  it('needs no free place: it works while holding as many as the limit allows', () => {
    const { state, id } = offerAndRich();
    // Held: as many others as the limit allows (any contracts but this one).
    const others = FRONTIER_CONTRACTS.filter((c) => c.id !== id)
      .slice(0, contractLimit(state))
      .map((c) => ({ id: c.id, takenOn: 1 }));
    const full = { ...state, contracts: others };
    expect(frontierAct(full, { kind: 'takeContract', id }).refusal).toBe('holding');
    expect(frontierAct(full, { kind: 'fillContract', id }).done).toBe(true);
  });

  it('is refused without everything it asks for, with the market closed, or off the board', () => {
    const { state, id } = offerAndRich();
    expect(frontierAct(at(3), { kind: 'fillContract', id }).refusal).toBe('cost');
    expect(frontierAct({ ...state, marketOpen: false }, { kind: 'fillContract', id }).refusal).toBe(
      'closed',
    );
    expect(frontierAct(state, { kind: 'fillContract', id: 'no-such' }).refusal).toBe('unknown');
  });

  it('lets a contract held be delivered at the market too, for no tap', () => {
    const { state, id } = offerAndRich();
    const holding = { ...state, contracts: [{ id, takenOn: 1 }] };
    const out = frontierAct(holding, { kind: 'deliver', id });
    expect(out.done).toBe(true);
    expect(out.state.tapsLeft).toBe(holding.tapsLeft);
    expect(out.state.contracts).toEqual([]);
    // A held one is delivered, not filled again from the board.
    expect(frontierAct(holding, { kind: 'fillContract', id }).refusal).toBe('unknown');
  });
});

describe('the board offers only what the world can fill (owner, on the hazards build)', () => {
  // "Let's inventory the entire board so that the contracts offered are not unfillable."
  it('counts the ground under every square, the store, and what smelting could make', () => {
    const w = at(3, { coal: 3, rawIronOre: 5 });
    const stock = worldStock(w);
    // The test world: a top layer of dirt and two of stone, 25 x 25.
    expect(stock.get('stone')).toBe(25 * 25 * 2);
    expect(stock.get('coal')).toBe(3);
    // Smelting: 2 raw iron and 1 coal make 2 ingots, twice with 5 raw iron.
    expect(stock.get('ironIngot')).toBe(4);
    expect(groundStock(w.cube).get('coal') ?? 0).toBe(0);
  });

  it('leaves out a contract the world cannot fill, and keeps it once the store holds enough', () => {
    const bare = at(3);
    const board = contractBoard(bare);
    // Stone is in the ground; coal, ore and clay are not.
    expect(board.length).toBeGreaterThan(0);
    for (const c of board) expect(worldCanFill(worldStock(bare), c.asks)).toBe(true);
    expect(board.some((c) => c.asks.some((a) => a.item === 'coal'))).toBe(false);
    // Holding plenty, every tier-1 kind is drawn in full: perTier surface and
    // perTier mining contracts, up to the day's most.
    const rich = at(3, PLENTY);
    const coal = FRONTIER_CONTRACTS.find((c) => c.id === 't1-coal');
    expect(worldCanFill(worldStock(rich), coal?.asks ?? [])).toBe(true);
    expect(contractBoard(rich).some((c) => c.surface !== true)).toBe(true);
    expect(contractBoard(rich).length).toBeGreaterThanOrEqual(FRONTIER_BOARD.perTier);
  });

  it('every world can fill every contract, of every tier (question 197)', () => {
    // Relics and keystones in every world; tier 2's coal asks for 40, not 80.
    for (let seed = 1; seed <= 20; seed += 1) {
      const stock = worldStock(createFrontier(seed));
      // Mushrooms come with rain (mushrooms.ts): a new world has none yet.
      for (const c of FRONTIER_CONTRACTS.filter(
        (k) => !k.asks.some((a) => a.item === 'mushroom'),
      )) {
        expect(worldCanFill(stock, c.asks), `${c.id} on seed ${seed}`).toBe(true);
      }
    }
  });

  it('places them deep, where the data says, the same for the same seed', () => {
    const cube = createFrontier(3).cube;
    const found: { block: number; z: number }[] = [];
    for (let z = 0; z < cube.size.z; z += 1) {
      for (let y = 0; y < cube.size.y; y += 1) {
        for (let x = 0; x < cube.size.x; x += 1) {
          const b = blockAt(cube, { x, y, z });
          if (b === BLOCKS.relic.code || b === BLOCKS.keystone.code) found.push({ block: b, z });
        }
      }
    }
    const relics = found.filter((f) => f.block === BLOCKS.relic.code);
    const keys = found.filter((f) => f.block === BLOCKS.keystone.code);
    expect(relics).toHaveLength(FRONTIER_TREASURE.relics);
    expect(keys).toHaveLength(FRONTIER_TREASURE.keystones);
    for (const r of relics) expect(r.z).toBeGreaterThanOrEqual(FRONTIER_TREASURE.relicFromDepth);
    for (const k of keys) expect(k.z).toBeGreaterThanOrEqual(FRONTIER_TREASURE.keystoneFromDepth);
    expect(createFrontier(3).cube.blocks).toEqual(cube.blocks);
  });

  it('every world holds about three times the coal the old game gave it (owner: "add more coal")', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const cube = createFrontier(seed).cube;
      const coal = groundStock(cube).get('coal') ?? 0;
      expect(coal, `seed ${seed}`).toBeGreaterThanOrEqual(
        FRONTIER_COAL.extraSeams * FRONTIER_COAL.minSize,
      );
      // Never at the surface (question 140), and not below FRONTIER_COAL.toDepth from the seams.
      for (let y = 0; y < cube.size.y; y += 1) {
        for (let x = 0; x < cube.size.x; x += 1) {
          expect(blockAt(cube, { x, y, z: 0 })).not.toBe(BLOCKS.coalSeam.code);
        }
      }
    }
  });

  it('never offers a contract the world cannot fill, on real worlds and many market days', () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const start = createFrontier(seed);
      for (const shift of [30, 60, 90]) {
        const s = {
          ...start,
          shift,
          contractsDone: [1, 1, 0],
          camps: start.camps.map((c) => ({ ...c, level: 3 })),
          marketOpen: true,
        };
        const stock = worldStock(s);
        for (const c of contractBoard(s)) expect(worldCanFill(stock, c.asks), c.id).toBe(true);
        // Every world holds relics and keystones now (question 197).
        expect(worldStock(s).get('relic')).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
