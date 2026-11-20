// Scenario tests for "close the mine" (design doc 4.1, 9.3 and 9.4; owner
// question 88; issue #92): 0 AP, at any time, ends the run alive as salvage.
// It replaces "leave", which needed a miner standing on the surface.

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS } from '../../src/data';
import { applyAction, endShift, legalActions } from '../../src/engine';
import type { Action } from '../../src/engine';
import { act, buildState, findActions } from './helpers';

// A 3 x 3 x 2 stone cube with a one-square pit in the middle.
const LAYERS = [
  ['###', '#.#', '###'],
  ['###', '###', '###'],
];

describe('close the mine', () => {
  it('is always legal, and costs what the data says', () => {
    const state = buildState({ layers: LAYERS });
    expect(findActions(state, { type: 'closeMine' })).toEqual([
      { type: 'closeMine', ap: ACTION_COSTS.closeMine },
    ]);
  });

  it('costs 0 AP, so it is legal with no AP left', () => {
    expect(ACTION_COSTS.closeMine).toBe(0);
    const state = buildState({ layers: LAYERS, ap: 0 });
    expect(findActions(state, { type: 'closeMine' })).toHaveLength(1);
  });

  it('is legal at any time: on the first shift, on a later one, and after other actions', () => {
    // A later shift, part-way through it, with a square already dug.
    const state = buildState({ layers: LAYERS, shift: 40, ap: 3 });
    expect(findActions(state, { type: 'closeMine' })).toHaveLength(1);
    // After a mine in the same shift it is still there.
    const afterMine = act(state, { type: 'mine', x: 0, y: 0 }).state;
    expect(findActions(afterMine, { type: 'closeMine' })).toHaveLength(1);
    // And after ending a shift.
    const nextShift = endShift(afterMine).state;
    expect(findActions(nextShift, { type: 'closeMine' })).toHaveLength(1);
  });

  it('is refused with the wrong cost', () => {
    const state = buildState({ layers: LAYERS });
    expect(() => applyAction(state, { type: 'closeMine', ap: ACTION_COSTS.closeMine + 1 })).toThrow(
      'Not a legal action',
    );
  });

  it('ends the run with the outcome "salvage" and the cause "mineClosed"', () => {
    const state = buildState({ layers: LAYERS, revealAll: true, stockpile: { coal: 2 } });
    const { state: after, events } = act(state, { type: 'closeMine' });
    expect(after.status).toEqual({ kind: 'ended', outcome: 'salvage', cause: 'mineClosed' });
    expect(events).toEqual([{ type: 'runEnded', outcome: 'salvage', cause: 'mineClosed' }]);
    // The stockpile is still there to be scored, and no AP or fuel was spent.
    expect(after.stockpile).toEqual({ coal: 2 });
    expect(after.ap).toBe(state.ap);
    expect(after.fuel).toBe(state.fuel);
    // The state passed in is untouched.
    expect(state.status).toEqual({ kind: 'active' });
  });

  it('after the mine is closed, there are no legal actions and endShift throws', () => {
    const { state: after } = act(buildState({ layers: LAYERS }), { type: 'closeMine' });
    expect(legalActions(after)).toEqual([]);
    expect(() => endShift(after)).toThrow('The run has ended');
  });

  it('the old "leave" action is gone: it is not a legal action', () => {
    const state = buildState({ layers: LAYERS });
    // `as unknown as Action`: the type no longer allows 'leave', which is the
    // point; this is what an old play log would hand the engine.
    const leave = { type: 'leave', ap: 0 } as unknown as Action;
    expect(() => applyAction(state, leave)).toThrow();
    expect(legalActions(state).map((action) => action.type as string)).not.toContain('leave');
  });
});
