// A tap on the map in the new game (plan A3): Lab 2's `campTap`
// (src/app/lab/campWorld.ts), in the engine. In order:
//
// 1. a square outside every camp's circle does nothing ('fog' or 'greyed');
// 2. an animal there is caught, even on a camp's ground;
// 3. a camp's own 3 x 3 is never mined ('camp');
// 4. grass, a tree or an apple tree is taken before the block under it;
// 5. the level rule: a square may be at most 1 level below its neighbours ('refused');
// 6. the camps covering the square must have a level that can mine its top
//    block, or, for a block no camp level mines (ore, crystal, relics), a
//    camp must cover it and the store must hold a tool that mines it
//    ('tooHard'; progression plan sections 2.2 and 4);
// 7. then the top block is mined, and what it yields goes into the inventory
//    (doubled while the store holds an iron pickaxe: FRONTIER_PICKAXE).
//
// The level rule is checked before the hardness gate, so a block too steep to
// mine says so rather than promising that an upgrade would let it be mined
// (review of PR #119).

import { blockDefByCode } from '../../data';
import type { ItemId, ItemStack } from '../../data';
import { FRONTIER_PICKAXE, FRONTIER_SAPLINGS, FRONTIER_SURFACE } from '../../data/frontier';
import { mayMine, topBlockAt } from '../heightmap';
import type { HigherNeighbour, MineRefusal } from '../heightmap';
import { labMine } from '../lab';
import { campAt, frontierMineCheck, sightAt } from './camps';
import { gained, harvestAt } from './surface';
import type { HarvestKind } from './surface';
import { APPLE_TREE, GRASS, NO_FEATURE, TREE } from './state';
import type { FrontierState } from './state';

/**
 * What a tap did:
 * - 'mined': the top block was mined (`block` and `gain` say what);
 * - 'harvested': something on the surface was taken (`harvest` and `gain`);
 * - 'fog' or 'greyed': the square is outside every camp's circle;
 * - 'camp': the square is a camp's ground;
 * - 'refused': the level rule refused it, or the square is off the map (`refusal`);
 * - 'tooHard': the camps covering it cannot mine its top block (`needs`
 *   or `needsTool`).
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
  /** For 'tooHard': the lowest camp level that can mine the block, or `null` if no level can. */
  needs: number | null;
  /** For 'tooHard': the tool that mines the block, if a tool does and none is held. */
  needsTool: ItemId | null;
  /** For 'refused': why ('outside' for a square off the map). */
  refusal: MineRefusal | 'outside' | null;
  /** For a 'refused' too-steep tap: the neighbours that are too high. */
  higherNeighbours: HigherNeighbour[];
}

/**
 * What mining a block that yields `yields` gives: each stack times
 * FRONTIER_PICKAXE.yieldTimes while `inventory` holds a pickaxe (owner,
 * question 163), as it is otherwise. A second pickaxe adds nothing.
 */
export function miningGain(inventory: Map<string, number>, yields: ItemStack[]): ItemStack[] {
  const times = (inventory.get(FRONTIER_PICKAXE.item) ?? 0) > 0 ? FRONTIER_PICKAXE.yieldTimes : 1;
  return yields.map((s) => ({ item: s.item, count: s.count * times }));
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
    needsTool: null,
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
    const gain = taken.extra === null ? [taken.gain] : [taken.gain, taken.extra];
    return { ...nothing('harvested'), state: taken.state, gain, harvest: taken.kind };
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
  const hard = frontierMineCheck(state.camps, state.inventory, x, y, topBlockAt(state.cube, x, y));
  if (!hard.ok) {
    return { ...nothing('tooHard'), needs: hard.needs, needsTool: hard.needsTool };
  }
  const mined = labMine(state.cube, x, y);
  if (!mined.mined) {
    return { ...nothing('refused'), refusal: mined.refusal };
  }
  const gain = miningGain(state.inventory, mined.yields);
  let inventory = state.inventory;
  for (const stack of gain) {
    inventory = gained(inventory, stack);
  }
  // Mining the ground under a stump digs it out: no tree grows back there,
  // and the stump is gone at once (owner, after the playtest of 8842e83:
  // "The tree ring needs to disappear if you mine the surface level block
  // the tree grows on").
  const i = x + state.cube.size.x * y;
  let stumps = state.stumps;
  let regrowIn = state.regrowIn;
  let planted = state.planted;
  if ((stumps[i] ?? NO_FEATURE) !== NO_FEATURE) {
    stumps = [...stumps];
    stumps[i] = NO_FEATURE;
    regrowIn = [...regrowIn];
    regrowIn[i] = -1;
    planted = [...planted];
    planted[i] = false;
  }
  // Nor does cut grass grow back on ground dug out (progression plan section 6.1).
  let grassIn = state.grassIn;
  if ((grassIn[i] ?? -1) >= 0) {
    grassIn = [...grassIn];
    grassIn[i] = -1;
  }
  const after = { ...state, cube: mined.state, inventory, mined: state.mined + 1 };
  return {
    ...nothing('mined'),
    state: { ...after, stumps, regrowIn, planted, grassIn },
    gain,
    block: mined.block,
  };
}

/**
 * What a tap on (x, y) would do and give, without making the new state: the
 * same checks in the same order as `frontierTap`, for policies and views
 * that look at every square (copying the cube for each would be slow).
 * `previewTap(s, x, y).kind` is always `frontierTap(s, x, y).kind`; a test
 * checks it on whole runs.
 */
export function previewTap(
  state: FrontierState,
  x: number,
  y: number,
): { kind: FrontierTapKind; gain: ItemStack[] } {
  if (x < 0 || y < 0 || x >= state.cube.size.x || y >= state.cube.size.y) {
    return { kind: 'refused', gain: [] };
  }
  const sight = sightAt(state, x, y);
  if (sight !== 'shown') return { kind: sight, gain: [] };
  const animalHere = state.animals.some((a) => a.x === x && a.y === y);
  if (animalHere) return { kind: 'harvested', gain: [{ item: 'animal', count: 1 }] };
  if (campAt(state.camps, x, y) !== null) return { kind: 'camp', gain: [] };
  const i = x + state.cube.size.x * y;
  const feature = state.features[i];
  if (feature === GRASS) {
    return { kind: 'harvested', gain: [{ item: 'grass', count: FRONTIER_SURFACE.grassPerTuft }] };
  }
  if (feature === APPLE_TREE && (state.apples[i] ?? 0) > 0) {
    return { kind: 'harvested', gain: [{ item: 'apple', count: 1 }] };
  }
  if (feature === TREE || feature === APPLE_TREE) {
    const wood = { item: 'wood' as const, count: FRONTIER_SURFACE.woodPerTree };
    // Every few trees felled give a sapling too (surface.ts).
    const sapling = (state.treesFelled + 1) % FRONTIER_SAPLINGS.saplingEveryFelled === 0;
    return {
      kind: 'harvested',
      gain: sapling ? [wood, { item: 'sapling', count: 1 }] : [wood],
    };
  }
  if (!mayMine(state.cube, x, y).allowed) return { kind: 'refused', gain: [] };
  const code = topBlockAt(state.cube, x, y);
  if (!frontierMineCheck(state.camps, state.inventory, x, y, code).ok)
    return { kind: 'tooHard', gain: [] };
  return { kind: 'mined', gain: miningGain(state.inventory, blockDefByCode(code).yields) };
}
