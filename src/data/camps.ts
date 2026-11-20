import type { CampData, CampToolData } from './types';

// Camps: design doc 8 ([Decided]) and what decision note 0014 items 25 to 30
// assume where section 8 is silent. Nothing reads this table until the camps
// task (M2-7), except `halfWidth` and `height`, which the engine uses to tell
// which cells belong to a camp when a hazard destroys one.
export const CAMPS: CampData = {
  kitItem: 'campKit',
  // A camp is 3 x 3 cells and 2 high (design doc 8): the founding cell, this
  // many cells to each side of it, and `height` layers counting its own
  // upwards (0014 item 26).
  halfWidth: 1,
  height: 2,
  // Founding and resting cost all the AP left in the shift, and need at
  // least this many (0014 items 26 and 27).
  foundMinAp: 1,
  restMinAp: 1,
  // Each active camp burns `upkeepFuel` every `upkeepEveryShifts` shifts,
  // counted from the shift it was founded (design doc 4; 0014 item 28).
  upkeepFuel: 1,
  upkeepEveryShifts: 4,
};

// Camp-made tools whose numbers are not a hazard's (0014 item 31; design doc
// 4.1). Pump and vent numbers are in hazards.ts; the drill's mine cost is
// `mineCostWithDrill` in blocks.ts.
export const CAMP_TOOLS: CampToolData = {
  drillItem: 'drill',
  sealantItem: 'sealant',
  scanChargeItem: 'scannerCharge',
  scanChargesPerScan: 1,
  // The centre of the scanned region is up to this many steps from the
  // avatar in a straight line.
  scanReach: 3,
  // The region is the centre and this many cells each way: 1 gives 3 x 3 x 3.
  scanRegionRadius: 1,
};
