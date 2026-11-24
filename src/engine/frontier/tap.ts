// A tap on the map in the new game (plan A3): Lab 2's `campTap`
// (src/app/lab/campWorld.ts), in the engine. In order:
//
// 1. a square outside every camp's circle does nothing ('fog' or 'greyed');
// 1a. a dragon there: with a sword in the store the tap drives it off
//    ('dragon'), without one it does nothing ('needsSword'; dragons.ts);
// 1b. a burning square: the tap puts its fire out ('fire'; fire.ts);
// 2. an animal there is caught, even on a camp's ground;
// 3. a camp's own 3 x 3 is never mined ('camp');
// 4. grass, a tree or an apple tree is taken before the block under it;
// 4a. a flooded square (water.ts) is never mined: a tap sets a pump from the
//    store on it, or picks up the pump that is there ('pump'), or, with no
//    pump, does nothing ('flooded');
// 5. the level rule: a square may be at most 1 level below its neighbours ('refused');
// 6. the camps covering the square must have a level that can mine its top
//    block, or, for a block no camp level mines (ore, crystal, relics), a
//    camp must cover it and the store must hold a tool that mines it
//    ('tooHard'; progression plan sections 2.2 and 4);
// 7. then the top block is mined, and what it yields goes into the inventory
//    (doubled while the store holds an iron pickaxe: FRONTIER_PICKAXE). If
//    the mine opened a water pocket deep enough, the water floods (water.ts);
//    if it opened a gas pocket deep enough, the gas may explode (gas.ts).
//
// The level rule is checked before the hardness gate, so a block too steep to
// mine says so rather than promising that an upgrade would let it be mined
// (review of PR #119).

import { blockDefByCode } from '../../data';
import type { ItemId, ItemStack } from '../../data';
import {
  FRONTIER_DRAGON,
  FRONTIER_PICKAXE,
  FRONTIER_PUMP,
  FRONTIER_SURFACE,
} from '../../data/frontier';
import { depthAt, mayMine, topBlockAt } from '../heightmap';
import type { HigherNeighbour, MineRefusal } from '../heightmap';
import { labMine } from '../lab';
import { campAt, frontierMineCheck, sightAt } from './camps';
import { gained, harvestAt } from './surface';
import { isFlooded, pumpIndexAt, takeWaterOpened, withFlood } from './water';
import { isBurning, putOut } from './fire';
import { gasOpened } from './gas';
import { dragonAt, driveOff } from './dragons';
import type { GasOutcome } from './gas';
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
 *   or `needsTool`);
 * - 'flooded': the square is flooded and no pump is in the store (water.ts);
 * - 'pump': a pump was set on the flooded square, or picked up (`pump`);
 * - 'fire': the fire burning on the square was put out (fire.ts);
 * - 'dragon': the dragon on the square was driven off with a sword (dragons.ts);
 * - 'needsSword': a dragon is on the square and no sword is in the store.
 */
export type FrontierTapKind =
  | 'mined'
  | 'harvested'
  | 'fog'
  | 'greyed'
  | 'camp'
  | 'refused'
  | 'tooHard'
  | 'flooded'
  | 'pump'
  | 'fire'
  | 'dragon'
  | 'needsSword';

