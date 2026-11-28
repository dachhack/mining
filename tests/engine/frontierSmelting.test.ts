// Smelting and crafting (docs/plans/smelting-and-crafting.md): the smelter
// (owner, question 161), smelting raw ore into ingots (question 162), and,
// PR 3, the iron pickaxe and the copper lantern (question 163).
import { describe, expect, it } from 'vitest';
import {
  FRONTIER_LANTERN,
  FRONTIER_MARKET,
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
    expect(frontierAct(demolished.state, { kind: 'make', recipe: 'iron-pickaxe' }).refusal).toBe(
      'noSmelter',
    );
  });
});

describe('loading a smelter (owner, after the 0.27.0 build)', () => {
  // "Let's have you can load up to 20 ore and 10 coal into a smelter and each
  // smelter produces 10 ingots per turn. Smelters can be upgraded with level
  // 2 and 3 kits you purchase at the market." Asked: the tap-to-smelt recipe
  // goes; the ratio stays (2 ore + 1 coal make 2 ingots); loading is 1 tap.
  const L1 = FRONTIER_SMELTER.levels[0];
  if (L1 === undefined) throw new Error('the smelter has a first level');

  it('holds 20 ore and 10 coal and makes 10 ingots a night at level 1; 40/20/20 and 60/30/30 above', () => {
    expect(FRONTIER_SMELTER.levels).toEqual([
      { ore: 20, coal: 10, perNight: 10 },
      { ore: 40, coal: 20, perNight: 20 },
      { ore: 60, coal: 30, perNight: 30 },
    ]);
    // The tap-to-smelt recipes are gone.
    expect(FRONTIER_RECIPES.some((r) => r.id.startsWith('smelt-'))).toBe(false);
    expect(
      frontierAct(withSmelter({ rawIronOre: 9, coal: 9 }), { kind: 'make', recipe: 'smelt-iron' })
        .refusal,
    ).toBe('unknown');
  });

  it('is loaded from the store, as far as it holds, for 1 tap', () => {
    const w = withSmelter({ rawIronOre: 50, rawCopperOre: 5, coal: 50 });
    const loaded = frontierAct(w, { kind: 'loadSmelter', id: 1, ore: 'rawIronOre' });
    expect(loaded.done, loaded.refusal ?? '').toBe(true);
    expect(loaded.state.tapsLeft).toBe(w.tapsLeft - 1);
    expect(loaded.state.camps[0]).toMatchObject({ smeltIron: 20, smeltCopper: 0, smeltCoal: 10 });
    expect(loaded.state.inventory.get('rawIronOre')).toBe(30);
    expect(loaded.state.inventory.get('coal')).toBe(40);
    // Full: nothing more goes in.
    expect(
      frontierAct(loaded.state, { kind: 'loadSmelter', id: 1, ore: 'rawCopperOre' }).refusal,
    ).toBe('full');
    // Iron and copper share the ore's room.
    const some = withSmelter({ rawIronOre: 12, rawCopperOre: 30, coal: 3 });
    const iron = frontierAct(some, { kind: 'loadSmelter', id: 1, ore: 'rawIronOre' }).state;
    expect(iron.camps[0]).toMatchObject({ smeltIron: 12, smeltCopper: 0, smeltCoal: 3 });
    const both = frontierAct(iron, { kind: 'loadSmelter', id: 1, ore: 'rawCopperOre' }).state;
    expect(both.camps[0]).toMatchObject({ smeltIron: 12, smeltCopper: 8, smeltCoal: 3 });
    expect(both.inventory.get('rawCopperOre')).toBe(22);
  });

  it('is refused with no smelter there, nothing to load, or no such camp', () => {
    const none = holding(world(), { rawIronOre: 9, coal: 9 });
    expect(frontierAct(none, { kind: 'loadSmelter', id: 1, ore: 'rawIronOre' }).refusal).toBe(
      'noSmelter',
    );
    expect(frontierAct(none, { kind: 'loadSmelter', id: 9, ore: 'rawIronOre' }).refusal).toBe(
      'missing',
    );
    const empty = withSmelter({});
    const refused = frontierAct(empty, { kind: 'loadSmelter', id: 1, ore: 'rawIronOre' });
    expect(refused.refusal).toBe('nothing');
    expect(refused.state).toBe(empty);
  });

  it('makes up to 10 ingots a night: 2 ore and 1 coal for 2 ingots, iron first', () => {
    const w = withSmelter({ rawIronOre: 6, rawCopperOre: 14, coal: 10, wood: 9, apple: 9 });
    let s = frontierAct(w, { kind: 'loadSmelter', id: 1, ore: 'rawIronOre' }).state;
    s = frontierAct(s, { kind: 'loadSmelter', id: 1, ore: 'rawCopperOre' }).state;
    expect(s.camps[0]).toMatchObject({ smeltIron: 6, smeltCopper: 14, smeltCoal: 10 });
    const night = frontierAct(s, { kind: 'endShift' });
    expect(night.report?.smelted).toEqual([
      { item: 'ironIngot', count: 6 },
      { item: 'copperIngot', count: 4 },
    ]);
    expect(night.state.inventory.get('ironIngot')).toBe(6);
    expect(night.state.inventory.get('copperIngot')).toBe(4);
    expect(night.state.camps[0]).toMatchObject({ smeltIron: 0, smeltCopper: 10, smeltCoal: 5 });
    // The second night finishes the load.
    const two = frontierAct({ ...night.state, marketOpen: false }, { kind: 'endShift' });
    expect(two.report?.smelted).toEqual([{ item: 'copperIngot', count: 10 }]);
    expect(two.state.camps[0]).toMatchObject({ smeltIron: 0, smeltCopper: 0, smeltCoal: 0 });
    // Nothing loaded: nothing made.
    const three = frontierAct({ ...two.state, marketOpen: false }, { kind: 'endShift' });
    expect(three.report?.smelted).toEqual([]);
  });

  it('makes only what its coal allows', () => {
    const w = withSmelter({ rawIronOre: 20, coal: 2, wood: 9, apple: 9 });
    const s = frontierAct(w, { kind: 'loadSmelter', id: 1, ore: 'rawIronOre' }).state;
    const night = frontierAct(s, { kind: 'endShift' });
    expect(night.report?.smelted).toEqual([{ item: 'ironIngot', count: 4 }]);
    expect(night.state.camps[0]).toMatchObject({ smeltIron: 16, smeltCoal: 0 });
  });

  it('is upgraded with a kit from the market, for 1 tap: bigger and faster', () => {
    // The kits are sold: level 2 from a level-3 camp, level 3 from contract stage 4.
    const lots = FRONTIER_MARKET.buyPrices;
    expect(lots.find((l) => l.item === 'smelterKit2')).toMatchObject({ coins: 150, fromLevel: 3 });
    expect(lots.find((l) => l.item === 'smelterKit3')).toMatchObject({ coins: 400, fromStage: 4 });
    const w = withSmelter({
      smelterKit2: 1,
      smelterKit3: 1,
      rawIronOre: 99,
      coal: 99,
      wood: 9,
      apple: 9,
    });
    expect(w.camps[0]?.smelterLevel).toBe(1);
    const two = frontierAct(w, { kind: 'upgradeSmelter', id: 1 });
    expect(two.done, two.refusal ?? '').toBe(true);
    expect(two.state.tapsLeft).toBe(w.tapsLeft - 1);
    expect(two.state.camps[0]?.smelterLevel).toBe(2);
    expect(two.state.inventory.get('smelterKit2') ?? 0).toBe(0);
    const three = frontierAct(two.state, { kind: 'upgradeSmelter', id: 1 }).state;
    expect(three.camps[0]?.smelterLevel).toBe(3);
    expect(frontierAct(three, { kind: 'upgradeSmelter', id: 1 }).refusal).toBe('max');
    // Level 3 holds 60 ore and 30 coal, and makes 30 a night.
    const loaded = frontierAct(three, { kind: 'loadSmelter', id: 1, ore: 'rawIronOre' }).state;
    expect(loaded.camps[0]).toMatchObject({ smeltIron: 60, smeltCoal: 30 });
    const night = frontierAct(loaded, { kind: 'endShift' });
    expect(night.report?.smelted).toEqual([{ item: 'ironIngot', count: 30 }]);
    // Without the kit: refused. The level-3 kit is no use to a level-1 smelter.
    expect(frontierAct(withSmelter({}), { kind: 'upgradeSmelter', id: 1 }).refusal).toBe('cost');
    expect(
      frontierAct(withSmelter({ smelterKit3: 1 }), { kind: 'upgradeSmelter', id: 1 }).refusal,
    ).toBe('cost');
    expect(
      frontierAct(holding(world(), { smelterKit2: 1 }), { kind: 'upgradeSmelter', id: 1 }).refusal,
    ).toBe('noSmelter');
  });

  it('loses its load and its upgrades with the smelter', () => {
    let w = withSmelter({ ...rich(), smelterKit2: 1, rawIronOre: 30, coal: 30 });
    w = frontierAct(w, { kind: 'upgradeSmelter', id: 1 }).state;
    w = frontierAct(w, { kind: 'loadSmelter', id: 1, ore: 'rawIronOre' }).state;
    w = frontierAct(w, { kind: 'place', x: MID + NEXT, y: MID }).state;
    const demolished = frontierAct(w, { kind: 'demolish', id: 1 });
    expect(demolished.done).toBe(true);
    expect(hasSmelter(demolished.state)).toBe(false);
  });

  it('a load can be undone, giving back the ore, the coal and the tap', () => {
    const w = withSmelter({ rawCopperOre: 2, coal: 1 });
    const logged = actLogged(w, startLog(w), { kind: 'loadSmelter', id: 1, ore: 'rawCopperOre' });
    expect(logged.outcome.state.camps[0]?.smeltCopper).toBe(2);
    const undone = undoLast(logged.log);
    expect(undone !== null && 'state' in undone).toBe(true);
    if (undone === null || !('state' in undone)) return;
    expect(undone.state.inventory.get('rawCopperOre')).toBe(2);
    expect(undone.state.camps[0]?.smeltCopper).toBe(0);
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
    // Stone: a level-2 camp mines it (progression plan section 2.2).
    const plainBase = world({ top: '#' });
    const plain = { ...plainBase, camps: plainBase.camps.map((c) => ({ ...c, level: 2 })) };
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
