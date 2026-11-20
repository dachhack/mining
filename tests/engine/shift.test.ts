// Scenario tests for the end of a shift: AP reset, unspent AP being lost,
// fuel upkeep, running out of fuel, and the end-shift preview
// (design doc 4; 0005 item 15; issue #32 "no fuel refill"; owner question 29).
//
// Every test uses a tiny hand-built cube with the avatar on the surface. The
// expected numbers are worked out from `SHIFT` where the rule is "whatever the
// data says", and written as plain numbers where the issue states a concrete
// case (5 unspent AP, fuel falls by exactly 1, and so on); a guard test at the top
// checks that the data still has the values those concrete cases assume.

import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT_ID, LOADOUTS, SHIFT } from '../../src/data';
import { applyAction, endShift, hashState, legalActions, previewCubePhase } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { act, buildState } from './helpers';
import type { BuildStateOptions } from './helpers';

/** A one-layer stone cube, avatar on the surface, with the given gauges. */
function surfaceState(options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({ layers: [['##', '##']], revealAll: true, ...options });
}

/** The events of one type, e.g. every `fuelChanged`. */
function eventsOfType(events: GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((event) => event.type === type);
}

describe('the data these scenarios assume', () => {
  it('is 5 AP per shift, 1 fuel per shift, and nothing about banking or lamp oil', () => {
    expect(SHIFT).toEqual({
      firstShiftNumber: 1,
      apPerShift: 5,
      fuelPerShift: 1,
    });
  });
});

describe('endShift', () => {
  it('resets AP to the per-shift value and adds 1 to the shift number', () => {
    const state = surfaceState({ ap: 0, shift: 3 });
    const { state: after, events } = endShift(state);
    expect(after.ap).toBe(SHIFT.apPerShift);
    expect(after.shift).toBe(4);
    expect(eventsOfType(events, 'shiftEnded')).toEqual([
      { type: 'shiftEnded', shift: 3, nextShift: 4 },
    ]);
    // The caller's state is untouched.
    expect(state.ap).toBe(0);
    expect(state.shift).toBe(3);
  });

  it('emits the events of an ordinary upkeep in order', () => {
    // 4 unspent AP, which are simply lost: no event for them.
    const state = surfaceState({ ap: 4, fuel: 7, shift: 4 });
    const { events } = endShift(state);
    expect(events).toEqual([
      { type: 'fuelChanged', delta: -1, fuel: 6, reason: 'upkeep' },
      { type: 'shiftEnded', shift: 4, nextShift: 5 },
    ]);
  });

  // The cube phase's own tests (the order of its steps, recorded damage,
  // health before air) are in cubePhase.test.ts.
});

describe('unspent AP (issue #32: no fuel refill)', () => {
  it('5 unspent AP give no fuel: fuel falls by exactly the per-shift cost', () => {
    const { state: after, events } = endShift(surfaceState({ ap: 5, fuel: 10 }));
    expect(after.fuel).toBe(9);
    expect(after.fuel).toBe(10 - SHIFT.fuelPerShift);
    // The only change to fuel is the shift's own cost.
    expect(eventsOfType(events, 'fuelChanged')).toEqual([
      { type: 'fuelChanged', delta: -1, fuel: 9, reason: 'upkeep' },
    ]);
  });

  it('gives no fuel however the unspent AP add up over several shifts', () => {
    // 2 unspent, then 1 unspent, then 5 unspent: 8 AP in all. Under the old
    // rule that paid 2 fuel; now fuel just falls by 1 per shift.
    let state = surfaceState({ ap: 2, fuel: 10 });
    const fuelAfterShift: number[] = [];
    for (const unspent of [2, 1, 5]) {
      state = endShift({ ...state, ap: unspent }).state;
      fuelAfterShift.push(state.fuel);
    }
    expect(fuelAfterShift).toEqual([9, 8, 7]);
  });

  it('does not carry unspent AP into the next shift as AP', () => {
    const { state: after } = endShift(surfaceState({ ap: 5 }));
    expect(after.ap).toBe(SHIFT.apPerShift);
  });

  it('keeps no banked-AP counter in the state, and emits no banking event', () => {
    const { state: after, events } = endShift(surfaceState({ ap: 3, fuel: 10 }));
    expect(Object.keys(after)).not.toContain('bankedAp');
    // `as string` because 'apBanked' is no longer one of the event types, so
    // TypeScript would otherwise reject the comparison outright.
    expect(events.map((event) => event.type as string)).not.toContain('apBanked');
  });
});

