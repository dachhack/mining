// Smelting and crafting (docs/plans/smelting-and-crafting.md): the smelter
// (owner, question 161), smelting raw ore into ingots (question 162), and,
// PR 3, the iron pickaxe and the copper lantern (question 163).
import { describe, expect, it } from 'vitest';
import {
  FRONTIER_LANTERN,
  FRONTIER_PICKAXE,
  FRONTIER_RECIPES,
  FRONTIER_SHIFT,
  FRONTIER_SMELTER,
} from '../../src/data/frontier';
import { campRadius, campRing, frontierAct, hasSmelter, previewTap } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { GRASS } from '../../src/engine/frontier/state';
import { actLogged, startLog, undoLast } from '../../src/engine/frontier/undo';
import { AT, MID, NEXT, rich, world } from './frontierHelpers';

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

describe('the iron pickaxe (owner, question 163)', () => {
  it('is made from the book for its inputs and 1 tap, with a smelter', () => {
    const recipe = FRONTIER_RECIPES.find((r) => r.id === 'iron-pickaxe');
    expect(recipe?.inputs).toEqual([
      { item: 'ironIngot', count: 3 },
      { item: 'wood', count: 2 },
    ]);
    const w = withSmelter({ ironIngot: 3, wood: 2 });
    const made = frontierAct(w, { kind: 'make', recipe: 'iron-pickaxe' });
    expect(made.done).toBe(true);
    expect(made.state.inventory.get(FRONTIER_PICKAXE.item)).toBe(1);
    expect(made.state.inventory.get('ironIngot') ?? 0).toBe(0);
    expect(made.state.tapsLeft).toBe(w.tapsLeft - 1);
    const noSmelter = holding(world(), { ironIngot: 3, wood: 2 });
    expect(frontierAct(noSmelter, { kind: 'make', recipe: 'iron-pickaxe' }).refusal).toBe(
      'noSmelter',
    );
  });

  it('doubles what a mining tap yields, and a second one adds nothing', () => {
    const plain = world({ top: '#' });
    const one = holding(plain, { [FRONTIER_PICKAXE.item]: 1 });
    const two = holding(plain, { [FRONTIER_PICKAXE.item]: 2 });
    const without = frontierAct(plain, { kind: 'tap', x: AT.x, y: AT.y });
    const withOne = frontierAct(one, { kind: 'tap', x: AT.x, y: AT.y });
    const withTwo = frontierAct(two, { kind: 'tap', x: AT.x, y: AT.y });
    const stone = without.state.inventory.get('stone') ?? 0;
    expect(stone).toBeGreaterThan(0);
    expect(withOne.state.inventory.get('stone')).toBe(stone * FRONTIER_PICKAXE.yieldTimes);
    expect(withTwo.state.inventory.get('stone')).toBe(stone * FRONTIER_PICKAXE.yieldTimes);
    expect(withOne.tap?.gain).toEqual([
      { item: 'stone', count: stone * FRONTIER_PICKAXE.yieldTimes },
    ]);
    // The preview agrees, and the pickaxe stays in the store.
    expect(previewTap(one, AT.x, AT.y).gain).toEqual(withOne.tap?.gain);
    expect(withOne.state.inventory.get(FRONTIER_PICKAXE.item)).toBe(1);
  });

  it('leaves taking from the surface as it is', () => {
    const w = holding(world({ everywhere: GRASS }), { [FRONTIER_PICKAXE.item]: 1 });
    const cut = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y });
    expect(cut.tap?.kind).toBe('harvested');
    const plain = frontierAct(world({ everywhere: GRASS }), { kind: 'tap', x: AT.x, y: AT.y });
    expect(cut.tap?.gain).toEqual(plain.tap?.gain);
  });
});

