// Playing the new game (Lab 2 becomes the game, plan A3) headlessly: its
// steps, a replay, and a simple policy to record golden runs with. The
// golden test (tests/golden/frontier.test.ts) and `npm run golden --
// --frontier` use it. Everything goes through the engine's public surface.

import {
  FRONTIER_DRILL,
  FRONTIER_LANTERN,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_PEN,
  FRONTIER_PICKAXE,
  FRONTIER_STEEL_DRILL,
} from '../src/data/frontier';
import {
  canAfford,
  contractBoard,
  contractById,
  coverLevels,
  openTiers,
  deliverRefusal,
  createFrontier,
  frontierAct,
  hasSmelter,
  isMarketDay,
  mostLots,
  tradeRefusal,
  lanternRefusal,
  makeRefusal,
  previewTap,
  newlyCovered,
  placeRefusal,
  penRefusal,
  plantRefusal,
  smelterRefusal,
  upgradeCostFrom,
  upgradeRefusal,
} from '../src/engine';
import type { FrontierAction, FrontierState } from '../src/engine';
import { NO_FEATURE } from '../src/engine/frontier/state';

/**
 * One step of the new game, as a short text: "tap X,Y", "place X,Y",
 * "upgrade ID", "demolish ID", "endShift", "rest ID" (at camp ID), "close",
 * "buildSmelter ID" (a smelter at camp ID), "make RECIPE" (a recipe id,
 * such as "smelt-iron"), "hangLantern ID" (a lantern at camp ID), or
 * "sell ITEM LOTS" / "buy ITEM LOTS" at the market (an item id, such as
 * "wood", and a whole number of lots), or "plant X,Y ITEM" (a sapling or
 * an apple sapling on square X,Y), "buildPen ID", "penIn ID" or "penOut ID"
 * (a pen at camp ID, an animal into it or out of it), "takeContract ID"
 * (a contract from today's board), "deliver" or "dropContract".
 */
export type FrontierStep = string;

/** A recorded run of the new game: tests/golden/frontier/*.json. */
export interface FrontierGolden {
  description: string;
  recordedWith: string;
  engineVersion: string;
  seed: number;
  /** How many steps were taken. */
  stepCount: number;
  expectedHash: string;
  steps: FrontierStep[];
}

/** Read "X,Y" into a square. Throws on anything else. */
function squareOf(text: string): { x: number; y: number } {
  const parts = text.split(',').map(Number);
  const x = parts[0];
  const y = parts[1];
  if (
    parts.length !== 2 ||
    x === undefined ||
    y === undefined ||
    !Number.isInteger(x) ||
    !Number.isInteger(y)
  ) {
    throw new Error(`"${text}" is not a square "X,Y"`);
  }
  return { x, y };
}

/** Rest at the first camp (question 156: rest only at a camp); End shift if no camp stands. */
export function restStep(state: FrontierState): FrontierStep {
  const camp = state.camps[0];
  return camp === undefined ? 'endShift' : `rest ${camp.id}`;
}

/** The engine's action for a step. Throws for text that is not a step. */
export function actionOf(step: FrontierStep): FrontierAction {
  const [verb, arg, third] = step.split(' ');
  if ((verb === 'sell' || verb === 'buy') && arg !== undefined && third !== undefined) {
    return { kind: verb, item: arg, lots: Number(third) };
  }
  if (verb === 'plant' && arg !== undefined && third !== undefined) {
    return { kind: 'plant', ...squareOf(arg), item: third };
  }
  if (verb === 'endShift' || verb === 'close' || verb === 'deliver' || verb === 'dropContract') {
    return { kind: verb };
  }
  if (verb === 'takeContract' && arg !== undefined) {
    return { kind: 'takeContract', id: arg };
  }
  if (
    (verb === 'upgrade' ||
      verb === 'demolish' ||
      verb === 'rest' ||
      verb === 'buildSmelter' ||
      verb === 'hangLantern' ||
      verb === 'buildPen' ||
      verb === 'penIn' ||
      verb === 'penOut') &&
    arg !== undefined
  ) {
    return { kind: verb, id: Number(arg) };
  }
  if (verb === 'make' && arg !== undefined) {
    return { kind: 'make', recipe: arg };
  }
  if ((verb === 'tap' || verb === 'place') && arg !== undefined) {
    return { kind: verb, ...squareOf(arg) };
  }
  throw new Error(`"${step}" is not a step of the new game`);
}

/**
 * The state after `step`. A step the rules refuse throws: a recorded run
 * only holds steps that did something, so a refusal means the rules changed.
 */
