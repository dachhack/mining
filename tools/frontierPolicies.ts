// Policies for the new game's simulator (plan B3): scripted players that
// choose the next step from what the player may know. Each is
// deterministic: the same seed and the same state give the same step (the
// random policy draws from its own seeded generator, never the clock).
//
// - random:   a step at random among the useful ones (a tap that takes or
//             mines something, a camp it can place, upgrade or demolish, a
//             smelter it can build, a recipe it can make, a lantern it
//             can hang, one lot it can sell or buy on a market day, a
//             sapling it holds, a pen it can build or use, a contract
//             it can take or deliver; it never drops one),
//             ending the shift when out of taps; it never closes the mine.
// - gatherer: tools/frontierRun.ts: builds a smelter, smelts and makes the
//             tools and lanterns, keeps a pen and makes hay, sells
//             surplus on market days, plants saplings,
//             upgrades, places up to 3 camps, takes plants and animals,
//             mines; spends everything as it comes.
// - careful:  the gatherer, but it keeps wood and food back for upkeep (no
//             camp, upgrade or wood-using recipe while short), and rests
//             when the crew's health is low.
// - digger:   digs a pit next to the first camp, as deep as the camps let
//             it, gathering only to pay upkeep.
// - idle:     gathers nothing: it ends every shift, rests at a camp when the
//             crew is at half health or less until shift IDLE_RESTS_UNTIL,
//             then lets the crew starve. The hunger path, start to end.

import {
  FRONTIER_FOODS,
  FRONTIER_MARKET,
  FRONTIER_RECIPES,
  FRONTIER_SHIFT,
} from '../src/data/frontier';
import {
  campAt,
  coverLevels,
  contractBoard,
  createRng,
  deliverRefusal,
  takeRefusal,
  fillRefusal,
  marketIsOpen,
  tradeRefusal,
  previewTap,
  placeRefusal,
  penRefusal,
  plantRefusal,
  upgradeRefusal,
  demolishRefusal,
  lanternRefusal,
  makeRefusal,
  smelterRefusal,
  upkeepDue,
} from '../src/engine';
import type { FrontierState } from '../src/engine';
import { nextFloat } from '../src/engine/rng';
import type { RngState } from '../src/engine/rng';
import { NO_FEATURE } from '../src/engine/frontier/state';
import { gathererStep, isBareAppleTree, restStep } from './frontierRun';
import type { FrontierStep } from './frontierRun';

export const FRONTIER_POLICY_NAMES = ['random', 'gatherer', 'careful', 'digger', 'idle'] as const;
export type FrontierPolicyName = (typeof FRONTIER_POLICY_NAMES)[number];

/** A policy: the next step for a state, or `null` to stop playing. */
export type FrontierPolicy = (state: FrontierState) => FrontierStep | null;

export function isFrontierPolicyName(name: string): name is FrontierPolicyName {
  return (FRONTIER_POLICY_NAMES as readonly string[]).includes(name);
}

/** A fresh policy for one run on `seed`. */
export function makeFrontierPolicy(name: FrontierPolicyName, seed: number): FrontierPolicy {
  if (name === 'random') return withMarket(randomPolicy(createRng((seed ^ 0x2545f491) >>> 0)));
  if (name === 'careful') return withMarket(carefulStep);
  if (name === 'digger') return withMarket(diggerStep);
  if (name === 'idle') return withMarket(idleStep);
  return withMarket(gathererStep);
}

/** The steps that can be taken while the market is open (market.ts). */
const MARKET_VERBS = ['sell', 'buy', 'takeContract', 'fillContract', 'deliver', 'closeMarket'];

/**
 * `policy`, closing the market when it is open and the policy's step is
 * not a market action: the market opens after a market day's night, and
 * the day starts only once it is closed.
 */
function withMarket(policy: FrontierPolicy): FrontierPolicy {
  return (state) => {
    const step = policy(state);
    if (!state.marketOpen || step === null) return step;
    return MARKET_VERBS.includes(step.split(' ')[0] ?? '') ? step : 'closeMarket';
  };
}

/** The idle policy rests when the crew is low only before this shift; after it, the crew starves. */
const IDLE_RESTS_UNTIL = 8;

/** The idle policy (see the top of this file). */
function idleStep(state: FrontierState): FrontierStep | null {
  if (state.status !== 'active') return null;
  const low = state.health <= FRONTIER_SHIFT.startHealth / 2;
  return low && state.shift < IDLE_RESTS_UNTIL ? restStep(state) : 'endShift';
}

