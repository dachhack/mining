// Tests of what index.ts does for every action, whatever the rule: copy the
// state, check the action is legal, spend its AP, and collect the events.
//
// The real rule modules are still stubs, so no action is legal yet. To test
// the dispatcher anyway, this file swaps four of them (leave, shift, gravity,
// reveal) for small fakes:
//
// - `vi.mock(path, factory)` tells Vitest that, in this test file only,
//   anything importing the module at `path` gets what `factory` returns
//   instead. (Python readers: like `unittest.mock.patch` on a module.)
// - The fake "leave" action costs 2 AP and deliberately scribbles on every
//   part of the state it is given. If the dispatcher handed it the caller's
//   state rather than a copy, the tests below would see the damage.
// - Every fake appends its name to `calls`, so the tests can check the order
//   the dispatcher calls them in.
//
// The tests of the real rules, in later tasks, use no mocks.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAction,
  createRun,
  endShift,
  hashState,
  legalActions,
  previewCubePhase,
} from '../../src/engine';
import type { Action, GameEvent, GameState, ShiftForecast } from '../../src/engine';
import { act, buildState, findActions } from './helpers';

const FAKE_LEAVE_COST = 2;

// The fakes record the order they were called in here.
const calls: string[] = [];
// Set by a test to make the fake cube phase end the run.
let cubePhaseEndsRun = false;

const FAKE_FORECAST: ShiftForecast = {
  hazards: [{ kind: 'test', cells: [], inShifts: 1 }],
  upkeep: {
    fuelConsumed: 1,
    fuelAfter: 9,
    lampOilBurned: 0,
    lampOilAfter: 10,
    runEnds: null,
  },
};

vi.mock('../../src/engine/actions/leave', () => ({
  legalLeaveActions: (): Action[] => [{ type: 'leave', ap: FAKE_LEAVE_COST }],
  applyLeave: (state: GameState, _action: Action, events: GameEvent[]): void => {
    calls.push('applyLeave');
    state.blocks.fill(0);
    state.revealed.fill(1);
    state.structures.fill(1);
    state.avatar.pos.x += 1;
    state.avatar.health -= 1;
    state.fuel -= 3;
    state.rng.s += 1;
    state.inventory['stone'] = 9;
    state.looseItems.push({ pos: { x: 0, y: 0, z: 0 }, item: 'coal', count: 1 });
    events.push({ type: 'fuelChanged', delta: -3, fuel: state.fuel, reason: 'upkeep' });
  },
}));

vi.mock('../../src/engine/gravity', () => ({
  settle: (): void => {
    calls.push('settle');
  },
}));

vi.mock('../../src/engine/reveal', () => ({
  updateReveal: (): void => {
    calls.push('updateReveal');
  },
}));

vi.mock('../../src/engine/tells', () => ({
  updateMineralTraces: (): void => {
    calls.push('updateMineralTraces');
  },
}));

vi.mock('../../src/engine/shift', () => ({
  runCubePhase: (state: GameState, events: GameEvent[]): void => {
    calls.push('runCubePhase');
    state.blocks.fill(0);
    if (cubePhaseEndsRun) {
      state.status = { kind: 'ended', outcome: 'death', cause: 'fell' };
      events.push({ type: 'runEnded', outcome: 'death', cause: 'fell' });
    }
  },
  runUpkeep: (state: GameState, events: GameEvent[]): void => {
    calls.push('runUpkeep');
    state.fuel -= 1;
    state.shift += 1;
    state.inventory['stone'] = 9;
    events.push({ type: 'shiftEnded', shift: state.shift - 1, nextShift: state.shift });
  },
  forecastShift: (): ShiftForecast => FAKE_FORECAST,
}));

function startState(ap: number): GameState {
  return buildState({
    layers: [
      ['##', '##'],
      ['##', '##'],
    ],
    ap,
    fuel: 10,
    inventory: { timber: 1 },
  });
}

const LEAVE: Action = { type: 'leave', ap: FAKE_LEAVE_COST };

beforeEach(() => {
  calls.length = 0; // empty the list
  cubePhaseEndsRun = false;
});

