import type { BlockDef } from './types';

// For a Python reader: this is a "union of string literals". A value of type
// BlockId must be exactly one of these strings, a bit like an Enum. Using it
// as the key type below makes the compiler check that every block has an entry
// and that `BLOCKS.stone` can never be a typo.
export type BlockId =
  | 'air'
  | 'dirt'
  | 'stone'
  | 'hardRock'
  | 'coalSeam'
  | 'timberRoot'
  | 'ironOre'
  | 'copperOre'
  | 'crystal'
  | 'unstableOre'
  | 'relic'
  | 'keystone'
  | 'bedrock'
  | 'rubble'
  | 'sealed';

// Design doc 3.5. Every block in that table is defined here, including the
// ones M1 does not generate yet (unstable ore, relic, keystone).
//
// `code` is what the cube's typed array stores. Codes are part of the save
// format: do not renumber them, only add new ones.
//
// `slumpLimit` is how far a pit wall of each material may fall before it
// slumps (design doc 3.5 and 6.1; owner question 81): a square is "tall", and
// so unstable, when its fall is MORE than the slump limit of its top block.
// - dirt and rubble 1: weak, they slump at the top of any slope that falls 2;
// - hard rock and crystal 3;
// - every other block 2.
// Open space and bedrock have none (`null`): bedrock never slumps.
export const BLOCKS: Record<BlockId, BlockDef> = {
  // Open space. Not in the table in 3.2, but the cube needs a value for it.
  air: {
    code: 0,
    name: 'Open space',
    solid: false,
    mineCost: null,
    mineCostWithDrill: null,
    yields: [],
    slumpLimit: null,
  },
  dirt: {
    code: 1,
    name: 'Dirt',
    solid: true,
    mineCost: 1,
    mineCostWithDrill: null,
    yields: [],
    slumpLimit: 1,
  },
  stone: {
    code: 2,
    name: 'Stone',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'stone', count: 1 }],
    slumpLimit: 2,
  },
  hardRock: {
    code: 3,
    name: 'Hard rock',
    solid: true,
    mineCost: 3,
    mineCostWithDrill: 2,
    yields: [{ item: 'stone', count: 1 }],
    slumpLimit: 3,
  },
  coalSeam: {
    code: 4,
    name: 'Coal seam',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'coal', count: 1 }],
    slumpLimit: 2,
  },
  timberRoot: {
    code: 5,
    name: 'Timber-root',
    solid: true,
    mineCost: 1,
    mineCostWithDrill: null,
    yields: [{ item: 'timber', count: 1 }],
    slumpLimit: 2,
  },
  ironOre: {
    code: 6,
    name: 'Iron ore',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'rawIronOre', count: 1 }],
    slumpLimit: 2,
  },
  copperOre: {
    code: 7,
    name: 'Copper ore',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'rawCopperOre', count: 1 }],
    slumpLimit: 2,
  },
  crystal: {
    code: 8,
    name: 'Crystal',
    solid: true,
    mineCost: 3,
    mineCostWithDrill: null,
    yields: [{ item: 'crystal', count: 1 }],
    slumpLimit: 3,
  },
  unstableOre: {
    code: 9,
    name: 'Unstable ore',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'rareOre', count: 1 }],
    slumpLimit: 2,
  },
  relic: {
    code: 10,
    name: 'Relic',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'relic', count: 1 }],
    slumpLimit: 2,
  },
  keystone: {
    code: 11,
    name: 'Keystone',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'keystone', count: 1 }],
    slumpLimit: 2,
  },
  // Never stored in the cube: it is the implied wall outside it (0005 item 1).
  bedrock: {
    code: 12,
    name: 'Bedrock',
    solid: true,
    mineCost: null,
    mineCostWithDrill: null,
    yields: [],
    slumpLimit: null,
  },
  // What a fallen block becomes where it comes to rest (0014 item 8).
  rubble: {
    code: 13,
    name: 'Rubble',
    solid: true,
    mineCost: 1,
    mineCostWithDrill: null,
    yields: [],
    slumpLimit: 1,
  },
  // What sealant turns an open cell into (0014 item 12).
  sealed: {
    code: 14,
    name: 'Sealed rock',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [],
    slumpLimit: 2,
  },
};
