import type { BlockId } from './blocks';
import type { ItemStack } from './types';
import type { ItemId } from './items';

// The new game (Lab 2 becomes the game, docs/plans/lab2-becomes-the-game.md):
// camps, their fog of war and their upgrades, and the surface: grass, trees,
// apple trees, roaming animals and clay. These numbers began in UI lab 2
// (issues #118 and #121, src/data/labCamps.ts); the engine's new world
// (src/engine/frontier) and Lab 2 both read them from here, so there is one
// source. The old game never reads this file. Every number is a [Default]
// for the owner to tune.

/** One camp level. */
export interface FrontierCampLevel {
  /** How far the camp sees and lets you mine, in squares: a circle around the camp. */
  radius: number;
  /** The block kinds this level adds to what the level below can mine. */
  addsBlocks: BlockId[];
  /** What it costs to upgrade a camp to this level. Level 1 has none: see FRONTIER_NEW_CAMP_COST. */
  upgradeCost: ItemStack[];
}

/**
 * The camp levels, level 1 first: `FRONTIER_CAMP_LEVELS[0]` is level 1.
 *
 * A square can be mined if a camp whose radius covers it has a level that
 * can mine its top block; with several camps over a square, the best level
 * counts. A block kind in no level's list is mined with a tool instead
 * (FRONTIER_TOOLS), or not at all.
 *
 * What each level mines and the level-2 cost are the progression plan's
 * (docs/plans/progression-phases.md, section 2.2; owner, 2026-11-23): a
 * base camp mines only dirt, rubble and clay; level 2 adds stone and coal;
 * level 3 adds hard rock. Ore, crystal and relics need a tool. The level-2
 * upgrade costs nothing a base camp cannot dig (no stone).
 *
 * The radii are 9, 12 and 15 (they were 5, 8 and 12). The owner found camps
 * had to touch to spread the light ("It's too close") and asked for a bigger
 * light radius (question 138). A new camp's 3 x 3 must stand on lit ground,
 * so it can go about one radius (8 squares) from the last; at radius 9 that
 * lights about 130 new squares, three times as many as at 5. The world is
 * only 32 x 32, so the radii cannot simply double: the first camp lights 29%
 * of it at radius 9, a level-2 camp 48% and a level-3 camp 73% (decision
 * note 0046). Level 4 (radius 18) lights most of it from one camp.
 */
export const FRONTIER_CAMP_LEVELS: FrontierCampLevel[] = [
  {
    radius: 9,
    // No timber-root: Lab 2's cube has none (LAB_SURFACE.timberRootBecomes).
    addsBlocks: ['dirt', 'rubble', 'clay'],
    upgradeCost: [],
  },
  {
    radius: 12,
    addsBlocks: ['stone', 'coalSeam'],
    // Wood too (owner: "Let's make timber needed for each camp upgrade";
    // "Wood is timber"): a little more than the 15 a new camp costs. No
    // stone: a base camp cannot mine it (progression plan section 2.2).
    upgradeCost: [
      { item: 'wood', count: 20 },
      { item: 'clay', count: 10 },
      { item: 'grass', count: 10 },
      { item: 'animal', count: 2 },
    ],
  },
  {
    radius: 15,
    addsBlocks: ['hardRock'],
    upgradeCost: [
      { item: 'wood', count: 40 },
      { item: 'clay', count: 20 },
      { item: 'stone', count: 40 },
      { item: 'animal', count: 3 },
      { item: 'apple', count: 10 },
      // Hay (progression plan section 6.3): farming pays for the level that
      // opens the tools.
      { item: 'hay', count: 10 },
    ],
  },
  {
    // Level 4 (owner, question 163; docs/plans/smelting-and-crafting.md):
    // a wider ring and nothing new to mine: what level 3 does not mine is
    // mined with tools. Its cost has ingots, so it needs a smelter
    // somewhere first.
    radius: 18,
    addsBlocks: [],
    upgradeCost: [
      { item: 'wood', count: 40 },
      { item: 'ironIngot', count: 8 },
      { item: 'copperIngot', count: 6 },
      { item: 'stone', count: 20 },
    ],
  },
];