export function applyFrontierStep(state: FrontierState, step: FrontierStep): FrontierState {
  const outcome = frontierAct(state, actionOf(step));
  if (!outcome.done) {
    throw new Error(`"${step}" did nothing: ${outcome.refusal ?? ''}`);
  }
  return outcome.state;
}

/** A new world on `seed` with `steps` taken in order. */
export function replayFrontier(seed: number, steps: FrontierStep[]): FrontierState {
  let state = createFrontier(seed);
  for (const step of steps) {
    state = applyFrontierStep(state, step);
  }
  return state;
}

/** The gatherer rests at the end of a shift when the crew's health is this or lower. */
const GATHERER_REST_AT = 4;

/** The gatherer stops placing camps once it has this many. */
const GATHERER_CAMPS = 3;

/**
 * Smelting and crafting, for the gatherer and the careful policy
 * (docs/plans/smelting-and-crafting.md), in order, the first that can be done:
 * a smelter at the lowest-numbered camp that may have one, if none stands;
 * an iron pickaxe, an iron drill (one each); hang a held lantern at the
 * lowest-numbered camp without one; make a lantern while a camp has none;
 * smelt iron, then copper. `null` if none can be done now.
 */
export function craftStep(state: FrontierState): FrontierStep | null {
  if (!hasSmelter(state)) {
    const at = state.camps.find((c) => smelterRefusal(state, c.id) === null);
    return at === undefined ? null : `buildSmelter ${at.id}`;
  }
  const held = (item: string): boolean => (state.inventory.get(item) ?? 0) > 0;
  if (!held(FRONTIER_PICKAXE.item) && makeRefusal(state, 'iron-pickaxe') === null) {
    return 'make iron-pickaxe';
  }
  if (!held(FRONTIER_DRILL.item) && makeRefusal(state, 'iron-drill') === null) {
    return 'make iron-drill';
  }
  const dark = state.camps.find((c) => !c.lantern);
  if (dark !== undefined && lanternRefusal(state, dark.id) === null) {
    return `hangLantern ${dark.id}`;
  }
  if (
    dark !== undefined &&
    !held(FRONTIER_LANTERN.item) &&
    makeRefusal(state, 'copper-lantern') === null
  ) {
    return 'make copper-lantern';
  }
  for (const recipe of ['smelt-iron', 'smelt-copper']) {
    if (makeRefusal(state, recipe) === null) return `make ${recipe}`;
  }
  return null;
}

/** The gatherer keeps this much grass back and sells the rest on a market day. */
const GATHERER_GRASS_KEPT = 60;

/** The gatherer keeps this much stone back and sells the rest on a market day. */
const GATHERER_STONE_KEPT = 100;

/**
 * Items it sells whenever it can, while no open tier of contracts asks for
 * them: crystal, rare ore and relics have no other use (design doc section
 * 7), and tier-3 contracts ask for them (progression PR 5).
 */
const GATHERER_SELLS_ALL = ['crystal', 'rareOre', 'relic'];

/**
 * On a market day (docs/plans/progression-phases.md, section 3): buy an
 * iron drill, then a steel drill, when it can (one each); sell every whole
 * lot of the items with no use yet (until tier-3 contracts ask for them), then grass above GATHERER_GRASS_KEPT and
 * stone above GATHERER_STONE_KEPT. `null` if there is nothing to trade, or
 * it is not a market day.
 */
export function marketStep(state: FrontierState): FrontierStep | null {
  if (!isMarketDay(state)) return null;
  for (const tool of [FRONTIER_DRILL.item, FRONTIER_STEEL_DRILL.item]) {
    const held = (state.inventory.get(tool) ?? 0) > 0;
    if (!held && tradeRefusal(state, 'buy', tool, 1) === null) return `buy ${tool} 1`;
  }
  const tier3 = openTiers(state).includes(3);
  for (const item of tier3 ? [] : GATHERER_SELLS_ALL) {
    const lots = mostLots(state, 'sell', item);
    if (lots > 0) return `sell ${item} ${lots}`;
  }
  const spare = { ...state, inventory: new Map(state.inventory) };
  spare.inventory.set(
    'grass',
    Math.max(0, (state.inventory.get('grass') ?? 0) - GATHERER_GRASS_KEPT),
  );
  const grass = mostLots(spare, 'sell', 'grass');
  if (grass > 0) return `sell grass ${grass}`;
  spare.inventory.set(
    'stone',
    Math.max(0, (state.inventory.get('stone') ?? 0) - GATHERER_STONE_KEPT),
  );
  const stone = mostLots(spare, 'sell', 'stone');
  return stone > 0 ? `sell stone ${stone}` : null;
}

