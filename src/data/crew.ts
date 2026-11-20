import type { CrewData } from './types';

// The crew: design doc v0.2 section 5 (decision note 0025; issue #90). All of
// it is [Default]: tune it here.
export const CREW: CrewData = {
  // Crew health at the start of a run (5.1). The run is lost at 0.
  startHealth: 10,
  // What each kind of hazard takes off crew health when it reaches a worked
  // square (5.2). Each kind hurts at most once a shift, by its largest amount.
  damage: {
    // A block slumps from a worked square, or comes to rest on one.
    slump: 3,
    // Water enters a worked square.
    water: 1,
    // Lava is on a worked square / on a square beside one.
    lavaOn: 5,
    lavaBeside: 1,
    // Gas is on a worked square.
    gas: 1,
    // An exploding gas square is a worked square or beside one.
    gasExplosion: 3,
    // The blast of a charge or of unstable ore includes a worked square.
    explosion: 6,
  },
};
