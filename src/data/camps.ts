import type { CampData, CampToolData } from './types';

// Camps: design doc v0.2 section 8 (issue #100; decision note 0031). The
// numbers are [Default]: tune them here.
export const CAMPS: CampData = {
  kitItem: 'campKit',
  // A camp stands on a flat square patch: its centre square and this many
  // squares to each side of it. 1 gives 3 x 3.
  halfWidth: 1,
  // Founding and resting cost all the AP left in the shift, and need at
  // least this many (design doc 4.1).
  foundMinAp: 1,
  restMinAp: 1,
  // Each active camp burns `upkeepFuel` every `upkeepEveryShifts` shifts,
  // counted from the shift it was founded (design doc 4).
  upkeepFuel: 1,
  upkeepEveryShifts: 4,
  // Mining near a camp is cheaper (owner, question 90). A mine costs
  // `mineDiscountAp` less, but never less than `mineMinAp`, when the square is
  // within `mineDiscountSteps` steps of a camp square (a step is to a face
  // neighbour, no diagonals) and no more than `mineDiscountMaxDeeper` levels
  // deeper than the camp.
  mineDiscountAp: 1,
  mineMinAp: 1,
  mineDiscountSteps: 4,
  mineDiscountMaxDeeper: 4,
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
