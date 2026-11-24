// Playing the new game (Lab 2 becomes the game, plan A3) headlessly: its
// steps, a replay, and a simple policy to record golden runs with. The
// golden test (tests/golden/frontier.test.ts) and `npm run golden --
// --frontier` use it. Everything goes through the engine's public surface.

import {
  FRONTIER_DEEP_CAMP,
  FRONTIER_DRAGON,
  FRONTIER_DRILL,
  FRONTIER_LANTERN,
  FRONTIER_MARKET,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_PEN,
  FRONTIER_PICKAXE,
  FRONTIER_PUMP,
  FRONTIER_RAID,
  FRONTIER_STEEL_DRILL,
} from '../src/data/frontier';
import {
  campAt,
  canAfford,
  contractBoard,
  coverLevelAt,
  footprintOf,
  contractById,
  coverLevels,
  openTiers,
  deliverRefusal,
  takeRefusal,
  createFrontier,
  depthAt,
  frontierAct,
  hasSmelter,
  coinsHeld,
  marketIsOpen,
  mostLots,
  tradeRefusal,
  lanternRefusal,
  makeRefusal,
  previewTap,
  newlyCovered,
  placeRefusal,
  sightAt,
  defenseRefusal,
  nextDefense,
  raidStrength,
  penRefusal,
  plantRefusal,
  smelterRefusal,
  upgradeCostFrom,
  upgradeRefusal,
} from '../src/engine';
import type { FrontierAction, FrontierState } from '../src/engine';
import { APPLE_TREE, NO_FEATURE } from '../src/engine/frontier/state';

/**
 * One step of the new game, as a short text: "tap X,Y", "place X,Y",
 * "upgrade ID", "demolish ID", "endShift", "rest ID" (at camp ID), "close",
 * "buildSmelter ID" (a smelter at camp ID), "make RECIPE" (a recipe id,
 * such as "smelt-iron"), "hangLantern ID" (a lantern at camp ID), or
 * "sell ITEM LOTS" / "buy ITEM LOTS" at the market (an item id, such as
 * "wood", and a whole number of lots), or "plant X,Y ITEM" (a sapling or
 * an apple sapling on square X,Y), "buildPen ID", "penIn ID" or "penOut ID"
 * (a pen at camp ID, an animal into it or out of it), "takeContract ID"
 * (a contract from today's board), "deliver ID", "dropContract ID", or
 * "placeDeep X,Y" (a deep camp), or "closeMarket" (the market closes and
 * the day starts).
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
  if (verb === 'endShift' || verb === 'close' || verb === 'closeMarket') {
    return { kind: verb };
  }
  if (
    (verb === 'takeContract' || verb === 'deliver' || verb === 'dropContract') &&
    arg !== undefined
  ) {
    return { kind: verb, id: arg };
  }
  if (
    (verb === 'upgrade' ||
      verb === 'demolish' ||
      verb === 'rest' ||
      verb === 'buildSmelter' ||
      verb === 'hangLantern' ||
      verb === 'buildPen' ||
      verb === 'penIn' ||
      verb === 'penOut' ||
      verb === 'buildDefense') &&
    arg !== undefined
  ) {
    return { kind: verb, id: Number(arg) };
  }
  if (verb === 'make' && arg !== undefined) {
    return { kind: 'make', recipe: arg };
  }
  if ((verb === 'tap' || verb === 'place' || verb === 'placeDeep') && arg !== undefined) {
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

/**
 * True if (x, y) holds an apple tree with no apples left: a tap would fell
 * it for wood. The steady policies leave such a tree standing and pick its
 * apples when they come back (owner, after decision note 0062: "don't chop
 * down the trees and pick apples when they regrow").
 */