/** The gatherer keeps this much hay: the level-3 upgrade's 10, and some for breeding. */
const GATHERER_HAY = 16;

/** The gatherer keeps this many animals in the store, for upgrades and food; the rest go in a pen. */
const GATHERER_ANIMALS_KEPT = 3;

/**
 * Pens and hay (progression plan section 6.3), in order, the first that
 * can be done: build a pen at the first camp once it holds the pen's cost
 * and 20 wood more; take an animal out of a pen while the store has fewer
 * than GATHERER_ANIMALS_KEPT and the pen keeps 2 to breed; put one in while
 * the store has more; make hay while it holds less than GATHERER_HAY and
 * has 30 grass to spare. `null` if none can be done.
 */
export function farmStep(state: FrontierState): FrontierStep | null {
  const first = state.camps[0];
  if (first === undefined) return null;
  const pen = state.camps.find((c) => c.pen);
  const wood = state.inventory.get('wood') ?? 0;
  if (pen === undefined) {
    const spare = wood >= (FRONTIER_PEN.cost.find((c) => c.item === 'wood')?.count ?? 0) + 20;
    if (spare && penRefusal(state, 'buildPen', first.id) === null) return `buildPen ${first.id}`;
  } else {
    const animals = state.inventory.get('animal') ?? 0;
    if (
      animals < GATHERER_ANIMALS_KEPT &&
      pen.penned > 2 &&
      penRefusal(state, 'penOut', pen.id) === null
    )
      return `penOut ${pen.id}`;
    if (animals > GATHERER_ANIMALS_KEPT && penRefusal(state, 'penIn', pen.id) === null)
      return `penIn ${pen.id}`;
  }
  const hay = state.inventory.get('hay') ?? 0;
  const grass = state.inventory.get('grass') ?? 0;
  if (hay < GATHERER_HAY && grass >= 30 && makeRefusal(state, 'hay') === null) return 'make hay';
  return null;
}

/**
 * True if delivering the held contract leaves the store holding what the
 * lowest camp's next upgrade needs of the same items (or the store did not
 * hold that much anyway): the gatherer does not trade an upgrade for coins.
 */
function keepsUpgrade(state: FrontierState): boolean {
  const asks = contractById(state.contract?.id ?? '')?.asks ?? [];
  const lowest = [...state.camps].sort((a, b) => a.level - b.level)[0];
  const upgrade = lowest === undefined ? [] : (upgradeCostFrom(lowest.level) ?? []);
  return upgrade.every((need) => {
    const ask = asks.find((a) => a.item === need.item)?.count ?? 0;
    const held = state.inventory.get(need.item) ?? 0;
    return ask === 0 || held < need.count || held - ask >= need.count;
  });
}

/** The gatherer drops a contract it cannot deliver after holding it this many shifts. */
const GATHERER_CONTRACT_PATIENCE = 20;

/**
 * Contracts (progression plan section 5), in order: deliver the one held
 * if it can; drop it on a market day once it has been held
 * GATHERER_CONTRACT_PATIENCE shifts; with none held, take the board's
 * contract whose asks the store holds the most of (as a share), the
 * highest tier first among equals. `null` if none of these can be done.
 */
export function contractStep(state: FrontierState): FrontierStep | null {
  if (deliverRefusal(state) === null && keepsUpgrade(state)) return 'deliver';
  const held = state.contract;
  if (held !== null) {
    const stale = state.shift - held.takenOn >= GATHERER_CONTRACT_PATIENCE;
    return stale && isMarketDay(state) ? 'dropContract' : null;
  }
  let best: { id: string; share: number; tier: number } | null = null;
  for (const offer of contractBoard(state)) {
    const shares = offer.asks.map((a) => Math.min(1, (state.inventory.get(a.item) ?? 0) / a.count));
    const share = shares.reduce((sum, x) => sum + x, 0) / shares.length;
    if (best === null || share > best.share || (share === best.share && offer.tier > best.tier)) {
      best = { id: offer.id, share, tier: offer.tier };
    }
  }
  return best === null ? null : `takeContract ${best.id}`;
}

/**
 * Plant a sapling it holds (progression plan section 6.2) on the lit square
 * farthest from the newest camp where one can be planted, so its own
 * digging, which starts nearest that camp, leaves it be. Ties go to the
 * square met first, row by row. `null` with no sapling, or nowhere to plant.
 */
