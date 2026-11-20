// Scenario tests for field crafting (design doc 7.1; 0005 item 18).

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, AVATAR, FIELD_RECIPES } from '../../src/data';
import { applyAction } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { carriedWeight } from '../../src/engine/inventory';
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
  it('has the four field recipes of design doc 7.1, each 1 AP (no ladder: issue #80)', () => {
    expect(FIELD_RECIPES.map((recipe) => recipe.id)).toEqual([
      'support',
      'torch',
      'fuel',
      'lampOil',
    ]);
    expect(ACTION_COSTS.craft).toBe(1);
    expect(AVATAR.carryCapacity).toBe(20);
  });
});

describe('crafting each recipe', () => {
  it('support: 1 timber and 1 stone become 1 support, for 1 AP', () => {
    const state = surfaceState({ ap: 5, inventory: { timber: 1, stone: 2 } });
    const { state: after, events } = act(state, { type: 'craft', recipe: 'support' });
    expect(after.inventory).toEqual({ timber: 0, stone: 1, support: 1 });
    expect(after.ap).toBe(4);
    expect(events).toEqual([
      { type: 'crafted', recipe: 'support' },
      { type: 'itemGained', item: 'support', count: 1 },
    ]);
  });

  it('torch: 1 timber and 1 coal become 1 torch, for 1 AP', () => {
    const state = surfaceState({ ap: 5, inventory: { timber: 1, coal: 1 } });
    const { state: after, events } = act(state, { type: 'craft', recipe: 'torch' });
    expect(after.inventory).toEqual({ timber: 0, coal: 0, torch: 1 });
    expect(after.ap).toBe(4);
    expect(events).toEqual([
      { type: 'crafted', recipe: 'torch' },
      { type: 'itemGained', item: 'torch', count: 1 },
    ]);
  });

  it('fuel: 1 coal adds 3 to the fuel gauge, for 1 AP, and no item', () => {
    const state = surfaceState({ ap: 5, fuel: 4, lampOil: 2, inventory: { coal: 2 } });
    const { state: after, events } = act(state, { type: 'craft', recipe: 'fuel' });
    expect(after.inventory).toEqual({ coal: 1 });
    expect(after.fuel).toBe(7);
    expect(after.lampOil).toBe(2);
    expect(after.ap).toBe(4);
    expect(events).toEqual([
      { type: 'crafted', recipe: 'fuel' },
      { type: 'fuelChanged', delta: 3, fuel: 7, reason: 'crafted' },
    ]);
  });

  it('lamp oil: 1 coal adds 2 to the lamp-oil gauge, for 1 AP, and no item', () => {
    const state = surfaceState({ ap: 5, fuel: 4, lampOil: 2, inventory: { coal: 2 } });
    const { state: after, events } = act(state, { type: 'craft', recipe: 'lampOil' });
    expect(after.inventory).toEqual({ coal: 1 });
    expect(after.lampOil).toBe(4);
    expect(after.fuel).toBe(4);
    expect(after.ap).toBe(4);
    expect(events).toEqual([
      { type: 'crafted', recipe: 'lampOil' },
      { type: 'lampOilChanged', delta: 2, lampOil: 4, reason: 'crafted' },
    ]);
  });

  it('does not change the state it was given', () => {
    const state = surfaceState({ inventory: { coal: 1 } });
    act(state, { type: 'craft', recipe: 'fuel' });
    expect(state.inventory).toEqual({ coal: 1 });
    expect(state.fuel).toBe(10);
  });
});

describe('when a craft is legal', () => {
  it('lists every recipe the avatar has the materials for, in recipe order', () => {
    const state = surfaceState({ inventory: { timber: 1, stone: 1, coal: 1 } });
    expect(craftable(state)).toEqual(['support', 'torch', 'fuel', 'lampOil']);
  });

  it('refuses each recipe without its materials', () => {
    expect(craftable(surfaceState({ inventory: {} }))).toEqual([]);
    // Timber only: no stone for a support, no coal for a torch.
    expect(craftable(surfaceState({ inventory: { timber: 1 } }))).toEqual([]);
    // Coal only: the two gauge recipes.
    expect(craftable(surfaceState({ inventory: { coal: 1 } }))).toEqual(['fuel', 'lampOil']);
    // Stone only: nothing.
    expect(craftable(surfaceState({ inventory: { stone: 3 } }))).toEqual([]);
    // Timber and stone: no coal, so no torch, fuel or lamp oil.
    expect(craftable(surfaceState({ inventory: { timber: 1, stone: 1 } }))).toEqual(['support']);
    // A count of 0 is not "having" the item.
    expect(craftable(surfaceState({ inventory: { timber: 0, coal: 0 } }))).toEqual([]);
  });

  it('refuses every recipe without the AP, and applyAction throws', () => {
    const state = surfaceState({ ap: 0, inventory: { timber: 1, stone: 1, coal: 1 } });
    expect(craftable(state)).toEqual([]);
    for (const recipe of FIELD_RECIPES) {
      expect(() =>
        applyAction(state, { type: 'craft', recipe: recipe.id, ap: ACTION_COSTS.craft }),
      ).toThrow('Not a legal action');
    }
  });

  it('applyAction throws for a recipe whose materials are missing', () => {
    const state = surfaceState({ inventory: { timber: 1 } });
    expect(() => applyAction(state, { type: 'craft', recipe: 'torch', ap: 1 })).toThrow(
      'Not a legal action',
    );
  });

  it('does not enforce the carry limit (decision note 0026)', () => {
    // With no miner there is no way to drop anything, so a load over the
    // limit must not stop the player crafting fuel. 10 stone (20) + 1 timber
    // + 2 coal = 23, over the limit of 20.
    const over = surfaceState({ inventory: { stone: 10, timber: 1, coal: 2 } });
    expect(carriedWeight(over)).toBe(23);
    expect(craftable(over)).toEqual(['support', 'torch', 'fuel', 'lampOil']);
  });
});
