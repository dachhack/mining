// UI lab 2: the recipe book (owner, after the PR #128 playtest: "We need a
// recipe book on that line. You can go into the recipe book and select which
// item or upgrade you are gathering resources for.").
//
// The recipes are made from the lab's data, so the book, the camp tool and a
// camp's panel always ask for the same things: a new camp costs
// LAB_NEW_CAMP_COST, and an upgrade to level N costs what LAB_CAMP_LEVELS
// says for level N. No DOM code here, so the unit tests run it in Node.

import type { ItemStack } from '../../data';
import { FRONTIER_RECIPES } from '../../data/frontier';
import { LAB_NEW_CAMP_COST } from '../../data/labCamps';
import { MAX_CAMP_LEVEL, upgradeCostFrom } from './campWorld';

export interface Recipe {
  /** A short name for code and tests: 'new-camp', 'upgrade-2', 'upgrade-3'. */
  id: string;
  /** What the book calls it. */
  name: string;
  /** The camp level it makes: 1 for a new camp, N for an upgrade to level N; 0 for a recipe made in the book. */
  level: number;
  /** What it costs. */
  cost: ItemStack[];
  /**
   * What it makes, for a recipe made in the book with its Make button
   * (smelting: docs/plans/smelting-and-crafting.md); `null` for a camp or an
   * upgrade, which are built on the map.
   */
  makes: ItemStack | null;
}

/** Every recipe in the book, in order: a new camp, then each upgrade, level 2 first, then what a smelter makes. */
export function labRecipes(): Recipe[] {
  const recipes: Recipe[] = [
    { id: 'new-camp', name: 'New camp', level: 1, cost: LAB_NEW_CAMP_COST, makes: null },
  ];
  for (let level = 2; level <= MAX_CAMP_LEVEL; level += 1) {
    const cost = upgradeCostFrom(level - 1);
    if (cost !== null) {
      recipes.push({
        id: `upgrade-${level}`,
        name: `Upgrade camp to level ${level}`,
        level,
        cost,
        makes: null,
      });
    }
  }
  // What a smelter makes (FRONTIER_RECIPES), after the camps.
  for (const recipe of FRONTIER_RECIPES) {
    recipes.push({
      id: recipe.id,
      name: recipe.name,
      level: 0,
      cost: recipe.inputs,
      makes: recipe.output,
    });
  }
  return recipes;
}

/** The recipe called `id`, or `null` if there is none. */
export function recipeById(id: string): Recipe | null {
  return labRecipes().find((recipe) => recipe.id === id) ?? null;
}

/** The recipes pinned when Lab 2 opens: a new camp, as the row showed before the book. */
export const FIRST_PINS: string[] = ['new-camp'];

/**
 * Where the pinned recipes are saved in the browser's localStorage, so they
 * come back when Lab 2 opens again (owner, question 143: "Pins should save
 * when you close the app").
 */
export const PINS_KEY = 'mining-game.lab2.pins';

/**
 * The pins saved as `text` (what localStorage held), or the first pins if
 * nothing was saved or what was saved cannot be read. Saved pins are a JSON
 * list of recipe ids; ids the book does not know are dropped, and each id
 * counts once. An empty list is kept: the player unpinned everything.
 */
export function parsePins(text: string | null): string[] {
  if (text === null) {
    return [...FIRST_PINS];
  }
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    return [...FIRST_PINS]; // not JSON at all
  }
  if (!Array.isArray(saved) || !saved.every((id) => typeof id === 'string')) {
    return [...FIRST_PINS]; // not a list of names
  }
  const known: string[] = [];
  for (const id of saved as string[]) {
    if (recipeById(id) !== null && !known.includes(id)) {
      known.push(id);
    }
  }
  // A non-empty list with no id the book knows is not a real choice: start over.
  return known.length === 0 && saved.length > 0 ? [...FIRST_PINS] : known;
}
