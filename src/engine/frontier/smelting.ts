// Smelting and crafting in the new game (docs/plans/smelting-and-crafting.md,
// PR 1 of 5): the smelter, and making what the recipe book lists.
//
// - A smelter is built at a camp of level FRONTIER_SMELTER.minLevel or more,
//   for FRONTIER_SMELTER.cost (owner, question 161). One per camp; it goes
//   with the camp when the camp is demolished.
// - Smelting (owner, after the 0.27.0 build: "you can load up to 20 ore and
//   10 coal into a smelter and each smelter produces 10 ingots per turn.
//   Smelters can be upgraded with level 2 and 3 kits you purchase at the
//   market"):
//   - a smelter is loaded from the store (`loadSmelter`), for 1 tap: as much
//     of the chosen raw ore as its room for ore takes (iron and copper share
//     it), and as much coal as its room for coal takes;
//   - each night (`nightOfSmelters`, at End shift after the workers) every
//     smelter makes up to its level's `perNight` ingots from its load, iron
//     first: FRONTIER_SMELTER.orePerBatch ore and coalPerBatch coal for
//     ingotsPerBatch ingots (owner, question 162: 2 raw ore + 1 coal make 2
//     ingots; an odd last ingot burns a whole coal). The ingots go to the store;
//   - a kit from the market takes it up a level (`upgradeSmelter`), for 1
//     tap: FRONTIER_SMELTER.kits[level - 1], up to level 3;
//   - its load and its upgrades go with the smelter (fire.ts, `stripCamp`;
//     a camp demolished).
//   Until engine 0.28.0 ingots were a recipe: 1 tap for 2.
// - A recipe (FRONTIER_RECIPES) is made from the book; some need a smelter
//   standing somewhere (the tools, the lantern, the sword).
// - A copper lantern (made from the book) is hung at a camp from its panel:
//   it leaves the store, and that camp's ring is FRONTIER_LANTERN.ringBonus
//   wider (owner, question 163). One per camp; it goes with the camp.
// Each costs 1 tap, as every action that does something does; shift.ts
// charges it. The numbers are in src/data/frontier.ts.

import { hasBuilding } from './buildings';
import { ownsUseful } from './market';
import type { ItemStack } from '../../data';
import { FRONTIER_LANTERN, FRONTIER_RECIPES, FRONTIER_SMELTER } from '../../data/frontier';
import type { FrontierRecipe } from '../../data/frontier';
import { canAfford, pay, seenWith } from './camps';
import { gained } from './surface';
import type { FrontierCamp, FrontierState } from './state';

/**
 * Why a smelter cannot be built at camp `id`, or `null` if it can:
 * - 'missing': there is no such camp;
 * - 'campLevel': the camp's level is below FRONTIER_SMELTER.minLevel;
 * - 'hasSmelter': the camp has one already;
 * - 'cost': the store does not hold FRONTIER_SMELTER.cost.
 */
export type SmelterRefusal = 'missing' | 'campLevel' | 'hasSmelter' | 'cost';

export function smelterRefusal(state: FrontierState, id: number): SmelterRefusal | null {
  const camp = state.camps.find((c) => c.id === id);
  if (camp === undefined) return 'missing';
  if (camp.level < FRONTIER_SMELTER.minLevel) return 'campLevel';
  if (camp.smelter) return 'hasSmelter';
  if (!canAfford(state.inventory, FRONTIER_SMELTER.cost)) return 'cost';
  return null;
}

/** Build a smelter at camp `id` and pay for it. If `smelterRefusal` says no, the very same state comes back. */
export function buildSmelter(state: FrontierState, id: number): FrontierState {
  if (smelterRefusal(state, id) !== null) {
    return state;
  }
  return {
    ...state,
    camps: state.camps.map((c) => (c.id === id ? { ...c, smelter: true, smelterLevel: 1 } : c)),
    inventory: pay(state.inventory, FRONTIER_SMELTER.cost),
  };
}

/** True if a smelter stands at some camp. */
export function hasSmelter(state: FrontierState): boolean {
  return state.camps.some((c) => c.smelter);
}

/** The recipe called `id`, or `null` if there is none. */
export function frontierRecipe(id: string): FrontierRecipe | null {
  return FRONTIER_RECIPES.find((r) => r.id === id) ?? null;
}

/**
 * Why recipe `id` cannot be made now, or `null` if it can:
 * - 'unknown': there is no such recipe;
 * - 'noSmelter': it needs a smelter, and no camp has one;
 * - 'noSugarShack': it needs a sugar shack, and none stands (buildings.ts);
 * - 'noSawHouse': it needs a saw house, and none stands (lumber);
 * - 'owned': it makes an item a second of which adds nothing, and the store
 *   holds one (FRONTIER_MARKET.uselessWhenHeld; owner, after the 0.17.0
 *   build: "Recipe book can hide items where it doesn't help to have a
 *   second");
 * - 'cost': the store does not hold its inputs.
 */
export type MakeRefusal =
  'unknown' | 'noSmelter' | 'noSugarShack' | 'noSawHouse' | 'owned' | 'cost';

