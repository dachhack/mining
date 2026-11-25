// The axe, the saw house, maple trees and the sugar shack (owner, after the
// 0.17.0 build: "Let's add an axe that gets you 3 wood from trees instead of
// 2. And you can build a one-square building saw house that increases the
// harvest of all trees within a camp level 1 radius by 1." Then: "Let's add
// maple tree saplings and a one square sugar shack where you can produce
// syrup if you harvest sap.").
import { describe, expect, it } from 'vitest';
import {
  FRONTIER_AXE,
  FRONTIER_RECIPES,
  FRONTIER_MARKET,
  FRONTIER_SAPLINGS,
  FRONTIER_SAW_HOUSE,
  FRONTIER_SHIFT,
  FRONTIER_SUGAR_SHACK,
  FRONTIER_SURFACE,
} from '../../src/data/frontier';
import { frontierAct, makeRefusal, previewTap } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { campRadius, placeRefusal } from '../../src/engine/frontier/camps';
import { plantRefusal } from '../../src/engine/frontier/farming';
import { buildRefusal, sawHouseReach } from '../../src/engine/frontier/buildings';
import { APPLE_TREE, GRASS, MAPLE_TREE, TREE } from '../../src/engine/frontier/state';
import { depthAt } from '../../src/engine/heightmap';
import { MID, SIDE, world } from './frontierHelpers';

/** Where the saw house goes in these tests: inside the camp's ring, off its 3 x 3. */
const SAW = { x: MID + 3, y: MID };
/** Enough for one saw house, and a little over. */
const COST = { wood: 30, stone: 20 };

/** Do `action` and expect it to be done. */
function act(state: FrontierState, action: Parameters<typeof frontierAct>[1]): FrontierState {
  const out = frontierAct(state, action);
  expect(out.done, `${action.kind}: ${out.refusal ?? ''}`).toBe(true);
  return out.state;
}

/** The wood a tap felling the tree on (x, y) gives. */
function felled(state: FrontierState, x: number, y: number): number {
  const before = state.inventory.get('wood') ?? 0;
  const after = act(state, { kind: 'tap', x, y });
  return (after.inventory.get('wood') ?? 0) - before;
}

describe('the axe', () => {
  it('fells a tree for FRONTIER_AXE.woodPerTree wood, while the store holds one', () => {
    expect(FRONTIER_AXE.woodPerTree).toBe(3);
    expect(FRONTIER_SURFACE.woodPerTree).toBe(2);
    const tree = { x: MID - 3, y: MID, feature: TREE } as const;
    expect(felled(world({ features: [tree] }), tree.x, tree.y)).toBe(2);
    const axe = world({ features: [tree], inventory: { [FRONTIER_AXE.item]: 1 } });
    expect(felled(axe, tree.x, tree.y)).toBe(3);
    expect(previewTap(axe, tree.x, tree.y).gain).toEqual([{ item: 'wood', count: 3 }]);
    // A second axe adds nothing, and the axe is kept.
    const two = world({ features: [tree], inventory: { [FRONTIER_AXE.item]: 2 } });
    expect(felled(two, tree.x, tree.y)).toBe(3);
  });

  it('fells an apple tree picked bare for as much; apples are as they were', () => {
    const tree = { x: MID - 3, y: MID, feature: APPLE_TREE, apples: 1 } as const;
    const w = world({ features: [tree], inventory: { [FRONTIER_AXE.item]: 1 } });
    const picked = act(w, { kind: 'tap', x: tree.x, y: tree.y });
    expect(picked.inventory.get('apple')).toBe(1);
    expect(felled(picked, tree.x, tree.y)).toBe(FRONTIER_AXE.woodPerTree);
  });

  it('is made at a smelter, and sold at the market from the start', () => {
    const recipe = FRONTIER_RECIPES.find((r) => r.output.item === FRONTIER_AXE.item);
    expect(recipe?.needsSmelter).toBe(true);
    const w = { ...world({ inventory: { coin: 100 } }), shift: 10, marketOpen: true };
    const bought = act(w, { kind: 'buy', item: FRONTIER_AXE.item, lots: 1 });
    expect(bought.inventory.get(FRONTIER_AXE.item)).toBe(1);
  });
});

