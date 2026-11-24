// Marauders and camp defenses (docs/plans/hazards.md, section 5; hazards PR 5).
//
// The owner: "Marauders can come and steal things from your camps and remove
// their upgrades and put them back to basic. If the camp has defenses
// though, they can be turned away. The strength of the marauders depends on
// how far you have dug. The damage they do depends on what level of defense
// your targeted camp has."
//
// - Defenses: a camp's `defense` goes up one level at a time (FRONTIER_DEFENSE,
//   up to 3) from its panel, for that level's cost and 1 tap (shift.ts
//   charges it), at a camp of level FRONTIER_DEFENSE_MIN_LEVEL or more, a
//   deep camp too. A raid never takes
//   them down.
// - A raid (`nightOfRaids`, at End shift after the dragons, before rain):
//   from shift FRONTIER_RAID.fromShift, with a chance of FRONTIER_RAID.chance,
//   marauders choose one camp at random. Their strength (`raidStrength`)
//   comes from the deepest square on the map. If the camp's defense level is
//   at least their strength they are turned away and nothing is lost.
//   Otherwise the shortfall (strength minus defense) sets the damage:
//   FRONTIER_RAID.stealShare of each goods stack in the store for each point,
//   rounded down (never coins), and FRONTIER_RAID.upgradesPerShortfall of the
//   camp's upgrades for each point, in the order fire takes them (fire.ts,
//   `stripCamp`): the lantern, the pen and its animals, the smelter, then
//   camp levels down to 1.
//
// The rolls use the state's own generator. The numbers are in
// src/data/frontier.ts.

import type { ItemStack } from '../../data';
import {
  FRONTIER_DEFENSE,
  FRONTIER_DEFENSE_MIN_LEVEL,
  FRONTIER_MARKET,
  FRONTIER_RAID,
} from '../../data/frontier';
import { depthAt } from '../heightmap';
import { nextFloat, nextInt } from '../rng';
import type { RngState } from '../rng';
import { canAfford, pay } from './camps';
import { stripCamp } from './fire';
import type { FrontierState } from './state';

/**
 * Why camp `id` cannot build its next level of defenses, or `null` if it can:
 * - 'none': no such camp;
 * - 'level': the camp is below FRONTIER_DEFENSE_MIN_LEVEL;
 * - 'max': it has every level already;
 * - 'cost': the store does not hold the next level's cost.
 */
export type DefenseRefusal = 'none' | 'level' | 'max' | 'cost';

/** The next level of defenses camp `id` would build, or `null` if it has them all or does not stand. */
export function nextDefense(
  state: FrontierState,
  id: number,
): (typeof FRONTIER_DEFENSE)[number] | null {
  const camp = state.camps.find((c) => c.id === id);
  if (camp === undefined) return null;
  return FRONTIER_DEFENSE[camp.defense] ?? null;
}

export function defenseRefusal(state: FrontierState, id: number): DefenseRefusal | null {
  const camp = state.camps.find((c) => c.id === id);
  if (camp === undefined) return 'none';
  if (camp.level < FRONTIER_DEFENSE_MIN_LEVEL) return 'level';
  const next = FRONTIER_DEFENSE[camp.defense];
  if (next === undefined) return 'max';
  return canAfford(state.inventory, next.cost) ? null : 'cost';
}

/** Build camp `id`'s next level of defenses. If `defenseRefusal` says no, the very same state comes back. */
export function buildDefense(state: FrontierState, id: number): FrontierState {
  const next = nextDefense(state, id);
  if (next === null || defenseRefusal(state, id) !== null) return state;
  return {
    ...state,
    inventory: pay(state.inventory, next.cost),
    camps: state.camps.map((c) => (c.id === id ? { ...c, defense: c.defense + 1 } : c)),
  };
}

/** The deepest any square on the map has been dug. */
export function deepestDug(state: FrontierState): number {
  let deepest = 0;
  for (let y = 0; y < state.cube.size.y; y += 1) {
    for (let x = 0; x < state.cube.size.x; x += 1) {
      deepest = Math.max(deepest, depthAt(state.cube, x, y));
    }
  }
  return deepest;
}

/** How strong marauders would be now: from the deepest square dug (FRONTIER_RAID.strengthFromDepth). */
export function raidStrength(state: FrontierState): number {
  const deepest = deepestDug(state);
  let strength = 0;
  for (const step of FRONTIER_RAID.strengthFromDepth) {
    if (deepest >= step.depth) strength = step.strength;
  }
  return strength;
}

/** What a raid did. */
export interface Raid {
  /** The camp they came for. */
  campId: number;
  strength: number;
  defense: number;
  /** True if the camp's defenses turned them away. */
  turnedAway: boolean;
  /** What they took from the store. */
  stolen: ItemStack[];
  /** Upgrades the camp lost. */
  upgradesLost: number;
  /** Penned animals they took. */
  animalsTaken: number;
}

/**
 * The night's marauders on `state`, rolled with `rng` (which it advances):
 * see the top of this file. `raid` is `null` if none came.
 */
export function nightOfRaids(
  state: FrontierState,
  rng: RngState,
): { state: FrontierState; raid: Raid | null } {
  if (state.shift < FRONTIER_RAID.fromShift || state.camps.length === 0) {
    return { state, raid: null };
  }
  if (nextFloat(rng) >= FRONTIER_RAID.chance) {
    return { state, raid: null };
  }
  const camp = state.camps[nextInt(rng, state.camps.length)];
  if (camp === undefined) return { state, raid: null };
  const strength = raidStrength(state);
  const shortfall = strength - camp.defense;
  const base = {
    campId: camp.id,
    strength,
    defense: camp.defense,
    stolen: [] as ItemStack[],
    upgradesLost: 0,
    animalsTaken: 0,
  };
  if (shortfall <= 0) {
    return { state, raid: { ...base, turnedAway: true } };
  }
  // What they steal: a share of each goods stack, never coins.
  const share = Math.min(1, shortfall * FRONTIER_RAID.stealShare);
  const stolen: ItemStack[] = [];
  for (const [item, count] of [...state.inventory.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    if (item === FRONTIER_MARKET.coin) continue;
    const take = Math.floor(count * share);
    // `as ItemStack['item']`: every key of the store is an item id.
    if (take > 0) stolen.push({ item: item as ItemStack['item'], count: take });
  }
  const inventory = stolen.length > 0 ? pay(state.inventory, stolen) : state.inventory;
  const stripped = stripCamp(camp, shortfall * FRONTIER_RAID.upgradesPerShortfall);
  const camps = state.camps.map((c) => (c.id === camp.id ? stripped.camp : c));
  return {
    state: { ...state, inventory, camps },
    raid: {
      ...base,
      turnedAway: false,
      stolen,
      upgradesLost: stripped.taken,
      animalsTaken: stripped.animalsLost,
    },
  };
}
