// Shifts in the new game, in the engine (plan A4, section 2): taps a shift,
// End shift (animals, apples, trees, upkeep, hunger), rest and closing the mine.
import { describe, expect, it } from 'vitest';
import { FRONTIER_FOODS, FRONTIER_SHIFT, FRONTIER_SURFACE } from '../../src/data/frontier';
import {
  createFrontier,
  endFrontierShift,
  frontierAct,
  hashFrontier,
  upkeepDue,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import type { Feature } from '../../src/engine/frontier/state';
import { APPLE_TREE, GRASS, NO_FEATURE, TREE } from '../../src/engine/frontier/state';
import { AT, MID, NEXT, SIDE, rich, world } from './frontierHelpers';

/** `state` holding `inventory` instead. */
function holding(state: FrontierState, inventory: Record<string, number>): FrontierState {
  return { ...state, inventory: new Map(Object.entries(inventory)) };
}

/** `state` after `n` End shifts. */
function shifts(state: FrontierState, n: number): FrontierState {
  let s = state;
  for (let i = 0; i < n; i += 1) s = endFrontierShift(s).state;
  return s;
}

describe('taps (plan A4)', () => {
  it('starts the run with a full shift of taps and full health', () => {
    const w = createFrontier(7);
    expect(w.shift).toBe(1);
    expect(w.tapsLeft).toBe(FRONTIER_SHIFT.taps);
    expect(w.health).toBe(FRONTIER_SHIFT.startHealth);
    expect(w.status).toBe('active');
  });

  it('charges 1 tap for each action that does something, and none for one that does not', () => {
    const w = world({ everywhere: GRASS, inventory: rich() });
    const cut = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y });
    expect(cut.done).toBe(true);
    expect(cut.state.tapsLeft).toBe(FRONTIER_SHIFT.taps - 1);
    const fog = frontierAct(cut.state, { kind: 'tap', x: 0, y: 0 });
    expect(fog.done).toBe(false);
    expect(fog.refusal).toBe('fog');
    expect(fog.state).toBe(cut.state);
    const placed = frontierAct(cut.state, { kind: 'place', x: MID + NEXT, y: MID });
    expect(placed.state.tapsLeft).toBe(FRONTIER_SHIFT.taps - 2);
    const upgraded = frontierAct(placed.state, { kind: 'upgrade', id: 2 });
    expect(upgraded.state.tapsLeft).toBe(FRONTIER_SHIFT.taps - 3);
    const demolished = frontierAct(upgraded.state, { kind: 'demolish', id: 1 });
    expect(demolished.done).toBe(true);
    expect(demolished.state.tapsLeft).toBe(FRONTIER_SHIFT.taps - 4);
    expect(frontierAct(demolished.state, { kind: 'upgrade', id: 99 }).refusal).toBe('upgrade');
  });

  it('refuses every tap once the shift has none left, until End shift', () => {
    // The last few taps of a shift (a full shift is FRONTIER_SHIFT.taps).
    let w: FrontierState = { ...world({ top: '#' }), tapsLeft: 8 };
    for (let i = 0; i < 8; i += 1) {
      const outcome = frontierAct(w, {
        kind: 'tap',
        x: MID + 2 + (i % 4),
        y: MID - 4 + Math.floor(i / 4) * 3,
      });
      expect(outcome.done, `tap ${i}`).toBe(true);
      w = outcome.state;
    }
    expect(w.tapsLeft).toBe(0);
    const out = frontierAct(w, { kind: 'tap', x: MID + 3, y: MID + 4 });
    expect(out.refusal).toBe('noTaps');
    expect(out.state).toBe(w);
    const next = frontierAct(w, { kind: 'endShift' });
    expect(next.state.shift).toBe(2);
    expect(next.state.tapsLeft).toBe(FRONTIER_SHIFT.taps);
  });

  it('lets End shift be pressed with taps left: they are lost', () => {
    const w = world();
    const next = frontierAct(w, { kind: 'endShift' }).state;
    expect(next.tapsLeft).toBe(FRONTIER_SHIFT.taps);
    expect(next.shift).toBe(2);
  });
});

