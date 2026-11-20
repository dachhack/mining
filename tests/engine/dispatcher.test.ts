// Tests of what index.ts does for every action, whatever the rule: copy the
// state, check the action is legal, spend its AP, and collect the events.
//
// The real rule modules are still stubs, so no action is legal yet. To test
// the dispatcher anyway, this file swaps some of them (close the mine, shift,
// reveal, tells) for small fakes:
//
// - `vi.mock(path, factory)` tells Vitest that, in this test file only,
//   anything importing the module at `path` gets what `factory` returns
//   instead. (Python readers: like `unittest.mock.patch` on a module.)
// - The fake "close the mine" action costs 2 AP and deliberately scribbles on every
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

const FAKE_CLOSE_COST = 2;

// The fakes record the order they were called in here.
const calls: string[] = [];
// Set by a test to make the fake cube phase end the run.
let cubePhaseEndsRun = false;

const FAKE_FORECAST: ShiftForecast = {
  countdowns: [{ kind: 'explosive', pos: { x: 0, y: 0, z: 0 }, inShifts: 1 }],
  slumps: [],
  flows: [],
  gas: [],
  crew: {
    damage: [],
    total: 0,
    totalAtLeast: 0,
    exact: true,
    health: 10,
    healthAfter: 10,
    runLost: 'no',
    lossCause: null,
  },
  upkeep: {
    fuelConsumed: 1,
    campFuelConsumed: 0,
    fuelAfter: 9,
    runEnds: null,
  },
  regrowth: [],
};

vi.mock('../../src/engine/actions/closeMine', () => ({
  legalCloseMineActions: (): Action[] => [{ type: 'closeMine', ap: FAKE_CLOSE_COST }],
  applyCloseMine: (state: GameState, _action: Action, events: GameEvent[]): void => {
    calls.push('applyCloseMine');
    state.blocks.fill(0);
    state.revealed.fill(1);
    state.structures.fill(1);
    state.crew.health -= 1;
    state.fuel -= 3;
    state.rng.s += 1;
    state.stockpile['stone'] = 9;
    events.push({ type: 'fuelChanged', delta: -3, fuel: state.fuel, reason: 'upkeep' });
  },
}));

vi.mock('../../src/engine/reveal', () => ({
  updateReveal: (): void => {
    calls.push('updateReveal');
  },
}));

// Coal in sight at the start: here it only records that `createRun` calls
// it, and when.
vi.mock('../../src/engine/surface/generation', async () => ({
  ...(await vi.importActual<typeof import('../../src/engine/surface/generation')>(
    '../../src/engine/surface/generation',
  )),
  ensureCoalInSight: (): void => {
    calls.push('ensureCoalInSight');
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
      state.status = { kind: 'ended', outcome: 'lost', cause: 'buried' };
      events.push({ type: 'runEnded', outcome: 'lost', cause: 'buried' });
    }
  },
  runUpkeep: (state: GameState, events: GameEvent[]): void => {
    calls.push('runUpkeep');
    state.fuel -= 1;
    state.shift += 1;
    state.stockpile['stone'] = 9;
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
    stockpile: { timber: 1 },
    // The helper would call the (faked) reveal and so add to `calls`.
    revealTops: false,
  });
}

const CLOSE_MINE: Action = { type: 'closeMine', ap: FAKE_CLOSE_COST };

beforeEach(() => {
  calls.length = 0; // empty the list
  cubePhaseEndsRun = false;
});

