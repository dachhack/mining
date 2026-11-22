// A tap on the map in the new game (plan A3): Lab 2's `campTap`
// (src/app/lab/campWorld.ts), in the engine. In order:
//
// 1. a square outside every camp's circle does nothing ('fog' or 'greyed');
// 2. an animal there is caught, even on a camp's ground;
// 3. a camp's own 3 x 3 is never mined ('camp');
// 4. grass, a tree or an apple tree is taken before the block under it;
// 5. the level rule: a square may be at most 1 level below its neighbours ('refused');
// 6. the camps covering the square must have a level that can mine its top block ('tooHard');
// 7. then the top block is mined, and what it yields goes into the inventory.
//
// The level rule is checked before the hardness gate, so a block too steep to
// mine says so rather than promising that an upgrade would let it be mined
// (review of PR #119).

import type { ItemStack } from '../../data';
import { mayMine, topBlockAt } from '../heightmap';
import type { HigherNeighbour, MineRefusal } from '../heightmap';
import { labMine } from '../lab';
import { campAt, coverLevelAt, levelNeededFor, sightAt } from './camps';
import { gained, harvestAt } from './surface';
import type { HarvestKind } from './surface';
import type { FrontierState } from './state';

/**
 * What a tap did:
 * - 'mined': the top block was mined (`block` and `gain` say what);
 * - 'harvested': something on the surface was taken (`harvest` and `gain`);
 * - 'fog' or 'greyed': the square is outside every camp's circle;
 * - 'camp': the square is a camp's ground;
 * - 'refused': the level rule refused it, or the square is off the map (`refusal`);
 * - 'tooHard': the camps covering it cannot mine its top block (`needs`).
 */
export type FrontierTapKind =
  'mined' | 'harvested' | 'fog' | 'greyed' | 'camp' | 'refused' | 'tooHard';

export interface FrontierTap {
  kind: FrontierTapKind;
  /** The state after the tap: the very same state for every kind but 'mined' and 'harvested'. */
  state: FrontierState;
  /** What the tap gave, for 'mined' and 'harvested'. (A block may give nothing: rubble.) */
  gain: ItemStack[];
  /** For 'harvested': what was taken. */
  harvest: HarvestKind | null;
  /** For 'mined': the block code that was mined. */
  block: number | null;
  /** For 'tooHard': the lowest camp level that can mine the block, or `null` if none can. */
  needs: number | null;
  /** For 'refused': why ('outside' for a square off the map). */
  refusal: MineRefusal | 'outside' | null;
  /** For a 'refused' too-steep tap: the neighbours that are too high. */
  higherNeighbours: HigherNeighbour[];
}

/** Tap square (x, y). See the order at the top of this file. */
export function frontierTap(state: FrontierState, x: number, y: number): FrontierTap {
  const nothing = (kind: FrontierTapKind): FrontierTap => ({
    kind,
    state,
    gain: [],
    harvest: null,
    block: null,
    needs: null,
    refusal: null,
    higherNeighbours: [],
  });
  if (x < 0 || y < 0 || x >= state.cube.size.x || y >= state.cube.size.y) {
    return { ...nothing('refused'), refusal: 'outside' };
  }
  const sight = sightAt(state, x, y);
  if (sight !== 'shown') {
    return nothing(sight);
  }
  const taken = harvestAt(state, x, y);
  if (taken !== null && taken.kind === 'caught') {
    return { ...nothing('harvested'), state: taken.state, gain: [taken.gain], harvest: 'caught' };
  }
  if (campAt(state.camps, x, y) !== null) {
    return nothing('camp');
  }
  if (taken !== null) {
    return { ...nothing('harvested'), state: taken.state, gain: [taken.gain], harvest: taken.kind };
  }
  const check = mayMine(state.cube, x, y);
  if (!check.allowed) {
    return {
      ...nothing('refused'),
      // `?? 'bottom'`: `refusal` is only null when `allowed` is true.
      refusal: check.refusal ?? 'bottom',
      higherNeighbours: check.higherNeighbours,
    };
  }
  const needs = levelNeededFor(topBlockAt(state.cube, x, y));
  if (needs === null || needs > coverLevelAt(state.camps, x, y)) {
    return { ...nothing('tooHard'), needs };
  }
  const mined = labMine(state.cube, x, y);
  if (!mined.mined) {
    return { ...nothing('refused'), refusal: mined.refusal };
  }
  let inventory = state.inventory;
  for (const stack of mined.yields) {
    inventory = gained(inventory, stack);
  }
  return {
    ...nothing('mined'),
    state: { ...state, cube: mined.state, inventory, mined: state.mined + 1 },
    gain: mined.yields,
    block: mined.block,
  };
}
