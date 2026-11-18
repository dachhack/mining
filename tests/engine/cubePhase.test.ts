// The cube phase's skeleton (decision notes 0014 items 1 and 2, and 0015):
// the fixed order of its five steps, damage that is recorded during steps (a)
// to (d) and applied in (e), "the first cause names the death", and health
// before air.
//
// Steps (a) to (d) are empty until their M2 tasks. So the tests that need a
// hazard put a stand-in in a step's place: a function that records damage the
// way a real rockfall or explosion will, with `recordDamage`.

import { describe, expect, it } from 'vitest';
import { AVATAR, HAZARDS } from '../../src/data';
import { endShift, hashState } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { applyRecordedDamage, stepAvatarEffects } from '../../src/engine/cube/avatarEffects';
import { stepCaveIns } from '../../src/engine/cube/caveIns';
import { stepFluids } from '../../src/engine/cube/fluids';
import { stepGas } from '../../src/engine/cube/gas';
import { newCubePhase, recordDamage } from '../../src/engine/cube/phase';
import type { CubePhase } from '../../src/engine/cube/phase';
import { stepTimers } from '../../src/engine/cube/timers';
import { CUBE_PHASE_STEPS } from '../../src/engine/shift';
import type { CubePhaseStep } from '../../src/engine/shift';
import { buildState } from './helpers';
import type { BuildStateOptions } from './helpers';

/** The type of a step's function: (state, events, phase) => void. */
type StepFunction = CubePhaseStep['run'];

/** A small tunnel: the avatar stands in the middle cell of the top layer. */
function tunnelState(options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({
    layers: [['#.#'], ['###']],
    avatar: { x: 1, y: 0, z: 0 },
    revealAll: true,
    ...options,
  });
}

/**
 * Run `body` with some of the cube phase's steps swapped for stand-ins, and
 * put the real ones back afterwards (in `finally`, so a failing test cannot
 * break the tests after it). `standIns` maps a step's name to its stand-in.
 */
function withSteps(standIns: Record<string, StepFunction>, body: () => void): void {
  const originals = CUBE_PHASE_STEPS.map((step) => step.run);
  try {
    for (const step of CUBE_PHASE_STEPS) {
      const standIn = standIns[step.name];
      if (standIn !== undefined) {
        step.run = standIn;
      }
    }
    body();
  } finally {
    CUBE_PHASE_STEPS.forEach((step, index) => {
      step.run = originals[index] as StepFunction;
    });
  }
}

const STEP_NAMES = ['caveIns', 'fluids', 'gas', 'timers', 'avatarEffects'];

describe('the order of the cube phase (0014 item 1)', () => {
  it('has the five steps (a) to (e), in that order', () => {
    expect(CUBE_PHASE_STEPS.map((step) => step.name)).toEqual(STEP_NAMES);
  });

  it('runs the function of each step under its name', () => {
    expect(CUBE_PHASE_STEPS.map((step) => step.run)).toEqual([
      stepCaveIns,
      stepFluids,
      stepGas,
      stepTimers,
      stepAvatarEffects,
    ]);
  });

  it('endShift calls each step once, in that order, then upkeep', () => {
    const called: string[] = [];
    const recorders: Record<string, StepFunction> = {};
    for (const name of STEP_NAMES) {
      recorders[name] = (_state, events) => {
        called.push(name);
        // Leave a mark in the event list too, to see where upkeep comes.
        events.push({ type: 'crafted', recipe: name });
      };
    }
    let events: GameEvent[] = [];
    withSteps(recorders, () => {
      events = endShift(tunnelState()).events;
    });
    expect(called).toEqual(STEP_NAMES);
    expect(events.map((event) => (event.type === 'crafted' ? event.recipe : event.type))).toEqual([
      ...STEP_NAMES,
      'fuelChanged',
      'shiftEnded',
    ]);
  });

  it('fails if two steps are swapped: each step sees what the steps before it did', () => {
    // Each stand-in checks that exactly the steps before it have run, by
    // looking at the notes they share. With the steps in any other order one
    // of these throws.
    const seen: string[] = [];
    const checkers: Record<string, StepFunction> = {};
    STEP_NAMES.forEach((name, index) => {
      checkers[name] = () => {
        expect(seen).toEqual(STEP_NAMES.slice(0, index));
        seen.push(name);
      };
    });
    withSteps(checkers, () => {
      endShift(tunnelState());
    });
    expect(seen).toEqual(STEP_NAMES);

    // And the check does catch a swap: with (b) and (c) exchanged it throws.
    const fluidsStep = CUBE_PHASE_STEPS[1] as CubePhaseStep;
    const gasStep = CUBE_PHASE_STEPS[2] as CubePhaseStep;
    seen.length = 0;
    CUBE_PHASE_STEPS[1] = gasStep;
    CUBE_PHASE_STEPS[2] = fluidsStep;
    try {
      expect(() => {
        withSteps(checkers, () => {
          endShift(tunnelState());
        });
      }).toThrow();
    } finally {
      CUBE_PHASE_STEPS[1] = fluidsStep;
      CUBE_PHASE_STEPS[2] = gasStep;
    }
  });

  it('hands every step the same notes, fresh for each cube phase', () => {
    const phases: CubePhase[] = [];
    const collectors: Record<string, StepFunction> = {};
    for (const name of STEP_NAMES) {
      collectors[name] = (_state, _events, phase) => {
        phases.push(phase);
      };
    }
    withSteps(collectors, () => {
      endShift(tunnelState());
      endShift(tunnelState());
    });
    expect(phases).toHaveLength(10);
    for (const phase of phases.slice(0, 5)) {
      expect(phase).toBe(phases[0]);
    }
    expect(phases[5]).not.toBe(phases[0]);
  });

  it('with the real, empty steps an end of shift is upkeep and nothing else', () => {
    const state = tunnelState({ fuel: 7, shift: 1 });
    const { state: after, events } = endShift(state);
    expect(events).toEqual([
      { type: 'fuelChanged', delta: -1, fuel: 6, reason: 'upkeep' },
      { type: 'shiftEnded', shift: 1, nextShift: 2 },
    ]);
    expect(after.avatar).toEqual(state.avatar);
  });

  it('uses no randomness: the RNG is where it was', () => {
    const state = tunnelState();
    expect(endShift(state).state.rng).toEqual(state.rng);
  });
});