/**
 * What a new camp costs, the same for every camp. The first camp is free.
 * 15 wood and 15 grass (was 5 and 5): the owner found camps too cheap once
 * the rings grew to radius 9 ("Flat, about 3x higher", question 139). The
 * first camp's ring always holds that much to gather (a test checks 200
 * seeds), and the first camp is put where its ring does (startSquare).
 */
export const FRONTIER_NEW_CAMP_COST: ItemStack[] = [
  { item: 'wood', count: 15 },
  { item: 'grass', count: 15 },
];

/**
 * Where a camp may stand (progression plan section 2.1; owner: "Camps can
 * only be placed in the top three levels"): its level 3 x 3 must be at a
 * depth of at most `maxDepth` (0 is the surface).
 */
export const FRONTIER_CAMP_PLACE = {
  maxDepth: 2,
};

/**
 * The deep camp (progression plan section 2.4; owner: "New camp type can be
 * placed down in deeper areas so now the entire depth is unlocked"; its kit
 * only the market sells). It is placed on level, lit ground at a depth of
 * `minDepth` or more, deeper than any other camp may stand (owner, after
 * decision note 0062: "min depth required on the deep camp"; question
 * 178), for `cost` and 1 tap. Its ring is `radius`; it mines what a camp of
 * `level` mines, and counts as that level for the market; it is never
 * upgraded (question 168). It can be demolished, and have a smelter, a pen
 * and a lantern, as any camp.
 */
export const FRONTIER_DEEP_CAMP = {
  cost: [
    { item: 'campKit', count: 1 },
    { item: 'wood', count: 20 },
    { item: 'stone', count: 20 },
  ] as ItemStack[],
  radius: 12,
  level: 3,
  minDepth: 3,
};

/**
 * The free first camp's 3 x 3 patch is centred no further than this many
 * squares from the middle of the map (the most open ground among those
 * patches wins).
 */
export const FRONTIER_START_REACH = 4;

/**
 * The surface ("zero level", issue #121). Every number here is a starting
 * value for the owner to try.
 */
export const FRONTIER_SURFACE = {
  /** Clumps of trees across the 32 x 32 map: each has a random middle... */
  treeClumps: 22,
  /** ...and puts a tree on each square within this many squares of it, with this chance. */
  treeClumpRadius: 2,
  treeChance: 0.55,
  /** Apple trees, scattered one by one. */
  appleTrees: 10,
  /** Each square left over is grass with this chance; the rest is bare ground. */
  grassChance: 0.65,
  /** What a tap gives: 1 grass from a tuft, 2 wood from a felled tree (apple trees too, once empty). */
  grassPerTuft: 1,
  woodPerTree: 2,
  /** An apple tree holds this many apples, 1 a tap. It regrows them FRONTIER_SHIFT.appleRegrowShifts shifts after it is picked bare. */
  applesPerTree: 3,
  /** Roaming animals at the start, and the most there can be. */
  animals: 8,
  /** Clay: blobs of it replace dirt and stone in these layers (1 is just under the surface). */
  clayFirstLayer: 1,
  clayLastLayer: 3,
  clayBlobs: 70,
  clayBlobRadius: 2,
  /** What a clay block gives when mined. */
  clayPerBlock: 1,
  /**
   * Grass, trees and apple trees grow only on these top blocks: never on
   * stone, coal or other rock (owner, after the PR #126 playtest: "Grass
   * and doesn't grow on coal or stone").
   */
  plantsGrowOn: ['dirt'] as BlockId[],
  // No coal at the surface (owner: "No coal at surface") is now the game's
  // own rule (`GENERATION.surfaceCoal`, question 140, decision note 0052).
  /**
   * No timber-root in Lab 2 (owner: "Let's get rid of the roots square";
   * "Wood is timber": wood comes from trees). Every timber-root cell of the
   * game's cube, in any layer, is this block instead. Dirt, because roots
   * grow in soil, dirt is as quick to mine (cost 1), so digging is no
   * harder, and plants can grow where roots showed at the surface. The
   * game's own cube is not changed.
   */
  timberRootBecomes: 'dirt' as BlockId,
};

/**
 * Shifts (plan section 2; owner, questions 145 to 150). A shift is the
 * player's turn of taps, then End shift, when the world moves on. Every
 * number is a [Default] for the owner to tune.
 */
