// Scenario tests for leaving (0005 item 23; design doc 9.4). There is no
// miner since issue #86, so leaving is offered at any time (decision note
// 0026) until task T6 turns it into "close the mine".

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS } from '../../src/data';
import { applyAction, endShift, legalActions } from '../../src/engine';
import { act, buildState, findActions } from './helpers';

// A 3 x 3 x 2 stone cube with a one-square pit in the middle.
const LAYERS = [
  ['###', '#.#', '###'],
  ['###', '###', '###'],
];

describe('leave', () => {
  it('is always legal, and costs what the data says', () => {
    const state = buildState({ layers: LAYERS });
    expect(findActions(state, { type: 'leave' })).toEqual([
      { type: 'leave', ap: ACTION_COSTS.leave },
    ]);
  });

  it('is legal with no AP left, because it costs 0', () => {
    expect(ACTION_COSTS.leave).toBe(0);
    const state = buildState({ layers: LAYERS, ap: 0 });
    expect(findActions(state, { type: 'leave' })).toHaveLength(1);
  });

  it('is refused with the wrong cost', () => {
    const state = buildState({ layers: LAYERS });
    expect(() => applyAction(state, { type: 'leave', ap: ACTION_COSTS.leave + 1 })).toThrow(
      'Not a legal action',
    );
  });

  it('ends the run with outcome "salvage"', () => {
    const state = buildState({ layers: LAYERS, revealAll: true, inventory: { coal: 2 } });
    const { state: after, events } = act(state, { type: 'leave' });
    expect(after.status).toEqual({ kind: 'ended', outcome: 'salvage', cause: 'left' });
    expect(events).toEqual([{ type: 'runEnded', outcome: 'salvage', cause: 'left' }]);
    // What was carried is still there to be scored.
    expect(after.inventory).toEqual({ coal: 2 });
    // The state passed in is untouched.
    expect(state.status).toEqual({ kind: 'active' });
  });

  it('after leaving, there are no legal actions and endShift throws', () => {
    const { state: after } = act(buildState({ layers: LAYERS }), { type: 'leave' });
    expect(legalActions(after)).toEqual([]);
    expect(() => endShift(after)).toThrow('The run has ended');
  });
});
