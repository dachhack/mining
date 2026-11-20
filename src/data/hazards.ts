import type { HazardData } from './types';

// Every hazard number of design doc 6 and decision note 0014, in one table.
// All of it is [Default]: tune it here. The per-material cave-in numbers
// (span and shaft limit) are in blocks.ts, one pair for each block.
//
// The M2 skeleton (issue #50) only puts the numbers in place. Each is read by
// the task that builds its rule; the item of 0014 it comes from is noted.
//
// What a hazard does to the crew's health is not here: see `CREW.damage` in
// crew.ts (design doc 5.2). There is no air (issue #90).
export const HAZARDS: HazardData = {
  // Cave-ins: design doc 6.1; 0014 items 5 to 10.
  caveIn: {
    // The stored timer a block gets when it cracks (item 7). The number shown
    // to the player is the stored timer plus 1.
    crackTimer: 2,
    // A support lines its own cell and this many cells above and below (item 10).
    supportLiningReach: 2,
    // An open cell is "tight" when at least this many of its four side
    // neighbours are solid (item 10).
    tightCellSolidSides: 3,
    // A support with no solid cell below it stays only with at least this
    // many solid side neighbours (item 6).
    supportHoldSolidSides: 2,
  },
  // Water: design doc 6.3; decision note 0031.
  water: {
    unitsPerCell: 1,
    // Extra AP to mine a square that water stands on (design doc 4.2;
    // owner question 91).
    floodedMineExtraAp: 1,
    // Water (and lava) moves from a square to a neighbour only when the
    // neighbour's level is at least this many levels lower. With 2, one unit
    // on a flat floor stays where it is, and a pit ends up level to within 1.
    // Must be at least 2: with 1, a unit would swap back and forth for ever.
    flowMinDrop: 2,
    pumpUnitsPerShift: 3,
    // A pump reaches water within this many steps through open cells.
    pumpReach: 2,
  },
  // Gas: design doc 6.3; 0014 item 13.
  gas: {
    // Units in each cell of a generated pocket.
    pocketUnitsPerCell: 4,
    // A vent removes gas within this many steps through open cells.
    ventReach: 2,
  },
  // Lava: design doc 6.4; 0014 item 16.
  lava: {
    unitsPerCell: 1,
    // Lava flows in the cube phase of every shift whose number divides by this.
    flowEveryShifts: 2,
    // Every cell of a generated pocket of more than this many cells is a source.
    sourcePocketCellsOver: 8,
    // A lava source gives this many units on every lava step (design doc 6.2).
    sourceUnitsPerStep: 1,
    // A source square always keeps this many units of lava: the vent is
    // never dry, so the player always sees where the source is.
    sourceKeepsUnits: 1,
  },
  // The forecast: 0014 item 4. In the copy of the cube the forecast is run
  // on, every unrevealed cell is this block with nothing in it.
  forecast: {
    unseenBlock: 'stone',
  },
};
