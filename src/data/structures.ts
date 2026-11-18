import type { StructureDef } from './types';

export type StructureId = 'ladder' | 'torch' | 'support';

// Things placed in a cell (design doc 4.1, 0005 item 19). Code 0 is reserved
// for "no structure". Like block codes, these are part of the save format.
// Supports can be crafted in M1 but are not placeable until M2.
export const STRUCTURES: Record<StructureId, StructureDef> = {
  ladder: { code: 1, name: 'Ladder', placedFromItem: 'ladder' },
  torch: { code: 2, name: 'Torch', placedFromItem: 'torch' },
  support: { code: 3, name: 'Support', placedFromItem: 'support' },
};

/** The value in the structure array for a cell with nothing placed in it. */
export const NO_STRUCTURE = 0;