describe('applyAction', () => {
  it('does not change the state it is given', () => {
    const state = startState(5);
    const before = hashState(state);
    const beforeBlocks = state.blocks.slice();

    const result = applyAction(state, LEAVE);

    expect(hashState(state)).toBe(before);
    expect(state.blocks).toEqual(beforeBlocks);
    expect(state.avatar.pos).toEqual({ x: 0, y: 0, z: -1 });
    expect(state.inventory).toEqual({ timber: 1 });
    expect(state.looseItems).toEqual([]);
    expect(state.ap).toBe(5);

    // The returned state is a different object and does carry the changes.
    expect(result.state).not.toBe(state);
    expect(result.state.blocks).not.toBe(state.blocks);
    expect(result.state.fuel).toBe(7);
    expect(result.state.avatar.pos.x).toBe(1);
    expect(hashState(result.state)).not.toBe(before);
  });

  it('applies the action, then gravity, then reveal, in that order (0006)', () => {
    applyAction(startState(5), LEAVE);
    expect(calls).toEqual(['applyLeave', 'settle', 'updateReveal', 'updateMineralTraces']);
  });

  it('spends the AP of the action and returns the events', () => {
    const state = startState(5);
    const { state: after, events } = applyAction(state, LEAVE);
    expect(after.ap).toBe(5 - FAKE_LEAVE_COST);
    expect(events).toEqual([{ type: 'fuelChanged', delta: -3, fuel: 7, reason: 'upkeep' }]);
  });

  it('gives the same result when the same action is applied to the same state twice', () => {
    const state = startState(5);
    const first = applyAction(state, LEAVE);
    const second = applyAction(state, LEAVE);
    expect(hashState(second.state)).toBe(hashState(first.state));
    expect(second.events).toEqual(first.events);
  });

  it('rejects an action that is not in the legal list, and leaves the state alone', () => {
    const state = startState(5);
    const before = hashState(state);
    // Mining is not legal here (its module is still a stub that offers nothing).
    const mine: Action = { type: 'mine', target: { x: 0, y: 0, z: 0 }, ap: 2 };
    expect(() => applyAction(state, mine)).toThrow('Not a legal action');
    // The right kind of action with a wrong field is not legal either.
    expect(() => applyAction(state, { type: 'leave', ap: 0 })).toThrow('Not a legal action');
    expect(calls).toEqual([]);
    expect(hashState(state)).toBe(before);
  });

  it('rejects an action that costs more AP than the avatar has', () => {
    const state = startState(FAKE_LEAVE_COST - 1);
    expect(findActions(state, { type: 'leave' })).toEqual([]);
    expect(() => applyAction(state, LEAVE)).toThrow('Not a legal action');

    // With exactly enough AP it is legal.
    const enough = startState(FAKE_LEAVE_COST);
    expect(findActions(enough, { type: 'leave' })).toEqual([LEAVE]);
    expect(applyAction(enough, LEAVE).state.ap).toBe(0);
  });

  it('rejects every action once the run has ended', () => {
    const state = startState(5);
    state.status = { kind: 'ended', outcome: 'salvage', cause: 'left' };
    expect(legalActions(state)).toEqual([]);
    expect(() => applyAction(state, LEAVE)).toThrow('The run has ended');
    expect(calls).toEqual([]);
  });
});

describe('legalActions', () => {
  it('returns the actions of the rule modules without changing the state', () => {
    const state = startState(5);
    const before = hashState(state);
    expect(findActions(state, { type: 'leave' })).toEqual([LEAVE]);
    expect(hashState(state)).toBe(before);
  });
});

describe('endShift', () => {
  it('runs the cube phase, gravity, upkeep, then reveal, in that order (0006)', () => {
    endShift(startState(5));
    expect(calls).toEqual([
      'runCubePhase',
      'settle',
      'runUpkeep',
      'updateReveal',
      'updateMineralTraces',
    ]);
  });

  it('skips upkeep when the cube phase ends the run', () => {
    cubePhaseEndsRun = true;
    const state = startState(5);
    const { state: after, events } = endShift(state);
    expect(calls).toEqual(['runCubePhase', 'settle', 'updateReveal', 'updateMineralTraces']);
    expect(after.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });
    // No fuel taken and no new shift: the fake upkeep never ran.
    expect(after.fuel).toBe(state.fuel);
    expect(after.shift).toBe(state.shift);
    expect(events).toEqual([{ type: 'runEnded', outcome: 'death', cause: 'fell' }]);
  });

  it('works on a copy of the state', () => {
    const state = startState(5);
    const before = hashState(state);

    const { state: after, events } = endShift(state);

    expect(hashState(state)).toBe(before);
    expect(state.fuel).toBe(10);
    expect(state.inventory).toEqual({ timber: 1 });

    expect(after).not.toBe(state);
    expect(after.fuel).toBe(9);
    expect(after.shift).toBe(state.shift + 1);
    expect(events).toEqual([{ type: 'shiftEnded', shift: state.shift, nextShift: after.shift }]);
  });

  it('refuses to end a shift once the run has ended', () => {
    const state = startState(5);
    state.status = { kind: 'ended', outcome: 'death', cause: 'outOfFuel' };
    expect(() => endShift(state)).toThrow('The run has ended');
    expect(calls).toEqual([]);
  });
});

describe('previewCubePhase', () => {
  it('returns the forecast without changing the state', () => {
    const state = startState(5);
    const before = hashState(state);
    expect(previewCubePhase(state)).toEqual(FAKE_FORECAST);
    expect(hashState(state)).toBe(before);
  });

  it('refuses once the run has ended, as endShift does', () => {
    const state = startState(5);
    state.status = { kind: 'ended', outcome: 'death', cause: 'fell' };
    expect(() => previewCubePhase(state)).toThrow('The run has ended');
  });
});

describe('createRun', () => {
  it('reveals what can be seen from the start', () => {
    createRun(1, 'none', 'standard');
    expect(calls).toEqual(['updateReveal', 'updateMineralTraces']);
  });
});

describe('the act and findActions test helpers', () => {
  it('find a legal action from a partial description and apply it', () => {
    const state = startState(5);
    expect(findActions(state, { type: 'leave' })).toEqual([LEAVE]);
    expect(findActions(state, { type: 'move', to: { x: 9, y: 9, z: 9 } })).toEqual([]);
    expect(act(state, { type: 'leave' }).state.ap).toBe(5 - FAKE_LEAVE_COST);
    expect(() => act(state, { type: 'mine' })).toThrow('found 0');
  });
});