export const FRONTIER_SHIFT = {
  /** Taps a shift (owner: "Fixed number of taps"). Every tap that does something costs 1. */
  taps: 100,
  /** The crew's health at the start, and what resting restores it to. */
  startHealth: 10,
  /** Upkeep: this much wood at the end of every shift (owner: "Food and wood")... */
  woodEveryShift: 1,
  /** ...1 food at the end of every this many shifts (FRONTIER_FOODS says what pays it)... */
  foodEveryShifts: 2,
  /** ...and 1 more wood, every this many shifts, for each camp after the first. */
  campWoodEveryShifts: 4,
  /** Each animal takes this many steps at the end of a shift (question 149). */
  animalStepsPerShift: 3,
  /** A new animal walks in at the edge every this many shifts, while there are fewer than FRONTIER_SURFACE.animals. */
  animalEveryShifts: 3,
  /** An apple tree picked bare has its apples back this many shifts later (question 150). */
  appleRegrowShifts: 5,
  /**
   * A felled tree grows back, as the same kind of tree, this many shifts
   * later (owner, question 157: "Trees regrow slowly").
   */
  treeRegrowShifts: 15,
  /**
   * Cut grass grows back this many shifts later, if grass grows on a face
   * neighbour then (progression plan section 6.1). A patch cut bare to its
   * last tuft stays bare (question 174).
   */
  grassRegrowShifts: 4,
};

/**
 * Saplings (progression plan section 6.2). Saplings and apple saplings come
 * only from the market (owner, after the progression playtest build:
 * "Saplings are only available from the market. Apple saplings are also
 * available."). A sapling planted on lit dirt at the surface, or on a stump,
 * grows into a tree `saplingGrowShifts` shifts later; an apple sapling into
 * an apple tree full of apples `appleSaplingGrowShifts` later.
 */
export const FRONTIER_SAPLINGS = {
  saplingGrowShifts: 15,
  appleSaplingGrowShifts: 20,
};

/**
 * What pays 1 food of upkeep, in the order it is eaten: the first one held
 * in the amount given pays. Grass first, at a worse rate than apples (owner,
 * question 158: "Feed animals / food"): it is the commonest and has few
 * other uses, so eating it first keeps it from piling up. Then an apple,
 * then an animal (owner, question 155: "Yes, that's fine"). Tuned with
 * `npm run sim` (decision note 0057).
 */
export const FRONTIER_FOODS: ItemStack[] = [
  { item: 'grass', count: 3 },
  // Hay (progression plan section 6.3; question 175): after grass, before apples.
  { item: 'hay', count: 1 },
  { item: 'apple', count: 1 },
  { item: 'animal', count: 1 },
];

// ----- Smelting and crafting (docs/plans/smelting-and-crafting.md) -----

/**
 * The smelter (owner, question 161): built at a camp of level `minLevel` or
 * more, from its panel, for `cost` and 1 tap. One per camp; it is lost if
 * the camp is demolished. Smelting needs a smelter somewhere.
 */
export const FRONTIER_SMELTER = {
  minLevel: 2,
  cost: [
    { item: 'stone', count: 20 },
    { item: 'clay', count: 10 },
  ] as ItemStack[],
};

/** Something made from the recipe book: what it takes and what it gives. */
export interface FrontierRecipe {
  /** A short name for code, step strings and tests: 'smelt-iron'. */
  id: string;
  /** What the book calls it. */
  name: string;
  inputs: ItemStack[];
  output: ItemStack;
  /** True if it is made only while a smelter stands somewhere. */
  needsSmelter: boolean;
}

/**
 * What can be made, each for 1 tap, while a smelter stands somewhere
 * (owner, question 162: 2 raw ore + 1 coal make 2 ingots, the old game's
 * ratio, decision note 0014).
 */
