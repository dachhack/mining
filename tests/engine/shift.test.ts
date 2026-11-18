// Scenario tests for the end of a shift: AP reset, banked AP, fuel upkeep,
// lamp oil, running out of fuel, and the end-shift preview
// (design doc 4; 0005 items 15, 20, 21; owner question 29).
//
// Every test uses a tiny hand-built cube with the avatar on the surface. The
// expected numbers are worked out from `SHIFT` where the rule is "whatever the
// data says", and written as plain numbers where the issue states a concrete
// case (2 + 1 banked AP gives 1 fuel, and so on); a guard test at the top
// checks that the data still has the values those concrete cases assume.

import { describe, expect, it } from 'vitest';
import { SHIFT } from '../../src/data';
import { applyAction, endShift, hashState, legalActions, previewCubePhase } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { CUBE_PHASE_STEPS } from '../../src/engine/shift';
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
  it('is 5 AP per shift, 3 banked AP per 1 fuel, 1 fuel per shift, 1 oil every 4 shifts', () => {
    expect(SHIFT).toEqual({
      firstShiftNumber: 1,
      apPerShift: 5,
      fuelPerShift: 1,
      bankedApPerRefund: 3,
      fuelPerRefund: 1,
      lampOilBurnEveryShifts: 4,
      lampOilPerBurn: 1,
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
    // 4 unspent AP: 1 refund step, 1 left in the counter. Shift 4, so oil burns.
    const state = surfaceState({ ap: 4, fuel: 7, lampOil: 5, shift: 4 });
    const { events } = endShift(state);
    expect(events).toEqual([
      { type: 'fuelChanged', delta: 1, fuel: 8, reason: 'bankedApRefund' },
      { type: 'apBanked', amount: 4, bankedAp: 1 },
      { type: 'fuelChanged', delta: -1, fuel: 7, reason: 'upkeep' },
      { type: 'lampOilChanged', delta: -1, lampOil: 4, reason: 'upkeep' },
      { type: 'shiftEnded', shift: 4, nextShift: 5 },
    ]);
  });

  it('runs the five cube-phase steps in the order of design doc 4', () => {
    expect(CUBE_PHASE_STEPS.map((step) => step.name)).toEqual([
      'supportAndFallingBlocks',
      'fluidsFlow',
      'gasSpreads',
      'timersTick',
      'applyDamage',
    ]);
  });
});

describe('banked AP', () => {
  it('2 unspent AP, then 1 unspent the next shift: 1 fuel refunded, counter back to 0', () => {
    const start = surfaceState({ ap: 2, fuel: 10 });

    const first = endShift(start);
    expect(first.state.bankedAp).toBe(2);
    // No refund yet: only the shift's fuel went.
    expect(first.state.fuel).toBe(9);
    expect(eventsOfType(first.events, 'apBanked')).toEqual([
      { type: 'apBanked', amount: 2, bankedAp: 2 },
    ]);

    // Next shift: leave exactly 1 AP unspent.
    const second = endShift({ ...first.state, ap: 1 });
    expect(second.state.bankedAp).toBe(0);
    // +1 refund, -1 upkeep.
    expect(second.state.fuel).toBe(9);
    expect(second.events).toContainEqual({
      type: 'fuelChanged',
      delta: 1,
      fuel: 10,
      reason: 'bankedApRefund',
    });
    expect(eventsOfType(second.events, 'apBanked')).toEqual([
      { type: 'apBanked', amount: 1, bankedAp: 0 },
    ]);
  });

  it('5 unspent AP: 1 fuel refunded and 2 left in the counter', () => {
    const { state: after, events } = endShift(surfaceState({ ap: 5, fuel: 10 }));
    expect(after.bankedAp).toBe(2);
    expect(after.fuel).toBe(10); // +1 refund, -1 upkeep
    expect(events).toContainEqual({
      type: 'fuelChanged',
      delta: 1,
      fuel: 11,
      reason: 'bankedApRefund',
    });
  });

  it('pays two refunds at once when the counter passes 6', () => {
    const { state: after, events } = endShift(surfaceState({ ap: 5, bankedAp: 2, fuel: 10 }));
    expect(after.bankedAp).toBe(1);
    expect(after.fuel).toBe(11); // +2 refund, -1 upkeep
    expect(eventsOfType(events, 'fuelChanged')).toEqual([
      { type: 'fuelChanged', delta: 2, fuel: 12, reason: 'bankedApRefund' },
      { type: 'fuelChanged', delta: -1, fuel: 11, reason: 'upkeep' },
    ]);
  });

  it('does not carry unspent AP into the next shift as AP', () => {
    const { state: after } = endShift(surfaceState({ ap: 5 }));
    expect(after.ap).toBe(SHIFT.apPerShift);
  });

  it('reports 0 AP banked when every AP was spent', () => {
    const { state: after, events } = endShift(surfaceState({ ap: 0, bankedAp: 2 }));
    expect(after.bankedAp).toBe(2);
    expect(eventsOfType(events, 'apBanked')).toEqual([
      { type: 'apBanked', amount: 0, bankedAp: 2 },
    ]);
  });
});