/** Every lit square where a tap does something now, row by row. */
function usefulTaps(state: FrontierState): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];
  const lit = coverLevels(state.camps, state.cube.size.x, state.cube.size.y);
  for (let y = 0; y < state.cube.size.y; y += 1) {
    for (let x = 0; x < state.cube.size.x; x += 1) {
      if ((lit[x + state.cube.size.x * y] ?? 0) === 0) continue;
      const kind = previewTap(state, x, y).kind;
      if (kind === 'mined' || kind === 'harvested') found.push({ x, y });
    }
  }
  return found;
}

/** The random policy, drawing from `rng`. */
function randomPolicy(rng: RngState): FrontierPolicy {
  return (state) => {
    if (state.status !== 'active') return null;
    if (state.tapsLeft === 0) return 'endShift';
    const options: FrontierStep[] = usefulTaps(state).map((s) => `tap ${s.x},${s.y}`);
    for (const camp of state.camps) {
      if (upgradeRefusal(state, camp.id) === null) options.push(`upgrade ${camp.id}`);
      if (demolishRefusal(state, camp.id) === null) options.push(`demolish ${camp.id}`);
      if (smelterRefusal(state, camp.id) === null) options.push(`buildSmelter ${camp.id}`);
      if (lanternRefusal(state, camp.id) === null) options.push(`hangLantern ${camp.id}`);
      for (const kind of ['buildPen', 'penIn', 'penOut'] as const) {
        if (penRefusal(state, kind, camp.id) === null) options.push(`${kind} ${camp.id}`);
      }
    }
    for (const recipe of FRONTIER_RECIPES) {
      if (makeRefusal(state, recipe.id) === null) options.push(`make ${recipe.id}`);
    }
    // While the market is open, one lot of anything it can sell or buy.
    if (marketIsOpen(state)) {
      options.push('closeMarket');
      for (const lot of FRONTIER_MARKET.sellPrices) {
        if (tradeRefusal(state, 'sell', lot.item, 1) === null) options.push(`sell ${lot.item} 1`);
      }
      for (const lot of FRONTIER_MARKET.buyPrices) {
        if (tradeRefusal(state, 'buy', lot.item, 1) === null) options.push(`buy ${lot.item} 1`);
      }
    }
    // A contract: take or fill one from the board, or deliver one held.
    for (const offer of contractBoard(state)) {
      if (takeRefusal(state, offer.id) === null) options.push(`takeContract ${offer.id}`);
      if (fillRefusal(state, offer.id) === null) options.push(`fillContract ${offer.id}`);
    }
    for (const held of state.contracts) {
      if (deliverRefusal(state, held.id) === null) options.push(`deliver ${held.id}`);
    }
    // A sapling it holds, on a few squares tried at random.
    for (const item of ['sapling', 'appleSapling']) {
      if ((state.inventory.get(item) ?? 0) < 1) continue;
      for (let k = 0; k < 4; k += 1) {
        const x = Math.floor(nextFloat(rng) * state.cube.size.x);
        const y = Math.floor(nextFloat(rng) * state.cube.size.y);
        if (plantRefusal(state, x, y, item) === null) options.push(`plant ${x},${y} ${item}`);
      }
    }
    // A few places for a camp, tried at random squares (all of them would be slow).
    for (let i = 0; i < 8; i += 1) {
      const x = Math.floor(nextFloat(rng) * state.cube.size.x);
      const y = Math.floor(nextFloat(rng) * state.cube.size.y);
      if (placeRefusal(state, x, y) === null) options.push(`place ${x},${y}`);
      if (placeRefusal(state, x, y, true) === null) options.push(`placeDeep ${x},${y}`);
    }
    options.push('endShift'); // sometimes it ends a shift early
    return options[Math.floor(nextFloat(rng) * options.length)] ?? 'endShift';
  };
}

/** How much of `item` the next few shifts' upkeep needs. */
function upkeepAhead(state: FrontierState, item: 'wood' | 'food', shifts: number): number {
  let need = 0;
  for (let s = state.shift; s < state.shift + shifts; s += 1) {
    need += upkeepDue(s, state.camps.length).filter((d) => d.item === item).length;
  }
  return need;
}

/** Food held, in upkeep's units: apples, grass (FRONTIER_FOODS says how much is 1 food) and animals. */
function foodHeld(state: FrontierState): number {
  let food = 0;
  for (const f of FRONTIER_FOODS) {
    food += Math.floor((state.inventory.get(f.item) ?? 0) / f.count);
  }
  return food;
}