export const FRONTIER_RECIPES: FrontierRecipe[] = [
  {
    id: 'smelt-iron',
    name: 'Smelt iron',
    inputs: [
      { item: 'rawIronOre', count: 2 },
      { item: 'coal', count: 1 },
    ],
    output: { item: 'ironIngot', count: 2 },
    needsSmelter: true,
  },
  {
    id: 'smelt-copper',
    name: 'Smelt copper',
    inputs: [
      { item: 'rawCopperOre', count: 2 },
      { item: 'coal', count: 1 },
    ],
    output: { item: 'copperIngot', count: 2 },
    needsSmelter: true,
  },
  // What ingots are for (owner, question 163), PR 3: a tool and a lantern.
  {
    id: 'iron-pickaxe',
    name: 'Iron pickaxe',
    inputs: [
      { item: 'ironIngot', count: 3 },
      { item: 'wood', count: 2 },
    ],
    output: { item: 'ironPickaxe', count: 1 },
    needsSmelter: true,
  },
  {
    id: 'copper-lantern',
    name: 'Copper lantern',
    inputs: [
      { item: 'copperIngot', count: 2 },
      { item: 'coal', count: 1 },
    ],
    output: { item: 'copperLantern', count: 1 },
    needsSmelter: true,
  },
  {
    id: 'iron-drill',
    name: 'Iron drill',
    inputs: [
      { item: 'ironIngot', count: 4 },
      { item: 'copperIngot', count: 2 },
      { item: 'wood', count: 2 },
    ],
    output: { item: 'drill', count: 1 },
    needsSmelter: true,
  },
  // A sword drives a dragon off (hazards plan, section 4; question 187).
  {
    id: 'sword',
    name: 'Sword',
    inputs: [
      { item: 'ironIngot', count: 3 },
      { item: 'wood', count: 2 },
    ],
    output: { item: 'sword', count: 1 },
    needsSmelter: true,
  },
  // Hay from grass (progression plan section 6.3): no smelter.
  {
    id: 'hay',
    name: 'Hay',
    inputs: [{ item: 'grass', count: 3 }],
    output: { item: 'hay', count: 1 },
    needsSmelter: false,
  },
];

/**
 * Animal pens (progression plan section 6.3). A pen is built at a camp of
 * level `minLevel` or more, from its panel, for `cost` and 1 tap (level 2,
 * as the smelter: farming is Phase 2's, and a base camp's panel has no room
 * for it); one per camp, lost with the camp (its
 * animals go to the store). It holds up to `capacity` animals, put in from
 * the store and taken out, 1 tap each; upkeep never eats a penned animal.
 * A pen with at least 2 animals and room for one more gains an animal every
 * `breedEveryShifts` shifts, at End shift, eating `hayPerBirth` hay from the
 * store; with too little hay it waits.
 */
export const FRONTIER_PEN = {
  minLevel: 2,
  cost: [{ item: 'wood', count: 10 }] as ItemStack[],
  capacity: 4,
  breedEveryShifts: 4,
  hayPerBirth: 2,
};

/**
 * The iron pickaxe (owner, question 163): while the store holds `item`,
 * every mining tap yields `yieldTimes` as much. Taking from the surface is
 * unchanged. It does not wear out, and a second one adds nothing.
 */
export const FRONTIER_PICKAXE = {
  item: 'ironPickaxe' as ItemId,
  yieldTimes: 2,
};

/** A tool that mines blocks no camp level mines: while the store holds `item`, a lit square's `mines` blocks can be mined. */
export interface FrontierTool {
  item: ItemId;
  mines: BlockId[];
}

/**
 * The iron drill (progression plan section 4; it was "one camp level
 * higher" until then): while the store holds `item`, any camp's lit
 * ground's iron and copper ore can be mined. It does not wear out, and a
 * second one adds nothing. Made at a smelter (FRONTIER_RECIPES) or bought
 * at the market; the first one has to be bought, since ingots need ore.
 */
export const FRONTIER_DRILL: FrontierTool = {
  item: 'drill',
  mines: ['ironOre', 'copperOre'],
};

/**
 * The steel drill (plan section 4; question 172): mines what the iron drill
 * does, and crystal, unstable ore, relics and the keystone. Bought only.
 */
export const FRONTIER_STEEL_DRILL: FrontierTool = {
  item: 'steelDrill',
  mines: ['ironOre', 'copperOre', 'crystal', 'unstableOre', 'relic', 'keystone'],
};

/**
 * Every tool, cheapest first: a block a tool mines asks for the first tool
 * here that mines it.
 */
