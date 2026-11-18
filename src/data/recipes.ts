import type { RecipeDef } from './types';

export type GaugeId = 'fuel' | 'lampOil';

/** The gauges a recipe may fill. They are numbers on the state, not carried items. */
export const GAUGES: GaugeId[] = ['fuel', 'lampOil'];

// Field recipes, design doc 7.1. Camp recipes (7.2) arrive in M2.
export const FIELD_RECIPES: RecipeDef[] = [
  {
    id: 'ladder',
    name: 'Ladder (x3)',
    inputs: [{ item: 'timber', count: 1 }],
    output: { kind: 'item', item: 'ladder', count: 3 },
  },
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
    id: 'torch',
    name: 'Torch',
    inputs: [
      { item: 'timber', count: 1 },
      { item: 'coal', count: 1 },
    ],
    output: { kind: 'item', item: 'torch', count: 1 },
  },
  {
    id: 'fuel',
    name: 'Fuel (x3)',
    inputs: [{ item: 'coal', count: 1 }],
    output: { kind: 'gauge', gauge: 'fuel', amount: 3 },
  },
  {
    id: 'lampOil',
    name: 'Lamp oil (x2)',
    inputs: [{ item: 'coal', count: 1 }],
    output: { kind: 'gauge', gauge: 'lampOil', amount: 2 },
  },
];
