import type { RecipeDef } from './types';

// Lamp oil was the second gauge; it is gone with light (design doc 7.1).
export type GaugeId = 'fuel';

/** The gauges a recipe may fill. They are numbers on the state, not carried items. */
export const GAUGES: GaugeId[] = ['fuel'];

// Field recipes, design doc 7.1. Craftable anywhere. The ladder recipe is
// gone with ladders (owner, issue #80); the torch and lamp-oil recipes are
// gone with light (design doc v0.2, 7.1).
export const FIELD_RECIPES: RecipeDef[] = [
  {
    id: 'support',
    name: 'Support',
    inputs: [
      { item: 'timber', count: 1 },
      { item: 'stone', count: 1 },
    ],
    output: { kind: 'item', item: 'support', count: 1 },
  },
  {
    id: 'fuel',
    name: 'Fuel (x3)',
    inputs: [{ item: 'coal', count: 1 }],
    output: { kind: 'gauge', gauge: 'fuel', amount: 3 },
  },
];

// Camp recipes, design doc 7.2. Craftable only while at least one camp stands
// (design doc 8: a camp's functions are available from anywhere on the map).
// The safety lamp is removed with light (design doc v0.2, 7.2).
//
// "Iron" and "copper" in 7.2 are read as ingots: raw ore must be smelted
// first. Smelting 2 raw ore + 1 coal makes 2 ingots (0014 item 31).
// A recipe id must not be the id of a field recipe: the two tables share one
// `craft` action, which names a recipe by id.
export const CAMP_RECIPES: RecipeDef[] = [
  {
    id: 'ironIngot',
    name: 'Iron ingot (x2)',
    inputs: [
      { item: 'rawIronOre', count: 2 },
      { item: 'coal', count: 1 },
    ],
    output: { kind: 'item', item: 'ironIngot', count: 2 },
  },
  {
    id: 'copperIngot',
    name: 'Copper ingot (x2)',
    inputs: [
      { item: 'rawCopperOre', count: 2 },
      { item: 'coal', count: 1 },
    ],
    output: { kind: 'item', item: 'copperIngot', count: 2 },
  },
  {
    id: 'drill',
    name: 'Drill',
    inputs: [{ item: 'ironIngot', count: 3 }],
    output: { kind: 'item', item: 'drill', count: 1 },
  },
  {
    id: 'pump',
    name: 'Pump',
    inputs: [
      { item: 'ironIngot', count: 2 },
      { item: 'copperIngot', count: 1 },
    ],
    output: { kind: 'item', item: 'pump', count: 1 },
  },
  {
    id: 'vent',
    name: 'Vent',
    inputs: [
      { item: 'copperIngot', count: 2 },
      { item: 'timber', count: 1 },
    ],
    output: { kind: 'item', item: 'vent', count: 1 },
  },
  {
    id: 'scannerCharge',
    name: 'Scanner charge',
    inputs: [
      { item: 'copperIngot', count: 1 },
      { item: 'crystal', count: 1 },
    ],
    output: { kind: 'item', item: 'scannerCharge', count: 1 },
  },
  {
    id: 'sealant',
    name: 'Sealant',
    inputs: [
      { item: 'stone', count: 1 },
      { item: 'coal', count: 1 },
    ],
    output: { kind: 'item', item: 'sealant', count: 1 },
  },
  {
    id: 'explosive',
    name: 'Explosive',
    inputs: [
      { item: 'coal', count: 2 },
      { item: 'ironIngot', count: 1 },
    ],
    output: { kind: 'item', item: 'explosive', count: 1 },
  },
  {
    id: 'campKit',
    name: 'Camp kit',
    inputs: [
      { item: 'ironIngot', count: 4 },
      { item: 'timber', count: 4 },
      { item: 'copperIngot', count: 2 },
    ],
    output: { kind: 'item', item: 'campKit', count: 1 },
  },
];
