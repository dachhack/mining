// Smelting and crafting, PR 1 (docs/plans/smelting-and-crafting.md): the
// smelter (owner, question 161) and smelting raw ore into ingots (question 162).
import { describe, expect, it } from 'vitest';
import { FRONTIER_RECIPES, FRONTIER_SHIFT, FRONTIER_SMELTER } from '../../src/data/frontier';
import { frontierAct, hasSmelter } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { actLogged, startLog, undoLast } from '../../src/engine/frontier/undo';
import { MID, NEXT, rich, world } from './frontierHelpers';

/** `state` holding `inventory` instead. */
function holding(state: FrontierState, inventory: Record<string, number>): FrontierState {
  return { ...state, inventory: new Map(Object.entries(inventory)) };
}

/** A world whose first camp is at level 2 and has a smelter, holding `inventory`. */
function withSmelter(inventory: Record<string, number>): FrontierState {
  const upgraded = frontierAct(world({ inventory: rich() }), { kind: 'upgrade', id: 1 }).state;
  const built = frontierAct(upgraded, { kind: 'buildSmelter', id: 1 });
  expect(built.done).toBe(true);
  return holding(built.state, inventory);
}

describe('the smelter (owner, question 161)', () => {
  it('is built at a camp of level 2 or more, for its cost and 1 tap', () => {
    const w = world({ inventory: rich() });
    // Level 1: refused, and nothing changes.
    const low = frontierAct(w, { kind: 'buildSmelter', id: 1 });
    expect(low.done).toBe(false);
    expect(low.refusal).toBe('campLevel');
    expect(low.state).toBe(w);
    const upgraded = frontierAct(w, { kind: 'upgrade', id: 1 }).state;
    expect(upgraded.camps[0]?.level).toBe(FRONTIER_SMELTER.minLevel);
    const built = frontierAct(upgraded, { kind: 'buildSmelter', id: 1 });
    expect(built.done).toBe(true);
    expect(built.state.camps[0]?.smelter).toBe(true);
    expect(built.state.tapsLeft).toBe(upgraded.tapsLeft - 1);
    for (const stack of FRONTIER_SMELTER.cost) {
      expect(built.state.inventory.get(stack.item) ?? 0).toBe(
        (upgraded.inventory.get(stack.item) ?? 0) - stack.count,
      );
    }
    // One per camp.
    expect(frontierAct(built.state, { kind: 'buildSmelter', id: 1 }).refusal).toBe('hasSmelter');
  });

  it('is refused without its cost, or at a camp that does not stand', () => {
    const upgraded = frontierAct(world({ inventory: rich() }), { kind: 'upgrade', id: 1 }).state;
    const poor = holding(upgraded, {});
    expect(frontierAct(poor, { kind: 'buildSmelter', id: 1 }).refusal).toBe('cost');
    expect(frontierAct(upgraded, { kind: 'buildSmelter', id: 99 }).refusal).toBe('missing');
  });

  it('goes with its camp when the camp is demolished', () => {
    let w = withSmelter(rich());
    w = frontierAct(w, { kind: 'place', x: MID + NEXT, y: MID }).state;
    const demolished = frontierAct(w, { kind: 'demolish', id: 1 });
    expect(demolished.done).toBe(true);
    expect(hasSmelter(demolished.state)).toBe(false);
    expect(frontierAct(demolished.state, { kind: 'make', recipe: 'smelt-iron' }).refusal).toBe(
      'noSmelter',
    );
  });
});

describe('smelting (owner, question 162: 2 raw ore + 1 coal make 2 ingots)', () => {
  it('turns raw ore and coal into ingots, for 1 tap', () => {
    for (const recipe of FRONTIER_RECIPES) {
      const have: Record<string, number> = {};
      for (const stack of recipe.inputs) have[stack.item] = stack.count + 1;
      const w = withSmelter(have);
      const made = frontierAct(w, { kind: 'make', recipe: recipe.id });
      expect(made.done).toBe(true);
      expect(made.state.tapsLeft).toBe(w.tapsLeft - 1);
      for (const stack of recipe.inputs) expect(made.state.inventory.get(stack.item)).toBe(1);
      expect(made.state.inventory.get(recipe.output.item)).toBe(recipe.output.count);
    }
    const iron = FRONTIER_RECIPES.find((r) => r.id === 'smelt-iron');
    expect(iron?.inputs).toEqual([
      { item: 'rawIronOre', count: 2 },
      { item: 'coal', count: 1 },
    ]);
    expect(iron?.output).toEqual({ item: 'ironIngot', count: 2 });
  });

  it('is refused with no smelter, short of an input, or for a recipe that does not exist', () => {
    const noSmelter = holding(world(), { rawIronOre: 9, coal: 9 });
    expect(frontierAct(noSmelter, { kind: 'make', recipe: 'smelt-iron' }).refusal).toBe(
      'noSmelter',
    );
    const short = withSmelter({ rawIronOre: 1, coal: 9 });
    const refused = frontierAct(short, { kind: 'make', recipe: 'smelt-iron' });
    expect(refused.refusal).toBe('cost');
    expect(refused.state).toBe(short);
    expect(frontierAct(short, { kind: 'make', recipe: 'gold' }).refusal).toBe('unknown');
  });

  it('can be undone, giving back the ore, the coal and the tap', () => {
    const w = withSmelter({ rawCopperOre: 2, coal: 1 });
    const logged = actLogged(w, startLog(w), { kind: 'make', recipe: 'smelt-copper' });
    expect(logged.outcome.state.inventory.get('copperIngot')).toBe(2);
    const undone = undoLast(logged.log);
    expect(undone !== null && 'state' in undone).toBe(true);
    if (undone === null || !('state' in undone)) return;
    expect(undone.state.inventory.get('copperIngot') ?? 0).toBe(0);
    expect(undone.state.inventory.get('rawCopperOre')).toBe(2);
    expect(undone.state.tapsLeft).toBe(w.tapsLeft);
    expect(undone.state.tapsLeft).toBeLessThanOrEqual(FRONTIER_SHIFT.taps);
  });
});
