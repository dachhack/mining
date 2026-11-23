// Smelting and crafting, PR 4 (docs/plans/smelting-and-crafting.md): the
// iron drill and camp level 4 (owner, question 163). Since progression PR 2
// (docs/plans/progression-phases.md, section 4) the drill mines ore rather
// than lifting a camp a level, and the steel drill mines crystal and relics.
import { describe, expect, it } from 'vitest';
import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_DRILL,
  FRONTIER_RECIPES,
  FRONTIER_STEEL_DRILL,
} from '../../src/data/frontier';
import {
  MAX_CAMP_LEVEL,
  blocksMinedAt,
  campRadius,
  campRing,
  frontierAct,
  frontierTap,
  holdsToolFor,
  levelNeededFor,
  previewTap,
  toolNeededFor,
  upgradeCostFrom,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { BLOCKS } from '../../src/data';
import { AT, MID, rich, world } from './frontierHelpers';

function holding(state: FrontierState, inventory: Record<string, number>): FrontierState {
  return { ...state, inventory: new Map(Object.entries(inventory)) };
}

/** `state` with its first camp at `level`. */
function atLevel(state: FrontierState, level: number): FrontierState {
  return { ...state, camps: state.camps.map((c) => ({ ...c, level })) };
}

const DRILL = { [FRONTIER_DRILL.item]: 1 };

describe('the iron drill (owner, question 163)', () => {
  it('is made from the book for its inputs and 1 tap, with a smelter', () => {
    const recipe = FRONTIER_RECIPES.find((r) => r.id === 'iron-drill');
    expect(recipe?.inputs).toEqual([
      { item: 'ironIngot', count: 4 },
      { item: 'copperIngot', count: 2 },
      { item: 'wood', count: 2 },
    ]);
    expect(recipe?.output).toEqual({ item: FRONTIER_DRILL.item, count: 1 });
    const level2 = atLevel(world(), 2);
    const w = holding(
      { ...level2, camps: level2.camps.map((c) => ({ ...c, smelter: true })) },
      { ironIngot: 4, copperIngot: 2, wood: 2 },
    );
    const made = frontierAct(w, { kind: 'make', recipe: 'iron-drill' });
    expect(made.done).toBe(true);
    expect(made.state.inventory.get(FRONTIER_DRILL.item)).toBe(1);
    expect(made.state.tapsLeft).toBe(w.tapsLeft - 1);
    const noSmelter = holding(world(), { ironIngot: 4, copperIngot: 2, wood: 2 });
    expect(frontierAct(noSmelter, { kind: 'make', recipe: 'iron-drill' }).refusal).toBe(
      'noSmelter',
    );
  });

  it('mines iron and copper ore on any camp’s ground; no camp level mines ore without it (progression plan section 4)', () => {
    expect(levelNeededFor(BLOCKS.ironOre.code)).toBeNull();
    expect(toolNeededFor(BLOCKS.ironOre.code)).toBe(FRONTIER_DRILL.item);
    expect(toolNeededFor(BLOCKS.copperOre.code)).toBe(FRONTIER_DRILL.item);
    for (const top of ['i', 'u']) {
      const w = world({ top });
      for (const level of [1, 2, 3, 4]) {
        const bare = frontierTap(atLevel(w, level), AT.x, AT.y);
        expect(bare.kind, `level ${level}`).toBe('tooHard');
        expect(bare.needs).toBeNull();
        expect(bare.needsTool).toBe(FRONTIER_DRILL.item);
      }
      const drilled = holding(w, DRILL);
      const tap = frontierTap(drilled, AT.x, AT.y);
      expect(tap.kind).toBe('mined');
      expect(previewTap(drilled, AT.x, AT.y).kind).toBe('mined');
      expect(tap.state.inventory.get(FRONTIER_DRILL.item)).toBe(1); // it does not wear out
    }
  });

  it('does not mine crystal; the steel drill does, and ore too', () => {
    const crystal = world({ top: 'x' });
    expect(frontierTap(holding(crystal, DRILL), AT.x, AT.y).needsTool).toBe(
      FRONTIER_STEEL_DRILL.item,
    );
    const steel = { [FRONTIER_STEEL_DRILL.item]: 1 };
    expect(frontierTap(holding(crystal, steel), AT.x, AT.y).kind).toBe('mined');
    expect(frontierTap(holding(world({ top: 'i' }), steel), AT.x, AT.y).kind).toBe('mined');
    for (const id of FRONTIER_STEEL_DRILL.mines) {
      expect(holdsToolFor(new Map(Object.entries(steel)), BLOCKS[id].code), id).toBe(true);
    }
  });

  it('does not help with a block a camp level mines: hard rock still needs a level-3 camp', () => {
    const w = holding(world({ top: 'H' }), { ...DRILL, [FRONTIER_STEEL_DRILL.item]: 1 });
    const tap = frontierTap(w, AT.x, AT.y);
    expect(tap.kind).toBe('tooHard');
    expect(tap.needs).toBe(3);
    expect(tap.needsTool).toBeNull();
  });

  it('leaves the ring as it is, and lights nothing', () => {
    const w = holding(world({ top: 'i' }), DRILL);
    expect(w.camps.map(campRing)).toEqual([campRadius(1)]);
    const beyond = { x: MID + campRadius(1) + 1, y: MID };
    expect(frontierTap(w, beyond.x, beyond.y).kind).toBe('fog');
  });
});

describe('camp level 4 (owner, question 163)', () => {
  it('is an upgrade from level 3, for wood, ingots and stone', () => {
    expect(MAX_CAMP_LEVEL).toBe(4);
    expect(upgradeCostFrom(3)).toEqual([
      { item: 'wood', count: 40 },
      { item: 'ironIngot', count: 8 },
      { item: 'copperIngot', count: 6 },
      { item: 'stone', count: 20 },
    ]);
    expect(upgradeCostFrom(4)).toBeNull();
  });

  it('widens the ring to 18 and mines nothing new', () => {
    expect(campRadius(4)).toBe(18);
    expect(campRadius(4)).toBeGreaterThan(campRadius(3));
    expect(FRONTIER_CAMP_LEVELS[3]?.addsBlocks).toEqual([]);
    expect(blocksMinedAt(4)).toEqual(blocksMinedAt(3));
  });

  it('is reached with the upgrade action, for its cost and 1 tap', () => {
    const w = holding(atLevel(world(), 3), rich());
    const up = frontierAct(w, { kind: 'upgrade', id: 1 });
    expect(up.done).toBe(true);
    expect(up.state.camps[0]?.level).toBe(4);
    expect(up.state.tapsLeft).toBe(w.tapsLeft - 1);
    for (const stack of upgradeCostFrom(3) ?? []) {
      expect(up.state.inventory.get(stack.item) ?? 0).toBe(
        (w.inventory.get(stack.item) ?? 0) - stack.count,
      );
    }
    expect(frontierAct(up.state, { kind: 'upgrade', id: 1 }).refusal).toBe('upgrade');
    // Without the ingots it is refused.
    const poor = holding(atLevel(world(), 3), { wood: 99, stone: 99 });
    expect(frontierAct(poor, { kind: 'upgrade', id: 1 }).done).toBe(false);
  });
});