export const FRONTIER_TOOLS: FrontierTool[] = [FRONTIER_DRILL, FRONTIER_STEEL_DRILL];

/**
 * The copper lantern (owner, question 163; its recipe takes coal, not
 * crystal: question 165, decision note 0060): one `item` from the store, hung
 * at a camp from its panel for 1 tap, widens that camp's ring by
 * `ringBonus` squares on top of its level. One per camp; it is lost with
 * the camp.
 */
export const FRONTIER_LANTERN = {
  item: 'copperLantern' as ItemId,
  ringBonus: 3,
};

// ----- The run and the market (docs/plans/progression-phases.md, PR 1) -----

/**
 * How long a run lasts (owner, 2026-11-23: "100 shifts or crew lost"). At
 * the end of shift `shifts` the run is over, and the coins held are the
 * score (plan section 7; question 176).
 */
export const FRONTIER_RUN = {
  shifts: 100,
};

/**
 * One lot at the market: `count` of `item` for `coins` coins. Selling trades
 * the item for the coins; buying, the coins for the item. A trade is any
 * whole number of lots, for 1 tap (plan section 3). A lot with `fromLevel`
 * is traded only while the best camp standing is at least that level.
 */
export interface FrontierLot {
  item: ItemId;
  count: number;
  coins: number;
  fromLevel?: number;
  /** True for a lot traded only once a tier-1 contract is done (progression plan section 3). */
  afterTier1?: boolean;
}

/**
 * The market (plan section 3). It opens at the start of every shift whose
 * number is a multiple of `everyShifts[best - 1]`, where `best` is the
 * highest level of any camp standing (owner: every 10 shifts at level 1,
 * 5 at level 2, 3 at level 3; level 4 is question 167), and stays open for
 * that whole shift (question 169). Coins are an item, `coin` (question 170).
 */
export const FRONTIER_MARKET = {
  coin: 'coin' as ItemId,
  everyShifts: [10, 5, 3, 3],
  /**
   * What the player can sell, and what the market pays for it. Surface
   * goods are cheap; what is dug and made pays more. An item not listed
   * cannot be sold.
   */
  sellPrices: [
    { item: 'grass', count: 5, coins: 1 },
    { item: 'wood', count: 2, coins: 1 },
    { item: 'apple', count: 2, coins: 1 },
    { item: 'animal', count: 1, coins: 3 },
    { item: 'clay', count: 2, coins: 1 },
    // Stone is what most taps dig (twice as much with a pickaxe): at 2 for a
    // coin, the simulator's gatherer made 4,500 coins in a run from stone
    // alone, more than the contracts are meant to pay (progression PR 2).
    { item: 'stone', count: 10, coins: 1 },
    { item: 'coal', count: 1, coins: 1 },
    { item: 'rawIronOre', count: 1, coins: 2 },
    { item: 'rawCopperOre', count: 1, coins: 2 },
    { item: 'ironIngot', count: 1, coins: 5 },
    { item: 'copperIngot', count: 1, coins: 5 },
    { item: 'crystal', count: 1, coins: 20 },
    { item: 'rareOre', count: 1, coins: 15 },
    { item: 'relic', count: 1, coins: 40 },
  ] as FrontierLot[],
  /**
   * What the player can buy, and what it costs (question 171). From the
   * start: an animal, clay, saplings, hay and a pump. From a level-3 camp: the tools (plan section
   * 4), dearer than making them at a smelter.
   */
  buyPrices: [
    { item: 'animal', count: 1, coins: 8 },
    { item: 'clay', count: 1, coins: 1 },
    { item: 'sapling', count: 1, coins: 3 },
    { item: 'appleSapling', count: 1, coins: 6 },
    { item: 'hay', count: 1, coins: 1 },
    // The pump drains a flood (hazards plan, section 2): from the start.
    { item: 'pump', count: 1, coins: 30 },
    { item: 'drill', count: 1, coins: 80, fromLevel: 3 },
    { item: 'steelDrill', count: 1, coins: 250, fromLevel: 3 },
    { item: 'ironPickaxe', count: 1, coins: 60, fromLevel: 3 },
    { item: 'copperLantern', count: 1, coins: 40, fromLevel: 3 },
    // The sword drives a dragon off (hazards plan, section 4).
    { item: 'sword', count: 1, coins: 60, fromLevel: 3 },
    // From the first tier-1 contract (phase 4): the deep camp's kit, and
    // wood and food in bulk, so farming becomes a choice.
    { item: 'campKit', count: 1, coins: 150, afterTier1: true },
    { item: 'wood', count: 10, coins: 8, afterTier1: true },
    { item: 'apple', count: 5, coins: 5, afterTier1: true },
  ] as FrontierLot[],
};

