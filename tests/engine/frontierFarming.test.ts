// Progression PR 3 (docs/plans/progression-phases.md, sections 6.1 and 6.2):
// cut grass grows back beside grass, felled trees give saplings, and
// saplings and apple saplings are planted and grow into trees.
import { describe, expect, it } from 'vitest';
import { FRONTIER_MARKET, FRONTIER_SAPLINGS, FRONTIER_SHIFT } from '../../src/data/frontier';
import { frontierAct, frontierTap, hashFrontier, previewTap } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { APPLE_TREE, GRASS, NO_FEATURE, TREE } from '../../src/engine/frontier/state';
import { actLogged, startLog, undoLast } from '../../src/engine/frontier/undo';
import { AT, MID, world } from './frontierHelpers';

/** End `n` shifts, with wood and grass enough for upkeep (and to keep grass beside AT). */
function endShifts(state: FrontierState, n: number): FrontierState {
  let s = state;
  for (let k = 0; k < n; k += 1) {
    s = { ...s, inventory: new Map([...s.inventory, ['wood', 50], ['apple', 50]]) };
    s = frontierAct(s, { kind: 'endShift' }).state;
  }
  return s;
}

const i = AT.x + 25 * AT.y;

describe('cut grass grows back (plan section 6.1)', () => {
  it('after the set number of shifts, when grass grows beside it', () => {
    const w = world({
      features: [
        { ...AT, feature: GRASS },
        { x: AT.x + 1, y: AT.y, feature: GRASS },
      ],
    });
    const cut = frontierTap(w, AT.x, AT.y).state;
    expect(cut.features[i]).toBe(NO_FEATURE);
    expect(cut.grassIn[i]).toBe(FRONTIER_SHIFT.grassRegrowShifts);
    const waiting = endShifts(cut, FRONTIER_SHIFT.grassRegrowShifts - 1);
    expect(waiting.features[i]).toBe(NO_FEATURE);
    const out = frontierAct(
      {
        ...waiting,
        inventory: new Map([
          ['wood', 9],
          ['apple', 9],
        ]),
      },
      { kind: 'endShift' },
    );
    expect(out.state.features[i]).toBe(GRASS);
    expect(out.state.grassIn[i]).toBe(-1);
    expect(out.report?.grassRegrown).toBe(1);
  });

  it('waits while no grass grows beside it: a patch cut bare stays bare', () => {
    const w = world({ features: [{ ...AT, feature: GRASS }] });
    const cut = frontierTap(w, AT.x, AT.y).state;
    const later = endShifts(cut, FRONTIER_SHIFT.grassRegrowShifts + 3);
    expect(later.features[i]).toBe(NO_FEATURE);
    expect(later.grassIn[i]).toBe(1); // still waiting for a neighbour
  });

  it('never grows back on ground dug out', () => {
    const w = world({
      top: 'd',
      features: [
        { ...AT, feature: GRASS },
        { x: AT.x + 1, y: AT.y, feature: GRASS },
      ],
    });
    const cut = frontierTap(w, AT.x, AT.y).state;
    const dug = frontierTap(cut, AT.x, AT.y).state;
    expect(dug.grassIn[i]).toBe(-1);
    expect(endShifts(dug, FRONTIER_SHIFT.grassRegrowShifts).features[i]).toBe(NO_FEATURE);
  });
});

describe('saplings from felling trees (plan section 6.2)', () => {
  it('every second tree felled gives a sapling too, counted, not random', () => {
    expect(FRONTIER_SAPLINGS.saplingEveryFelled).toBe(2);
    const w = world({
      features: [
        { ...AT, feature: TREE },
        { x: AT.x + 1, y: AT.y, feature: TREE },
      ],
    });
    const first = frontierTap(w, AT.x, AT.y);
    expect(first.gain.map((g) => g.item)).toEqual(['wood']);
    expect(first.state.treesFelled).toBe(1);
    expect(previewTap(first.state, AT.x + 1, AT.y).gain.map((g) => g.item)).toEqual([
      'wood',
      'sapling',
    ]);
    const second = frontierTap(first.state, AT.x + 1, AT.y);
    expect(second.gain).toEqual([
      { item: 'wood', count: 2 },
      { item: 'sapling', count: 1 },
    ]);
    expect(second.state.inventory.get('sapling')).toBe(1);
  });
});

