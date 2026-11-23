// Progression PR 6 (docs/plans/progression-phases.md, sections 2.4 and 3):
// the deep camp, its kit, and wood and apples on sale once a tier-1
// contract is done.
import { describe, expect, it } from 'vitest';
import { FRONTIER_CAMP_PLACE, FRONTIER_DEEP_CAMP } from '../../src/data/frontier';
import { campRing, coverLevelAt, frontierAct, isMarketDay, placeRefusal } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { MID, NEXT, world } from './frontierHelpers';

/** A world dug `depth` levels down east of the first camp's 3 x 3, holding `inventory`. */
function dug(depth: number, inventory: Record<string, number>): FrontierState {
  const special = [];
  for (let y = 0; y < 25; y += 1) {
    for (let x = MID + 2; x < 25; x += 1) {
      for (let z = 0; z < depth; z += 1) special.push({ x, y, z, char: '.' });
    }
  }
  return world({ special, inventory });
}

const KIT = { campKit: 1, wood: 20, stone: 20 };

describe('the deep camp (plan section 2.4)', () => {
  it('is placed on deep ground for its kit, wood and stone, where a camp is refused, and not shallower', () => {
    expect(FRONTIER_DEEP_CAMP.minDepth).toBe(FRONTIER_CAMP_PLACE.maxDepth + 1);
    for (let depth = 0; depth < FRONTIER_DEEP_CAMP.minDepth; depth += 1) {
      expect(placeRefusal(dug(depth, KIT), MID + NEXT, MID, true), `depth ${depth}`).toBe(
        'tooShallow',
      );
    }
    expect(FRONTIER_DEEP_CAMP.cost).toEqual([
      { item: 'campKit', count: 1 },
      { item: 'wood', count: 20 },
      { item: 'stone', count: 20 },
    ]);
    const deep = FRONTIER_CAMP_PLACE.maxDepth + 1;
    const w = dug(deep, KIT);
    expect(placeRefusal(w, MID + NEXT, MID)).toBe('tooDeep');
    expect(placeRefusal(w, MID + NEXT, MID, true)).toBeNull();
    const placed = frontierAct(w, { kind: 'placeDeep', x: MID + NEXT, y: MID });
    expect(placed.done).toBe(true);
    const camp = placed.state.camps[1];
    expect(camp?.deep).toBe(true);
    expect(camp?.level).toBe(FRONTIER_DEEP_CAMP.level);
    expect(camp === undefined ? 0 : campRing(camp)).toBe(FRONTIER_DEEP_CAMP.radius);
    expect(placed.state.inventory.size).toBe(0);
    expect(placed.state.tapsLeft).toBe(w.tapsLeft - 1);
    // Without the kit it is refused.
    expect(
      frontierAct(dug(deep, { wood: 20, stone: 20 }), { kind: 'placeDeep', x: MID + NEXT, y: MID })
        .done,
    ).toBe(false);
  });

  it('mines what a level-3 camp mines, and is never upgraded', () => {
    const rich = { ...KIT, wood: 999, stone: 999, clay: 99, animal: 9, apple: 99, hay: 99 };
    const w = dug(FRONTIER_DEEP_CAMP.minDepth, rich);
    const placed = frontierAct(w, { kind: 'placeDeep', x: MID + NEXT, y: MID }).state;
    expect(frontierAct(placed, { kind: 'upgrade', id: 2 }).refusal).toBe('upgrade');
    // Beside it, the ground is covered at level 3 now, not only the first camp's level 1.
    expect(coverLevelAt(w.camps, MID + NEXT - 2, MID)).toBe(1);
    expect(coverLevelAt(placed.camps, MID + NEXT - 2, MID)).toBe(FRONTIER_DEEP_CAMP.level);
  });
});

describe('the market from the first tier-1 contract (plan section 3)', () => {
  it('sells the camp kit, wood and apples only once a tier-1 contract is done', () => {
    const w = { ...world({ inventory: { coin: 1000 } }), shift: 30 };
    expect(isMarketDay(w)).toBe(true);
    for (const item of ['campKit', 'wood', 'apple']) {
      expect(frontierAct(w, { kind: 'buy', item, lots: 1 }).refusal, item).toBe('notYet');
      const done = { ...w, contractsDone: [1, 0, 0] };
      expect(frontierAct(done, { kind: 'buy', item, lots: 1 }).done, item).toBe(true);
    }
  });
});
