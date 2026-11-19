import type { StructureDef } from './types';

export type StructureId = 'torch' | 'support' | 'vent' | 'pump' | 'safetyLamp' | 'explosive';

// Things placed in a cell (design doc 4.1, 0005 item 19). Code 0 is reserved
// for "no structure". Like block codes, these are part of the save format.
// A cell holds at most one structure (0014 item 6). The rules for supports,
// vents, pumps, safety lamps and explosives arrive with the M2 tasks.
// Code 1 was the ladder, removed with the miner's gravity (owner, issue #80).
// It is not given to anything else, so that an old save cannot be misread.
export const STRUCTURES: Record<StructureId, StructureDef> = {
  torch: { code: 2, name: 'Torch', placedFromItem: 'torch' },
  support: { code: 3, name: 'Support', placedFromItem: 'support' },
  vent: { code: 4, name: 'Vent', placedFromItem: 'vent' },
  pump: { code: 5, name: 'Pump', placedFromItem: 'pump' },
  safetyLamp: { code: 6, name: 'Safety lamp', placedFromItem: 'safetyLamp' },
  explosive: { code: 7, name: 'Explosive', placedFromItem: 'explosive' },
};

/** The value in the structure array for a cell with nothing placed in it. */
export const NO_STRUCTURE = 0;
