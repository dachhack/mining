// Contracts and the phases of a run (docs/plans/progression-phases.md,
// sections 1 and 5; PR 5).
//
// - The board: on a market day (market.ts) it shows 3 to 7 contracts, drawn
//   from the run's seed and the shift with a generator of its own, so the
//   board is never stored and the world's own generator is never touched:
//   the same seed and shift always show the same board.
// - Stages (owner, after the 0.25.0 build: "Let's stay heavy on clay stone
//   wood and hay in early game. Then coal and common ores mix in. Then
//   crops, sheep, syrup mix in. Then more refined ore products and larger
//   contracts. Then special ores and items."): every contract has a stage,
//   1 to 5, and the board offers only the stages open (`contractStage`):
//   stage 1 from the start; each later one with its milestone and its count
//   of contracts delivered, both needed (FRONTIER_STAGES). Up to
//   FRONTIER_BOARD.perStage are drawn from each open stage, and the day's 3
//   to 7 are taken from them in turn, the newest stage first, so the newest
//   stage is always offered and the earlier ones stay in the mix. A
//   contract with `fromLevel` waits for a camp of that level too (stone is
//   mined from level 2). Tiers no longer open the board: they say how big a
//   contract is, and what it pays.
// - Only contracts the world can fill are offered (stock.ts): what grows
//   back, or is bought and made, always counts (FRONTIER_BOARD.renewable);
//   mushrooms are counted.
// - Up to `contractLimit` (the best camp's level) are held at once.
// - Filling one from the board (`fillContract`; owner, on the hazards build:
//   "Should be able to immediately fill contracts if you have the
//   materials"): while the market is open, a contract on today's board
//   whose asks the store holds is delivered at once, without being held, so
//   it needs no free place. No tap: the market comes before the day. Held
//   contracts can be delivered while the market is open too, also for no tap.
// - Taking one (while the market is open, holding fewer than the limit; no tap), delivering it (any shift,
//   holding everything it asks for: the items leave the store and its
//   coins arrive), and dropping it (any shift, nothing back) cost no tap,
//   even with none left (owner, after the 0.20.0 build: "Free, any time").
//   A contract never ends the run.
// - The phase (plan section 1) is worked out from the camps and the
//   contracts done: 1 until a level-2 camp, 2 until a level-3 camp, 3 until
//   a tier-1 contract is done, 4 until a tier-2 one is, then 5. (Phases are
//   the run's goals on the contracts card; stages open the board.)
//
// The numbers are in src/data/frontier.ts.

import {
  FRONTIER_BOARD,
  FRONTIER_CONTRACTS,
  FRONTIER_MARKET,
  FRONTIER_STAGES,
} from '../../data/frontier';
import type { FrontierContractDef } from '../../data/frontier';
import { createRng, nextInt } from '../rng';
import { canAfford, pay } from './camps';
import { bestCampLevel, marketIsOpen } from './market';
import { worldCanFill, worldStock } from './stock';
import { gained } from './surface';
import { deepestDug } from './raids';
import type { FrontierState } from './state';

/** True if `state` has reached the milestone `needs` names (FRONTIER_STAGES). */
function milestoneReached(
  state: FrontierState,
  needs: (typeof FRONTIER_STAGES)[number]['needs'],
): boolean {
  if (needs === 'level2') return bestCampLevel(state) >= 2;
  if (needs === 'level3') return bestCampLevel(state) >= 3;
  if (needs === 'smelter') return state.camps.some((c) => c.smelter);
  return (state.inventory.get('steelDrill') ?? 0) > 0 || state.camps.some((c) => c.deep);
}

/** How many contracts have been delivered in the run, every tier. */
export function contractsDelivered(state: FrontierState): number {
  return state.contractsDone.reduce((sum, n) => sum + n, 0);
}

/** The contract stage open now, 1 to 5 (see the top of this file). */
export function contractStage(state: FrontierState): number {
  let stage = 1;
  for (const next of FRONTIER_STAGES) {
    if (!milestoneReached(state, next.needs) || contractsDelivered(state) < next.delivered) break;
    stage = next.stage;
  }
  return stage;
}

