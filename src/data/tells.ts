import type { TellsData } from './types';

// Tells: what a block shows about something hidden near it. Design doc 6 gives
// each hazard one ("damp stone within 1 of a water pocket"). Mineral traces
// follow the same model for ore (owner's answer to question 41; decision note
// 0012).
//
// All of it is [Default]: tune it here.
export const TELLS: TellsData = {
  mineralTraces: {
    // How near an ore block must be, counted in steps through the grid
    // (north, east, south, west, up or down: "Manhattan" distance).
    distance: 2,
    // The ores that give traces. Coal and timber-root are left out: the top
    // layer already shows them. Unstable ore gets its own tell in M2 (6.5).
    sourceBlocks: ['ironOre', 'copperOre', 'crystal'],
    // The plain rock traces show on.
    shownOnBlocks: ['dirt', 'stone', 'hardRock'],
  },
  // Hazard tells (design doc 3.7; 0014 item 18): how near a pocket must be,
  // in steps through the grid (down as well as sideways), for a block to show
  // its tell. Read by `hazardTellsAt` in src/engine/tells.ts.
  hazards: {
    dampStoneDistance: 1,
    pittedRockDistance: 1,
    warmGlowDistance: 2,
  },
};
