import type { ActionCostData, ShiftData } from './types';

// Design doc 4; decision note 0005 item 15. Unspent AP is lost at the end of
// a shift (issue #32), so there are no banked-AP numbers here.
// Camp fuel upkeep is in camps.ts.
export const SHIFT: ShiftData = {
  firstShiftNumber: 1,
  apPerShift: 5,
  fuelPerShift: 1,
};

// Design doc 4.1. Mining is not here: its cost comes from the block (blocks.ts).
// Closing the mine costs 0 AP (design doc 4.1; owner question 88).
// There is no pick-up, drop or stash cost: carrying is gone (design doc 5.4).
export const ACTION_COSTS: ActionCostData = {
  move: 1,
  craft: 1,
  closeMine: 0,
  // M2 actions (design doc 4.1; decision note 0014). Founding a camp and
  // resting cost "the rest of the shift", so they are not here: see camps.ts.
  placeSupport: 1,
  placeExplosive: 1,
  placePump: 1,
  placeVent: 1,
  seal: 1,
  scan: 2,
  campCraft: 1,
  decommissionCamp: 1,
};
