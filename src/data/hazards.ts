import type { HazardData } from './types';

// Every hazard number of design doc 6 and decision note 0014, in one table.
// All of it is [Default]: tune it here. The per-material slump limit is in
// blocks.ts, one for each block.
//
// The M2 skeleton (issue #50) only puts the numbers in place. Each is read by
// the task that builds its rule; the item of 0014 it comes from is noted.
//
// What a hazard does to the crew's health is not here: see `CREW.damage` in
// crew.ts (design doc 5.2). There is no air (issue #90).
export const HAZARDS: HazardData = {
  // Pit walls slump: design doc 6.1; owner question 81.
  slump: {
    // The number a fresh crack shows: the block falls in the cube phase that
    // ends the shift after next. 1 would mean "at the end of the next shift".
    crackCountdown: 2,
    // A square is "steep", and so unstable whatever its material, when it is
    // this many levels or more above a face neighbour. Only a hazard can make
    // such a step: the level rule keeps the player's mining to steps of 1.
    // Must be at least 2, or a slumping block would not move down.
    steepStep: 2,
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
  // Lava: design doc 6.4; 0014 item 16.
  lava: {
    unitsPerCell: 1,
    // Lava flows in the cube phase of every shift whose number divides by this.
    flowEveryShifts: 2,
    // Every cell of a generated pocket of more than this many cells is a source.
    sourcePocketCellsOver: 8,
  },
  // The forecast: 0014 item 4. In the copy of the cube the forecast is run
  // on, every unrevealed cell is this block with nothing in it.
  forecast: {
    unseenBlock: 'stone',
  },
};
