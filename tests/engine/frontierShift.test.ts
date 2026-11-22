// Shifts in the new game, in the engine (plan A4, section 2): taps a shift,
// End shift (animals, apples, upkeep, hunger), rest and closing the mine.
import { describe, expect, it } from 'vitest';
import { FRONTIER_SHIFT, FRONTIER_SURFACE } from '../../src/data/frontier';
import {
  createFrontier,
  endFrontierShift,
  frontierAct,
  hashFrontier,
  upkeepDue,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
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
    let w = world({ top: '#' });
    for (let i = 0; i < FRONTIER_SHIFT.taps; i += 1) {
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
  it('rest restores the crew, then the shift ends', () => {
    const hungry = shifts(world(), 4);
    expect(hungry.health).toBe(FRONTIER_SHIFT.startHealth - 6);
    const rested = frontierAct(hungry, { kind: 'rest' });
    expect(rested.state.shift).toBe(hungry.shift + 1);
    // Full, less the 1 wood it could not pay at the end of shift 5.
    expect(rested.state.health).toBe(FRONTIER_SHIFT.startHealth - 1);
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

  it('a bare apple tree felled regrows nothing (bug found by the B3 acceptance check)', () => {
    let w = world({
      features: [{ ...AT, feature: APPLE_TREE, apples: 1 }],
      inventory: { wood: 99 },
    });
    w = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y }).state; // the last apple
    w = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y }).state; // felled
    const i = AT.x + SIDE * AT.y;
    expect(w.features[i]).toBe(NO_FEATURE);
    expect(w.regrowIn[i]).toBe(-1);
    const later = shifts(w, FRONTIER_SHIFT.appleRegrowShifts + 1);
    expect(later.apples[i]).toBe(0);
  });

  it('is the same for the same seed and actions', () => {
    const a = shifts(createFrontier(5), 6);
    const b = shifts(createFrontier(5), 6);
    expect(hashFrontier(a)).toBe(hashFrontier(b));
  });
});