describe('upkeep and hunger (plan A4)', () => {
  it('is 1 wood a shift, 1 food every 2, and 1 more wood every 4 per camp after the first', () => {
    expect(upkeepDue(1, 1)).toEqual([{ item: 'wood', count: 1 }]);
    expect(upkeepDue(2, 1)).toEqual([
      { item: 'wood', count: 1 },
      { item: 'food', count: 1 },
    ]);
    expect(upkeepDue(4, 3)).toEqual([
      { item: 'wood', count: 1 },
      { item: 'food', count: 1 },
      { item: 'wood', count: 1 },
      { item: 'wood', count: 1 },
    ]);
  });

  it('pays wood, then food with apples before animals', () => {
    const w = holding(world(), { wood: 5, apple: 1, animal: 1 });
    const one = endFrontierShift(w);
    expect(one.report?.paid).toEqual([{ item: 'wood', count: 1 }]);
    const two = endFrontierShift(one.state);
    expect(two.report?.paid).toEqual([
      { item: 'wood', count: 1 },
      { item: 'apple', count: 1 },
    ]);
    const four = endFrontierShift(endFrontierShift(two.state).state);
    expect(four.report?.paid).toEqual([
      { item: 'wood', count: 1 },
      { item: 'animal', count: 1 },
    ]);
    expect(four.state.inventory.get('wood')).toBe(1);
    expect(four.state.health).toBe(FRONTIER_SHIFT.startHealth);
  });

  it('pays food with grass first, at its rate, then an apple, then an animal (questions 155, 158)', () => {
    const rate = FRONTIER_FOODS.find((f) => f.item === 'grass')?.count ?? 0;
    expect(rate).toBeGreaterThan(1); // a worse rate than an apple's
    // Shift 2 is a food shift: from the start of it, hold a food of grass and one grass more.
    const w = holding(endFrontierShift(holding(world(), { wood: 9 })).state, {
      wood: 9,
      grass: rate + 1,
      apple: 1,
      animal: 1,
    });
    const two = endFrontierShift(w);
    expect(two.report?.paid).toEqual([
      { item: 'wood', count: 1 },
      { item: 'grass', count: rate },
    ]);
    // Too little grass for a food: the apple is eaten, then the animal.
    const four = endFrontierShift(endFrontierShift(two.state).state);
    expect(four.report?.paid).toEqual([
      { item: 'wood', count: 1 },
      { item: 'apple', count: 1 },
    ]);
    const six = endFrontierShift(endFrontierShift(four.state).state);
    expect(six.report?.paid).toEqual([
      { item: 'wood', count: 1 },
      { item: 'animal', count: 1 },
    ]);
    expect(six.state.inventory.get('grass')).toBe(1);
    expect(six.state.health).toBe(FRONTIER_SHIFT.startHealth);
  });

  it('costs 1 health for each item it cannot pay, and loses the run at 0', () => {
    const w = world(); // holding nothing
    const one = endFrontierShift(w);
    expect(one.report?.unpaid).toEqual([{ item: 'wood', count: 1 }]);
    expect(one.state.health).toBe(FRONTIER_SHIFT.startHealth - 1);
    const two = endFrontierShift(one.state);
    expect(two.report?.healthLost).toBe(2); // wood and food
    // With nothing, shifts 1 to 6 cost 1 + 2 + 1 + 2 + 1 + 2 = 9; shift 7 costs the last.
    const six = shifts(w, 6);
    expect(six.health).toBe(1);
    expect(six.status).toBe('active');
    const seven = endFrontierShift(six);
    expect(seven.state.health).toBe(0);
    expect(seven.state.status).toBe('lost');
    expect(frontierAct(seven.state, { kind: 'tap', x: AT.x, y: AT.y }).refusal).toBe('over');
    expect(endFrontierShift(seven.state).refusal).toBe('over');
  });
});

describe('rest and closing the mine (plan A4)', () => {
  it('rest at a camp restores the crew, then the shift ends', () => {
    const hungry = shifts(world(), 4);
    expect(hungry.health).toBe(FRONTIER_SHIFT.startHealth - 6);
    const rested = frontierAct(hungry, { kind: 'rest', id: 1 });
    expect(rested.state.shift).toBe(hungry.shift + 1);
    // Full, less the 1 wood it could not pay at the end of shift 5.
    expect(rested.state.health).toBe(FRONTIER_SHIFT.startHealth - 1);
  });

  it('rest only at a camp: refused for a camp that does not stand (owner, question 156)', () => {
    const w = world();
    const refused = frontierAct(w, { kind: 'rest', id: 99 });
    expect(refused.done).toBe(false);
    expect(refused.refusal).toBe('rest');
    expect(refused.state).toBe(w);
  });

  it('closing the mine ends the run, and nothing more can be done', () => {
    const closed = frontierAct(world(), { kind: 'close' });
    expect(closed.state.status).toBe('closed');
    expect(frontierAct(closed.state, { kind: 'endShift' }).refusal).toBe('over');
  });
});