export interface FrontierTap {
  kind: FrontierTapKind;
  /** The state after the tap: the very same state for every kind but 'mined', 'harvested', 'pump' and 'fire'. */
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
  /** For 'pump': whether a pump was set or picked up. */
  pump: 'set' | 'taken' | null;
  /** For 'mined': the squares the water it let out flooded (water.ts), nearest first. */
  flooded: { x: number; y: number }[];
  /** For 'mined': what the gas it let out did (gas.ts), or `null` if it let none out. */
  gas: GasOutcome;
  /** For 'mined': the squares a blast dug, and the squares it set on fire (gas.ts). */
  blown: { x: number; y: number }[];
  fires: { x: number; y: number }[];
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
    pump: null,
    flooded: [],
    gas: null,
    blown: [],
    fires: [],
  });
  if (x < 0 || y < 0 || x >= state.cube.size.x || y >= state.cube.size.y) {
    return { ...nothing('refused'), refusal: 'outside' };
  }
  const sight = sightAt(state, x, y);
  if (sight !== 'shown') {
    return nothing(sight);
  }
  // A dragon first: driven off with a sword, else nothing (dragons.ts).
  const dragon = dragonAt(state, x, y);
  if (dragon !== null) {
    if ((state.inventory.get(FRONTIER_DRAGON.sword) ?? 0) < 1) return nothing('needsSword');
    return { ...nothing('dragon'), state: driveOff(state, dragon.id) };
  }
  // A fire is put out before anything else on the square (fire.ts).
  if (isBurning(state, x, y)) {
    return { ...nothing('fire'), state: putOut(state, x, y) };
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
  if (isFlooded(state, x, y)) {
    return pumpTap(state, x, y, nothing);
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
  const wasDepth = depthAt(state.cube, x, y);
  const mined = labMine(state.cube, x, y);
  if (!mined.mined) {
    return { ...nothing('refused'), refusal: mined.refusal };
  }
  // Water let out of a pocket under the block (water.ts). `mined.state` is
  // the mine's own copy of the cube, so taking the water out of it is safe.
  const flooded = takeWaterOpened(mined.state, state.camps, state.hazards.flooded, x, y, wasDepth);
  const hazards = withFlood(state.hazards, state.cube.size.x, flooded);
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
  const after = { ...state, cube: mined.state, inventory, mined: state.mined + 1, hazards };
  // Gas let out of a pocket under the block (gas.ts): it may explode.
  const blast = gasOpened({ ...after, stumps, regrowIn, planted, grassIn }, x, y, wasDepth);
  return {
    ...nothing('mined'),
    state: blast.state,
    gain,
    block: mined.block,
    flooded,
    gas: blast.gas,
    blown: blast.blown,
    fires: blast.fires,
  };
}

/**
 * A tap on a flooded square (water.ts): pick up the pump there, or set one
 * from the store, or, with none, do nothing ('flooded').
 */
function pumpTap(
  state: FrontierState,
  x: number,
  y: number,
  nothing: (kind: FrontierTapKind) => FrontierTap,
): FrontierTap {
  const at = pumpIndexAt(state.hazards, x, y);
  if (at >= 0) {
    const pumps = state.hazards.pumps.filter((_, k) => k !== at);
    const inventory = gained(state.inventory, { item: FRONTIER_PUMP.item, count: 1 });
    const next = { ...state, inventory, hazards: { ...state.hazards, pumps } };
    return { ...nothing('pump'), state: next, pump: 'taken' };
  }
  const held = state.inventory.get(FRONTIER_PUMP.item) ?? 0;
  if (held < 1) return nothing('flooded');
  const inventory = new Map(state.inventory);
  if (held > 1) inventory.set(FRONTIER_PUMP.item, held - 1);
  else inventory.delete(FRONTIER_PUMP.item);
  const pumps = [...state.hazards.pumps, { x, y }];
  const next = { ...state, inventory, hazards: { ...state.hazards, pumps } };
  return { ...nothing('pump'), state: next, pump: 'set' };
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
  if (dragonAt(state, x, y) !== null) {
    const sword = (state.inventory.get(FRONTIER_DRAGON.sword) ?? 0) > 0;
    return { kind: sword ? 'dragon' : 'needsSword', gain: [] };
  }
  if (isBurning(state, x, y)) return { kind: 'fire', gain: [] };
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
    return { kind: 'harvested', gain: [{ item: 'wood', count: FRONTIER_SURFACE.woodPerTree }] };
  }
  if (isFlooded(state, x, y)) {
    const pumpHere = pumpIndexAt(state.hazards, x, y) >= 0;
    const held = (state.inventory.get(FRONTIER_PUMP.item) ?? 0) > 0;
    return { kind: pumpHere || held ? 'pump' : 'flooded', gain: [] };
  }
  if (!mayMine(state.cube, x, y).allowed) return { kind: 'refused', gain: [] };
  const code = topBlockAt(state.cube, x, y);
  if (!frontierMineCheck(state.camps, state.inventory, x, y, code).ok)
    return { kind: 'tooHard', gain: [] };
  return { kind: 'mined', gain: miningGain(state.inventory, blockDefByCode(code).yields) };
}