export function makeRefusal(state: FrontierState, id: string): MakeRefusal | null {
  const recipe = frontierRecipe(id);
  if (recipe === null) return 'unknown';
  if (recipe.needsSmelter && !hasSmelter(state)) return 'noSmelter';
  if (recipe.needsSugarShack === true && !hasBuilding(state, 'sugarShack')) return 'noSugarShack';
  if (recipe.needsSawHouse === true && !hasBuilding(state, 'sawHouse')) return 'noSawHouse';
  if (ownsUseful(state, recipe.output.item)) return 'owned';
  if (!canAfford(state.inventory, recipe.inputs)) return 'cost';
  return null;
}

/** Make recipe `id` once: its inputs are paid and its output stored. If `makeRefusal` says no, the very same state comes back. */
export function makeRecipe(state: FrontierState, id: string): FrontierState {
  const recipe = frontierRecipe(id);
  if (recipe === null || makeRefusal(state, id) !== null) {
    return state;
  }
  const output: ItemStack = recipe.output;
  return { ...state, inventory: gained(pay(state.inventory, recipe.inputs), output) };
}

/**
 * Why a lantern cannot be hung at camp `id`, or `null` if it can:
 * - 'missing': there is no such camp;
 * - 'hasLantern': the camp has one already;
 * - 'cost': the store holds no lantern (FRONTIER_LANTERN.item).
 */
export type LanternRefusal = 'missing' | 'hasLantern' | 'cost';

export function lanternRefusal(state: FrontierState, id: number): LanternRefusal | null {
  const camp = state.camps.find((c) => c.id === id);
  if (camp === undefined) return 'missing';
  if (camp.lantern) return 'hasLantern';
  if ((state.inventory.get(FRONTIER_LANTERN.item) ?? 0) < 1) return 'cost';
  return null;
}

/**
 * Hang a lantern from the store at camp `id`: its ring widens, and the
 * squares it now reaches are seen. If `lanternRefusal` says no, the very
 * same state comes back.
 */
export function hangLantern(state: FrontierState, id: number): FrontierState {
  if (lanternRefusal(state, id) !== null) {
    return state;
  }
  const camps = state.camps.map((c) => (c.id === id ? { ...c, lantern: true } : c));
  return {
    ...state,
    camps,
    seen: seenWith(state.seen, camps, state.cube.size.x, state.cube.size.y),
    inventory: pay(state.inventory, [{ item: FRONTIER_LANTERN.item, count: 1 }]),
  };
}

/** A smelter's level data (FRONTIER_SMELTER.levels), or `null` for a camp with no smelter. */
function smelterData(camp: FrontierCamp): (typeof FRONTIER_SMELTER.levels)[number] | null {
  if (!camp.smelter) return null;
  return FRONTIER_SMELTER.levels[Math.max(1, camp.smelterLevel) - 1] ?? null;
}

/** What loading `ore` into camp `id`'s smelter would move from the store: the ore and the coal. */
export function loadPlan(
  state: FrontierState,
  id: number,
  ore: string,
): { ore: number; coal: number } {
  const camp = state.camps.find((c) => c.id === id);
  const data = camp === undefined ? null : smelterData(camp);
  if (camp === undefined || data === null) return { ore: 0, coal: 0 };
  if (!FRONTIER_SMELTER.smelts.some((p) => p.ore === ore)) return { ore: 0, coal: 0 };
  const oreRoom = data.ore - camp.smeltIron - camp.smeltCopper;
  const coalRoom = data.coal - camp.smeltCoal;
  return {
    ore: Math.max(0, Math.min(oreRoom, state.inventory.get(ore) ?? 0)),
    coal: Math.max(0, Math.min(coalRoom, state.inventory.get('coal') ?? 0)),
  };
}

/**
 * Why camp `id`'s smelter cannot be loaded with `ore`, or `null` if it can:
 * - 'missing': there is no such camp;
 * - 'noSmelter': the camp has no smelter;
 * - 'unknown': `ore` is not an ore a smelter takes;
 * - 'full': it has no room for more of that ore, nor for more coal;
 * - 'nothing': the store holds neither that ore nor coal that would fit.
 */
export type LoadRefusal = 'missing' | 'noSmelter' | 'unknown' | 'full' | 'nothing';

export function loadRefusal(state: FrontierState, id: number, ore: string): LoadRefusal | null {
  const camp = state.camps.find((c) => c.id === id);
  if (camp === undefined) return 'missing';
  const data = smelterData(camp);
  if (data === null) return 'noSmelter';
  if (!FRONTIER_SMELTER.smelts.some((p) => p.ore === ore)) return 'unknown';
  const plan = loadPlan(state, id, ore);
  if (plan.ore > 0 || plan.coal > 0) return null;
  const full = camp.smeltIron + camp.smeltCopper >= data.ore && camp.smeltCoal >= data.coal;
  return full ? 'full' : 'nothing';
}