describe('the saw house', () => {
  it('reaches as far as a level-1 camp’s ring', () => {
    expect(FRONTIER_SAW_HOUSE.radiusOfLevel).toBe(1);
    expect(sawHouseReach()).toBe(campRadius(1));
  });

  it('is built on one bare, undug, lit square for its cost and 1 tap', () => {
    const w = world({ inventory: COST });
    const out = frontierAct(w, { kind: 'build', building: 'sawHouse', ...SAW });
    expect(out.done).toBe(true);
    expect(out.state.buildings).toEqual([{ kind: 'sawHouse', ...SAW }]);
    expect(out.state.tapsLeft).toBe(w.tapsLeft - 1);
    for (const c of FRONTIER_SAW_HOUSE.cost) {
      expect(out.state.inventory.get(c.item) ?? 0).toBe(
        ((COST as Record<string, number>)[c.item] ?? 0) - c.count,
      );
    }
  });

  it('gives FRONTIER_SAW_HOUSE.bonus more wood for each tree it reaches, once', () => {
    const near = { x: SAW.x - 4, y: SAW.y + 4, feature: TREE } as const;
    const far = { x: SAW.x - 10, y: SAW.y + 9, feature: TREE } as const;
    expect(far.x >= 0 && far.y < SIDE).toBe(true);
    let w = act(world({ features: [near, far], inventory: COST }), {
      kind: 'build',
      building: 'sawHouse',
      ...SAW,
    });
    expect(felled(w, near.x, near.y)).toBe(FRONTIER_SURFACE.woodPerTree + FRONTIER_SAW_HOUSE.bonus);
    // Out of its reach, a tree gives what it always did, if a camp lights it.
    const lit = { ...w, camps: w.camps.map((c) => ({ ...c, level: 4 })) };
    expect(felled(lit, far.x, far.y)).toBe(FRONTIER_SURFACE.woodPerTree);
    // With the axe as well: 3 + 1. A second saw house in reach adds nothing.
    w = act(
      { ...w, inventory: new Map([...w.inventory, [FRONTIER_AXE.item, 1]]) },
      {
        kind: 'build',
        building: 'sawHouse',
        x: SAW.x,
        y: SAW.y + 2,
      },
    );
    expect(felled(w, near.x, near.y)).toBe(FRONTIER_AXE.woodPerTree + FRONTIER_SAW_HOUSE.bonus);
  });

  it('is never mined, nor planted on, nor built under a camp', () => {
    const w = act(world({ inventory: { ...COST, sapling: 1 } }), {
      kind: 'build',
      building: 'sawHouse',
      ...SAW,
    });
    const tap = frontierAct(w, { kind: 'tap', ...SAW });
    expect(tap.done).toBe(false);
    expect(tap.refusal).toBe('building');
    expect(depthAt(tap.state.cube, SAW.x, SAW.y)).toBe(0);
    expect(previewTap(w, SAW.x, SAW.y).kind).toBe('building');
    expect(plantRefusal(w, SAW.x, SAW.y, 'sapling')).toBe('occupied');
    expect(placeRefusal({ ...w, inventory: new Map([['wood', 99]]) }, SAW.x + 1, SAW.y)).toBe(
      'occupied',
    );
  });

  it('says why it cannot go where it cannot', () => {
    const grass = { x: SAW.x, y: SAW.y + 1, feature: GRASS } as const;
    const w = world({
      features: [grass],
      inventory: COST,
      animals: [{ id: 1, x: SAW.x, y: SAW.y + 2 }],
    });
    expect(buildRefusal(w, 'sawHouse', MID, MID)).toBe('camp');
    expect(buildRefusal(w, 'sawHouse', 0, 0)).toBe('notShown');
    expect(buildRefusal(w, 'sawHouse', grass.x, grass.y)).toBe('growing');
    expect(buildRefusal(w, 'sawHouse', SAW.x, SAW.y + 2)).toBe('animal');
    const dug = act(w, { kind: 'tap', x: SAW.x, y: SAW.y - 2 });
    expect(buildRefusal(dug, 'sawHouse', SAW.x, SAW.y - 2)).toBe('ground');
    const wet = { ...w, hazards: { ...w.hazards, flooded: w.hazards.flooded.map(() => true) } };
    expect(buildRefusal(wet, 'sawHouse', SAW.x, SAW.y)).toBe('hazard');
    expect(buildRefusal({ ...w, inventory: new Map() }, 'sawHouse', SAW.x, SAW.y)).toBe('cost');
    expect(buildRefusal(w, 'castle', SAW.x, SAW.y)).toBe('unknown');
    const built = act(w, { kind: 'build', building: 'sawHouse', ...SAW });
    expect(buildRefusal(built, 'sawHouse', SAW.x, SAW.y)).toBe('occupied');
    const refused = frontierAct(w, { kind: 'build', building: 'sawHouse', x: MID, y: MID });
    expect(refused.done).toBe(false);
    expect(refused.state).toBe(w);
  });
});

