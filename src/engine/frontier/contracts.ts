// Contracts and the phases of a run (docs/plans/progression-phases.md,
// sections 1 and 5; PR 5).
//
// - The board: on a market day (market.ts) it shows up to
//   FRONTIER_BOARD.perTier contracts of each open tier. Which ones is
//   drawn from the run's seed and the shift with a generator of its own,
//   so the board is never stored and the world's own generator is never
//   touched: the same seed and shift always show the same board.
// - Tiers open in turn: tier 1 while the best camp is at least
//   FRONTIER_BOARD.tier1Level; tier 2 once a tier-1 contract is done; tier 3
//   once a tier-2 contract is done.
// - Up to `contractLimit` (the best camp's level) are held at once.
// - Filling one from the board (`fillContract`; owner, on the hazards build:
//   "Should be able to immediately fill contracts if you have the
//   materials"): while the market is open, a contract on today's board
//   whose asks the store holds is delivered at once, without being held, so
//   it needs no free place. No tap: the market comes before the day. Held
//   contracts can be delivered while the market is open too, also for no tap.
// - Taking one (while the market is open, holding fewer than the limit; no tap), delivering it (any shift,
//   holding everything it asks for: the items leave the store and its
//   coins arrive), and dropping it (any shift, nothing back) cost 1 tap
//   each; shift.ts charges it. A contract never ends the run.
// - The phase (plan section 1) is worked out from the camps and the
//   contracts done: 1 until a level-2 camp, 2 until a level-3 camp, 3 until
//   a tier-1 contract is done, 4 until a tier-2 one is, then 5.
//
// The numbers are in src/data/frontier.ts.

import { FRONTIER_BOARD, FRONTIER_CONTRACTS, FRONTIER_MARKET } from '../../data/frontier';
import type { FrontierContractDef } from '../../data/frontier';
import { createRng, nextInt } from '../rng';
import { canAfford, pay } from './camps';
import { bestCampLevel, marketIsOpen } from './market';
import { gained } from './surface';
import type { FrontierState } from './state';

/** The tiers whose contracts the board offers now: [1], [1, 2] or [1, 2, 3], or none. */
export function openTiers(state: FrontierState): number[] {
  if (bestCampLevel(state) < FRONTIER_BOARD.tier1Level && (state.contractsDone[0] ?? 0) === 0) {
    return [];
  }
  const tiers = [1];
  if ((state.contractsDone[0] ?? 0) > 0) tiers.push(2);
  if ((state.contractsDone[1] ?? 0) > 0) tiers.push(3);
  return tiers;
}

/**
 * The board on the shift being played: for each open tier, lowest first,
 * up to FRONTIER_BOARD.perTier of its contracts in an order drawn from the
 * seed and the shift. Empty unless the market is open.
 */
export function contractBoard(state: FrontierState): FrontierContractDef[] {
  if (!marketIsOpen(state)) return [];
  // A generator of the board's own, from the seed and the shift (each kept
  // to 32 bits): the world's generator is untouched.
  const rng = createRng(
    (Math.imul(state.seed, 0x9e3779b1) ^ Math.imul(state.shift, 0x85ebca6b)) >>> 0,
  );
  const board: FrontierContractDef[] = [];
  for (const tier of openTiers(state)) {
    const pool = FRONTIER_CONTRACTS.filter((c) => c.tier === tier);
    // Draw without putting back: a few steps of a shuffle.
    const left = [...pool];
    for (let k = 0; k < FRONTIER_BOARD.perTier && left.length > 0; k += 1) {
      const [picked] = left.splice(nextInt(rng, left.length), 1);
      if (picked !== undefined) board.push(picked);
    }
  }
  return board;
}

/** The contract with this id, or `null`. */
export function contractById(id: string): FrontierContractDef | null {
  return FRONTIER_CONTRACTS.find((c) => c.id === id) ?? null;
}

/**
 * How many contracts may be held at once: the best camp's level (owner,
 * after the market-scene build: "Let's allow multiple contracts at a time.
 * As many as your highest camp level"). A deep camp counts as its level.
 */
export function contractLimit(state: FrontierState): number {
  return bestCampLevel(state);
}

/** The contracts held now, oldest first. */
export function heldContracts(state: FrontierState): FrontierContractDef[] {
  const held: FrontierContractDef[] = [];
  for (const h of state.contracts) {
    const def = contractById(h.id);
    if (def !== null) held.push(def);
  }
  return held;
}