/** Load camp `id`'s smelter with `ore` and coal from the store. If `loadRefusal` says no, the very same state comes back. */
export function loadSmelter(state: FrontierState, id: number, ore: string): FrontierState {
  if (loadRefusal(state, id, ore) !== null) return state;
  const plan = loadPlan(state, id, ore);
  const cost: ItemStack[] = [];
  // `as ItemStack['item']`: `ore` is one of FRONTIER_SMELTER.smelts' ores (loadRefusal checked).
  if (plan.ore > 0) cost.push({ item: ore as ItemStack['item'], count: plan.ore });
  if (plan.coal > 0) cost.push({ item: 'coal', count: plan.coal });
  return {
    ...state,
    inventory: pay(state.inventory, cost),
    camps: state.camps.map((c) =>
      c.id === id
        ? {
            ...c,
            smeltIron: c.smeltIron + (ore === 'rawIronOre' ? plan.ore : 0),
            smeltCopper: c.smeltCopper + (ore === 'rawCopperOre' ? plan.ore : 0),
            smeltCoal: c.smeltCoal + plan.coal,
          }
        : c,
    ),
  };
}

/**
 * Why camp `id`'s smelter cannot be upgraded, or `null` if it can:
 * 'missing' (no such camp), 'noSmelter', 'max' (it is at the top level),
 * 'cost' (the store does not hold the next level's kit).
 */
export type SmelterUpgradeRefusal = 'missing' | 'noSmelter' | 'max' | 'cost';

export function smelterUpgradeRefusal(
  state: FrontierState,
  id: number,
): SmelterUpgradeRefusal | null {
  const camp = state.camps.find((c) => c.id === id);
  if (camp === undefined) return 'missing';
  if (!camp.smelter) return 'noSmelter';
  const kit = FRONTIER_SMELTER.kits[Math.max(1, camp.smelterLevel) - 1];
  if (kit === undefined || camp.smelterLevel >= FRONTIER_SMELTER.levels.length) return 'max';
  return (state.inventory.get(kit) ?? 0) >= 1 ? null : 'cost';
}

/** Upgrade camp `id`'s smelter a level with its kit. If `smelterUpgradeRefusal` says no, the very same state comes back. */
export function upgradeSmelter(state: FrontierState, id: number): FrontierState {
  if (smelterUpgradeRefusal(state, id) !== null) return state;
  const camp = state.camps.find((c) => c.id === id);
  const kit = camp === undefined ? undefined : FRONTIER_SMELTER.kits[camp.smelterLevel - 1];
  if (camp === undefined || kit === undefined) return state;
  return {
    ...state,
    inventory: pay(state.inventory, [{ item: kit, count: 1 }]),
    camps: state.camps.map((c) => (c.id === id ? { ...c, smelterLevel: c.smelterLevel + 1 } : c)),
  };
}

/**
 * The night's smelting: every smelter makes up to its level's `perNight`
 * ingots from its load, iron first (see the top of this file). `smelted` is
 * what went to the store, one stack an ingot.
 */
export function nightOfSmelters(state: FrontierState): {
  state: FrontierState;
  smelted: ItemStack[];
} {
  if (!state.camps.some((c) => c.smelter && c.smeltIron + c.smeltCopper > 0 && c.smeltCoal > 0)) {
    return { state, smelted: [] };
  }
  const made = new Map<string, number>();
  const { orePerBatch, coalPerBatch, ingotsPerBatch } = FRONTIER_SMELTER;
  const camps = state.camps.map((camp) => {
    const data = smelterData(camp);
    if (data === null) return camp;
    let left = data.perNight;
    let coal = camp.smeltCoal;
    const loads: Record<string, number> = {
      rawIronOre: camp.smeltIron,
      rawCopperOre: camp.smeltCopper,
    };
    for (const pair of FRONTIER_SMELTER.smelts) {
      // Ingots this ore can give tonight: what is left of the night's count,
      // what the ore allows, and what the coal allows.
      const byOre = Math.floor(((loads[pair.ore] ?? 0) * ingotsPerBatch) / orePerBatch);
      const byCoal = Math.floor((coal * ingotsPerBatch) / coalPerBatch);
      const n = Math.min(left, byOre, byCoal);
      if (n <= 0) continue;
      loads[pair.ore] = (loads[pair.ore] ?? 0) - Math.ceil((n * orePerBatch) / ingotsPerBatch);
      coal -= Math.ceil((n * coalPerBatch) / ingotsPerBatch);
      left -= n;
      made.set(pair.ingot, (made.get(pair.ingot) ?? 0) + n);
    }
    return {
      ...camp,
      smeltIron: loads['rawIronOre'] ?? 0,
      smeltCopper: loads['rawCopperOre'] ?? 0,
      smeltCoal: coal,
    };
  });
  let inventory = state.inventory;
  const smelted: ItemStack[] = [];
  for (const pair of FRONTIER_SMELTER.smelts) {
    const n = made.get(pair.ingot) ?? 0;
    if (n <= 0) continue;
    const stack: ItemStack = { item: pair.ingot, count: n };
    smelted.push(stack);
    inventory = gained(inventory, stack);
  }
  return { state: { ...state, camps, inventory }, smelted };
}
