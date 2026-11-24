// Progression PR 6 (docs/plans/progression-phases.md, sections 2.4 and 3):
// the deep camp, its kit, and wood and apples on sale once a tier-1
// contract is done.
import { describe, expect, it } from 'vitest';
import { FRONTIER_CAMP_PLACE, FRONTIER_DEEP_CAMP } from '../../src/data/frontier';
import {
  campRing,
  coverLevelAt,
  depthAt,
  foundationDepth,
  frontierAct,
  isMarketDay,
  placeRefusal,
} from '../../src/engine';
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
    const w = { ...world({ inventory: { coin: 1000 } }), shift: 30, marketOpen: true };
    expect(isMarketDay(w)).toBe(true);
    for (const item of ['campKit', 'wood', 'apple']) {
      expect(frontierAct(w, { kind: 'buy', item, lots: 1 }).refusal, item).toBe('notYet');
      const done = { ...w, contractsDone: [1, 0, 0] };
      expect(frontierAct(done, { kind: 'buy', item, lots: 1 }).done, item).toBe(true);
    }
  });
});

describe("the deep camp's concrete foundation (owner, on the hazards build)", () => {
  // "The deep mine should come with a concrete foundation that levels any spot you place it into 3by3."
  /** `dug(3)`, but the east column of the 3 x 3 at (MID + NEXT, MID) only dug `shallow` deep. */
  function uneven(shallow: number, inventory: Record<string, number> = KIT): FrontierState {
    const cx = MID + NEXT;
    const special = [];
    for (let y = 0; y < 25; y += 1) {
      for (let x = MID + 2; x < 25; x += 1) {
        const east = x === cx + 1 && Math.abs(y - MID) <= 1;
        const depth = east ? shallow : 3;
        for (let z = 0; z < depth; z += 1) special.push({ x, y, z, char: '.' });
      }
    }
    return world({ special, inventory });
  }

  it('is placed on uneven ground, and digs its 3 x 3 down to the deepest square', () => {
    const w = uneven(2);
    const cx = MID + NEXT;
    expect(depthAt(w.cube, cx + 1, MID)).toBe(2);
    expect(placeRefusal(w, cx, MID, true)).toBeNull();
    // An ordinary camp still needs level ground (and stands no deeper than 2).
    expect(
      placeRefusal(
        {
          ...w,
          inventory: new Map([
            ['wood', 99],
            ['grass', 99],
          ]),
        },
        cx,
        MID,
      ),
    ).toBe('notLevel');
    const placed = frontierAct(w, { kind: 'placeDeep', x: cx, y: MID });
    expect(placed.done).toBe(true);
    for (const dy of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) {
        expect(depthAt(placed.state.cube, cx + dx, MID + dy)).toBe(3);
      }
    }
    // The dug blocks gave nothing, and Dug did not count them.
    expect(placed.state.mined).toBe(w.mined);
    expect(placed.state.inventory.size).toBe(0);
  });

  it('levels to the deepest square: refused if even that is too shallow', () => {
    // Everything at depth 2 or less: the foundation would stand at 2.
    const flat2 = dug(2, KIT);
    expect(foundationDepth(flat2.cube, MID + NEXT, MID)).toBe(2);
    expect(placeRefusal(flat2, MID + NEXT, MID, true)).toBe('tooShallow');
  });

  it('is not dug where an animal stands', () => {
    const w = uneven(2);
    const cx = MID + NEXT;
    const withAnimal = { ...w, animals: [{ id: 1, x: cx + 1, y: MID }] };
    expect(placeRefusal(withAnimal, cx, MID, true)).toBe('animal');
  });
});
