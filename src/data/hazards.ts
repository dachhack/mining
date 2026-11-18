import type { HazardData } from './types';

// Every hazard number of design doc 6 and decision note 0014, in one table.
// All of it is [Default]: tune it here. The per-material cave-in numbers
// (span and shaft limit) are in blocks.ts, one pair for each block.
//
// The M2 skeleton (issue #50) only puts the numbers in place. Each is read by
// the task that builds its rule; the item of 0014 it comes from is noted.
export const HAZARDS: HazardData = {
  // Cave-ins: design doc 6.1; 0014 items 5 to 10.
  caveIn: {
    // The stored timer a block gets when it cracks (item 7). The number shown
    // to the player is the stored timer plus 1.
    crackTimer: 2,
    // Damage a falling block deals to an avatar in its path (item 8).
    rockfallDamage: 4,
    // A support lines its own cell and this many cells above and below (item 10).
    supportLiningReach: 2,
    // An open cell is "tight" when at least this many of its four side
    // neighbours are solid (item 10).
    tightCellSolidSides: 3,
    // A support with no solid cell below it stays only with at least this
    // many solid side neighbours (item 6).
    supportHoldSolidSides: 2,
  },
  // Water: design doc 6.2; 0014 item 12.
  water: {
    unitsPerCell: 1,
    // Extra AP to move into a flooded cell.
    floodedMoveExtraAp: 1,
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
  // Explosions: 0014 item 15. Radius 1 is "the cell and its six face
  // neighbours", which the engine's `FACE_OFFSETS` gives; it is not a number here.
  explosion: {
    damage: 6,
  },
  // Lava: design doc 6.4; 0014 item 16.
  lava: {
    unitsPerCell: 1,
    // Lava flows in the cube phase of every shift whose number divides by this.
    flowEveryShifts: 2,
    // Every cell of a generated pocket of more than this many cells is a source.
    sourcePocketCellsOver: 8,
    damageInCell: 5,
    damageBeside: 1,
  },
  // Air: design doc 5.1; 0014 item 20.
  air: {
    max: 10,
    lossPerShift: 1,
  },
  // The forecast: 0014 item 4. In the copy of the cube the forecast is run
  // on, every unrevealed cell is this block with nothing in it.
  forecast: {
    unseenBlock: 'stone',
  },
};
