// The axe and the saw house (owner, after the 0.17.0 build: "Let's add an axe
// that gets you 3 wood from trees instead of 2. And you can build a
// one-square building saw house that increases the harvest of all trees
// within a camp level 1 radius by 1.").
import { describe, expect, it } from 'vitest';
import {
  FRONTIER_AXE,
  FRONTIER_RECIPES,
  FRONTIER_SAW_HOUSE,
  FRONTIER_SURFACE,
} from '../../src/data/frontier';
import { frontierAct, previewTap } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { campRadius, placeRefusal } from '../../src/engine/frontier/camps';
import { plantRefusal } from '../../src/engine/frontier/farming';
import { sawHouseReach, sawHouseRefusal } from '../../src/engine/frontier/sawHouse';
import { APPLE_TREE, GRASS, TREE } from '../../src/engine/frontier/state';
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
    const out = frontierAct(w, { kind: 'buildSawHouse', ...SAW });
    expect(out.done).toBe(true);
    expect(out.state.sawHouses).toEqual([SAW]);
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
      kind: 'buildSawHouse',
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
        kind: 'buildSawHouse',
        x: SAW.x,
        y: SAW.y + 2,
      },
    );
    expect(felled(w, near.x, near.y)).toBe(FRONTIER_AXE.woodPerTree + FRONTIER_SAW_HOUSE.bonus);
  });

  it('is never mined, nor planted on, nor built under a camp', () => {
    const w = act(world({ inventory: { ...COST, sapling: 1 } }), {
      kind: 'buildSawHouse',
      ...SAW,
    });
    const tap = frontierAct(w, { kind: 'tap', ...SAW });
    expect(tap.done).toBe(false);
    expect(tap.refusal).toBe('sawHouse');
    expect(depthAt(tap.state.cube, SAW.x, SAW.y)).toBe(0);
    expect(previewTap(w, SAW.x, SAW.y).kind).toBe('sawHouse');
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
    expect(sawHouseRefusal(w, MID, MID)).toBe('camp');
    expect(sawHouseRefusal(w, 0, 0)).toBe('notShown');
    expect(sawHouseRefusal(w, grass.x, grass.y)).toBe('growing');
    expect(sawHouseRefusal(w, SAW.x, SAW.y + 2)).toBe('animal');
    const dug = act(w, { kind: 'tap', x: SAW.x, y: SAW.y - 2 });
    expect(sawHouseRefusal(dug, SAW.x, SAW.y - 2)).toBe('ground');
    const wet = { ...w, hazards: { ...w.hazards, flooded: w.hazards.flooded.map(() => true) } };
    expect(sawHouseRefusal(wet, SAW.x, SAW.y)).toBe('hazard');
    expect(sawHouseRefusal({ ...w, inventory: new Map() }, SAW.x, SAW.y)).toBe('cost');
    const built = act(w, { kind: 'buildSawHouse', ...SAW });
    expect(sawHouseRefusal(built, SAW.x, SAW.y)).toBe('occupied');
    const refused = frontierAct(w, { kind: 'buildSawHouse', x: MID, y: MID });
    expect(refused.done).toBe(false);
    expect(refused.state).toBe(w);
  });
});
