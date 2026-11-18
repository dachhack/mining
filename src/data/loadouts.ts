import type { LoadoutDef } from './types';

export type LoadoutId = 'standard';

// Decision note 0005 item 22.
// Lamp oil 3 (issue #41): the lamp burns 1 oil every 4 shifts (shift.ts), so
// with no crafting it goes out at the upkeep that ends shift 12, half-way
// through the 24 fuel. From shift 13 the miner works by touch (note 0011).
// One camp kit (issue #57): a kit can only be crafted at a camp (design doc
// 7.2), so the first camp needs a kit from somewhere. Assumed; raised as a
// design question in the pull request for issue #57.
export const LOADOUTS: Record<LoadoutId, LoadoutDef> = {
  standard: {
    name: 'Standard',
    fuel: 24,
    lampOil: 3,
    items: [
      { item: 'ladder', count: 6 },
      { item: 'timber', count: 2 },
      { item: 'campKit', count: 1 },
    ],
  },
};

export const DEFAULT_LOADOUT_ID: LoadoutId = 'standard';

// Contracts arrive in M4. Until then `createRun` takes this placeholder
// (0005 item 23).
export const CONTRACT_IDS: string[] = ['none'];