describe('fuel upkeep', () => {
  it('fuel falls by 1 per shift', () => {
    let state = surfaceState({ ap: 0, fuel: 10 });
    for (const expected of [9, 8, 7]) {
      state = endShift({ ...state, ap: 0 }).state;
      expect(state.fuel).toBe(expected);
    }
  });

  it('idling from the starting kit ends the run out of fuel at the expected shift', () => {
    // The standard kit's fuel, never touching an AP. Each upkeep takes
    // `fuelPerShift`; the upkeep that finds the gauge at 0 ends the run. With
    // 24 fuel that is the upkeep ending shift 25, well inside 30 idle shifts.
    const startFuel = LOADOUTS[DEFAULT_LOADOUT_ID].fuel;
    expect(startFuel).toBe(24);
    let state = surfaceState({ fuel: startFuel });
    let shiftsEnded = 0;
    while (state.status.kind === 'active' && shiftsEnded < 30) {
      // Idle: all 5 AP unspent.
      expect(state.ap).toBe(SHIFT.apPerShift);
      state = endShift(state).state;
      shiftsEnded += 1;
    }
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'outOfFuel' });
    expect(shiftsEnded).toBe(25);
    expect(shiftsEnded).toBe(startFuel / SHIFT.fuelPerShift + 1);
    // The run ended during shift 25: its upkeep did not start shift 26.
    expect(state.shift).toBe(25);
    expect(state.fuel).toBe(0);
  });

  it('fuel 0 at upkeep ends the run, cause "out of fuel"', () => {
    const state = surfaceState({ ap: 2, fuel: 0, shift: 2 });
    const { state: after, events } = endShift(state);
    expect(after.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'outOfFuel' });
    expect(events).toEqual([{ type: 'runEnded', outcome: 'death', cause: 'outOfFuel' }]);
    // Upkeep stopped there: no next shift.
    expect(after.shift).toBe(2);
    expect(after.fuel).toBe(0);
  });

  it('fuel 0 at upkeep ends the run however much AP is unspent', () => {
    // Under the old rule 3 or more unspent AP bought a fuel and saved the run.
    for (const unspent of [0, 3, 5]) {
      const { state: after } = endShift(surfaceState({ ap: unspent, fuel: 0 }));
      expect(after.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'outOfFuel' });
    }
  });

  it('finishing a shift on exactly 0 fuel, then crafting fuel next shift, survives', () => {
    // 1 fuel: upkeep takes the last of it but the run goes on.
    const start = surfaceState({ ap: 0, fuel: 1, inventory: { coal: 1 } });
    const first = endShift(start);
    expect(first.state.fuel).toBe(0);
    expect(first.state.status).toEqual({ kind: 'active' });

    // Next shift: craft fuel (1 AP), leave the other 4 AP unspent.
    const crafted = act(first.state, { type: 'craft', recipe: 'fuel' });
    expect(crafted.state.fuel).toBe(3);
    const second = endShift(crafted.state);
    expect(second.state.status).toEqual({ kind: 'active' });
    expect(second.state.fuel).toBe(2);

    // Without the craft, the same upkeep ends the run, 5 unspent AP or not.
    const without = endShift(first.state);
    expect(without.state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'outOfFuel' });
  });
});

describe('after the run has ended', () => {
  // Documented choice: `endShift` (and `previewCubePhase`) throw.
  const ended = surfaceState({ status: { kind: 'ended', outcome: 'salvage', cause: 'left' } });

  it('legalActions is empty', () => {
    expect(legalActions(ended)).toEqual([]);
  });

  it('endShift throws', () => {
    expect(() => endShift(ended)).toThrow('The run has ended');
  });

  it('previewCubePhase throws', () => {
    expect(() => previewCubePhase(ended)).toThrow('The run has ended');
  });

  it('holds for a run that ended by running out of fuel', () => {
    const { state: dead } = endShift(surfaceState({ ap: 0, fuel: 0, inventory: { coal: 1 } }));
    expect(legalActions(dead)).toEqual([]);
    expect(() => endShift(dead)).toThrow('The run has ended');
    expect(() => applyAction(dead, { type: 'leave', ap: 0 })).toThrow('The run has ended');
  });
});

describe('previewCubePhase', () => {
  // Each case is a state; the test checks the forecast against what endShift
  // then actually does to it.
  const cases: { name: string; options: Omit<BuildStateOptions, 'layers'> }[] = [
    { name: 'every AP spent', options: { ap: 0, fuel: 10 } },
    { name: '2 unspent AP', options: { ap: 2, fuel: 10 } },
    { name: '5 unspent AP', options: { ap: 5, fuel: 10 } },
    { name: 'out of fuel', options: { ap: 2, fuel: 0 } },
    { name: 'out of fuel with 5 unspent AP', options: { ap: 5, fuel: 0 } },
    { name: 'last fuel consumed', options: { ap: 0, fuel: 1 } },
    { name: 'a later shift (shift 4)', options: { ap: 0, shift: 4 } },
  ];

  for (const { name, options } of cases) {
    it(`agrees with endShift: ${name}`, () => {
      const state = surfaceState(options);
      const before = hashState(state);
      const forecast = previewCubePhase(state);
      // The preview changes nothing.
      expect(hashState(state)).toBe(before);
      expect(forecast.countdowns).toEqual([]);
      expect(forecast.flows).toEqual([]);

      const { state: after, events } = endShift(state);
      const upkeep = forecast.upkeep;

      // The forecast has exactly these fields: nothing about banked AP or lamp oil.
      expect(Object.keys(upkeep).sort()).toEqual(['fuelAfter', 'fuelConsumed', 'runEnds']);
      expect(upkeep.fuelAfter).toBe(after.fuel);
      expect(upkeep.fuelConsumed).toBe(state.fuel - after.fuel);

      // The forecast's fuel matches the events: every change to fuel at
      // upkeep is the shift's own cost.
      let consumed = 0;
      for (const event of events) {
        if (event.type === 'fuelChanged') {
          expect(event.reason).toBe('upkeep');
          consumed -= event.delta;
        }
      }
      expect(upkeep.fuelConsumed).toBe(consumed);

      if (after.status.kind === 'ended') {
        expect(upkeep.runEnds).toBe(after.status.cause);
      } else {
        expect(upkeep.runEnds).toBeNull();
      }
    });
  }

  it('says "run ends: out of fuel" exactly when that is what will happen', () => {
    expect(previewCubePhase(surfaceState({ ap: 2, fuel: 0 })).upkeep.runEnds).toBe('outOfFuel');
    expect(previewCubePhase(surfaceState({ ap: 5, fuel: 0 })).upkeep.runEnds).toBe('outOfFuel');
    expect(previewCubePhase(surfaceState({ ap: 0, fuel: 1 })).upkeep.runEnds).toBeNull();
  });
});
