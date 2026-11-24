// Progression PR 5 (docs/plans/progression-phases.md, sections 1 and 5):
// the contract board, taking, delivering and dropping a contract, tiers
// opening in turn, and the phases of a run.
import { describe, expect, it } from 'vitest';
import { FRONTIER_BOARD, FRONTIER_CONTRACTS, FRONTIER_MARKET } from '../../src/data/frontier';
import {
  contractBoard,
  contractLimit,
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

describe('the contract board (plan section 5)', () => {
  it('opens tier 1 with a level-3 camp, tier 2 after a tier-1 contract, tier 3 after a tier-2', () => {
    expect(FRONTIER_BOARD.tier1Level).toBe(3);
    expect(openTiers(at(2))).toEqual([]);
    expect(openTiers(at(3))).toEqual([1]);
    expect(openTiers(at(3, {}, [1, 0, 0]))).toEqual([1, 2]);
    expect(openTiers(at(3, {}, [1, 1, 0]))).toEqual([1, 2, 3]);
  });

  it('shows up to 3 of each open tier on a market day only, different ones, the same for the same seed and shift', () => {
    const board = contractBoard(at(3, {}, [1, 1, 0]));
    expect(board).toHaveLength(9);
    for (const tier of [1, 2, 3]) {
      const ids = board.filter((c) => c.tier === tier).map((c) => c.id);
      expect(new Set(ids).size).toBe(FRONTIER_BOARD.perTier);
    }
    expect(contractBoard(at(3, {}, [1, 1, 0]))).toEqual(board);
    expect(contractBoard(at(3, {}, [0, 0, 0], 31))).toEqual([]); // not a market day
    // Another market day shows another draw (over a few days, at least one differs).
    const days = [33, 36, 39, 42].map((s) =>
      contractBoard(at(3, {}, [0, 0, 0], s))
        .map((c) => c.id)
        .join(),
    );
    expect(new Set(days).size).toBeGreaterThan(1);
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

describe('taking, delivering and dropping contracts', () => {
  it('takes one from the board at the market for no tap, delivers it later for 1 tap and its coins, and counts it done', () => {
    const w = at(3);
    const offer = contractBoard(w)[0];
    if (offer === undefined) throw new Error('no contract on the board');
    const taken = frontierAct(w, { kind: 'takeContract', id: offer.id });
    expect(taken.done).toBe(true);
    expect(taken.state.contracts).toEqual([{ id: offer.id, takenOn: 30 }]);
    expect(taken.state.tapsLeft).toBe(w.tapsLeft);
    // Delivering is a day's action: not while the market is open.
    expect(frontierAct(taken.state, { kind: 'deliver', id: offer.id }).refusal).toBe('market');
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
  });

  it('holds as many as the best camp’s level (owner), each once, and delivers or drops each by name', () => {
    const w = at(3, {}, [1, 1, 0]); // nine on the board
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