/** True if `item` can pay food upkeep. */
function isFood(item: string | undefined): boolean {
  return FRONTIER_FOODS.some((f) => f.item === item);
}

/** True if `step` spends what upkeep needs: a camp, an upgrade, a pen, or a recipe with wood or food in it. */
function spendsUpkeep(step: FrontierStep): boolean {
  if (step.startsWith('place') || step.startsWith('upgrade') || step.startsWith('buildPen'))
    return true;
  if (!step.startsWith('make ')) return false;
  const recipe = FRONTIER_RECIPES.find((r) => r.id === step.slice('make '.length));
  return (recipe?.inputs ?? []).some((stack) => stack.item === 'wood' || isFood(stack.item));
}

/**
 * The careful policy: before ending a shift, rest if the crew is low; never
 * spend wood or food on a camp if that leaves too little for the next 4
 * shifts' upkeep; otherwise play as the gatherer, gathering for upkeep first.
 */
function carefulStep(state: FrontierState): FrontierStep | null {
  if (state.status !== 'active') return null;
  if (state.marketOpen) return gathererStep(state); // the market first, then the day
  if (state.tapsLeft === 0) {
    return state.health <= FRONTIER_SHIFT.startHealth / 2 ? restStep(state) : 'endShift';
  }
  const woodNeed = upkeepAhead(state, 'wood', 4);
  const foodNeed = upkeepAhead(state, 'food', 4);
  const short =
    (state.inventory.get('wood') ?? 0) < woodNeed
      ? 'wood'
      : foodHeld(state) < foodNeed
        ? 'food'
        : null;
  if (short !== null) {
    // Gather what upkeep needs first: trees for wood; apples, grass or animals for food.
    const near = state.camps[state.camps.length - 1] ?? { x: 0, y: 0 };
    const taps = usefulTaps(state).sort(
      (a, b) =>
        Math.abs(a.x - near.x) +
        Math.abs(a.y - near.y) -
        (Math.abs(b.x - near.x) + Math.abs(b.y - near.y)),
    );
    const wanted = taps.find((s) => {
      if (isBareAppleTree(state, s.x, s.y)) return false; // left for its apples
      const item = previewTap(state, s.x, s.y).gain[0]?.item;
      return short === 'wood' ? item === 'wood' : isFood(item);
    });
    if (wanted !== undefined) return `tap ${wanted.x},${wanted.y}`;
  }
  const step = gathererStep(state);
  // The gatherer would spend the stock on a camp, an upgrade, or a recipe
  // that takes wood or food: only if upkeep is covered after.
  if (step !== null && spendsUpkeep(step) && short !== null) {
    return 'endShift';
  }
  return step;
}

/**
 * The digger: keeps upkeep paid (as the careful policy does), and otherwise
 * mines the square nearest a pit centre 3 squares east of the first camp,
 * going down wherever the level rule and the camps' levels allow.
 */
function diggerStep(state: FrontierState): FrontierStep | null {
  if (state.status !== 'active') return null;
  if (state.tapsLeft === 0) {
    return state.health <= FRONTIER_SHIFT.startHealth / 2 ? restStep(state) : 'endShift';
  }
  const woodShort = (state.inventory.get('wood') ?? 0) < upkeepAhead(state, 'wood', 2);
  const foodShort = foodHeld(state) < upkeepAhead(state, 'food', 2);
  const first = state.camps[0];
  if (first === undefined) return null;
  const pit = { x: first.x + 4, y: first.y };
  const width = state.cube.size.x;
  const taps = usefulTaps(state).sort(
    (a, b) =>
      Math.abs(a.x - pit.x) +
      Math.abs(a.y - pit.y) -
      (Math.abs(b.x - pit.x) + Math.abs(b.y - pit.y)),
  );
  if (woodShort || foodShort) {
    const wanted = taps.find((s) => {
      if (isBareAppleTree(state, s.x, s.y)) return false; // left for its apples
      const item = previewTap(state, s.x, s.y).gain[0]?.item;
      return woodShort ? item === 'wood' : isFood(item);
    });
    if (wanted !== undefined) return `tap ${wanted.x},${wanted.y}`;
  }
  // Dig: the nearest square to the pit's centre that can be mined, clearing what grows first.
  const dig = taps.find(
    (s) =>
      campAt(state.camps, s.x, s.y) === null &&
      (state.features[s.x + width * s.y] !== NO_FEATURE ||
        previewTap(state, s.x, s.y).kind === 'mined'),
  );
  return dig === undefined ? 'endShift' : `tap ${dig.x},${dig.y}`;
}
