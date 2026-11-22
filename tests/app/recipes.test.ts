// UI lab 2: the recipe book's recipes come from the lab's data.
import { describe, expect, it } from 'vitest';
import { LAB_CAMP_LEVELS, LAB_NEW_CAMP_COST } from '../../src/data/labCamps';
import { MAX_CAMP_LEVEL, upgradeCostFrom } from '../../src/app/lab/campWorld';
import { FIRST_PINS, labRecipes, recipeById } from '../../src/app/lab/recipes';

describe('the recipe book', () => {
  it('holds a new camp, then an upgrade to each level above 1, in order', () => {
    expect(labRecipes().map((r) => r.id)).toEqual(['new-camp', 'upgrade-2', 'upgrade-3']);
    expect(labRecipes()).toHaveLength(MAX_CAMP_LEVEL);
  });

  it('asks for exactly what the camp tool and the upgrades cost: one source, src/data', () => {
    expect(recipeById('new-camp')?.cost).toBe(LAB_NEW_CAMP_COST);
    for (let level = 2; level <= MAX_CAMP_LEVEL; level += 1) {
      const recipe = recipeById(`upgrade-${level}`);
      expect(recipe?.cost).toEqual(upgradeCostFrom(level - 1));
      expect(recipe?.cost).toBe(LAB_CAMP_LEVELS[level - 1]?.upgradeCost);
      expect(recipe?.level).toBe(level);
    }
  });

  it('pins a new camp at first, and knows no recipe it was not given', () => {
    expect(FIRST_PINS).toEqual(['new-camp']);
    expect(recipeById('upgrade-9')).toBeNull();
  });
});