describe('recordDamage', () => {
  it('keeps the entries in the order they were recorded and drops zero damage', () => {
    const phase = newCubePhase();
    recordDamage(phase, 4, 'rockfall');
    recordDamage(phase, 0, 'lava');
    recordDamage(phase, 6, 'explosion');
    recordDamage(phase, 1, 'lava');
    expect(phase.damage).toEqual([
      { amount: 4, cause: 'rockfall' },
      { amount: 6, cause: 'explosion' },
      { amount: 1, cause: 'lava' },
    ]);
  });

  it('refuses an amount that is negative or not whole', () => {
    const phase = newCubePhase();
    expect(() => recordDamage(phase, -1, 'rockfall')).toThrow('Cannot record -1 damage');
    expect(() => recordDamage(phase, 1.5, 'lava')).toThrow('Cannot record 1.5 damage');
    expect(phase.damage).toEqual([]);
  });

  it('does not touch the avatar: health changes only in step (e)', () => {
    const state = tunnelState({ health: 10 });
    let healthDuringStepD = -1;
    withSteps(
      {
        caveIns: (_state, _events, phase) => recordDamage(phase, 4, 'rockfall'),
        timers: (current) => {
          healthDuringStepD = current.avatar.health;
        },
      },
      () => {
        expect(endShift(state).state.avatar.health).toBe(6);
      },
    );
    expect(healthDuringStepD).toBe(10);
  });
});