// ----- Contracts (docs/plans/progression-phases.md, section 5; PR 5) -----

/** A contract: the items it asks for, all delivered at once, and the coins it pays then. */
export interface FrontierContractDef {
  /** A short name for code, steps and tests: 't1-coal'. */
  id: string;
  /** 1, 2 or 3. */
  tier: number;
  /** What the board calls it. */
  name: string;
  asks: ItemStack[];
  pays: number;
}

/**
 * Every contract the board can offer. Each pays well over what its items
 * fetch at the market (FRONTIER_MARKET.sellPrices), and each tier pays
 * more than the one below. Every number is a [Default] (plan section 5:
 * tier 1 pays 50 to 150 coins, tier 2 200 to 500, tier 3 600 to 2,000).
 */
export const FRONTIER_CONTRACTS: FrontierContractDef[] = [
  // Tier 1: coal, stone, raw ore, or ingots for more.
  {
    id: 't1-coal',
    tier: 1,
    name: 'Coal for the forge',
    asks: [{ item: 'coal', count: 20 }],
    pays: 60,
  },
  {
    id: 't1-stone',
    tier: 1,
    name: 'Stone for a wall',
    asks: [{ item: 'stone', count: 100 }],
    pays: 50,
  },
  { id: 't1-iron', tier: 1, name: 'Raw iron', asks: [{ item: 'rawIronOre', count: 20 }], pays: 80 },
  {
    id: 't1-copper',
    tier: 1,
    name: 'Raw copper',
    asks: [{ item: 'rawCopperOre', count: 20 }],
    pays: 80,
  },
  {
    id: 't1-iron-ingots',
    tier: 1,
    name: 'Iron ingots',
    asks: [{ item: 'ironIngot', count: 10 }],
    pays: 120,
  },
  {
    id: 't1-copper-ingots',
    tier: 1,
    name: 'Copper ingots',
    asks: [{ item: 'copperIngot', count: 10 }],
    pays: 120,
  },
  {
    id: 't1-mixed',
    tier: 1,
    name: 'Coal and iron',
    asks: [
      { item: 'coal', count: 10 },
      { item: 'rawIronOre', count: 10 },
    ],
    pays: 75,
  },
  // Clay in volume, for bricks, pottery and roads (owner, after the 0.11.0
  // build: "We need some high volume clay contracts for bricks and pottery
  // and roads"). A base camp mines clay, layers 1 to 3.
  {
    id: 't1-pottery',
    tier: 1,
    name: 'Clay for pottery',
    asks: [{ item: 'clay', count: 40 }],
    pays: 40,
  },
  {
    id: 't1-bricks',
    tier: 1,
    name: 'Clay for bricks',
    asks: [{ item: 'clay', count: 80 }],
    pays: 70,
  },
  // Tier 2: bulk stone, ore, ingots and clay.
  {
    id: 't2-stone',
    tier: 2,
    name: 'Stone for a bridge',
    asks: [{ item: 'stone', count: 300 }],
    pays: 200,
  },
  {
    id: 't2-coal',
    tier: 2,
    name: 'Coal for a winter',
    asks: [{ item: 'coal', count: 80 }],
    pays: 220,
  },
  {
    id: 't2-iron',
    tier: 2,
    name: 'Iron ore in bulk',
    asks: [{ item: 'rawIronOre', count: 60 }],
    pays: 250,
  },
  {
    id: 't2-copper-ingots',
    tier: 2,
    name: 'Copper for wire',
    asks: [{ item: 'copperIngot', count: 40 }],
    pays: 380,
  },
  {
    id: 't2-ingots',
    tier: 2,
    name: 'Ingots for a works',
    asks: [
      { item: 'ironIngot', count: 30 },
      { item: 'copperIngot', count: 20 },
    ],
    pays: 450,
  },
  {
    id: 't2-road',
    tier: 2,
    name: 'Clay for a road',
    asks: [{ item: 'clay', count: 200 }],
    pays: 200,
  },
  {
    id: 't2-town',
    tier: 2,
    name: 'Bricks for a town',
    asks: [{ item: 'clay', count: 400 }],
    pays: 380,
  },
  // Tier 3: crystal, rare ore and relics.
  { id: 't3-crystal', tier: 3, name: 'Crystal', asks: [{ item: 'crystal', count: 10 }], pays: 700 },
  { id: 't3-rare', tier: 3, name: 'Rare ore', asks: [{ item: 'rareOre', count: 15 }], pays: 900 },
  { id: 't3-relics', tier: 3, name: 'Relics', asks: [{ item: 'relic', count: 3 }], pays: 800 },
  {
    id: 't3-collection',
    tier: 3,
    name: 'A collector’s order',
    asks: [
      { item: 'crystal', count: 20 },
      { item: 'relic', count: 2 },
    ],
    pays: 1500,
  },
  {
    id: 't3-keystone',
    tier: 3,
    name: 'The keystone',
    asks: [{ item: 'keystone', count: 1 }],
    pays: 2000,
  },
];