/**
 * Why a contract action cannot be done now, or `null` if it can:
 * - 'holding': taking one while as many are held as `contractLimit` allows;
 * - 'closed': taking one while the market is not open;
 * - 'unknown': taking one that is not on today's board, or is held already;
 * - 'none': delivering or dropping one that is not held;
 * - 'cost': delivering one without everything it asks for.
 */
export type ContractRefusal = 'holding' | 'closed' | 'unknown' | 'none' | 'cost';

export function takeRefusal(state: FrontierState, id: string): ContractRefusal | null {
  if (state.contracts.length >= contractLimit(state)) return 'holding';
  if (!marketIsOpen(state)) return 'closed';
  if (!contractBoard(state).some((c) => c.id === id)) return 'unknown';
  if (state.contracts.some((c) => c.id === id)) return 'unknown';
  return null;
}

export function deliverRefusal(state: FrontierState, id: string): ContractRefusal | null {
  const held = state.contracts.some((c) => c.id === id) ? contractById(id) : null;
  if (held === null) return 'none';
  return canAfford(state.inventory, held.asks) ? null : 'cost';
}

export function dropRefusal(state: FrontierState, id: string): ContractRefusal | null {
  return state.contracts.some((c) => c.id === id) ? null : 'none';
}

/** True if some contract held can be delivered now. */
export function anyDeliverable(state: FrontierState): boolean {
  return state.contracts.some((c) => deliverRefusal(state, c.id) === null);
}

/** Take contract `id` from today's board. If `takeRefusal` says no, the very same state comes back. */
export function takeContract(state: FrontierState, id: string): FrontierState {
  if (takeRefusal(state, id) !== null) return state;
  return { ...state, contracts: [...state.contracts, { id, takenOn: state.shift }] };
}

/**
 * Why contract `id` cannot be filled from today's board now, or `null` if it can:
 * 'closed' (the market is not open), 'unknown' (not on today's board, or
 * held already: deliver that one instead), 'cost' (the store does not hold
 * everything it asks for).
 */
export function fillRefusal(state: FrontierState, id: string): ContractRefusal | null {
  if (!marketIsOpen(state)) return 'closed';
  const offered = contractBoard(state).find((c) => c.id === id);
  if (offered === undefined || state.contracts.some((c) => c.id === id)) return 'unknown';
  return canAfford(state.inventory, offered.asks) ? null : 'cost';
}

/** Fill contract `id` from today's board at once. If `fillRefusal` says no, the very same state comes back. */
export function fillContract(state: FrontierState, id: string): FrontierState {
  if (fillRefusal(state, id) !== null) return state;
  // Taken and delivered in one go: it is never held.
  return deliverContract(takeAnyway(state, id), id);
}

/** `state` holding contract `id` too, whatever the limit (only for filling it at once). */
function takeAnyway(state: FrontierState, id: string): FrontierState {
  return { ...state, contracts: [...state.contracts, { id, takenOn: state.shift }] };
}

/** Deliver held contract `id`: its items go, its coins come, and it counts as done for its tier. */
export function deliverContract(state: FrontierState, id: string): FrontierState {
  const held = contractById(id);
  if (held === null || deliverRefusal(state, id) !== null) return state;
  const contractsDone = state.contractsDone.map((n, i) => (i === held.tier - 1 ? n + 1 : n));
  const inventory = gained(pay(state.inventory, held.asks), {
    item: FRONTIER_MARKET.coin,
    count: held.pays,
  });
  const contracts = state.contracts.filter((c) => c.id !== id);
  return { ...state, inventory, contracts, contractsDone };
}

/** Drop held contract `id`: nothing back, nothing lost. */
export function dropContract(state: FrontierState, id: string): FrontierState {
  if (dropRefusal(state, id) !== null) return state;
  return { ...state, contracts: state.contracts.filter((c) => c.id !== id) };
}

/** The phase of the run, 1 to 5 (plan section 1). */
export function runPhase(state: FrontierState): number {
  const best = bestCampLevel(state);
  if (best < 2) return 1;
  if (best < 3 && (state.contractsDone[0] ?? 0) === 0) return 2;
  if ((state.contractsDone[0] ?? 0) === 0) return 3;
  if ((state.contractsDone[1] ?? 0) === 0) return 4;
  return 5;
}