describe('recorded damage is applied in step (e), in order (0014 item 2)', () => {
  it('applies each entry in the order it was recorded, one damageTaken each', () => {
    const state = tunnelState({ health: 10 });
    const events: GameEvent[] = [];
    applyRecordedDamage(state, events, [
      { amount: 4, cause: 'rockfall' },
      { amount: 1, cause: 'lava' },
      { amount: 3, cause: 'explosion' },
    ]);
    expect(events).toEqual([
      { type: 'damageTaken', amount: 4, cause: 'rockfall', health: 6 },
      { type: 'damageTaken', amount: 1, cause: 'lava', health: 5 },
      { type: 'damageTaken', amount: 3, cause: 'explosion', health: 2 },
    ]);
    expect(state.avatar.health).toBe(2);
    expect(state.status).toEqual({ kind: 'active' });
  });

  it('the first cause that brings health to 0 names the death; later damage is not applied', () => {
    // 4 from a rockfall leaves 2; the explosion then kills. The lava after
    // it never touches the avatar.
    const state = tunnelState({ health: 6 });
    const events: GameEvent[] = [];
    applyRecordedDamage(state, events, [
      { amount: 4, cause: 'rockfall' },
      { amount: 6, cause: 'explosion' },
      { amount: 5, cause: 'lava' },
    ]);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'burned' });
    expect(events).toEqual([
      { type: 'damageTaken', amount: 4, cause: 'rockfall', health: 2 },
      // Never more than the health that is left, as with a fall.
      { type: 'damageTaken', amount: 2, cause: 'explosion', health: 0 },
      { type: 'runEnded', outcome: 'death', cause: 'burned' },
    ]);
    expect(state.avatar.health).toBe(0);
  });

  it('the same damage in the other order gives the other death', () => {
    const state = tunnelState({ health: 6 });
    applyRecordedDamage(
      state,
      [],
      [
        { amount: 6, cause: 'explosion' },
        { amount: 4, cause: 'rockfall' },
      ],
    );
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'burned' });

    const other = tunnelState({ health: 6 });
    applyRecordedDamage(
      other,
      [],
      [
        { amount: 2, cause: 'explosion' },
        { amount: 4, cause: 'rockfall' },
      ],
    );
    expect(other.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'crushed' });
  });

  it('death is at health 0: damage equal to the health left kills', () => {
    const state = tunnelState({ health: 4 });
    applyRecordedDamage(state, [], [{ amount: 4, cause: 'rockfall' }]);
    expect(state.avatar.health).toBe(0);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'crushed' });
  });

  it('each cause of damage has its death (design doc 5.3)', () => {
    const deaths: [GameEvent & { type: 'damageTaken' }, string][] = [];
    for (const cause of ['fall', 'rockfall', 'lava', 'explosion'] as const) {
      const state = tunnelState({ health: 1 });
      const events: GameEvent[] = [];
      applyRecordedDamage(state, events, [{ amount: 1, cause }]);
      const status = state.status;
      expect(status.kind).toBe('ended');
      if (status.kind === 'ended') {
        deaths.push([events[0] as GameEvent & { type: 'damageTaken' }, status.cause]);
      }
    }
    expect(deaths.map(([event, death]) => `${event.cause}: ${death}`)).toEqual([
      'fall: fell',
      'rockfall: crushed',
      'lava: burned',
      'explosion: burned',
    ]);
  });

  it('through endShift: damage recorded in (a), (b) and (c) is applied in that order', () => {
    const state = tunnelState({ health: 10 });
    let result = { state, events: [] as GameEvent[] };
    withSteps(
      {
        caveIns: (_state, _events, phase) => recordDamage(phase, 4, 'rockfall'),
        fluids: (_state, _events, phase) => recordDamage(phase, 1, 'lava'),
        gas: (_state, _events, phase) => recordDamage(phase, 6, 'explosion'),
      },
      () => {
        result = endShift(state);
      },
    );
    expect(result.events).toEqual([
      { type: 'damageTaken', amount: 4, cause: 'rockfall', health: 6 },
      { type: 'damageTaken', amount: 1, cause: 'lava', health: 5 },
      { type: 'damageTaken', amount: 5, cause: 'explosion', health: 0 },
      { type: 'runEnded', outcome: 'death', cause: 'burned' },
    ]);
    // A dead avatar pays no upkeep and starts no new shift.
    expect(result.state.fuel).toBe(state.fuel);
    expect(result.state.shift).toBe(state.shift);
  });

  it('an avatar that survives the damage goes on to upkeep', () => {
    const state = tunnelState({ health: 10, fuel: 5 });
    withSteps({ caveIns: (_state, _events, phase) => recordDamage(phase, 4, 'rockfall') }, () => {
      const { state: after, events } = endShift(state);
      expect(after.avatar.health).toBe(6);
      expect(after.fuel).toBe(4);
      expect(events.map((event) => event.type)).toEqual([
        'damageTaken',
        'fuelChanged',
        'shiftEnded',
      ]);
    });
  });
});