export function plantStep(state: FrontierState): FrontierStep | null {
  if ((state.inventory.get('sapling') ?? 0) < 1) return null;
  const newest = state.camps[state.camps.length - 1];
  if (newest === undefined) return null;
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < state.cube.size.y; y += 1) {
    for (let x = 0; x < state.cube.size.x; x += 1) {
      if (plantRefusal(state, x, y, 'sapling') !== null) continue;
      const d = (x - newest.x) ** 2 + (y - newest.y) ** 2;
      if (best === null || d > best.d) best = { x, y, d };
    }
  }
  return best === null ? null : `plant ${best.x},${best.y} sapling`;
}

/**
 * The gatherer: a plain policy for recording golden runs. In order:
 * 0. with no taps left, end the shift, or rest if the crew's health is at
 *    GATHERER_REST_AT or below (plan A4);
 * 1. take and deliver contracts (`contractStep`), smelt and craft what it
 *    can (`craftStep`), keep a pen and make hay
 *    (`farmStep`), trade on a market day (`marketStep`), and plant the
 *    saplings it holds (`plantStep`);
 * 2. upgrade the lowest camp it can pay for;
 * 3. with fewer than 3 camps, place one where it lights the most new
 *    ground, if it can pay;
 * 4. catch the lit animal nearest the newest camp;
 * 5. while the next goal (a new camp, or else the lowest camp's upgrade) is
 *    short of wood, grass or apples, take the lit plant nearest the newest camp;
 * 6. mine the block nearest the newest camp that it can mine;
 * 7. failing that, take the nearest plant.
 * Ties go to the square met first, row by row. `null` when nothing is left to do.
 */
export function gathererStep(state: FrontierState): FrontierStep | null {
  if (state.status !== 'active') return null;
  if (state.tapsLeft === 0) {
    return state.health <= GATHERER_REST_AT ? restStep(state) : 'endShift';
  }
  const craft =
    contractStep(state) ??
    craftStep(state) ??
    farmStep(state) ??
    marketStep(state) ??
    plantStep(state);
  if (craft !== null) return craft;
  const byLevel = [...state.camps].sort((a, b) => a.level - b.level || a.id - b.id);
  for (const camp of byLevel) {
    if (upgradeCostFrom(camp.level) !== null && upgradeRefusal(state, camp.id) === null) {
      return `upgrade ${camp.id}`;
    }
  }
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  const moreCamps = state.camps.length < GATHERER_CAMPS;
  if (moreCamps && canAfford(state.inventory, FRONTIER_NEW_CAMP_COST)) {
    let best: { x: number; y: number; fresh: number } | null = null;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        if (placeRefusal(state, x, y) !== null) continue;
        const fresh = newlyCovered(state, x, y).length;
        if (best === null || fresh > best.fresh) best = { x, y, fresh };
      }
    }
    if (best !== null && best.fresh > 0) {
      return `place ${best.x},${best.y}`;
    }
  }
  const newest = state.camps[state.camps.length - 1];
  if (newest === undefined) return null;
  // The lit squares, nearest the newest camp first (a stable sort: ties stay row by row).
  const lit = coverLevels(state.camps, width, height);
  const squares: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((lit[x + width * y] ?? 0) > 0) {
        squares.push({ x, y, d: (x - newest.x) ** 2 + (y - newest.y) ** 2 });
      }
    }
  }
  squares.sort((a, b) => a.d - b.d);
  const animal = squares.find((s) => state.animals.some((a) => a.x === s.x && a.y === s.y));
  if (animal !== undefined) return `tap ${animal.x},${animal.y}`;
  // A plant the tap would take: not on a camp's ground (`frontierTap` checks the rest).
  const plant = squares.find(
    (s) =>
      state.features[s.x + width * s.y] !== NO_FEATURE &&
      !state.camps.some((c) => Math.abs(c.x - s.x) <= 1 && Math.abs(c.y - s.y) <= 1),
  );
  // Plants give wood, grass and apples: take them while the next goal (a new
  // camp, or else the lowest camp's upgrade) is short of any of those.
  const lowest = byLevel[0];
  const goal = moreCamps
    ? FRONTIER_NEW_CAMP_COST
    : lowest === undefined
      ? []
      : (upgradeCostFrom(lowest.level) ?? []);
  const short = goal.some(
    (stack) =>
      ['wood', 'grass', 'apple'].includes(stack.item) &&
      (state.inventory.get(stack.item) ?? 0) < stack.count,
  );
  if (plant !== undefined && short) return `tap ${plant.x},${plant.y}`;
  for (const s of squares) {
    if (state.features[s.x + width * s.y] !== NO_FEATURE) continue; // a plant must go first
    if (previewTap(state, s.x, s.y).kind === 'mined') return `tap ${s.x},${s.y}`;
  }
  // Nothing left to take: end the shift, so the animals and apples come round again.
  return plant === undefined ? 'endShift' : `tap ${plant.x},${plant.y}`;
}
