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
  },
  {
    id: 'smelt-copper',
    name: 'Smelt copper',
    inputs: [
      { item: 'rawCopperOre', count: 2 },
      { item: 'coal', count: 1 },
    ],
    output: { item: 'copperIngot', count: 2 },
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
  },
  {
    id: 'copper-lantern',
    name: 'Copper lantern',
    inputs: [
      { item: 'copperIngot', count: 2 },
      { item: 'coal', count: 1 },
    ],
    output: { item: 'copperLantern', count: 1 },
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
  },
];

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
   * start: an animal and clay. From a level-3 camp: the tools (plan section
   * 4), dearer than making them at a smelter. Saplings and hay join with
   * farming (plan section 6).
   */
  buyPrices: [
    { item: 'animal', count: 1, coins: 8 },
    { item: 'clay', count: 1, coins: 1 },
    { item: 'drill', count: 1, coins: 80, fromLevel: 3 },
    { item: 'steelDrill', count: 1, coins: 250, fromLevel: 3 },
    { item: 'ironPickaxe', count: 1, coins: 60, fromLevel: 3 },
    { item: 'copperLantern', count: 1, coins: 40, fromLevel: 3 },
  ] as FrontierLot[],
};
