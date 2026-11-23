// Progression PR 5 (docs/plans/progression-phases.md, sections 1 and 5):
// the contract board, taking, delivering and dropping a contract, tiers
// opening in turn, and the phases of a run.
import { describe, expect, it } from 'vitest';
import { FRONTIER_BOARD, FRONTIER_CONTRACTS, FRONTIER_MARKET } from '../../src/data/frontier';
import { contractBoard, frontierAct, isMarketDay, openTiers, runPhase } from '../../src/engine';
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

describe('taking, delivering and dropping a contract', () => {
  it('takes one from the board at the market for no tap, delivers it later for 1 tap and its coins, and counts it done', () => {
    const w = at(3);
    const offer = contractBoard(w)[0];
    if (offer === undefined) throw new Error('no contract on the board');
    const taken = frontierAct(w, { kind: 'takeContract', id: offer.id });
    expect(taken.done).toBe(true);
    expect(taken.state.contract).toEqual({ id: offer.id, takenOn: 30 });
    expect(taken.state.tapsLeft).toBe(w.tapsLeft);
    // Delivering is a day's action: not while the market is open.
    expect(frontierAct(taken.state, { kind: 'deliver' }).refusal).toBe('market');
    const day = frontierAct(taken.state, { kind: 'closeMarket' }).state;
    expect(frontierAct(day, { kind: 'deliver' }).refusal).toBe('cost');
    // Holding everything, on any day: it is delivered.
    const holding = new Map(offer.asks.map((a) => [a.item, a.count + 1] as [string, number]));
    const later = { ...day, shift: 31, inventory: holding };
    const out = frontierAct(later, { kind: 'deliver' });
    expect(out.done).toBe(true);
    expect(out.state.contract).toBeNull();
    expect(out.state.inventory.get('coin')).toBe(offer.pays);
    for (const a of offer.asks) expect(out.state.inventory.get(a.item)).toBe(1);
    expect(out.state.contractsDone).toEqual([1, 0, 0]);
    expect(out.state.status).toBe('active'); // a contract never ends the run
  });

  it('holds one at a time, takes only on a market day and only from the board, and drops for nothing', () => {
    const w = at(3);
    const [first, second] = contractBoard(w);
    if (first === undefined || second === undefined) throw new Error('board too short');
    const taken = frontierAct(w, { kind: 'takeContract', id: first.id }).state;
    expect(frontierAct(taken, { kind: 'takeContract', id: second.id }).refusal).toBe('holding');
    const closed = { ...w, marketOpen: false };
    expect(frontierAct(closed, { kind: 'takeContract', id: first.id }).refusal).toBe('closed');
    const offTheBoard = FRONTIER_CONTRACTS.find((c) => !contractBoard(w).includes(c));
    expect(frontierAct(w, { kind: 'takeContract', id: offTheBoard?.id ?? 'x' }).refusal).toBe(
      'unknown',
    );
    expect(frontierAct(closed, { kind: 'dropContract' }).refusal).toBe('none');
    const dropped = frontierAct({ ...taken, marketOpen: false }, { kind: 'dropContract' });
    expect(dropped.done).toBe(true);
    expect(dropped.state.contract).toBeNull();
    expect(dropped.state.contractsDone).toEqual([0, 0, 0]);
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
