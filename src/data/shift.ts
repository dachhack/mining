import type { ActionCostData, ShiftData } from './types';

// Design doc 4; decision note 0005 item 15. Unspent AP is lost at the end of
// a shift (issue #32), so there are no banked-AP numbers here.
// Camp fuel upkeep arrives with camps in M2.
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
  placeLadder: 1,
  placeTorch: 1,
  craft: 1,
  pickUp: 0,
  drop: 0,
  leave: 0,
};
