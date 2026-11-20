// "What if" trials for the depth survey (issue #108).
//
// The owner is to choose how runs should come to reach the hazards: bring the
// depth bands shallower, give more fuel and AP, or let rock stand steeper.
// Each trial here changes ONE set of [Default] numbers from src/data, in the
// memory of the simulator process only, so that the survey can play the same
// seeds with it and measure what it does.
//
// NOTHING HERE CHANGES THE GAME. The files in src/data are not touched; the
// change lasts until the simulator process ends. `npm run sim -- --survey
// depth` plays each trial in worker processes of its own (tools/parallel.ts),
// so a trial never leaks into another measurement.

import { BLOCKS, GENERATION, LOADOUTS, SHIFT, WORLD } from '../src/data';

export interface WhatIf {
  /** The name on the command line and in the report's tables. */
  id: string;
  /**
   * Which of the owner's options it belongs to: 'a', 'b' or 'c' (issue #108),
   * 'a+b' for two of them together, or 'other' for a change that is not on
   * the owner's list.
   */
  option: string;
  /** What it changes, in a few words, with the numbers. */
  label: string;
  /** The first layer of the middle band under this trial, if the trial moves it. */
  middleBandStart?: number;
  /** Make the change, in this process's copy of the data. */
  apply: () => void;
}

/** Set where the three depth bands begin: the middle band at `middle`, the deep band at `deep`. */
function setBands(middle: number, deep: number): void {
  const bands = WORLD.depthBands;
  const last = WORLD.size.z - 1;
  // `as`: the data always lists exactly three bands (upper, middle, deep).
  const [upper, mid, low] = bands as [(typeof bands)[0], (typeof bands)[0], (typeof bands)[0]];
  upper.firstLayer = 0;
  upper.lastLayer = middle - 1;
  mid.firstLayer = middle;
  mid.lastLayer = deep - 1;
  low.firstLayer = deep;
  low.lastLayer = last;
}

/**
 * Multiply the number of water and gas pockets the generator places by
 * `factor` (`spacesPer1000Cells` in src/data/generation.ts).
 */
function multiplyPockets(factor: number): void {
  for (const band of GENERATION.bands) {
    for (const space of band.spaces) {
      if (space.kind === 'water' || space.kind === 'gas') {
        space.spacesPer1000Cells *= factor;
      }
    }
  }
}

/** Add `extra` to the slump limit of every block that has one and passes the test. */
function raiseSlumpLimits(extra: number, test: (blockId: string) => boolean): void {
  for (const [blockId, def] of Object.entries(BLOCKS)) {
    if (def.slumpLimit !== null && test(blockId)) {
      def.slumpLimit += extra;
    }
  }
}

export const WHAT_IFS: WhatIf[] = [
  {
    id: 'bands-6',
    option: 'a',
    label: 'Middle band starts at layer 6 (now 8), deep band at 16 (now 20)',
    middleBandStart: 6,
    apply: () => {
      setBands(6, 16);
    },
  },
  {
    id: 'bands-4',
    option: 'a',
    label: 'Middle band starts at layer 4 (now 8), deep band at 12 (now 20)',
    middleBandStart: 4,
    apply: () => {
      setBands(4, 12);
    },
  },
  {
    id: 'fuel-48',
    option: 'b',
    label: 'Starting fuel 48 (now 24)',
    apply: () => {
      LOADOUTS.standard.fuel = 48;
    },
  },
  {
    id: 'fuel-96',
    option: 'b',
    label: 'Starting fuel 96 (now 24)',
    apply: () => {
      LOADOUTS.standard.fuel = 96;
    },
  },
  {
    id: 'ap-8',
    option: 'b',
    label: '8 AP a shift (now 5)',
    apply: () => {
      SHIFT.apPerShift = 8;
    },
  },
  {
    id: 'fuel-48-ap-8',
    option: 'b',
    label: 'Starting fuel 48 and 8 AP a shift',
    apply: () => {
      LOADOUTS.standard.fuel = 48;
      SHIFT.apPerShift = 8;
    },
  },
  {
    id: 'slump-dirt-2',
    option: 'c',
    label: 'Dirt and rubble hold a fall of 2 (now 1)',
    apply: () => {
      raiseSlumpLimits(1, (blockId) => blockId === 'dirt' || blockId === 'rubble');
    },
  },
  {
    id: 'slump-all-plus-1',
    option: 'c',
    label: 'Every slump limit 1 higher: dirt 2, stone 3, hard rock 4',
    apply: () => {
      raiseSlumpLimits(1, () => true);
    },
  },
  {
    id: 'slump-all-plus-2',
    option: 'c',
    label: 'Every slump limit 2 higher: dirt 3, stone 4, hard rock 5',
    apply: () => {
      raiseSlumpLimits(2, () => true);
    },
  },
  {
    id: 'bands-6-fuel-48',
    option: 'a+b',
    label: 'Middle band starts at layer 6, deep band at 16, and starting fuel 48',
    middleBandStart: 6,
    apply: () => {
      setBands(6, 16);
      LOADOUTS.standard.fuel = 48;
    },
  },
  {
    id: 'bands-4-fuel-48',
    option: 'a+b',
    label: 'Middle band starts at layer 4, deep band at 12, and starting fuel 48',
    middleBandStart: 4,
    apply: () => {
      setBands(4, 12);
      LOADOUTS.standard.fuel = 48;
    },
  },
  {
    id: 'bands-6-fuel-48-pockets-x4',
    option: 'other',
    label:
      'Middle band starts at layer 6, deep band at 16, starting fuel 48, and four times as many water and gas pockets',
    middleBandStart: 6,
    apply: () => {
      setBands(6, 16);
      LOADOUTS.standard.fuel = 48;
      multiplyPockets(4);
    },
  },
];

/** The trial with this id. Throws on an unknown id. */
export function findWhatIf(id: string): WhatIf {
  const found = WHAT_IFS.find((whatIf) => whatIf.id === id);
  if (found === undefined) {
    throw new Error(
      `Unknown what-if "${id}"; they are ${WHAT_IFS.map((whatIf) => whatIf.id).join(', ')}`,
    );
  }
  return found;
}
