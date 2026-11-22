import type { BlockId } from './blocks';
import type { ItemStack } from './types';

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
 * counts. A block kind in no level's list cannot be mined in Lab 2 at all.
 *
 * The radii are 9, 12 and 15 (they were 5, 8 and 12). The owner found camps
 * had to touch to spread the light ("It's too close") and asked for a bigger
 * light radius (question 138). A new camp's 3 x 3 must stand on lit ground,
 * so it can go about one radius (8 squares) from the last; at radius 9 that
 * lights about 130 new squares, three times as many as at 5. The world is
 * only 32 x 32, so the radii cannot simply double: the first camp lights 29%
 * of it at radius 9, a level-2 camp 48% and a level-3 camp 73% (decision
 * note 0046).
 */
export const FRONTIER_CAMP_LEVELS: FrontierCampLevel[] = [
  {
    radius: 9,
    // No timber-root: Lab 2's cube has none (LAB_SURFACE.timberRootBecomes).
    addsBlocks: ['dirt', 'rubble', 'stone', 'coalSeam', 'clay'],
    upgradeCost: [],
  },
  {
    radius: 12,
    addsBlocks: ['hardRock'],
    // Wood too (owner: "Let's make timber needed for each camp upgrade";
    // "Wood is timber"): a little more than the 15 a new camp costs.
    upgradeCost: [
      { item: 'wood', count: 20 },
      { item: 'clay', count: 10 },
      { item: 'stone', count: 15 },
      { item: 'animal', count: 1 },
    ],
  },
  {
    radius: 15,
    addsBlocks: ['ironOre', 'copperOre', 'crystal', 'unstableOre', 'relic', 'keystone'],
    upgradeCost: [
      { item: 'wood', count: 40 },
      { item: 'clay', count: 20 },
      { item: 'stone', count: 40 },
      { item: 'animal', count: 3 },
      { item: 'apple', count: 10 },
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
  /** An apple tree holds this many apples, 1 a tap. (How long one takes to regrow is the lab's, in milliseconds, until shifts come: labCamps.ts.) */
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