describe('planting (plan section 6.2)', () => {
  it('plants a sapling on lit surface dirt for 1 tap, and it grows into a tree', () => {
    const w = world({ inventory: { sapling: 1 } });
    const planted = frontierAct(w, { kind: 'plant', x: AT.x, y: AT.y, item: 'sapling' });
    expect(planted.done).toBe(true);
    const s = planted.state;
    expect(s.tapsLeft).toBe(w.tapsLeft - 1);
    expect(s.inventory.has('sapling')).toBe(false);
    expect(s.stumps[i]).toBe(TREE);
    expect(s.planted[i]).toBe(true);
    expect(s.regrowIn[i]).toBe(FRONTIER_SAPLINGS.saplingGrowShifts);
    const grown = endShifts(s, FRONTIER_SAPLINGS.saplingGrowShifts);
    expect(grown.features[i]).toBe(TREE);
    expect(grown.planted[i]).toBe(false);
    expect(grown.stumps[i]).toBe(NO_FEATURE);
  });

  it('grows an apple sapling into an apple tree full of apples; apple saplings are made from apples without a smelter', () => {
    const made = frontierAct(world({ inventory: { apple: 3 } }), {
      kind: 'make',
      recipe: 'apple-sapling',
    });
    expect(made.done).toBe(true);
    expect(made.state.inventory.get('appleSapling')).toBe(1);
    const s = frontierAct(made.state, {
      kind: 'plant',
      x: AT.x,
      y: AT.y,
      item: 'appleSapling',
    }).state;
    expect(s.stumps[i]).toBe(APPLE_TREE);
    const grown = endShifts(s, FRONTIER_SAPLINGS.appleSaplingGrowShifts);
    expect(grown.features[i]).toBe(APPLE_TREE);
    expect(grown.apples[i]).toBeGreaterThan(0);
  });

  it('plants on a stump, replacing it, and on cut grass, which then waits no more', () => {
    const stump = frontierTap(
      world({ features: [{ ...AT, feature: APPLE_TREE }], inventory: { sapling: 1 } }),
      AT.x,
      AT.y,
    ).state;
    expect(stump.stumps[i]).toBe(APPLE_TREE);
    const replaced = frontierAct(stump, { kind: 'plant', x: AT.x, y: AT.y, item: 'sapling' }).state;
    expect(replaced.stumps[i]).toBe(TREE);
    const grass = frontierTap(
      world({ features: [{ ...AT, feature: GRASS }], inventory: { sapling: 1 } }),
      AT.x,
      AT.y,
    ).state;
    const onGrass = frontierAct(grass, { kind: 'plant', x: AT.x, y: AT.y, item: 'sapling' }).state;
    expect(onGrass.grassIn[i]).toBe(-1);
  });

  it('is refused off lit dirt, on a camp, under an animal, over a plant or a sapling, and without one', () => {
    const base = world({
      inventory: { sapling: 2 },
      features: [{ x: AT.x, y: AT.y + 1, feature: GRASS }],
      animals: [{ id: 1, x: AT.x, y: AT.y + 2 }],
      special: [{ x: AT.x, y: AT.y + 3, char: '#' }],
    });
    const twice = frontierAct(base, { kind: 'plant', x: AT.x, y: AT.y, item: 'sapling' }).state;
    const cases: [FrontierState, number, number, string, string][] = [
      [base, AT.x, AT.y, 'wood', 'unknown'],
      [base, AT.x, AT.y, 'appleSapling', 'cost'],
      [base, 0, 0, 'sapling', 'notShown'],
      [base, MID, MID, 'sapling', 'camp'],
      [base, AT.x, AT.y + 2, 'sapling', 'animal'],
      [base, AT.x, AT.y + 3, 'sapling', 'ground'],
      [base, AT.x, AT.y + 1, 'sapling', 'occupied'],
      [twice, AT.x, AT.y, 'sapling', 'occupied'],
    ];
    for (const [state, x, y, item, why] of cases) {
      const out = frontierAct(state, { kind: 'plant', x, y, item });
      expect(out.refusal, `${item} at ${x},${y}`).toBe(why);
      expect(out.state).toBe(state);
    }
  });

  it('is lost if its square is mined, and can be undone', () => {
    const w = world({ inventory: { sapling: 1 } });
    const { outcome, log } = actLogged(w, startLog(w), {
      kind: 'plant',
      x: AT.x,
      y: AT.y,
      item: 'sapling',
    });
    const dug = frontierTap(outcome.state, AT.x, AT.y).state;
    expect(dug.planted[i]).toBe(false);
    expect(dug.stumps[i]).toBe(NO_FEATURE);
    const undone = undoLast(log);
    if (undone === null || 'refused' in undone) throw new Error('undo failed');
    expect(hashFrontier(undone.state)).toBe(hashFrontier(w));
  });

  it('sells saplings at the market from the start', () => {
    for (const item of ['sapling', 'appleSapling']) {
      const lot = FRONTIER_MARKET.buyPrices.find((l) => l.item === item);
      expect(lot?.fromLevel, item).toBeUndefined();
    }
  });
});
