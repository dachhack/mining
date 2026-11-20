import type { ActionCostData, ShiftData } from './types';

// Design doc 4; decision note 0005 item 15. Unspent AP is lost at the end of
// a shift (issue #32), so there are no banked-AP numbers here.
// Camp fuel upkeep is in camps.ts.
export const SHIFT: ShiftData = {
  firstShiftNumber: 1,
  apPerShift: 5,
  fuelPerShift: 1,
  lampOilBurnEveryShifts: 4,
  lampOilPerBurn: 1,
};

// Design doc 4.1. Mining is not here: its cost comes from the block (blocks.ts).
// Leaving has no cost given anywhere; 0 is assumed (owner question 27).
export const ACTION_COSTS: ActionCostData = {
  move: 1,
  placeTorch: 1,
  craft: 1,
  pickUp: 0,
  drop: 0,
  leave: 0,
  // M2 actions (design doc 4.1; decision note 0014). Founding a camp and
  // resting cost "the rest of the shift", so they are not here: see camps.ts.
  placeSupport: 1,
  placeExplosive: 1,
  placePump: 1,
  placeVent: 1,
  placeSafetyLamp: 1,
  seal: 1,
  scan: 2,
  campCraft: 1,
  stash: 0,
  decommissionCamp: 1,
};
