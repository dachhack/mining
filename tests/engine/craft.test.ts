// Scenario tests for field crafting (design doc 7.1). Materials come from
// the stockpile and what is made goes into it (design doc 4.1).

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, FIELD_RECIPES } from '../../src/data';
import { applyAction } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { act, buildState, findActions } from './helpers';
import type { BuildStateOptions } from './helpers';

/** A one-layer stone cube with the avatar on the surface. */
function surfaceState(options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({ layers: [['##', '##']], revealAll: true, ...options });
}

/** The ids of the recipes that can be crafted now, in list order. */
function craftable(state: GameState): string[] {
  return findActions(state, { type: 'craft' }).map((action) =>
    action.type === 'craft' ? action.recipe : '',
  );
}

describe('the data these scenarios assume', () => {
  it('has the two field recipes of design doc 7.1, each 1 AP (no torch or lamp oil: issue #89)', () => {
    expect(FIELD_RECIPES.map((recipe) => recipe.id)).toEqual(['support', 'fuel']);
    expect(ACTION_COSTS.craft).toBe(1);
  });
});

describe('crafting each recipe', () => {
  it('support: 1 timber and 1 stone become 1 support, for 1 AP', () => {
    const state = surfaceState({ ap: 5, stockpile: { timber: 1, stone: 2 } });
    const { state: after, events } = act(state, { type: 'craft', recipe: 'support' });
    expect(after.stockpile).toEqual({ timber: 0, stone: 1, support: 1 });
    expect(after.ap).toBe(4);
    expect(events).toEqual([
      { type: 'crafted', recipe: 'support' },
      { type: 'itemGained', item: 'support', count: 1 },
    ]);
  });

  it('fuel: 1 coal adds 3 to the fuel gauge, for 1 AP, and no item', () => {
    const state = surfaceState({ ap: 5, fuel: 4, stockpile: { coal: 2 } });
    const { state: after, events } = act(state, { type: 'craft', recipe: 'fuel' });
    expect(after.stockpile).toEqual({ coal: 1 });
    expect(after.fuel).toBe(7);
    expect(after.ap).toBe(4);
    expect(events).toEqual([
      { type: 'crafted', recipe: 'fuel' },
      { type: 'fuelChanged', delta: 3, fuel: 7, reason: 'crafted' },
    ]);
  });

  it('does not change the state it was given', () => {
    const state = surfaceState({ stockpile: { coal: 1 } });
    act(state, { type: 'craft', recipe: 'fuel' });
    expect(state.stockpile).toEqual({ coal: 1 });
    expect(state.fuel).toBe(10);
  });
});

describe('when a craft is legal', () => {
  it('lists every recipe the stockpile has the materials for, in recipe order', () => {
    const state = surfaceState({ stockpile: { timber: 1, stone: 1, coal: 1 } });
    expect(craftable(state)).toEqual(['support', 'fuel']);
  });

  it('refuses each recipe without its materials', () => {
    expect(craftable(surfaceState({ stockpile: {} }))).toEqual([]);
    // Timber only: no stone for a support.
    expect(craftable(surfaceState({ stockpile: { timber: 1 } }))).toEqual([]);
    // Coal only: fuel.
    expect(craftable(surfaceState({ stockpile: { coal: 1 } }))).toEqual(['fuel']);
    // Stone only: nothing.
    expect(craftable(surfaceState({ stockpile: { stone: 3 } }))).toEqual([]);
    // Timber and stone: no coal, so no fuel.
    expect(craftable(surfaceState({ stockpile: { timber: 1, stone: 1 } }))).toEqual(['support']);
    // A count of 0 is not "having" the item.
    expect(craftable(surfaceState({ stockpile: { timber: 0, coal: 0 } }))).toEqual([]);
  });

  it('refuses every recipe without the AP, and applyAction throws', () => {
    const state = surfaceState({ ap: 0, stockpile: { timber: 1, stone: 1, coal: 1 } });
    expect(craftable(state)).toEqual([]);
    for (const recipe of FIELD_RECIPES) {
      expect(() =>
        applyAction(state, { type: 'craft', recipe: recipe.id, ap: ACTION_COSTS.craft }),
      ).toThrow('Not a legal action');
    }
  });

  it('applyAction throws for a recipe whose materials are missing', () => {
    const state = surfaceState({ stockpile: { timber: 1 } });
    expect(() => applyAction(state, { type: 'craft', recipe: 'support', ap: 1 })).toThrow(
      'Not a legal action',
    );
  });

  it('the stockpile has no limit: a craft is never refused for want of room (issue #92)', () => {
    // Far more than the old carry capacity of 20 (10 stone alone weighed 20).
    const full = surfaceState({ stockpile: { stone: 500, timber: 300, coal: 200 } });
    expect(craftable(full)).toEqual(['support', 'fuel']);
    const { state: after, events } = act(full, { type: 'craft', recipe: 'support' });
    // The support went into the stockpile; nothing was left lying anywhere.
    expect(after.stockpile).toEqual({ stone: 499, timber: 299, coal: 200, support: 1 });
    expect(events).toEqual([
      { type: 'crafted', recipe: 'support' },
      { type: 'itemGained', item: 'support', count: 1 },
    ]);
  });
});