/**
 * The board on the shift being played: up to FRONTIER_BOARD.perStage of
 * each open stage's contracts, in an order drawn from the seed and the
 * shift, of which 3 to 7 are taken, the newest stage first (see the top of
 * this file). Empty unless the market is open. Only contracts the world can
 * fill are offered (stock.ts; owner, on the hazards build: "Let's inventory
 * the entire board so that the contracts offered are not unfillable").
 */
export function contractBoard(state: FrontierState): FrontierContractDef[] {
  if (!marketIsOpen(state)) return [];
  // A generator of the board's own, from the seed and the shift (each kept
  // to 32 bits): the world's generator is untouched.
  const rng = createRng(
    (Math.imul(state.seed, 0x9e3779b1) ^ Math.imul(state.shift, 0x85ebca6b)) >>> 0,
  );
  // Only what is within reach of the deepest square dug counts (owner, after
  // the 0.20.0 build: "no keystone or relics etc if they are still far away").
  const stock = worldStock(state, deepestDug(state) + FRONTIER_BOARD.reachBelowDeepest);
  const level = bestCampLevel(state);
  const open = contractStage(state);
  // Each open stage's draw, the first stage first.
  const byStage: FrontierContractDef[][] = [];
  for (let stage = 1; stage <= open; stage += 1) {
    const pool = FRONTIER_CONTRACTS.filter(
      (c) => c.stage === stage && (c.fromLevel ?? 1) <= level && worldCanFill(stock, c.asks),
    );
    // Draw without putting back: a few steps of a shuffle.
    const left = [...pool];
    const drawn: FrontierContractDef[] = [];
    while (drawn.length < FRONTIER_BOARD.perStage && left.length > 0) {
      const [picked] = left.splice(nextInt(rng, left.length), 1);
      if (picked !== undefined) drawn.push(picked);
    }
    byStage.push(drawn);
  }
  // At most 3 to 7 a day (owner: "Only 3-7 available to take"): taken in
  // turn from each stage, the newest first, so every open stage is offered;
  // then shown in the order of FRONTIER_CONTRACTS (the stages of a tier together).
  const [low, high] = FRONTIER_BOARD.offers;
  const most = low + nextInt(rng, high - low + 1);
  const chosen: FrontierContractDef[] = [];
  for (let round = 0; chosen.length < most; round += 1) {
    let any = false;
    for (let t = byStage.length - 1; t >= 0 && chosen.length < most; t -= 1) {
      const pick = byStage[t]?.[round];
      if (pick !== undefined) {
        chosen.push(pick);
        any = true;
      }
    }
    if (!any) break;
  }
  // Clay and stone on every board through stage 4 (owner, after the 0.26.0
  // build): a contract for each, drawn from those the board could offer, if
  // none was taken above; at the day's most, it takes the place of the last
  // one taken that asks for neither.
  if (open <= FRONTIER_BOARD.alwaysOfferUntilStage) {
    const asksFor = (c: FrontierContractDef, item: string): boolean =>
      c.asks.some((a) => a.item === item);
    for (const item of FRONTIER_BOARD.alwaysOffer) {
      if (chosen.some((c) => asksFor(c, item))) continue;
      const can = FRONTIER_CONTRACTS.filter(
        (c) =>
          c.stage <= open &&
          (c.fromLevel ?? 1) <= level &&
          asksFor(c, item) &&
          !chosen.includes(c) &&
          worldCanFill(stock, c.asks),
      );
      const pick = can[nextInt(rng, Math.max(1, can.length))];
      if (pick === undefined) continue;
      if (chosen.length >= high) {
        let k = chosen.length - 1;
        while (
          k >= 0 &&
          FRONTIER_BOARD.alwaysOffer.some((it) => asksFor(chosen[k] as FrontierContractDef, it))
        )
          k -= 1;
        if (k < 0) continue;
        chosen.splice(k, 1);
      }
      chosen.push(pick);
    }
  }
  // One taken or filled today has left the board (`boardUsed`).
  return FRONTIER_CONTRACTS.filter((c) => chosen.includes(c) && !state.boardUsed.includes(c.id));
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
  return {
    ...state,
    contracts: [...state.contracts, { id, takenOn: state.shift }],
    boardUsed: [...state.boardUsed, id],
  };
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
  // Taken and delivered in one go: it is never held. It leaves today's board.
  const done = deliverContract(takeAnyway(state, id), id);
  return { ...done, boardUsed: [...done.boardUsed, id] };
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
