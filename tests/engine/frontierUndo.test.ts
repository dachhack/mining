// Undo in the new game, in the engine (plan A5): leave the newest undoable
// action out and play the shift again from its start. Exact, within the
// shift; catches and apple picks are never undone (question 141).
import { describe, expect, it } from 'vitest';
import { FRONTIER_SHIFT } from '../../src/data/frontier';
import {
  actLogged,
  createFrontier,
  hashFrontier,
  shiftUndoCount,
  startLog,
  undoLastAction,
} from '../../src/engine';
import type { FrontierAction, FrontierState, ShiftLog } from '../../src/engine';
import { APPLE_TREE, GRASS, TREE } from '../../src/engine/frontier/state';
import { AT, MID, NEXT, rich, world } from './frontierHelpers';

/** Play `actions` from `state` with a log, as the screen does. */
function play(
  state: FrontierState,
  actions: FrontierAction[],
): { state: FrontierState; log: ShiftLog } {
  let s = state;
  let log = startLog(state);
  for (const action of actions) {
    const result = actLogged(s, log, action);
    s = result.outcome.state;
    log = result.log;
  }
  return { state: s, log };
}

describe('undo (plan A5)', () => {
  it('takes back each action exactly, newest first, and gives its tap back', () => {
    const start = world({
      top: 'C',
      features: [
        { x: AT.x, y: AT.y + 1, feature: GRASS },
        { x: AT.x, y: AT.y + 2, feature: TREE },
      ],
      inventory: rich(),
    });
    const actions: FrontierAction[] = [
      { kind: 'tap', x: AT.x, y: AT.y }, // mines clay
      { kind: 'tap', x: AT.x, y: AT.y + 1 }, // cuts grass
      { kind: 'tap', x: AT.x, y: AT.y + 2 }, // fells the tree
      { kind: 'place', x: MID + NEXT, y: MID },
      { kind: 'upgrade', id: 2 },
      { kind: 'demolish', id: 1 },
    ];
    // The state before each action, and after all of them.
    const before: string[] = [];
    let s = start;
    let log = startLog(start);
    for (const action of actions) {
      before.push(hashFrontier(s));
      const result = actLogged(s, log, action);
      expect(result.outcome.done, action.kind).toBe(true);
      s = result.outcome.state;
      log = result.log;
    }
    expect(shiftUndoCount(log)).toBe(actions.length);
    expect(s.tapsLeft).toBe(FRONTIER_SHIFT.taps - actions.length);
    for (let k = actions.length - 1; k >= 0; k -= 1) {
      const result = undoLastAction(log);
      if (result === null || 'refused' in result) throw new Error(`undo ${k} failed`);
      expect(result.undone).toEqual(actions[k]);
      expect(hashFrontier(result.state), `before action ${k}`).toBe(before[k]);
      expect(result.state.tapsLeft).toBe(FRONTIER_SHIFT.taps - k);
      log = result.log;
    }
    expect(undoLastAction(log)).toBeNull();
  });

  it('never undoes a catch or an apple pick, and steps past them', () => {
    const start = world({
      top: 'C',
      features: [{ x: AT.x, y: AT.y + 1, feature: APPLE_TREE, apples: 3 }],
      animals: [{ id: 1, x: AT.x, y: AT.y + 2 }],
    });
    const { state, log } = play(start, [
      { kind: 'tap', x: AT.x, y: AT.y }, // dig
      { kind: 'tap', x: AT.x, y: AT.y + 2 }, // catch
      { kind: 'tap', x: AT.x, y: AT.y + 1 }, // pick
    ]);
    expect(state.inventory.get('animal')).toBe(1);
    expect(shiftUndoCount(log)).toBe(1);
    const result = undoLastAction(log);
    if (result === null || 'refused' in result) throw new Error('undo failed');
    expect(result.undone).toEqual({ kind: 'tap', x: AT.x, y: AT.y });
    // The dig is gone; the catch and the pick stay, and their taps stay spent.
    expect(result.state.mined).toBe(0);
    expect(result.state.inventory.get('animal')).toBe(1);
    expect(result.state.inventory.get('apple')).toBe(1);
    expect(result.state.animals).toEqual([]);
    expect(result.state.tapsLeft).toBe(FRONTIER_SHIFT.taps - 2);
    expect(undoLastAction(result.log)).toBeNull();
  });

  it('does not reach back past the end of a shift', () => {
    const start = holding(createFrontier(110));
    const camp = start.camps[0] ?? { x: 0, y: 0 };
    const { log } = play(start, [{ kind: 'tap', x: camp.x + 2, y: camp.y }, { kind: 'endShift' }]);
    expect(log.actions).toEqual([]);
    expect(undoLastAction(log)).toBeNull();
  });

  it('records nothing for an action that did nothing', () => {
    const { log } = play(world(), [{ kind: 'tap', x: 0, y: 0 }]); // fog
    expect(log.actions).toEqual([]);
  });
});

/** `state` holding plenty of wood and apples, so End shift costs no health. */
function holding(state: FrontierState): FrontierState {
  return {
    ...state,
    inventory: new Map([
      ['wood', 9],
      ['apple', 9],
    ]),
  };
}
