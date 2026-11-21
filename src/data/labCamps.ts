import type { BlockId } from './blocks';
import type { ItemStack } from './types';

// UI lab 2 (issue #118): camps, their fog of war and their upgrades.
//
// These numbers belong to the lab only. The real game never reads this file,
// and it is not part of GAME_DATA, so changing it changes no rule of the game
// and no golden hash. The owner tunes Lab 2 here.

/** One camp level. */
export interface LabCampLevel {
  /** How far the camp sees and lets you mine, in squares: a circle around the camp. */
  radius: number;
  /** The block kinds this level adds to what the level below can mine. */
  addsBlocks: BlockId[];
  /** What it costs to upgrade a camp to this level. Level 1 has none: see LAB_NEW_CAMP_COST. */
  upgradeCost: ItemStack[];
}

/**
 * The camp levels, level 1 first: `LAB_CAMP_LEVELS[0]` is level 1.
 *
 * A square can be mined if a camp whose radius covers it has a level that
 * can mine its top block; with several camps over a square, the best level
 * counts. A block kind in no level's list cannot be mined in Lab 2 at all.
 */
export const LAB_CAMP_LEVELS: LabCampLevel[] = [
  {
    radius: 5,
    // Timber-root is here too: timber pays for the level-3 upgrade.
    addsBlocks: ['dirt', 'rubble', 'stone', 'coalSeam', 'timberRoot'],
    upgradeCost: [],
  },
  {
    radius: 8,
    addsBlocks: ['hardRock'],
    upgradeCost: [{ item: 'stone', count: 30 }],
  },
  {
    radius: 12,
    addsBlocks: ['ironOre', 'copperOre', 'crystal', 'unstableOre', 'relic', 'keystone'],
    upgradeCost: [
      { item: 'stone', count: 150 },
      { item: 'timber', count: 20 },
      { item: 'coal', count: 20 },
    ],
  },
];

/** What a new camp costs. The first camp is free. */
export const LAB_NEW_CAMP_COST: ItemStack[] = [{ item: 'stone', count: 12 }];