export function isBareAppleTree(state: FrontierState, x: number, y: number): boolean {
  const i = x + state.cube.size.x * y;
  return state.features[i] === APPLE_TREE && (state.apples[i] ?? 0) === 0;
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

/** On a market day that sells wood, the gatherer buys it up to this much. */
const GATHERER_WOOD_STOCK = 40;

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
 * iron drill, then a steel drill, when it can (one each); buy wood up to
 * GATHERER_WOOD_STOCK once the market sells it; buy a camp kit; sell every whole
 * lot of the items with no use yet (until tier-3 contracts ask for them), then grass above GATHERER_GRASS_KEPT and
 * stone above GATHERER_STONE_KEPT. `null` if there is nothing to trade, or
 * it is not a market day.
 */
export function marketStep(state: FrontierState): FrontierStep | null {
  if (!marketIsOpen(state)) return null;
  // A sword while a dragon is on the map (hazards PR 4).
  if (
    state.hazards.dragons.length > 0 &&
    (state.inventory.get(FRONTIER_DRAGON.sword) ?? 0) === 0 &&
    tradeRefusal(state, 'buy', FRONTIER_DRAGON.sword, 1) === null
  ) {
    return `buy ${FRONTIER_DRAGON.sword} 1`;
  }
  // A pump for a lit flood no pump drains (hazards PR 2).
  if (
    unpumpedFlood(state) !== null &&
    (state.inventory.get(FRONTIER_PUMP.item) ?? 0) === 0 &&
    tradeRefusal(state, 'buy', FRONTIER_PUMP.item, 1) === null
  ) {
    return `buy ${FRONTIER_PUMP.item} 1`;
  }
  for (const tool of [FRONTIER_DRILL.item, FRONTIER_STEEL_DRILL.item]) {
    const held = (state.inventory.get(tool) ?? 0) > 0;
    if (!held && tradeRefusal(state, 'buy', tool, 1) === null) return `buy ${tool} 1`;
  }
  // Wood for upkeep once the market sells it (phase 4): up to
  // GATHERER_WOOD_STOCK, as the coins allow. Leaving apple trees standing
  // (isBareAppleTree) means less wood from felling late in a run.
  const wood = state.inventory.get('wood') ?? 0;
  const woodLot = FRONTIER_MARKET.buyPrices.find((l) => l.item === 'wood');
  if (woodLot !== undefined && wood < GATHERER_WOOD_STOCK) {
    const wanted = Math.ceil((GATHERER_WOOD_STOCK - wood) / woodLot.count);
    const lots = Math.min(wanted, mostLots(state, 'buy', 'wood'));
    if (lots > 0 && tradeRefusal(state, 'buy', 'wood', lots) === null) return `buy wood ${lots}`;
  }
  // Saplings come only from the market: two at a time, keeping 40 coins back.
  if ((state.inventory.get('sapling') ?? 0) === 0 && coinsHeld(state) >= 40) {
    if (tradeRefusal(state, 'buy', 'sapling', 2) === null) return 'buy sapling 2';
  }
  // A camp kit for one deep camp (progression PR 6), keeping 100 coins back.
  const kit = (state.inventory.get('campKit') ?? 0) > 0;
  const coins = coinsHeld(state);
  if (!kit && !state.camps.some((c) => c.deep) && coins >= 250) {
    if (tradeRefusal(state, 'buy', 'campKit', 1) === null) return 'buy campKit 1';
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

/**
 * A lit flooded square in a flood that no pump drains (hazards PR 2), the
 * first row by row, or `null`. A flood is the flooded squares joined to one
 * another; it counts as drained if a pump stands on any of them.
 */
export function unpumpedFlood(state: FrontierState): { x: number; y: number } | null {
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  const { flooded, pumps } = state.hazards;
  if (!flooded.includes(true)) return null;
  // Every square of a flood with a pump on it.
  const drained = new Set<number>();
  for (const pump of pumps) {
    const queue = [pump.x + width * pump.y];
    drained.add(queue[0] ?? 0);
    for (let k = 0; k < queue.length; k += 1) {
      const i = queue[k] ?? 0;
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const) {
        const nx = (i % width) + dx;
        const ny = Math.floor(i / width) + dy;
        const j = nx + width * ny;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (flooded[j] !== true || drained.has(j)) continue;
        drained.add(j);
        queue.push(j);
      }
    }
  }
  for (let i = 0; i < flooded.length; i += 1) {
    const x = i % width;
    const y = Math.floor(i / width);
    if (flooded[i] === true && !drained.has(i) && sightAt(state, x, y) === 'shown') return { x, y };
  }
  return null;
}

/**
 * Deal with the hazards: drive off a lit dragon with a sword, or make a sword
 * while a dragon is on the map (hazards PR 4); put out a lit fire (PR 3), the
 * first row by row; else set a pump from the store on a lit flood no pump
 * drains (PR 2). `null` if there is nothing to do.
 */
export function hazardStep(state: FrontierState): FrontierStep | null {
  const width = state.cube.size.x;
  const sword = (state.inventory.get(FRONTIER_DRAGON.sword) ?? 0) > 0;
  const dragons = state.hazards.dragons;
  const litDragon = dragons.find((d) => sightAt(state, d.x, d.y) === 'shown');
  if (litDragon !== undefined && sword) return `tap ${litDragon.x},${litDragon.y}`;
  if (dragons.length > 0 && !sword && makeRefusal(state, 'sword') === null) return 'make sword';
  const fire = state.hazards.fires.findIndex(
    (burning, i) => burning && sightAt(state, i % width, Math.floor(i / width)) === 'shown',
  );
  if (fire >= 0) return `tap ${fire % width},${Math.floor(fire / width)}`;
  if ((state.inventory.get(FRONTIER_PUMP.item) ?? 0) > 0) {
    const flood = unpumpedFlood(state);
    if (flood !== null) return `tap ${flood.x},${flood.y}`;
  }
  return defendStep(state);
}

/** The gatherer builds defenses only while it keeps this much wood after paying (hazards PR 5). */
const GATHERER_DEFENSE_WOOD_KEPT = 20;

/** ...and only from this many shifts before marauders can first come. */
const GATHERER_DEFENSE_LEAD = 3;

/**
 * Build defenses (hazards PR 5) at the camp with the fewest, while it has
 * fewer levels than marauders would come strong now, keeping
 * GATHERER_DEFENSE_WOOD_KEPT wood, from GATHERER_DEFENSE_LEAD shifts before
 * raids can start; `null` if none is wanted or affordable.
 */
function defendStep(state: FrontierState): FrontierStep | null {
  if (state.shift < FRONTIER_RAID.fromShift - GATHERER_DEFENSE_LEAD) return null;
  const camps = [...state.camps].sort((a, b) => a.defense - b.defense || a.id - b.id);
  // The strength is worked out only once a camp could build (it reads every square).
  let strength: number | null = null;
  for (const camp of camps) {
    const next = nextDefense(state, camp.id);
    if (next === null || defenseRefusal(state, camp.id) !== null) continue;
    const wood = next.cost.find((st) => st.item === 'wood')?.count ?? 0;
    if ((state.inventory.get('wood') ?? 0) - wood < GATHERER_DEFENSE_WOOD_KEPT) continue;
    strength ??= raidStrength(state); // `??=` sets it only while it is still null
    if (camp.defense < strength) return `buildDefense ${camp.id}`;
  }
  return null;
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
 * True if delivering held contract `id` leaves the store holding what the
 * lowest camp's next upgrade needs of the same items (or the store did not
 * hold that much anyway): the gatherer does not trade an upgrade for coins.
 */
function keepsUpgrade(state: FrontierState, id: string): boolean {
  const asks = contractById(id)?.asks ?? [];
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
 * Contracts (progression plan section 5), in order: deliver one held if
 * it can; drop one held GATHERER_CONTRACT_PATIENCE shifts, on a day after
 * the market; while fewer are held than the best camp's level allows, take
 * the board's contract whose asks the store holds the most of (as a
 * share), the highest tier first among equals. `null` if none of these
 * can be done.
 */
export function contractStep(state: FrontierState): FrontierStep | null {
  for (const held of state.contracts) {
    if (deliverRefusal(state, held.id) === null && keepsUpgrade(state, held.id))
      return `deliver ${held.id}`;
  }
  // Dropped on the first day after the market, so another can be taken at the next.
  for (const held of state.contracts) {
    const stale = state.shift - held.takenOn >= GATHERER_CONTRACT_PATIENCE;
    if (stale && !marketIsOpen(state)) return `dropContract ${held.id}`;
  }
  let best: { id: string; share: number; tier: number } | null = null;
  for (const offer of contractBoard(state)) {
    if (takeRefusal(state, offer.id) !== null) continue;
    const shares = offer.asks.map((a) => Math.min(1, (state.inventory.get(a.item) ?? 0) / a.count));
    const share = shares.reduce((sum, x) => sum + x, 0) / shares.length;
    if (best === null || share > best.share || (share === best.share && offer.tier > best.tier)) {
      best = { id: offer.id, share, tier: offer.tier };
    }
  }
  return best === null ? null : `takeContract ${best.id}`;
}

/**
 * A deep camp (progression PR 6), once it holds the kit and none stands:
 * on the deepest level 3 x 3 it may stand on, so the ground under its pit
 * is lit and mined as a level-3 camp's (ties go to the square met first,
 * row by row); with none, it flattens a patch deep enough (`flattenStep`).
 * `null` if it can do neither.
 */
export function deepStep(state: FrontierState): FrontierStep | null {
  if ((state.inventory.get('campKit') ?? 0) < 1 || state.camps.some((c) => c.deep)) return null;
  let best: { x: number; y: number; depth: number } | null = null;
  for (let y = 1; y < state.cube.size.y - 1; y += 1) {
    for (let x = 1; x < state.cube.size.x - 1; x += 1) {
      if (placeRefusal(state, x, y, true) !== null) continue;
      const depth = depthAt(state.cube, x, y);
      if (best === null || depth > best.depth) best = { x, y, depth };
    }
  }
  if (best !== null) return `placeDeep ${best.x},${best.y}`;
  return flattenStep(state);
}

/**
 * Flatten ground for a deep camp: among the lit 3 x 3 patches, clear of
 * camps, whose squares are all at least FRONTIER_DEEP_CAMP.minDepth deep,
 * take the one closest to level (smallest gap between its deepest and
 * shallowest squares), and mine one of its shallowest squares that can be
 * mined now. A pit's floor is terraced by the level rule, so a level 3 x 3
 * that deep seldom exists until it is dug for. `null` if no such patch has
 * a square it can mine.
 */
function flattenStep(state: FrontierState): FrontierStep | null {
  let best: { squares: { x: number; y: number; depth: number }[]; gap: number } | null = null;
  for (let y = 1; y < state.cube.size.y - 1; y += 1) {
    for (let x = 1; x < state.cube.size.x - 1; x += 1) {
      const squares = footprintOf(x, y).map((s) => ({
        ...s,
        depth: depthAt(state.cube, s.x, s.y),
      }));
      const deepEnough = squares.every((s) => s.depth >= FRONTIER_DEEP_CAMP.minDepth);
      const clear = squares.every((s) => campAt(state.camps, s.x, s.y) === null);
      const lit = squares.every((s) => coverLevelAt(state.camps, s.x, s.y) > 0);
      if (!deepEnough || !clear || !lit) continue;
      const depths = squares.map((s) => s.depth);
      const gap = Math.max(...depths) - Math.min(...depths);
      // A patch with a square it can mine now (a level patch is placed on, above).
      const minable = squares.some((s) => previewTap(state, s.x, s.y).kind === 'mined');
      if (minable && (best === null || gap < best.gap)) best = { squares, gap };
    }
  }
  if (best === null) return null;
  const shallowest = [...best.squares]
    .sort((a, b) => a.depth - b.depth)
    .find((s) => previewTap(state, s.x, s.y).kind === 'mined');
  return shallowest === undefined ? null : `tap ${shallowest.x},${shallowest.y}`;
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
 *    short of wood, grass or apples, take the lit plant nearest the newest
 *    camp, but never fell an apple tree picked bare (`isBareAppleTree`);
 * 6. mine the block nearest the newest camp that it can mine;
 * 7. failing that, take the nearest plant.
 * Ties go to the square met first, row by row. `null` when nothing is left to do.
 */
export function gathererStep(state: FrontierState): FrontierStep | null {
  if (state.status !== 'active') return null;
  if (state.tapsLeft === 0) {
    return state.health <= GATHERER_REST_AT ? restStep(state) : 'endShift';
  }
  // While the market is open (after a market day's night): trade and take a
  // contract, then close it and start the day.
  if (marketIsOpen(state)) {
    const take = contractStep(state);
    return marketStep(state) ?? (take?.startsWith('takeContract') === true ? take : 'closeMarket');
  }
  const craft =
    hazardStep(state) ??
    contractStep(state) ??
    deepStep(state) ??
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
  // An apple tree picked bare is left standing, for its apples to come back.
  const plant = squares.find(
    (s) =>
      state.features[s.x + width * s.y] !== NO_FEATURE &&
      !isBareAppleTree(state, s.x, s.y) &&
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