describe('the world moves on at End shift (plan A4)', () => {
  it('animals step to open ground, never onto a tree, a pit or each other', () => {
    let w = createFrontier(11);
    for (let i = 0; i < 20; i += 1) {
      const before = w.animals;
      w = holding(endFrontierShift(w).state, { wood: 9, apple: 9 });
      const width = w.cube.size.x;
      for (const a of w.animals) {
        const feature = w.features[a.x + width * a.y];
        expect(feature === TREE || feature === APPLE_TREE).toBe(false);
        expect(w.animals.filter((b) => b.x === a.x && b.y === a.y)).toHaveLength(1);
        const was = before.find((b) => b.id === a.id);
        if (was !== undefined) {
          const moved = Math.abs(was.x - a.x) + Math.abs(was.y - a.y);
          expect(moved).toBeLessThanOrEqual(FRONTIER_SHIFT.animalStepsPerShift);
        }
      }
    }
  });

  it('a new animal walks in at the edge every few shifts, up to the most there can be', () => {
    let w: FrontierState = { ...createFrontier(11), animals: [] };
    w = shifts(holding(w, { wood: 99, apple: 99 }), FRONTIER_SHIFT.animalEveryShifts);
    expect(w.animals).toHaveLength(1);
    const a = w.animals[0];
    const size = w.cube.size;
    expect(
      a === undefined ? false : a.x === 0 || a.y === 0 || a.x === size.x - 1 || a.y === size.y - 1,
    ).toBe(true);
    const full = shifts(holding(createFrontier(11), { wood: 99, apple: 99 }), 9);
    expect(full.animals.length).toBeLessThanOrEqual(FRONTIER_SURFACE.animals);
  });

  it('apples come back the set number of shifts after a tree is picked bare', () => {
    let w = world({
      features: [{ ...AT, feature: APPLE_TREE, apples: 1 }],
      inventory: { wood: 99 },
    });
    w = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y }).state;
    const i = AT.x + SIDE * AT.y;
    expect(w.apples[i]).toBe(0);
    expect(w.regrowIn[i]).toBe(FRONTIER_SHIFT.appleRegrowShifts);
    const almost = shifts(w, FRONTIER_SHIFT.appleRegrowShifts - 1);
    expect(almost.apples[i]).toBe(0);
    const back = endFrontierShift(almost);
    expect(back.state.apples[i]).toBe(FRONTIER_SURFACE.applesPerTree);
    expect(back.state.regrowIn[i]).toBe(-1);
    expect(back.report?.regrown).toBe(1);
  });

  it('a bare apple tree felled grows no apples on its stump (bug found by the B3 acceptance check)', () => {
    let w = world({
      features: [{ ...AT, feature: APPLE_TREE, apples: 1 }],
      inventory: { wood: 99 },
    });
    w = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y }).state; // the last apple
    w = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y }).state; // felled
    const i = AT.x + SIDE * AT.y;
    expect(w.features[i]).toBe(NO_FEATURE);
    // The apples' wait ended with the tree: the stump's wait for the tree took its place.
    expect(w.regrowIn[i]).toBe(FRONTIER_SHIFT.treeRegrowShifts);
    const later = shifts(holding(w, { wood: 99, apple: 99 }), FRONTIER_SHIFT.appleRegrowShifts + 1);
    expect(later.apples[i]).toBe(0);
    expect(later.features[i]).toBe(NO_FEATURE);
  });
});

