import type { TellsData } from './types';

// Tells: what a block shows about something hidden near it. Design doc 6 gives
// each hazard one ("damp stone within 1 of a water pocket"); the hazards and
// their tells arrive in M2. Mineral traces are the first, and follow the same
// model for ore (owner's answer to question 41; decision note 0012).
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
};