describe('applyAction', () => {
  it('does not change the state it is given', () => {
    const state = startState(5);
    const before = hashState(state);
    const beforeBlocks = state.blocks.slice();

    const result = applyAction(state, CLOSE_MINE);

    expect(hashState(state)).toBe(before);
    expect(state.blocks).toEqual(beforeBlocks);
    expect(state.stockpile).toEqual({ timber: 1 });
    expect(state.ap).toBe(5);

    // The returned state is a different object and does carry the changes.
    expect(result.state).not.toBe(state);
    expect(result.state.blocks).not.toBe(state.blocks);
    expect(result.state.fuel).toBe(7);
    expect(result.state.crew.health).toBe(state.crew.health - 1);
    expect(hashState(result.state)).not.toBe(before);
  });

  it('applies the action, then reveal, in that order (0006)', () => {
    applyAction(startState(5), CLOSE_MINE);
    expect(calls).toEqual(['applyCloseMine', 'updateReveal', 'updateMineralTraces']);
  });

  it('calls reveal after a mine as after anything else', () => {
    // The mine module is the real one.
    act(startState(5), { type: 'mine', x: 1, y: 0 });
    expect(calls).toEqual(['updateReveal', 'updateMineralTraces']);
  });

  it('spends the AP of the action and returns the events', () => {
    const state = startState(5);
    const { state: after, events } = applyAction(state, CLOSE_MINE);
    expect(after.ap).toBe(5 - FAKE_CLOSE_COST);
    expect(events).toEqual([{ type: 'fuelChanged', delta: -3, fuel: 7, reason: 'upkeep' }]);
  });

  it('gives the same result when the same action is applied to the same state twice', () => {
    const state = startState(5);
    const first = applyAction(state, CLOSE_MINE);
    const second = applyAction(state, CLOSE_MINE);
    expect(hashState(second.state)).toBe(hashState(first.state));
    expect(second.events).toEqual(first.events);
  });

  it('rejects an action that is not in the legal list, and leaves the state alone', () => {
    const state = startState(5);
    const before = hashState(state);
    // A mine of a square the cube does not have.
    const mine: Action = { type: 'mine', x: 5, y: 0, ap: 2 };
    expect(() => applyAction(state, mine)).toThrow('Not a legal action');
    // The right kind of action with a wrong field is not legal either.
    expect(() => applyAction(state, { type: 'closeMine', ap: 0 })).toThrow('Not a legal action');
    expect(calls).toEqual([]);
    expect(hashState(state)).toBe(before);
  });

  it('rejects an action that costs more AP than there is left', () => {
    const state = startState(FAKE_CLOSE_COST - 1);
    expect(findActions(state, { type: 'closeMine' })).toEqual([]);
    expect(() => applyAction(state, CLOSE_MINE)).toThrow('Not a legal action');

    // With exactly enough AP it is legal.
    const enough = startState(FAKE_CLOSE_COST);
    expect(findActions(enough, { type: 'closeMine' })).toEqual([CLOSE_MINE]);
    expect(applyAction(enough, CLOSE_MINE).state.ap).toBe(0);
  });

  it('rejects every action once the run has ended', () => {
    const state = startState(5);
    state.status = { kind: 'ended', outcome: 'salvage', cause: 'mineClosed' };
    expect(legalActions(state)).toEqual([]);
    expect(() => applyAction(state, CLOSE_MINE)).toThrow('The run has ended');
    expect(calls).toEqual([]);
  });
});

describe('legalActions', () => {
  it('returns the actions of the rule modules without changing the state', () => {
    const state = startState(5);
    const before = hashState(state);
    expect(findActions(state, { type: 'closeMine' })).toEqual([CLOSE_MINE]);
    expect(hashState(state)).toBe(before);
  });
});

describe('endShift', () => {
  it('runs the cube phase, upkeep, then reveal, in that order (0006)', () => {
    endShift(startState(5));
    expect(calls).toEqual(['runCubePhase', 'runUpkeep', 'updateReveal', 'updateMineralTraces']);
  });

  it('skips upkeep when the cube phase ends the run', () => {
    cubePhaseEndsRun = true;
    const state = startState(5);
    const { state: after, events } = endShift(state);
    expect(calls).toEqual(['runCubePhase', 'updateReveal', 'updateMineralTraces']);
    expect(after.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'buried' });
    // No fuel taken and no new shift: the fake upkeep never ran.
    expect(after.fuel).toBe(state.fuel);
    expect(after.shift).toBe(state.shift);
    expect(events).toEqual([{ type: 'runEnded', outcome: 'lost', cause: 'buried' }]);
  });

  it('works on a copy of the state', () => {
    const state = startState(5);
    const before = hashState(state);

    const { state: after, events } = endShift(state);

    expect(hashState(state)).toBe(before);
    expect(state.fuel).toBe(10);
    expect(state.stockpile).toEqual({ timber: 1 });

    expect(after).not.toBe(state);
    expect(after.fuel).toBe(9);
    expect(after.shift).toBe(state.shift + 1);
    expect(events).toEqual([{ type: 'shiftEnded', shift: state.shift, nextShift: after.shift }]);
  });

  it('refuses to end a shift once the run has ended', () => {
    const state = startState(5);
    state.status = { kind: 'ended', outcome: 'lost', cause: 'outOfFuel' };
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
    state.status = { kind: 'ended', outcome: 'lost', cause: 'buried' };
    expect(() => previewCubePhase(state)).toThrow('The run has ended');
  });
});

describe('createRun', () => {
  it('reveals what can be seen from the start', () => {
    createRun(1, 'none', 'standard');
    // Coal in sight is made sure of first, then the first reveal shows it.
    expect(calls).toEqual(['ensureCoalInSight', 'updateReveal', 'updateMineralTraces']);
  });
});

describe('the act and findActions test helpers', () => {
  it('find a legal action from a partial description and apply it', () => {
    const state = startState(5);
    expect(findActions(state, { type: 'closeMine' })).toEqual([CLOSE_MINE]);
    expect(findActions(state, { type: 'mine', x: 9, y: 9 })).toEqual([]);
    expect(act(state, { type: 'closeMine' }).state.ap).toBe(5 - FAKE_CLOSE_COST);
    expect(() => act(state, { type: 'cutTree' })).toThrow('found 0');
    // Every square of the 2 x 2 cube can be mined: too many to pick one.
    expect(() => act(state, { type: 'mine' })).toThrow('found 4');
  });
});
