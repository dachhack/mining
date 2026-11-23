// UI lab 2: the recipe book's recipes come from the lab's data.
import { describe, expect, it } from 'vitest';
import { FRONTIER_RECIPES } from '../../src/data/frontier';
import { LAB_CAMP_LEVELS, LAB_NEW_CAMP_COST } from '../../src/data/labCamps';
import { MAX_CAMP_LEVEL, upgradeCostFrom } from '../../src/app/lab/campWorld';
import { FIRST_PINS, labRecipes, parsePins, recipeById } from '../../src/app/lab/recipes';

describe('the recipe book', () => {
  it('holds a new camp, then an upgrade to each level above 1, then what a smelter makes, in order', () => {
    expect(labRecipes().map((r) => r.id)).toEqual([
      'new-camp',
      'upgrade-2',
      'upgrade-3',
      'upgrade-4',
      ...FRONTIER_RECIPES.map((r) => r.id),
    ]);
    expect(labRecipes().filter((r) => r.makes === null)).toHaveLength(MAX_CAMP_LEVEL);
  });

  it('asks for what smelting takes, and says what it makes: one source, src/data', () => {
    for (const made of FRONTIER_RECIPES) {
      const recipe = recipeById(made.id);
      expect(recipe?.cost).toBe(made.inputs);
      expect(recipe?.makes).toBe(made.output);
      expect(recipe?.level).toBe(0);
    }
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

describe('saved pins (owner, question 143: "Pins should save when you close the app")', () => {
  it('read back what was saved, in order', () => {
    expect(parsePins(JSON.stringify(['upgrade-2', 'new-camp']))).toEqual(['upgrade-2', 'new-camp']);
  });

  it('keep an empty list: the player unpinned everything', () => {
    expect(parsePins('[]')).toEqual([]);
  });

  it('fall back to the first pins when nothing was saved', () => {
    expect(parsePins(null)).toEqual(FIRST_PINS);
  });

  it('fall back to the first pins when what was saved is bad', () => {
    for (const bad of [
      '',
      'not json',
      '{"pins":1}',
      '"new-camp"',
      '[1, 2]',
      '[null]',
      '["nope"]',
    ]) {
      expect(parsePins(bad), bad).toEqual(FIRST_PINS);
    }
  });

  it('drop ids the book does not know, and repeats', () => {
    expect(parsePins(JSON.stringify(['upgrade-3', 'gone', 'upgrade-3', 'new-camp']))).toEqual([
      'upgrade-3',
      'new-camp',
    ]);
  });

  it('never hand out the shared first-pins list itself', () => {
    const pins = parsePins(null);
    pins.push('upgrade-2');
    expect(FIRST_PINS).toEqual(['new-camp']);
  });
});
