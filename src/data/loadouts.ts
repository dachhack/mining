import type { LoadoutDef } from './types';

export type LoadoutId = 'standard';

// Decision note 0005 item 22.
export const LOADOUTS: Record<LoadoutId, LoadoutDef> = {
  standard: {
    name: 'Standard',
    fuel: 24,
    lampOil: 6,
    items: [
      { item: 'ladder', count: 6 },
      { item: 'timber', count: 2 },
    ],
  },
};

export const DEFAULT_LOADOUT_ID: LoadoutId = 'standard';

// Contracts arrive in M4. Until then `createRun` takes this placeholder
// (0005 item 23).
export const CONTRACT_IDS: string[] = ['none'];
