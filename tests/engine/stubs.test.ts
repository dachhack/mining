// The rule modules were stubs until M1 tasks 2 to 5, and the M2 action
// modules are stubs until their tasks (placing a support is built: issue #94;
// the camp tools: issue #104). This file pins the one
// thing every later task relies on in the meantime: that the stubs keep the
// engine usable (nothing legal, nothing thrown), so tasks can be built and
// tested one at a time in any order.
//
// Each task deletes the lines about the module it fills in.
//
// M1 task 5 filled in shift, craft and leave (now "close the mine"). With
// those real, a new run has legal actions, and with shift real an end of
// shift changes the state, so the three stub tests that pinned the opposite
// are gone; the real rules are tested in shift.test.ts, craft.test.ts and
// closeMine.test.ts.

import { describe, expect, it } from 'vitest';
import { actionKey, sameAction } from '../../src/engine';
import type { Action } from '../../src/engine';
import { buildState } from './helpers';

describe('actionKey and sameAction', () => {
  // One of each kind of action.
  const actions: Action[] = [
    { type: 'mine', x: 1, y: 2, ap: 2 },
    { type: 'cutTree', x: 1, y: 2, ap: 2 },
    { type: 'placeSupport', x: 1, y: 2, ap: 1 },
    { type: 'craft', recipe: 'support', ap: 1 },
    { type: 'closeMine', ap: 0 },
    // The M2 actions (decision note 0015).
    { type: 'placeExplosive', target: { x: 1, y: 2, z: 3 }, ap: 1 },
    { type: 'placePump', x: 1, y: 2, ap: 1 },
    { type: 'placeVent', x: 1, y: 2, ap: 1 },
    { type: 'seal', x: 1, y: 2, ap: 1 },
    { type: 'scan', x: 1, y: 2, ap: 2 },
    { type: 'foundCamp', x: 1, y: 2, ap: 5 },
    { type: 'rest', x: 1, y: 2, ap: 5 },
    { type: 'decommissionCamp', x: 1, y: 2, ap: 1 },
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
    const mine: Action = { type: 'mine', x: 1, y: 2, ap: 2 };
    expect(sameAction(mine, { ...mine, x: 2 })).toBe(false);
    expect(sameAction(mine, { ...mine, y: 1 })).toBe(false);
    // The same square, another kind of action.
    expect(sameAction(mine, { ...mine, type: 'cutTree' })).toBe(false);
    const craft: Action = { type: 'craft', recipe: 'support', ap: 1 };
    expect(sameAction(craft, { ...craft, recipe: 'fuel' })).toBe(false);
    const scan: Action = { type: 'scan', x: 1, y: 2, ap: 2 };
    expect(sameAction(scan, { ...scan, y: 3 })).toBe(false);
  });
});

describe('the M2 action modules are stubs (decision note 0015)', () => {
  // One test for each stub module, each with its own import inside it, so
  // that the task filling a module in deletes one block here and touches no
  // line another task touches. `await import(...)` loads a module where it
  // is needed, like an `import` statement inside a Python function.
  const state = buildState({
    layers: [['#.#'], ['###']],
    revealAll: true,
    stockpile: { explosive: 1, pump: 1, vent: 1, sealant: 1 },
  });

  it('placeExplosive offers nothing (until M2-5)', async () => {
    const { legalPlaceExplosiveActions } = await import('../../src/engine/actions/placeExplosive');
    expect(legalPlaceExplosiveActions(state)).toEqual([]);
  });

});