describe('fuel upkeep', () => {
  it('fuel falls by 1 per shift', () => {
    let state = surfaceState({ ap: 0, fuel: 10 });
    for (const expected of [9, 8, 7]) {
      // AP set back to 0 each shift so that nothing is banked.
      state = endShift({ ...state, ap: 0 }).state;
      expect(state.fuel).toBe(expected);
    }
  });

  it('fuel 0 at upkeep with no refund due ends the run, cause "out of fuel"', () => {
    const state = surfaceState({ ap: 2, fuel: 0, shift: 2 });
    const { state: after, events } = endShift(state);
    expect(after.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'outOfFuel' });
    expect(events).toEqual([
      { type: 'apBanked', amount: 2, bankedAp: 2 },
      { type: 'runEnded', outcome: 'death', cause: 'outOfFuel' },
    ]);
    // Upkeep stopped there: no next shift.
    expect(after.shift).toBe(2);
    expect(after.fuel).toBe(0);
  });

  it('fuel 0 at upkeep with a refund due survives', () => {
    const { state: after } = endShift(surfaceState({ ap: 3, fuel: 0 }));
    expect(after.status).toEqual({ kind: 'active' });
    // The refunded fuel was then consumed by the shift.
    expect(after.fuel).toBe(0);
    expect(after.shift).toBe(2);
  });

  it('finishing a shift on exactly 0 fuel, then crafting fuel next shift, survives', () => {
    // 1 fuel, nothing banked: upkeep takes the last fuel but the run goes on.
    const start = surfaceState({ ap: 0, fuel: 1, inventory: { coal: 1 } });
    const first = endShift(start);
    expect(first.state.fuel).toBe(0);
    expect(first.state.status).toEqual({ kind: 'active' });

    // Next shift: craft fuel (1 AP), spend the rest so nothing is refunded.
    const crafted = act(first.state, { type: 'craft', recipe: 'fuel' });
    expect(crafted.state.fuel).toBe(3);
    const second = endShift({ ...crafted.state, ap: 0 });
    expect(second.state.status).toEqual({ kind: 'active' });
    expect(second.state.fuel).toBe(2);

    // Without the craft, the same upkeep ends the run.
    const without = endShift({ ...first.state, ap: 0 });
    expect(without.state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'outOfFuel' });
  });
});

describe('lamp oil', () => {
  it('burns 1 oil at the upkeep that ends the 4th and the 8th shift, and at no other', () => {
    let state = surfaceState({ ap: 0, fuel: 20, lampOil: 6 });
    const oilAfterShift: number[] = [];
    for (let i = 0; i < 9; i += 1) {
      state = endShift({ ...state, ap: 0 }).state;
      oilAfterShift.push(state.lampOil);
    }
    // After shifts 1..9.
    expect(oilAfterShift).toEqual([6, 6, 6, 5, 5, 5, 5, 4, 4]);
  });

  it('burns nothing, and emits nothing, when there is no oil left', () => {
    const { state: after, events } = endShift(surfaceState({ lampOil: 0, shift: 4 }));
    expect(after.lampOil).toBe(0);
    expect(eventsOfType(events, 'lampOilChanged')).toEqual([]);
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
    { name: 'nothing banked', options: { ap: 0, fuel: 10 } },
    { name: '2 unspent AP, no refund', options: { ap: 2, fuel: 10 } },
    { name: '1 unspent AP on top of 2 banked', options: { ap: 1, bankedAp: 2, fuel: 9 } },
    { name: '5 unspent AP', options: { ap: 5, fuel: 10 } },
    { name: 'two refunds', options: { ap: 5, bankedAp: 2, fuel: 10 } },
    { name: 'out of fuel', options: { ap: 2, fuel: 0 } },
    { name: 'fuel 0 saved by a refund', options: { ap: 3, fuel: 0 } },
    { name: 'last fuel consumed', options: { ap: 0, fuel: 1 } },
    { name: 'oil burns (shift 4)', options: { ap: 0, lampOil: 6, shift: 4 } },
    { name: 'oil burns (shift 8)', options: { ap: 0, lampOil: 1, shift: 8 } },
    { name: 'oil due but none left', options: { ap: 0, lampOil: 0, shift: 4 } },
    { name: 'oil not due (shift 5)', options: { ap: 0, lampOil: 6, shift: 5 } },
  ];

  for (const { name, options } of cases) {
    it(`agrees with endShift: ${name}`, () => {
      const state = surfaceState(options);
      const before = hashState(state);
      const forecast = previewCubePhase(state);
      // The preview changes nothing.
      expect(hashState(state)).toBe(before);
      expect(forecast.hazards).toEqual([]);

      const { state: after, events } = endShift(state);
      const upkeep = forecast.upkeep;

      expect(upkeep.apBanked).toBe(state.ap);
      expect(upkeep.bankedApAfter).toBe(after.bankedAp);
      expect(upkeep.fuelAfter).toBe(after.fuel);
      expect(upkeep.lampOilAfter).toBe(after.lampOil);
      expect(upkeep.lampOilBurned).toBe(state.lampOil - after.lampOil);
      // Fuel: start + refunded - consumed = end.
      expect(state.fuel + upkeep.fuelRefunded - upkeep.fuelConsumed).toBe(after.fuel);

      // The forecast's parts match the events one for one.
      let refunded = 0;
      let consumed = 0;
      for (const event of events) {
        if (event.type === 'fuelChanged' && event.reason === 'bankedApRefund') {
          refunded += event.delta;
        }
        if (event.type === 'fuelChanged' && event.reason === 'upkeep') {
          consumed -= event.delta;
        }
      }
      expect(upkeep.fuelRefunded).toBe(refunded);
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
    expect(previewCubePhase(surfaceState({ ap: 3, fuel: 0 })).upkeep.runEnds).toBeNull();
    expect(previewCubePhase(surfaceState({ ap: 0, fuel: 1 })).upkeep.runEnds).toBeNull();
  });
});
