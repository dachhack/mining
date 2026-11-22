// UI lab 2: the recipe book (owner, after the PR #128 playtest: "We need a
// recipe book on that line. You can go into the recipe book and select which
// item or upgrade you are gathering resources for.").
//
// The recipes are made from the lab's data, so the book, the camp tool and a
// camp's panel always ask for the same things: a new camp costs
// LAB_NEW_CAMP_COST, and an upgrade to level N costs what LAB_CAMP_LEVELS
// says for level N. No DOM code here, so the unit tests run it in Node.

import type { ItemStack } from '../../data';
import { LAB_NEW_CAMP_COST } from '../../data/labCamps';
import { MAX_CAMP_LEVEL, upgradeCostFrom } from './campWorld';

export interface Recipe {
  /** A short name for code and tests: 'new-camp', 'upgrade-2', 'upgrade-3'. */
  id: string;
  /** What the book calls it. */
  name: string;
  /** The camp level it makes: 1 for a new camp, N for an upgrade to level N. */
  level: number;
  /** What it costs. */
  cost: ItemStack[];
}

/** Every recipe in the book, in order: a new camp, then each upgrade, level 2 first. */
export function labRecipes(): Recipe[] {
  const recipes: Recipe[] = [
    { id: 'new-camp', name: 'New camp', level: 1, cost: LAB_NEW_CAMP_COST },
  ];
  for (let level = 2; level <= MAX_CAMP_LEVEL; level += 1) {
    const cost = upgradeCostFrom(level - 1);
    if (cost !== null) {
      recipes.push({ id: `upgrade-${level}`, name: `Upgrade camp to level ${level}`, level, cost });
    }
  }
  return recipes;
}

/** The recipe called `id`, or `null` if there is none. */
export function recipeById(id: string): Recipe | null {
  return labRecipes().find((recipe) => recipe.id === id) ?? null;
}

/** The recipes pinned when Lab 2 opens: a new camp, as the row showed before the book. */
export const FIRST_PINS: string[] = ['new-camp'];