describe('health is checked before air (0014 item 2)', () => {
  it('an avatar with no air left that a rockfall kills was crushed, not suffocated', () => {
    const state = tunnelState({ health: 4, air: 0 });
    const events: GameEvent[] = [];
    const phase = newCubePhase();
    recordDamage(phase, 4, 'rockfall');
    stepAvatarEffects(state, events, phase);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'crushed' });
    expect(events.filter((event) => event.type === 'runEnded')).toHaveLength(1);
  });

  it('an avatar that survives the damage and has no air left suffocates', () => {
    // Gas in the avatar's cell: since the air rule was built (M2-4) an open
    // tunnel under the surface has connected air, and air at 0 would refill.
    const state = tunnelState({
      health: 10,
      air: 0,
      gas: [{ pos: { x: 1, y: 0, z: 0 }, units: 1 }],
    });
    const events: GameEvent[] = [];
    const phase = newCubePhase();
    recordDamage(phase, 4, 'rockfall');
    stepAvatarEffects(state, events, phase);
    expect(state.avatar.health).toBe(6);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'suffocated' });
    expect(events.map((event) => event.type)).toEqual(['damageTaken', 'runEnded']);
  });

  it('with no air left in a flooded cell the avatar drowns', () => {
    const state = tunnelState({ air: 0, water: [{ x: 1, y: 0, z: 0 }] });
    stepAvatarEffects(state, [], newCubePhase());
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'drowned' });
  });

  it('with full air in connected air nothing happens', () => {
    // Until M2-4 this pinned the empty air rule (air stayed at 1). The rule
    // itself is tested in air.test.ts; here, a step (e) with nothing to do.
    const state = tunnelState({ air: HAZARDS.air.max });
    const before = hashState(state);
    const events: GameEvent[] = [];
    stepAvatarEffects(state, events, newCubePhase());
    expect(events).toEqual([]);
    expect(hashState(state)).toBe(before);
    expect(state.avatar.air).toBe(HAZARDS.air.max);
  });

  it('a new run starts with full health and full air', () => {
    const state = tunnelState();
    expect(state.avatar.health).toBe(AVATAR.startHealth);
    expect(state.avatar.air).toBe(HAZARDS.air.max);
  });
});

describe('rest (0014 item 2: only for an avatar alive after damage and air)', () => {
  it('step (e) clears the resting flag, whether the avatar lived or not', () => {
    const alive = tunnelState();
    alive.avatar.resting = true;
    stepAvatarEffects(alive, [], newCubePhase());
    expect(alive.avatar.resting).toBe(false);
    expect(alive.status).toEqual({ kind: 'active' });

    const dying = tunnelState({ health: 1 });
    dying.avatar.resting = true;
    const phase = newCubePhase();
    recordDamage(phase, 4, 'rockfall');
    stepAvatarEffects(dying, [], phase);
    expect(dying.avatar.resting).toBe(false);
    expect(dying.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'crushed' });
  });
});

describe('after step (e): settle once, then upkeep (0014 item 2)', () => {
  it('an avatar whose floor the cube phase took falls after the damage is applied', () => {
    // A shaft: the avatar stands on a block that step (a) removes. It takes
    // the recorded damage first, then falls 3 blocks uncontrolled (1 + 1 + 2
    // damage; decision note 0010).
    const state = buildState({
      layers: [['.'], ['#'], ['.'], ['.'], ['#']],
      avatar: { x: 0, y: 0, z: 0 },
      revealAll: true,
      health: 10,
    });
    withSteps(
      {
        caveIns: (current, _events, phase) => {
          current.blocks[1] = 0;
          recordDamage(phase, 4, 'rockfall');
        },
        timers: (current) => {
          // The avatar does not move during steps (a) to (d).
          expect(current.avatar.pos).toEqual({ x: 0, y: 0, z: 0 });
        },
      },
      () => {
        const { state: after, events } = endShift(state);
        expect(after.avatar.pos).toEqual({ x: 0, y: 0, z: 3 });
        expect(events.map((event) => event.type)).toEqual([
          'damageTaken', // rockfall, in step (e)
          'fell',
          'damageTaken', // the fall
          'fuelChanged',
          'shiftEnded',
        ]);
        expect(after.avatar.health).toBe(10 - 4 - 4);
      },
    );
  });

  it('an avatar that step (e) kills does not then fall: it was crushed, not fell', () => {
    // The same shaft, deeper (a fall of 8 would be fatal by itself), and the
    // rockfall takes all the health that is left.
    const state = buildState({
      layers: [['.'], ['#'], ['.'], ['.'], ['.'], ['.'], ['.'], ['.'], ['.'], ['#']],
      avatar: { x: 0, y: 0, z: 0 },
      revealAll: true,
      health: 4,
      looseItems: [{ pos: { x: 0, y: 0, z: 0 }, item: 'coal', count: 1 }],
    });
    withSteps(
      {
        caveIns: (current, _events, phase) => {
          current.blocks[1] = 0;
          recordDamage(phase, 4, 'rockfall');
        },
      },
      () => {
        const { state: after, events } = endShift(state);
        expect(after.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'crushed' });
        // The avatar stays where it died, and nothing follows `runEnded`
        // except the loose coal dropping down the shaft.
        expect(after.avatar.pos).toEqual({ x: 0, y: 0, z: 0 });
        expect(events.map((event) => event.type)).toEqual(['damageTaken', 'runEnded', 'itemFell']);
        expect(after.looseItems).toEqual([{ pos: { x: 0, y: 0, z: 8 }, item: 'coal', count: 1 }]);
      },
    );
  });
});