/**
 * The contract board (plan section 5). On a market day it shows up to
 * `perTier` contracts of each open tier, drawn from the run's seed and the
 * shift. Tier 1 opens while the best camp is at least `tier1Level`; tier 2
 * once a tier-1 contract is done; tier 3 once a tier-2 contract is done.
 * One contract is held at a time (question 173), with no deadline.
 */
export const FRONTIER_BOARD = {
  perTier: 3,
  tier1Level: 3,
};

/**
 * The phases of a run (progression plan section 1), phase 1 first: what
 * each is about, and what moves the run on. The engine's `runPhase` says
 * which one a run is in; the screen and the play interface show these.
 */
export const FRONTIER_PHASES: { title: string; next: string }[] = [
  {
    title: 'Camps and the landscape',
    next: 'Upgrade a camp to level 2 (wood, clay, grass, animals).',
  },
  {
    title: 'Farming and planning the pit',
    next: 'Upgrade a camp to level 3 (stone, clay, apples, animals, hay); keep grass, trees and a pen going.',
  },
  {
    title: 'Tier-1 contracts and tools',
    next: 'Buy an iron drill at the market, take a tier-1 contract from the board, and deliver it.',
  },
  { title: 'Tier-2 contracts', next: 'Deliver a tier-2 contract: ore and ingots in bulk.' },
  {
    title: 'Tier-3 contracts and money',
    next: 'Deliver tier-3 contracts (crystal, rare ore, relics: a steel drill mines them) and end rich.',
  },
];

// ----- Hazards (docs/plans/hazards.md; owner, 2026-11-24) -----

/**
 * Rain (hazards plan, section 1): "Rain overnight washes clay and soil into
 * low areas and covers them." At End shift it rains with a chance of
 * `chance`. Each low spot (a dug square no face neighbour is deeper than, and
 * at least one is shallower than) is then filled with a chance of
 * `fillChance`: one block goes back on top of it, clay with a chance of
 * `clayChance`, else dirt.
 */
export const FRONTIER_RAIN = {
  chance: 0.2,
  fillChance: 0.5,
  clayChance: 1 / 3,
  fillBlock: 'dirt' as BlockId,
  clayBlock: 'clay' as BlockId,
};

/**
 * Water (hazards plan, section 2): "You can hit water starting at level 3"
 * (depth 4: owner, question 181). A tap that opens one of the cube's water
 * pockets, leaving its square at depth `fromDepth` or more, floods that
 * square and the dug squares joined to it at the same depth or deeper, up to
 * `maxSquares`, nearest first. A pocket opened higher up just collapses, as
 * before.
 */
export const FRONTIER_WATER = {
  fromDepth: 4,
  maxSquares: 12,
};

/**
 * The pump (hazards plan, section 2): "you need to purchase a pump to remove
 * it by clicking it and waiting". Bought at the market (FRONTIER_MARKET). A
 * tap on a flooded square sets one from the store there; at each End shift
 * it drains `drainPerShift` squares of its flood, the farthest first, its own
 * square last; then it comes back to the store (question 184).
 */
