// Progression PR 4 (docs/plans/progression-phases.md, section 6.3): hay from
// grass, animal pens, breeding, and hay in the level-3 upgrade.
import { describe, expect, it } from 'vitest';
import { FRONTIER_FOODS, FRONTIER_PEN } from '../../src/data/frontier';
import { demolishFrontierCamp, frontierAct, upgradeCostFrom } from '../../src/engine';
import type { FrontierAction, FrontierState } from '../../src/engine';
import { MID, NEXT, rich, world as baseWorld } from './frontierHelpers';
import type { WorldOptions } from './frontierHelpers';

/** A test world whose first camp is at level 2, which may have a pen (FRONTIER_PEN.minLevel). */
function world(options: WorldOptions = {}): FrontierState {
  const w = baseWorld(options);
  return { ...w, camps: w.camps.map((c) => ({ ...c, level: 2 })) };
}

/** Do `actions` in order, each of which must do something. */
function play(state: FrontierState, actions: FrontierAction[]): FrontierState {
  let s = state;
  for (const action of actions) {
    const out = frontierAct(s, action);
    expect(out.done, `${action.kind}: ${out.refusal ?? ''}`).toBe(true);
    s = out.state;
  }
  return s;
}

/** End a shift with upkeep paid in wood and grass (grass is eaten before hay, apples and animals). */
function endShift(state: FrontierState): FrontierState {
  const fed = new Map([...state.inventory, ['wood', 50], ['grass', 150]]);
  return frontierAct({ ...state, inventory: fed }, { kind: 'endShift' }).state;
}

const penAt1 = (s: FrontierState) => s.camps.find((c) => c.id === 1);

describe('hay (plan section 6.3)', () => {
  it('is made from 3 grass without a smelter, and pays food after grass, before apples', () => {
    const made = frontierAct(world({ inventory: { grass: 3 } }), { kind: 'make', recipe: 'hay' });
    expect(made.done).toBe(true);
    expect(made.state.inventory.get('hay')).toBe(1);
    expect(FRONTIER_FOODS.map((f) => f.item)).toEqual(['grass', 'hay', 'apple', 'animal']);
    const hungry = { ...world({ inventory: { wood: 5, hay: 1, apple: 1 } }), shift: 2 };
    const fed = frontierAct(hungry, { kind: 'endShift' });
    expect(fed.report?.paid).toContainEqual({ item: 'hay', count: 1 });
    expect(fed.state.inventory.get('apple')).toBe(1);
  });

  it('is part of the level-3 upgrade', () => {
    expect(upgradeCostFrom(2)).toContainEqual({ item: 'hay', count: 10 });
  });
});

