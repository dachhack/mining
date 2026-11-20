// All gameplay data in one place. The engine and the tools import from here.

import { BLOCKS } from './blocks';
import { CREW } from './crew';
import { GENERATION } from './generation';
import { ITEMS } from './items';
import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, LOADOUTS } from './loadouts';
import { CAMPS, CAMP_TOOLS } from './camps';
import { HAZARDS } from './hazards';
import { CAMP_RECIPES, FIELD_RECIPES, GAUGES } from './recipes';
import { ACTION_COSTS, SHIFT } from './shift';
import { STRUCTURES } from './structures';
import { TELLS } from './tells';
import type { BlockDef, GameData, ItemDef, LoadoutDef, RecipeDef } from './types';
import { WORLD } from './world';

export { BLOCKS } from './blocks';
export type { BlockId } from './blocks';
export { CREW } from './crew';
export { GENERATION } from './generation';
export { ITEMS } from './items';
export type { ItemId } from './items';
export { CONTRACT_IDS, DEFAULT_LOADOUT_ID, LOADOUTS } from './loadouts';
export type { LoadoutId } from './loadouts';
export { CAMPS, CAMP_TOOLS } from './camps';
export { HAZARDS } from './hazards';
export { CAMP_RECIPES, FIELD_RECIPES, GAUGES } from './recipes';
export type { GaugeId } from './recipes';
export { ACTION_COSTS, SHIFT } from './shift';
export { NO_STRUCTURE, STRUCTURES } from './structures';
// The surface forest (issue #70): kinds, cutting, regrowth, generation.
export { SURFACE, surfaceKindByCode, validateSurfaceData } from './surface';
export type { SurfaceData, SurfaceGenerationData, SurfaceKindDef, SurfaceKinds } from './surface';
export type { StructureId } from './structures';
export { TELLS } from './tells';
export { WORLD } from './world';
export { validateData } from './validate';
export type * from './types';

/** Every table, gathered for `validateData`. */
export const GAME_DATA: GameData = {
  world: WORLD,
  generation: GENERATION,
  blocks: BLOCKS,
  items: ITEMS,
  structures: STRUCTURES,
  gauges: GAUGES,
  recipes: FIELD_RECIPES,
  campRecipes: CAMP_RECIPES,
  hazards: HAZARDS,
  camps: CAMPS,
  campTools: CAMP_TOOLS,
  crew: CREW,
  tells: TELLS,
  shift: SHIFT,
  actionCosts: ACTION_COSTS,
  loadouts: LOADOUTS,
  defaultLoadoutId: DEFAULT_LOADOUT_ID,
  contractIds: CONTRACT_IDS,
};

// Lookups by a value that is only known at run time. Each throws on an
// unknown value instead of returning `undefined`, so a bad id fails loudly at
// the place it is used.

const BLOCK_BY_CODE: (BlockDef | undefined)[] = [];
for (const def of Object.values(BLOCKS)) {
  BLOCK_BY_CODE[def.code] = def;
}

/** The definition of the block with this code (the number stored in the cube). */
export function blockDefByCode(code: number): BlockDef {
  const def = BLOCK_BY_CODE[code];
  if (def === undefined) {
    throw new Error(`Unknown block code: ${code}`);
  }
  return def;
}

/** The definition of the item with this id. */
export function itemDef(itemId: string): ItemDef {
  // `Record<string, ItemDef>` tells TypeScript the table may be indexed by any
  // string; with our compiler settings the result is then `ItemDef | undefined`.
  const table: Record<string, ItemDef> = ITEMS;
  // `Object.hasOwn` is Python's `key in dict`. A bare `table[itemId]` would
  // also find names every object inherits, such as "toString".
  const def = Object.hasOwn(table, itemId) ? table[itemId] : undefined;
  if (def === undefined) {
    throw new Error(`Unknown item id: ${itemId}`);
  }
  return def;
}

/** The loadout with this id, or `undefined` if there is none. */
export function findLoadout(loadoutId: string): LoadoutDef | undefined {
  const table: Record<string, LoadoutDef> = LOADOUTS;
  return Object.hasOwn(table, loadoutId) ? table[loadoutId] : undefined;
}

/** The field recipe with this id, or `undefined` if there is none. */
export function findRecipe(recipeId: string): RecipeDef | undefined {
  return FIELD_RECIPES.find((recipe) => recipe.id === recipeId);
}

/** The camp recipe with this id, or `undefined` if there is none. */
export function findCampRecipe(recipeId: string): RecipeDef | undefined {
  return CAMP_RECIPES.find((recipe) => recipe.id === recipeId);
}