describe('felled trees grow back (owner, question 157: "Trees regrow slowly")', () => {
  const i = AT.x + SIDE * AT.y;

  it('a felled tree grows back as the same kind of tree after the set number of shifts', () => {
    for (const feature of [TREE, APPLE_TREE] as const) {
      let w = world({
        features: [{ ...AT, feature, apples: 0 }],
        inventory: { wood: 99, apple: 99 },
      });
      w = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y }).state; // felled
      expect(w.features[i]).toBe(NO_FEATURE);
      expect(w.stumps[i]).toBe(feature);
      const almost = shifts(w, FRONTIER_SHIFT.treeRegrowShifts - 1);
      expect(almost.features[i]).toBe(NO_FEATURE);
      const back = endFrontierShift(almost);
      expect(back.state.features[i]).toBe(feature);
      expect(back.state.stumps[i]).toBe(NO_FEATURE);
      expect(back.state.regrowIn[i]).toBe(-1);
      expect(back.report?.treesRegrown).toBe(1);
      // An apple tree comes back full of apples.
      expect(back.state.apples[i]).toBe(
        feature === APPLE_TREE ? FRONTIER_SURFACE.applesPerTree : 0,
      );
    }
  });

  it('a stump dug out (its square mined) grows nothing back', () => {
    let w = world({ features: [{ ...AT, feature: TREE }], inventory: { wood: 99, apple: 99 } });
    w = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y }).state; // felled
    w = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y }).state; // mined
    expect(w.mined).toBe(1);
    const later = endFrontierShift(shifts(w, FRONTIER_SHIFT.treeRegrowShifts - 1));
    expect(later.state.features[i]).toBe(NO_FEATURE);
    expect(later.state.stumps[i]).toBe(NO_FEATURE);
    expect(later.state.regrowIn[i]).toBe(-1);
    expect(later.report?.treesRegrown).toBe(0);
  });

  it('a camp built over a tree or a stump keeps the stump: it waits under the camp', () => {
    // Owner: "Trees grow back as long as you don't mine the ground directly under them."
    const next = { x: MID + NEXT, y: MID };
    const beside = { x: next.x + 1, y: next.y };
    let w = world({
      features: [
        { ...next, feature: TREE },
        { ...beside, feature: APPLE_TREE, apples: 2 },
      ],
      inventory: rich(),
    });
    const j = next.x + SIDE * next.y;
    const k = beside.x + SIDE * beside.y;
    w = frontierAct(w, { kind: 'tap', x: next.x, y: next.y }).state; // felled
    expect(w.stumps[j]).toBe(TREE);
    const placed = frontierAct(w, { kind: 'place', x: next.x, y: next.y });
    expect(placed.done).toBe(true);
    // The felled tree's stump stays, and the apple tree cleared for the camp leaves one.
    expect(placed.state.stumps[j]).toBe(TREE);
    expect(placed.state.stumps[k]).toBe(APPLE_TREE);
    expect(placed.state.features[k]).toBe(NO_FEATURE);
    expect(placed.state.regrowIn[k]).toBe(FRONTIER_SHIFT.treeRegrowShifts);
    // Long after they are due, nothing grows on the camp's ground: the stumps wait.
    const later = shifts(
      holding(placed.state, { wood: 999, apple: 999 }),
      2 * FRONTIER_SHIFT.treeRegrowShifts,
    );
    expect(later.features[j]).toBe(NO_FEATURE);
    expect(later.stumps[j]).toBe(TREE);
    expect(later.regrowIn[j]).toBe(1);
  });

  it('a stump under a camp grows back once the camp is demolished', () => {
    const i0 = MID + SIDE * MID; // the first camp's middle square
    const w0 = world({ inventory: rich() });
    const stumps = [...w0.stumps];
    stumps[i0] = TREE;
    const regrowIn = [...w0.regrowIn];
    regrowIn[i0] = 1;
    const w = { ...w0, stumps, regrowIn };
    const waited = endFrontierShift(w).state;
    expect(waited.features[i0]).toBe(NO_FEATURE);
    expect(waited.regrowIn[i0]).toBe(1);
    // A second camp covers the first one's ground, so the first can be demolished.
    const placed = frontierAct(waited, { kind: 'place', x: MID + NEXT, y: MID }).state;
    const demolished = frontierAct(placed, { kind: 'demolish', id: 1 });
    expect(demolished.done).toBe(true);
    const grown = endFrontierShift(holding(demolished.state, { wood: 99, apple: 99 }));
    expect(grown.state.features[i0]).toBe(TREE);
    expect(grown.state.stumps[i0]).toBe(NO_FEATURE);
    expect(grown.report?.treesRegrown).toBe(1);
  });

  it('waits a shift more while an animal stands on the stump', () => {
    // The animal is boxed in by trees, so it stays where it is.
    const around = [
      { x: AT.x, y: AT.y - 1 },
      { x: AT.x + 1, y: AT.y },
      { x: AT.x, y: AT.y + 1 },
      { x: AT.x - 1, y: AT.y },
    ].map((s) => ({ ...s, feature: TREE as Feature })); // `as`: map would widen TREE to a plain number
    const w0 = world({
      features: around,
      animals: [{ id: 1, ...AT }],
      inventory: { wood: 99, apple: 99 },
    });
    const stumps = [...w0.stumps];
    stumps[i] = TREE;
    const regrowIn = [...w0.regrowIn];
    regrowIn[i] = 1;
    const w = { ...w0, stumps, regrowIn };
    const blocked = endFrontierShift(w).state;
    expect(blocked.features[i]).toBe(NO_FEATURE);
    expect(blocked.stumps[i]).toBe(TREE);
    expect(blocked.regrowIn[i]).toBe(1);
    const gone = endFrontierShift({ ...blocked, animals: [] }).state;
    expect(gone.features[i]).toBe(TREE);
  });

  it('is the same for the same seed and actions', () => {
    const a = shifts(createFrontier(5), 6);
    const b = shifts(createFrontier(5), 6);
    expect(hashFrontier(a)).toBe(hashFrontier(b));
  });
});