describe('maple trees', () => {
  const at = { x: MID - 3, y: MID };

  it('grow from a maple sapling, bought at the market from the start', () => {
    const market = { ...world({ inventory: { coin: 100 } }), shift: 10, marketOpen: true };
    const bought = act(market, { kind: 'buy', item: 'mapleSapling', lots: 1 });
    let w = act({ ...bought, marketOpen: false }, { kind: 'plant', ...at, item: 'mapleSapling' });
    expect(w.stumps[at.x + SIDE * at.y]).toBe(MAPLE_TREE);
    for (let k = 0; k < FRONTIER_SAPLINGS.mapleSaplingGrowShifts; k += 1) {
      w = act(
        {
          ...w,
          health: 10,
          inventory: new Map([
            ['wood', 99],
            ['apple', 99],
          ]),
        },
        {
          kind: 'endShift',
        },
      );
      w = w.marketOpen ? act(w, { kind: 'closeMarket' }) : w;
    }
    expect(w.features[at.x + SIDE * at.y]).toBe(MAPLE_TREE);
    expect(w.apples[at.x + SIDE * at.y]).toBe(FRONTIER_SURFACE.sapPerTree);
  });

  it('give 1 sap a tap until dry, then are felled for wood; the sap comes back', () => {
    const n = FRONTIER_SURFACE.sapPerTree;
    let w = world({ features: [{ ...at, feature: MAPLE_TREE, apples: n }] });
    expect(previewTap(w, at.x, at.y).gain).toEqual([{ item: 'sap', count: 1 }]);
    for (let k = 0; k < n; k += 1) w = act(w, { kind: 'tap', ...at });
    expect(w.inventory.get('sap')).toBe(n);
    // Dry: it fills again after FRONTIER_SHIFT.appleRegrowShifts, as apples do.
    expect(w.regrowIn[at.x + SIDE * at.y]).toBe(FRONTIER_SHIFT.appleRegrowShifts);
    expect(felled(w, at.x, at.y)).toBe(FRONTIER_SURFACE.woodPerTree);
    // A dry tree left standing fills again.
    const dry = world({ features: [{ ...at, feature: MAPLE_TREE, apples: 0 }] });
    const waiting = {
      ...dry,
      regrowIn: dry.regrowIn.map((r, i) => (i === at.x + SIDE * at.y ? 1 : r)),
    };
    const night = act(
      {
        ...waiting,
        inventory: new Map([
          ['wood', 99],
          ['apple', 99],
        ]),
      },
      {
        kind: 'endShift',
      },
    );
    expect(night.apples[at.x + SIDE * at.y]).toBe(n);
  });
});

describe('the sugar shack', () => {
  const SHACK = { x: MID + 3, y: MID + 1 };
  const enough = { wood: 30, clay: 20, sap: 7 };

  it('is built as a saw house is, for its own cost', () => {
    const w = world({ inventory: enough });
    const built = act(w, { kind: 'build', building: 'sugarShack', ...SHACK });
    expect(built.buildings).toEqual([{ kind: 'sugarShack', ...SHACK }]);
    for (const c of FRONTIER_SUGAR_SHACK.cost) {
      expect(built.inventory.get(c.item)).toBe(
        ((enough as Record<string, number>)[c.item] ?? 0) - c.count,
      );
    }
    expect(previewTap(built, SHACK.x, SHACK.y).kind).toBe('building');
  });

  it('boils sap into syrup while one stands, for 1 tap', () => {
    const w = world({ inventory: enough });
    expect(makeRefusal(w, 'syrup')).toBe('noSugarShack');
    const built = act(w, { kind: 'build', building: 'sugarShack', ...SHACK });
    const boiled = frontierAct(built, { kind: 'make', recipe: 'syrup' });
    expect(boiled.done).toBe(true);
    expect(boiled.state.tapsLeft).toBe(built.tapsLeft - 1);
    expect(boiled.state.inventory.get('syrup')).toBe(1);
    expect(boiled.state.inventory.get('sap')).toBe(enough.sap - 3);
    // A saw house does not boil sap.
    const saw = act(world({ inventory: { ...enough, stone: 20 } }), {
      kind: 'build',
      building: 'sawHouse',
      ...SHACK,
    });
    expect(makeRefusal(saw, 'syrup')).toBe('noSugarShack');
  });

  it('makes syrup worth more at the market than the sap it took', () => {
    const lot = (item: string): number => {
      const l = FRONTIER_MARKET.sellPrices.find((p) => p.item === item);
      return l === undefined ? 0 : l.coins / l.count;
    };
    expect(lot('syrup')).toBeGreaterThan(3 * lot('sap'));
  });
});
