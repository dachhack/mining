// The rule modules are stubs until M1 tasks 2 to 5. This file pins the one
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
  });
});
