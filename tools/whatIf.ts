// "What if" trials for the depth survey (issue #108).
//
// The owner is to choose how runs should come to reach the hazards: bring the
// depth bands shallower, give more fuel and AP, or let rock stand steeper.
// Each trial here changes ONE set of [Default] numbers from src/data, in the
// memory of the simulator process only, so that the survey can play the same
// seeds with it and measure what it does.
//
// THE NAMED TRIALS ARE A RECORD. `WHAT_IFS` below is written as changes from
// the numbers of the day of the survey (24 fuel, the middle band at layer 8).
// The owner has since chosen new numbers (decision note 0040), so "starting
// fuel 48" would now lower the fuel. They reproduce the survey's tables only
// on the commit of PR #113. The custom trials (`set:...`, see `customWhatIf`)
// say their numbers outright and work on any data.
//
// NOTHING HERE CHANGES THE GAME. The files in src/data are not touched; the
// change lasts until the simulator process ends. `npm run sim -- --survey
// depth` plays each trial in worker processes of its own (tools/parallel.ts),
// so a trial never leaks into another measurement.

import { BLOCKS, CAMPS, GENERATION, LOADOUTS, SHIFT, WORLD } from '../src/data';

export interface WhatIf {
  /** The name on the command line and in the report's tables. */
  id: string;
  /**
   * Which of the owner's options it belongs to: 'a', 'b' or 'c' (issue #108),
   * 'a+b' for two of them together, 'other' for a change that is not on
   * the owner's list, or 'candidate' for a custom trial (see `customWhatIf`).
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

/**
 * Multiply the number of iron and copper veins the generator places by
 * `factor` (`veinsPer1000Cells` in src/data/generation.ts).
 */
function multiplyOreVeins(factor: number): void {
  for (const band of GENERATION.bands) {
    for (const vein of band.veins) {
      if (vein.block === 'ironOre' || vein.block === 'copperOre') {
        vein.veinsPer1000Cells *= factor;
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

/**
 * The settings a custom trial may change, with what each one sets. A custom
 * trial's id is 'set:' and then a list such as 'middle=4,deep=12,fuel=48':
 * - middle, deep: the first layer of the middle band and of the deep band
 *   (give both or neither);
 * - fuel: the standard loadout's starting fuel;
 * - ap: AP per shift;
 * - pockets: how many times as many water and gas pockets are generated;
 * - ore: how many times as many iron and copper veins are generated;
 * - slump: how much is added to every slump limit;
 * - campUpkeepEvery: a camp burns 1 fuel every this many shifts;
 * - campDiscount: AP taken off a mine near a camp;
 * - campSteps: how many steps from a camp the cheaper mining reaches.
 */
const CUSTOM_KEYS = [
  'middle',
  'deep',
  'fuel',
  'ap',
  'pockets',
  'ore',
  'slump',
  'campUpkeepEvery',
  'campDiscount',
  'campSteps',
];

/** The id prefix of a custom trial. */
const CUSTOM_PREFIX = 'set:';

/**
 * A trial made from a list of settings: see `CUSTOM_KEYS`. The depth survey
 * uses these for its candidate settings, so that a candidate is fully
 * described by its id. Throws on a setting it does not know.
 */
function customWhatIf(id: string): WhatIf {
  const values = new Map<string, number>();
  for (const part of id.slice(CUSTOM_PREFIX.length).split(',')) {
    const [key, text] = part.split('=');
    if (key === undefined || !CUSTOM_KEYS.includes(key) || !/^\d+$/.test(text ?? '')) {
      throw new Error(
        `Cannot read "${part}" in the what-if "${id}"; the settings are ${CUSTOM_KEYS.join(', ')}, each with a whole number`,
      );
    }
    values.set(key, Number(text));
  }
  const middle = values.get('middle');
  const deep = values.get('deep');
  if ((middle === undefined) !== (deep === undefined)) {
    throw new Error(`The what-if "${id}" must give both middle and deep, or neither`);
  }
  const whatIf: WhatIf = {
    id,
    option: 'candidate',
    label: id.slice(CUSTOM_PREFIX.length).split(',').join(', '),
    apply: () => {
      if (middle !== undefined && deep !== undefined) {
        setBands(middle, deep);
      }
      // `?? current`: a setting that was not given keeps its value.
      LOADOUTS.standard.fuel = values.get('fuel') ?? LOADOUTS.standard.fuel;
      SHIFT.apPerShift = values.get('ap') ?? SHIFT.apPerShift;
      multiplyPockets(values.get('pockets') ?? 1);
      multiplyOreVeins(values.get('ore') ?? 1);
      raiseSlumpLimits(values.get('slump') ?? 0, () => true);
      CAMPS.upkeepEveryShifts = values.get('campUpkeepEvery') ?? CAMPS.upkeepEveryShifts;
      CAMPS.mineDiscountAp = values.get('campDiscount') ?? CAMPS.mineDiscountAp;
      CAMPS.mineDiscountSteps = values.get('campSteps') ?? CAMPS.mineDiscountSteps;
    },
  };
  if (middle !== undefined) {
    whatIf.middleBandStart = middle;
  }
  return whatIf;
}

/**
 * The trial with this id: one of `WHAT_IFS`, or a custom trial whose id
 * starts with 'set:' (see `CUSTOM_KEYS`). Throws on an unknown id.
 */
export function findWhatIf(id: string): WhatIf {
  if (id.startsWith(CUSTOM_PREFIX)) {
    return customWhatIf(id);
  }
  const found = WHAT_IFS.find((whatIf) => whatIf.id === id);
  if (found === undefined) {
    throw new Error(
      `Unknown what-if "${id}"; they are ${WHAT_IFS.map((whatIf) => whatIf.id).join(', ')}, or set:...`,
    );
  }
  return found;
}
