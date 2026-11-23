// Progression PR 2 (docs/plans/progression-phases.md, sections 2 and 4):
// what each camp level mines, camps only in the top levels, the tools for
// ore, crystal and relics, and the tools on sale at the market from a
// level-3 camp.
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_CAMP_PLACE,
  FRONTIER_DRILL,
  FRONTIER_MARKET,
  FRONTIER_STEEL_DRILL,
} from '../../src/data/frontier';
import {
  frontierAct,
  frontierTap,
  levelNeededFor,
  placeRefusal,
  upgradeCostFrom,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { AT, MID, NEXT, rich, world } from './frontierHelpers';

/** `state` with its first camp at `level`. */
function atLevel(state: FrontierState, level: number): FrontierState {
  return { ...state, camps: state.camps.map((c) => ({ ...c, level })) };
}

describe('what each camp level mines (owner: the base camp cannot mine rock or coal)', () => {
  it('level 1 mines dirt, rubble and clay; level 2 adds stone and coal; level 3 hard rock; level 4 nothing new', () => {
    expect(FRONTIER_CAMP_LEVELS.map((l) => l.addsBlocks)).toEqual([
      ['dirt', 'rubble', 'clay'],
      ['stone', 'coalSeam'],
      ['hardRock'],
      [],
    ]);
  });

  it('refuses stone and coal at a base camp, saying a level-2 camp mines them', () => {
    for (const top of ['#', 'c']) {
      const tap = frontierTap(world({ top }), AT.x, AT.y);
      expect(tap.kind, top).toBe('tooHard');
      expect(tap.needs).toBe(2);
      expect(frontierTap(atLevel(world({ top }), 2), AT.x, AT.y).kind).toBe('mined');
    }
    const hard = frontierTap(atLevel(world({ top: 'H' }), 2), AT.x, AT.y);
    expect(hard.needs).toBe(3);
    expect(frontierTap(atLevel(world({ top: 'H' }), 3), AT.x, AT.y).kind).toBe('mined');
  });

  it('costs no stone for level 2, since a base camp cannot mine it', () => {
    expect((upgradeCostFrom(1) ?? []).map((s) => s.item)).not.toContain('stone');
    expect(levelNeededFor(BLOCKS.stone.code)).toBe(2);
  });
});

describe('camps only in the top levels (owner: "Camps can only be placed in the top three levels")', () => {
  /** A world whose ground is dug `depth` levels down everywhere east of the first camp's 3 x 3. */
  function dug(depth: number): FrontierState {
    const special = [];
    for (let y = 0; y < 25; y += 1) {
      for (let x = MID + 2; x < 25; x += 1) {
        for (let z = 0; z < depth; z += 1) special.push({ x, y, z, char: '.' });
      }
    }
    return world({ special, inventory: rich() });
  }

  it('places a camp on level ground down to depth 2, and refuses it deeper', () => {
    expect(FRONTIER_CAMP_PLACE.maxDepth).toBe(2);
    for (const depth of [0, 1, 2]) {
      expect(placeRefusal(dug(depth), MID + NEXT, MID), `depth ${depth}`).toBeNull();
    }
    const deep = dug(3);
    expect(placeRefusal(deep, MID + NEXT, MID)).toBe('tooDeep');
    expect(frontierAct(deep, { kind: 'place', x: MID + NEXT, y: MID }).done).toBe(false);
  });
});

describe('the tools at the market (plan section 4)', () => {
  /** On a market day, the first camp at `level`, holding 1,000 coins. */
  function market(level: number): FrontierState {
    return { ...atLevel(world({ inventory: { coin: 1000 } }), level), shift: 30, marketOpen: true };
  }

  it('sells the drills, the pickaxe and the lantern only from a level-3 camp', () => {
    const tools = FRONTIER_MARKET.buyPrices.filter((l) => l.fromLevel === 3).map((l) => l.item);
    expect(tools).toEqual(
      expect.arrayContaining([
        FRONTIER_DRILL.item,
        FRONTIER_STEEL_DRILL.item,
        'ironPickaxe',
        'copperLantern',
      ]),
    );
    for (const item of tools) {
      expect(frontierAct(market(2), { kind: 'buy', item, lots: 1 }).refusal, item).toBe('notYet');
      const bought = frontierAct(market(3), { kind: 'buy', item, lots: 1 });
      expect(bought.done, item).toBe(true);
      expect(bought.state.inventory.get(item)).toBe(1);
    }
  });

  it('a bought iron drill mines the ore it could not before', () => {
    const w = {
      ...atLevel(world({ top: 'i', inventory: { coin: 1000 } }), 3),
      shift: 30,
      marketOpen: true,
    };
    expect(frontierTap(w, AT.x, AT.y).needsTool).toBe(FRONTIER_DRILL.item);
    const atMarket = frontierAct(w, { kind: 'buy', item: FRONTIER_DRILL.item, lots: 1 }).state;
    const bought = frontierAct(atMarket, { kind: 'closeMarket' }).state;
    expect(frontierTap(bought, AT.x, AT.y).kind).toBe('mined');
  });
});
