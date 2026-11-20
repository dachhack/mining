import type { StructureDef } from './types';

export type StructureId = 'support' | 'vent' | 'pump' | 'explosive';

// Things placed in a cell (design doc 4.1, 0005 item 19). Code 0 is reserved
// for "no structure". Like block codes, these are part of the save format.
// A cell holds at most one structure (0014 item 6). The rules for supports,
// vents, pumps and explosives arrive with the M2 tasks.
// Code 1 was the ladder, removed with the miner's gravity (owner, issue #80).
// Codes 2 and 6 were the torch and the safety lamp, removed with light
// (design doc v0.2, section 7). A retired code is not given to anything else,
// so that an old save cannot be misread.
export const STRUCTURES: Record<StructureId, StructureDef> = {
  support: { code: 3, name: 'Support', placedFromItem: 'support' },
  vent: { code: 4, name: 'Vent', placedFromItem: 'vent' },
  pump: { code: 5, name: 'Pump', placedFromItem: 'pump' },
  explosive: { code: 7, name: 'Explosive', placedFromItem: 'explosive' },
};

/** The value in the structure array for a cell with nothing placed in it. */
export const NO_STRUCTURE = 0;