export const FRONTIER_PUMP = {
  item: 'pump' as ItemId,
  drainPerShift: 2,
};

/**
 * Gas (hazards plan, section 3): "Pockets of gas can explode starting at
 * level 4. This blows away blocks and starts fires on combustible squares."
 * A tap that opens one of the cube's gas pockets, leaving its square at depth
 * `fromDepth` or more, explodes with a chance of `explodeChance` (question
 * 185); otherwise the gas vents harmlessly. A blast takes the top block off
 * every other square within `blastRadius` (the 3 x 3 round it) where the level rule
 * allows it, giving nothing, and sets fire to every combustible square within
 * `fireRadius`.
 */
export const FRONTIER_GAS = {
  fromDepth: 4,
  explodeChance: 0.5,
  blastRadius: 1,
  fireRadius: 3,
};

/**
 * Dragons (hazards plan, section 4): "Wandering dragons can eat your sheep
 * and apples and set fire to things. They don't go away until you get a
 * sword and drive them away." From shift `fromShift`, at End shift, a dragon
 * flies in at the map's edge with a chance of `chance`, while fewer than
 * `most` are on the map. Each night each dragon flies `steps` squares (over
 * anything), eats one animal on or beside its square (or, on a camp's
 * ground, one from its pen) and every apple on the apple trees on or beside
 * its square, and with a chance of `fireChance` sets fire to one thing that
 * can burn on or beside its square. A tap on it with a sword in the store
 * (`sword`) drives it off the map; the sword is kept.
 */
export const FRONTIER_DRAGON = {
  fromShift: 20,
  chance: 1 / 12,
  most: 1,
  steps: 4,
  fireChance: 1 / 3,
  sword: 'sword' as ItemId,
};

/** A level of a camp's defenses (hazards plan, section 5): its name and what it costs. */
export interface FrontierDefenseLevel {
  name: string;
  cost: ItemStack[];
}

/**
 * Camp defenses (hazards plan, section 5; question 189): "If the camp has
 * defenses though, they can be turned away." A camp's defense level goes up
 * one level at a time from its panel, for the next level's cost and 1 tap,
 * at a camp of level FRONTIER_DEFENSE_MIN_LEVEL or more (as the smelter and
 * the pen: a base camp's panel has no room for another row; question 194),
 * deep camps too. A raid never takes them down (question 191).
 */
export const FRONTIER_DEFENSE_MIN_LEVEL = 2;

export const FRONTIER_DEFENSE: FrontierDefenseLevel[] = [
  { name: 'Palisade', cost: [{ item: 'wood', count: 15 }] },
  {
    name: 'Stone wall',
    cost: [
      { item: 'stone', count: 20 },
      { item: 'wood', count: 10 },
    ],
  },
  {
    name: 'Gatehouse',
    cost: [
      { item: 'ironIngot', count: 10 },
      { item: 'stone', count: 20 },
    ],
  },
];

/**
 * Marauders (hazards plan, section 5): "Marauders can come and steal things
 * from your camps and remove their upgrades and put them back to basic ...
 * The strength of the marauders depends on how far you have dug. The damage
 * they do depends on what level of defense your targeted camp has." From
 * shift `fromShift`, at End shift, with a chance of `chance`, they raid one
 * camp drawn at random (question 188). Their strength is the `strength` of
 * the last entry of `strengthFromDepth` whose `depth` the deepest square on
 * the map has reached. A camp whose defense level is at least that turns
 * them away. Otherwise the shortfall (strength minus defense) sets the
 * damage: `stealShare` of each goods stack in the store for each point of
 * shortfall, rounded down, never coins (question 190); and
 * `upgradesPerShortfall` of the camp's upgrades for each point, in the order
 * fire takes them (lantern, pen and its animals, smelter, then levels).
 */
export const FRONTIER_RAID = {
  fromShift: 15,
  chance: 0.1,
  strengthFromDepth: [
    { depth: 0, strength: 1 },
    { depth: 4, strength: 2 },
    { depth: 8, strength: 3 },
    { depth: 16, strength: 4 },
  ],
  stealShare: 0.1,
  upgradesPerShortfall: 2,
};
