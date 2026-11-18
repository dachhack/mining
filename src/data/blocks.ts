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

// Design doc 3.2. Every block in that table is defined here, including the
// ones M1 does not generate yet (unstable ore, relic, keystone).
//
// `code` is what the cube's typed array stores. Codes are part of the save
// format: do not renumber them, only add new ones.
//
// `span` and `shaftLimit` are the cave-in numbers of each material (design
// doc 6.1; decision note 0014 items 5 and 10):
// - span: dirt and rubble 0, hard rock 3, every other block 2;
// - shaftLimit: dirt and rubble 3, hard rock 8, every other block 5.
// Open space and bedrock have neither (`null`): bedrock never falls and is
// ignored when a shaft's limit is worked out.
export const BLOCKS: Record<BlockId, BlockDef> = {
  // Open space. Not in the table in 3.2, but the cube needs a value for it.
  air: {
    code: 0,
    name: 'Open space',
    solid: false,
    mineCost: null,
    mineCostWithDrill: null,
    yields: [],
    span: null,
    shaftLimit: null,
  },
  dirt: {
    code: 1,
    name: 'Dirt',
    solid: true,
    mineCost: 1,
    mineCostWithDrill: null,
    yields: [],
    span: 0,
    shaftLimit: 3,
  },
  stone: {
    code: 2,
    name: 'Stone',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'stone', count: 1 }],
    span: 2,
    shaftLimit: 5,
  },
  hardRock: {
    code: 3,
    name: 'Hard rock',
    solid: true,
    mineCost: 3,
    mineCostWithDrill: 2,
    yields: [{ item: 'stone', count: 1 }],
    span: 3,
    shaftLimit: 8,
  },
  coalSeam: {
    code: 4,
    name: 'Coal seam',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'coal', count: 1 }],
    span: 2,
    shaftLimit: 5,
  },
  timberRoot: {
    code: 5,
    name: 'Timber-root',
    solid: true,
    mineCost: 1,
    mineCostWithDrill: null,
    yields: [{ item: 'timber', count: 1 }],
    span: 2,
    shaftLimit: 5,
  },
  ironOre: {
    code: 6,
    name: 'Iron ore',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'rawIronOre', count: 1 }],
    span: 2,
    shaftLimit: 5,
  },
  copperOre: {
    code: 7,
    name: 'Copper ore',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'rawCopperOre', count: 1 }],
    span: 2,
    shaftLimit: 5,
  },
  crystal: {
    code: 8,
    name: 'Crystal',
    solid: true,
    mineCost: 3,
    mineCostWithDrill: null,
    yields: [{ item: 'crystal', count: 1 }],
    span: 2,
    shaftLimit: 5,
  },
  unstableOre: {
    code: 9,
    name: 'Unstable ore',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'rareOre', count: 1 }],
    span: 2,
    shaftLimit: 5,
  },
  relic: {
    code: 10,
    name: 'Relic',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'relic', count: 1 }],
    span: 2,
    shaftLimit: 5,
  },
  keystone: {
    code: 11,
    name: 'Keystone',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [{ item: 'keystone', count: 1 }],
    span: 2,
    shaftLimit: 5,
  },
  // Never stored in the cube: it is the implied wall outside it (0005 item 1).
  bedrock: {
    code: 12,
    name: 'Bedrock',
    solid: true,
    mineCost: null,
    mineCostWithDrill: null,
    yields: [],
    span: null,
    shaftLimit: null,
  },
  // What a fallen block becomes where it comes to rest (0014 item 8).
  rubble: {
    code: 13,
    name: 'Rubble',
    solid: true,
    mineCost: 1,
    mineCostWithDrill: null,
    yields: [],
    span: 0,
    shaftLimit: 3,
  },
  // What sealant turns an open cell into (0014 item 12).
  sealed: {
    code: 14,
    name: 'Sealed rock',
    solid: true,
    mineCost: 2,
    mineCostWithDrill: null,
    yields: [],
    span: 2,
    shaftLimit: 5,
  },
};
