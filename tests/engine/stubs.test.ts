// The rule modules were stubs until M1 tasks 2 to 5, and the M2 action
// modules are stubs until M2 tasks 3, 5, 7, 8 and 9. This file pins the one
// thing every later task relies on in the meantime: that the stubs keep the
// engine usable (nothing legal, nothing thrown), so tasks can be built and
// tested one at a time in any order.
//
// Each task deletes the lines about the module it fills in.
//
// M1 task 5 filled in shift, craft and leave. With craft and leave real, a new
// run has legal actions, and with shift real an end of shift changes the
// state, so the three stub tests that pinned the opposite are gone; the real
// rules are tested in shift.test.ts, craft.test.ts and leave.test.ts.

import { describe, expect, it } from 'vitest';
import { actionKey, sameAction } from '../../src/engine';
import type { Action } from '../../src/engine';
import { buildState } from './helpers';

describe('actionKey and sameAction', () => {
  // One of each kind of action.
  const actions: Action[] = [
    { type: 'move', to: { x: 1, y: 2, z: 3 }, drop: 0, ap: 1 },
    { type: 'mine', target: { x: 1, y: 2, z: 3 }, ap: 2 },
    { type: 'placeLadder', target: { x: 1, y: 2, z: 3 }, ap: 1 },
    { type: 'placeTorch', target: { x: 1, y: 2, z: 3 }, ap: 1 },
    { type: 'craft', recipe: 'ladder', ap: 1 },
    { type: 'pickUp', from: { x: 1, y: 2, z: 3 }, item: 'coal', count: 2, ap: 0 },
    { type: 'drop', item: 'coal', count: 2, ap: 0 },
    { type: 'leave', ap: 0 },
    // The M2 actions (decision note 0015).
    { type: 'placeSupport', target: { x: 1, y: 2, z: 3 }, ap: 1 },
    { type: 'placeExplosive', target: { x: 1, y: 2, z: 3 }, ap: 1 },
    { type: 'placePump', target: { x: 1, y: 2, z: 3 }, ap: 1 },
    { type: 'placeVent', target: { x: 1, y: 2, z: 3 }, ap: 1 },
    { type: 'placeSafetyLamp', target: { x: 1, y: 2, z: 3 }, ap: 1 },
    { type: 'seal', target: { x: 1, y: 2, z: 3 }, ap: 1 },
    { type: 'scan', centre: { x: 1, y: 2, z: 3 }, ap: 2 },
    { type: 'foundCamp', ap: 5 },
    { type: 'rest', ap: 5 },
    { type: 'stashPut', item: 'coal', count: 2, ap: 0 },
    { type: 'stashTake', item: 'coal', count: 2, ap: 0 },
    { type: 'decommissionCamp', ap: 1 },
    { type: 'giveUp', ap: 0 },
  ];

  it('give every kind of action its own key', () => {
    const keys = new Set(actions.map(actionKey));
    expect(keys.size).toBe(actions.length);
  });

  it('treat two actions as the same only when every field is the same', () => {
    for (const action of actions) {
      // structuredClone: a deep copy, so an equal but separate object.
      expect(sameAction(action, structuredClone(action))).toBe(true);
      expect(sameAction(action, { ...action, ap: action.ap + 1 })).toBe(false);
    }
    const move: Action = { type: 'move', to: { x: 1, y: 2, z: 3 }, drop: 0, ap: 1 };
    expect(sameAction(move, { ...move, to: { x: 1, y: 2, z: 4 } })).toBe(false);
    expect(sameAction(move, { ...move, drop: 1 })).toBe(false);
    const pickUp: Action = {
      type: 'pickUp',
      from: { x: 0, y: 0, z: 0 },
      item: 'coal',
      count: 1,
      ap: 0,
    };
    expect(sameAction(pickUp, { ...pickUp, item: 'stone' })).toBe(false);
    expect(sameAction(pickUp, { ...pickUp, count: 2 })).toBe(false);
    const scan: Action = { type: 'scan', centre: { x: 1, y: 2, z: 3 }, ap: 2 };
    expect(sameAction(scan, { ...scan, centre: { x: 1, y: 2, z: 4 } })).toBe(false);
    const stash: Action = { type: 'stashPut', item: 'coal', count: 2, ap: 0 };
    expect(sameAction(stash, { ...stash, item: 'stone' })).toBe(false);
    expect(sameAction(stash, { ...stash, count: 3 })).toBe(false);
    expect(sameAction(stash, { ...stash, type: 'stashTake' })).toBe(false);
  });
});

describe('the M2 action modules are stubs (decision note 0015)', () => {
  // One test for each stub module, each with its own import inside it, so
  // that the task filling a module in deletes one block here and touches no
  // line another task touches. `await import(...)` loads a module where it
  // is needed, like an `import` statement inside a Python function.
  const state = buildState({
    layers: [['#.#'], ['###']],
    avatar: { x: 1, y: 0, z: 0 },
    revealAll: true,
    inventory: { support: 2, explosive: 1, pump: 1, vent: 1, safetyLamp: 1, sealant: 1 },
  });

  it('placeSupport offers nothing (until M2-3)', async () => {
    const { legalPlaceSupportActions } = await import('../../src/engine/actions/placeSupport');
    expect(legalPlaceSupportActions(state)).toEqual([]);
  });

  it('placeExplosive offers nothing (until M2-5)', async () => {
    const { legalPlaceExplosiveActions } = await import('../../src/engine/actions/placeExplosive');
    expect(legalPlaceExplosiveActions(state)).toEqual([]);
  });

  it('camp offers nothing (until M2-7)', async () => {
    const { legalCampActions } = await import('../../src/engine/actions/camp');
    expect(legalCampActions(state)).toEqual([]);
  });

  it('campTools offers nothing (until M2-8)', async () => {
    const { legalCampToolActions } = await import('../../src/engine/actions/campTools');
    expect(legalCampToolActions(state)).toEqual([]);
  });

  it('giveUp offers nothing (until M2-9)', async () => {
    const { legalGiveUpActions } = await import('../../src/engine/actions/giveUp');
    expect(legalGiveUpActions(state)).toEqual([]);
  });

  it('no camp has an air line (until M2-7)', async () => {
    const { campAirLineIntact } = await import('../../src/engine/airLine');
    const camp = { pos: { x: 1, y: 0, z: 0 }, foundedShift: 1, stash: {} };
    expect(campAirLineIntact(state, camp)).toBe(false);
  });
});