describe('animal pens (plan section 6.3)', () => {
  it('are built at a camp for wood and 1 tap, one per camp', () => {
    const w = world({ inventory: { wood: 20 } });
    const built = play(w, [{ kind: 'buildPen', id: 1 }]);
    expect(penAt1(built)?.pen).toBe(true);
    expect(built.inventory.get('wood')).toBe(20 - 10);
    expect(built.tapsLeft).toBe(w.tapsLeft - 1);
    expect(frontierAct(built, { kind: 'buildPen', id: 1 }).refusal).toBe('hasPen');
    expect(frontierAct(world(), { kind: 'buildPen', id: 1 }).refusal).toBe('cost');
    expect(frontierAct(w, { kind: 'buildPen', id: 9 }).refusal).toBe('missing');
    expect(
      frontierAct(baseWorld({ inventory: { wood: 20 } }), { kind: 'buildPen', id: 1 }).refusal,
    ).toBe('campLevel');
    expect(frontierAct(w, { kind: 'penIn', id: 1 }).refusal).toBe('noPen');
  });

  it('take animals from the store and give them back, 1 tap each, up to the capacity', () => {
    const w = world({ inventory: { wood: 10, animal: FRONTIER_PEN.capacity + 1 } });
    let s = play(w, [{ kind: 'buildPen', id: 1 }]);
    expect(frontierAct(s, { kind: 'penOut', id: 1 }).refusal).toBe('empty');
    for (let k = 0; k < FRONTIER_PEN.capacity; k += 1) s = play(s, [{ kind: 'penIn', id: 1 }]);
    expect(penAt1(s)?.penned).toBe(FRONTIER_PEN.capacity);
    expect(s.inventory.get('animal')).toBe(1);
    expect(frontierAct(s, { kind: 'penIn', id: 1 }).refusal).toBe('full');
    s = play(s, [{ kind: 'penOut', id: 1 }]);
    expect(s.inventory.get('animal')).toBe(2);
    expect(
      frontierAct(play(w, [{ kind: 'buildPen', id: 1 }]), { kind: 'penIn', id: 9 }).refusal,
    ).toBe('missing');
  });

  it('keep their animals from upkeep: the crew goes hungry before a penned animal is eaten', () => {
    const s = play(world({ inventory: { wood: 10, animal: 1 } }), [
      { kind: 'buildPen', id: 1 },
      { kind: 'penIn', id: 1 },
    ]);
    const out = frontierAct(
      { ...s, shift: 2, inventory: new Map([['wood', 5]]) },
      { kind: 'endShift' },
    );
    expect(out.report?.unpaid).toContainEqual({ item: 'food', count: 1 });
    expect(penAt1(out.state)?.penned).toBe(1);
  });

  it('breed every few shifts with 2 animals or more and room, eating hay', () => {
    let s = play(world({ inventory: { wood: 10, animal: 2, hay: 4 } }), [
      { kind: 'buildPen', id: 1 },
      { kind: 'penIn', id: 1 },
    ]);
    expect(penAt1(s)?.breedIn).toBe(0); // one animal: no breeding
    s = play(s, [{ kind: 'penIn', id: 1 }]);
    expect(penAt1(s)?.breedIn).toBe(FRONTIER_PEN.breedEveryShifts);
    for (let k = 1; k < FRONTIER_PEN.breedEveryShifts; k += 1) s = endShift(s);
    expect(penAt1(s)?.penned).toBe(2);
    const fed = new Map([...s.inventory, ['wood', 50], ['grass', 150]]);
    const out = frontierAct({ ...s, inventory: fed }, { kind: 'endShift' });
    expect(out.report?.born).toBe(1);
    expect(penAt1(out.state)?.penned).toBe(3);
    expect(out.state.inventory.get('hay')).toBe(4 - FRONTIER_PEN.hayPerBirth);
    expect(penAt1(out.state)?.breedIn).toBe(FRONTIER_PEN.breedEveryShifts);
  });

  it('wait for hay, and stop when full', () => {
    let s = play(world({ inventory: { wood: 10, animal: 3 } }), [
      { kind: 'buildPen', id: 1 },
      { kind: 'penIn', id: 1 },
      { kind: 'penIn', id: 1 },
    ]);
    for (let k = 0; k < FRONTIER_PEN.breedEveryShifts + 2; k += 1) s = endShift(s);
    expect(penAt1(s)?.penned).toBe(2);
    expect(penAt1(s)?.breedIn).toBe(1); // waiting for hay
    s = endShift({ ...s, inventory: new Map([...s.inventory, ['hay', 2]]) });
    expect(penAt1(s)?.penned).toBe(3);
    // Full: no count.
    const full = play({ ...s, inventory: new Map([...s.inventory, ['animal', 1]]) }, [
      { kind: 'penIn', id: 1 },
    ]);
    expect(penAt1(full)?.penned).toBe(FRONTIER_PEN.capacity);
    expect(penAt1(full)?.breedIn).toBe(0);
  });

  it('go with their camp: its animals go back to the store', () => {
    const w = world({ inventory: { ...rich(), animal: 99 } });
    let s = play(w, [
      { kind: 'place', x: MID + NEXT, y: MID },
      { kind: 'upgrade', id: 2 },
      { kind: 'buildPen', id: 1 },
      { kind: 'penIn', id: 1 },
      { kind: 'penIn', id: 1 },
    ]);
    const animals = s.inventory.get('animal') ?? 0;
    s = demolishFrontierCamp(s, 1);
    expect(s.camps.map((c) => c.id)).toEqual([2]);
    expect(s.inventory.get('animal')).toBe(animals + 2);
  });
});
