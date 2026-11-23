// Hand-made frontier worlds for the engine's tests of the new game (plan A2, A3).
import type { ItemStack } from '../../src/data';
import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_SHIFT,
} from '../../src/data/frontier';
import { campRadius, seenWith } from '../../src/engine/frontier/camps';
import { FRONTIER_STATE_VERSION, NO_FEATURE } from '../../src/engine/frontier/state';
import type { Feature, FrontierAnimal, FrontierState } from '../../src/engine/frontier/state';
import { buildState } from './helpers';

/** The side of the square test cube: wide enough for a level-2 ring, and then some. */
export const SIDE = 25;
export const MID = Math.floor(SIDE / 2);
/** A second camp this far east of the first stands inside its ring, and its ring covers the first's 3 x 3. */
export const NEXT = campRadius(1) - 1;

/** A square inside the first camp's ring, just outside its 3 x 3. */
export const AT = { x: MID + 3, y: MID };

export interface WorldOptions {
  /** The top layer's block everywhere (a character of BLOCK_CHARS in helpers.ts); dirt if not given. */
  top?: string;
  /** Squares whose top block differs: `char` in the layer `z` (0 if not given). */
  special?: { x: number; y: number; z?: number; char: string }[];
  /** What grows everywhere (nothing if not given). */
  everywhere?: Feature;
  /** Features on single squares, with apples for an apple tree. */
  features?: { x: number; y: number; feature: Feature; apples?: number }[];
  animals?: FrontierAnimal[];
  inventory?: Record<string, number>;
}

/**
 * A frontier world on a hand-made SIDE x SIDE cube, 3 layers deep (`top`
 * on top, stone under it, with `special` squares), with one level-1 camp in
 * the middle.
 */
export function world(options: WorldOptions = {}): FrontierState {
  const layer = (z: number, base: string): string[] => {
    const rows: string[] = [];
    for (let y = 0; y < SIDE; y += 1) {
      let row = '';
      for (let x = 0; x < SIDE; x += 1) {
        const s = (options.special ?? []).find((p) => p.x === x && p.y === y && (p.z ?? 0) === z);
        row += s?.char ?? base;
      }
      rows.push(row);
    }
    return rows;
  };
  const cube = buildState({ layers: [layer(0, options.top ?? 'd'), layer(1, '#'), layer(2, '#')] });
  const features = new Array<Feature>(SIDE * SIDE).fill(options.everywhere ?? NO_FEATURE);
  const apples = new Array<number>(SIDE * SIDE).fill(0);
  for (const f of options.features ?? []) {
    features[f.x + SIDE * f.y] = f.feature;
    apples[f.x + SIDE * f.y] = f.apples ?? 0;
  }
  const camps = [{ id: 1, x: MID, y: MID, level: 1, smelter: false, lantern: false }];
  const animals = options.animals ?? [];
  return {
    version: FRONTIER_STATE_VERSION,
    seed: 1,
    cube,
    features,
    apples,
    animals,
    nextAnimalId: animals.length + 1,
    rng: { s: 1 },
    camps,
    nextCampId: 2,
    seen: seenWith(new Array<boolean>(SIDE * SIDE).fill(false), camps, SIDE, SIDE),
    inventory: new Map(Object.entries(options.inventory ?? {})),
    mined: 0,
    regrowIn: new Array<number>(SIDE * SIDE).fill(-1),
    stumps: new Array<Feature>(SIDE * SIDE).fill(NO_FEATURE),
    grassIn: new Array<number>(SIDE * SIDE).fill(-1),
    planted: new Array<boolean>(SIDE * SIDE).fill(false),
    treesFelled: 0,
    shift: 1,
    tapsLeft: FRONTIER_SHIFT.taps,
    health: FRONTIER_SHIFT.startHealth,
    status: 'active',
  };
}

/** Enough of everything for any camp or upgrade in the data. */
export function rich(): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (stacks: ItemStack[]): void => {
    for (const s of stacks) counts[s.item] = (counts[s.item] ?? 0) + s.count * 10;
  };
  add(FRONTIER_NEW_CAMP_COST);
  for (const level of FRONTIER_CAMP_LEVELS) add(level.upgradeCost);
  return counts;
}