describe('the copper lantern (owner, question 163)', () => {
  it('is made from the book for its inputs and 1 tap, with a smelter', () => {
    const recipe = FRONTIER_RECIPES.find((r) => r.id === 'copper-lantern');
    expect(recipe?.inputs).toEqual([
      { item: 'copperIngot', count: 2 },
      { item: 'coal', count: 1 },
    ]);
    const made = frontierAct(withSmelter({ copperIngot: 2, coal: 1 }), {
      kind: 'make',
      recipe: 'copper-lantern',
    });
    expect(made.done).toBe(true);
    expect(made.state.inventory.get(FRONTIER_LANTERN.item)).toBe(1);
  });

  it('hung at a camp, for 1 tap, widens its ring and lights the squares it now reaches', () => {
    const w = holding(world(), { [FRONTIER_LANTERN.item]: 1 });
    const r = campRadius(1);
    const beyond = { x: MID + r + 1, y: MID };
    expect(frontierAct(w, { kind: 'tap', ...beyond }).refusal).toBe('fog');
    const hung = frontierAct(w, { kind: 'hangLantern', id: 1 });
    expect(hung.done).toBe(true);
    expect(hung.state.tapsLeft).toBe(w.tapsLeft - 1);
    expect(hung.state.camps[0]?.lantern).toBe(true);
    expect(hung.state.inventory.get(FRONTIER_LANTERN.item) ?? 0).toBe(0);
    const camp = hung.state.camps[0];
    expect(camp === undefined ? 0 : campRing(camp)).toBe(r + FRONTIER_LANTERN.ringBonus);
    expect(hung.state.seen[beyond.x + w.cube.size.x * beyond.y]).toBe(true);
    expect(frontierAct(hung.state, { kind: 'tap', ...beyond }).done).toBe(true);
  });

  it('stacks with the camp level', () => {
    const upgraded = frontierAct(world({ inventory: rich() }), { kind: 'upgrade', id: 1 }).state;
    const w = holding(upgraded, { [FRONTIER_LANTERN.item]: 1 });
    const hung = frontierAct(w, { kind: 'hangLantern', id: 1 }).state;
    const camp = hung.camps[0];
    expect(camp === undefined ? 0 : campRing(camp)).toBe(
      campRadius(2) + FRONTIER_LANTERN.ringBonus,
    );
  });

  it('is refused without a lantern in the store, at a camp that has one, or at a missing camp', () => {
    const w = holding(world(), { [FRONTIER_LANTERN.item]: 2 });
    expect(frontierAct(holding(world(), {}), { kind: 'hangLantern', id: 1 }).refusal).toBe('cost');
    expect(frontierAct(w, { kind: 'hangLantern', id: 99 }).refusal).toBe('missing');
    const hung = frontierAct(w, { kind: 'hangLantern', id: 1 }).state;
    const again = frontierAct(hung, { kind: 'hangLantern', id: 1 });
    expect(again.refusal).toBe('hasLantern');
    expect(again.state).toBe(hung);
  });

  it('goes with its camp when the camp is demolished', () => {
    let w = holding(world({ inventory: rich() }), { ...rich(), [FRONTIER_LANTERN.item]: 1 });
    w = frontierAct(w, { kind: 'hangLantern', id: 1 }).state;
    w = frontierAct(w, { kind: 'place', x: MID + NEXT, y: MID }).state;
    const demolished = frontierAct(w, { kind: 'demolish', id: 1 });
    expect(demolished.done).toBe(true);
    expect(demolished.state.camps.some((c) => c.lantern)).toBe(false);
    expect(demolished.state.inventory.get(FRONTIER_LANTERN.item) ?? 0).toBe(0);
  });

  it('can be undone, giving back the lantern and the tap', () => {
    const w = holding(world(), { [FRONTIER_LANTERN.item]: 1 });
    const logged = actLogged(w, startLog(w), { kind: 'hangLantern', id: 1 });
    expect(logged.outcome.done).toBe(true);
    const undone = undoLast(logged.log);
    if (undone === null || !('state' in undone)) throw new Error('undo refused');
    expect(undone.state.camps[0]?.lantern).toBe(false);
    expect(undone.state.inventory.get(FRONTIER_LANTERN.item)).toBe(1);
    expect(undone.state.tapsLeft).toBe(w.tapsLeft);
  });
});
