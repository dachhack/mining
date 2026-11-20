// The cube phase's skeleton (decision notes 0014 items 1 and 2, and 0015) and
// the crew (design doc v0.2 section 5; issue #90): the fixed order of the
// five steps, worked squares, damage that is recorded during steps (a) to (d)
// only for a hazard on a worked square, once for each kind of hazard, and
// applied in (e), where "the first cause names the loss".
//
// Steps (a) to (d) are empty until their tasks (T8 to T11). So the tests that
// need a hazard put a stand-in in a step's place: a function that records
// damage the way a real slump or explosion will, with `recordDamage`.

import { describe, expect, it } from 'vitest';
import { CREW } from '../../src/data';
import {
  applyAction,
  createRun,
  deserialise,
  endShift,
  hashState,
  isWorked,
  legalActions,
  serialise,
  workedSquares,
} from '../../src/engine';
import type { DamageCause, GameEvent, GameState, SerialisedState, Square } from '../../src/engine';
import { isBesideWorked, markWorked } from '../../src/engine/crew';
import { stepSlumps } from '../../src/engine/cube/slumps';
import { applyRecordedDamage, stepCrewEffects } from '../../src/engine/cube/crewEffects';
import { stepFluids } from '../../src/engine/cube/fluids';
import { stepGas } from '../../src/engine/cube/gas';
import { newCubePhase, recordDamage, recordDamageBeside } from '../../src/engine/cube/phase';
import type { CubePhase } from '../../src/engine/cube/phase';
import { stepTimers } from '../../src/engine/cube/timers';
import { CUBE_PHASE_STEPS } from '../../src/engine/shift';
import type { CubePhaseStep } from '../../src/engine/shift';
import { buildState } from './helpers';
import type { BuildStateOptions } from './helpers';

/** The type of a step's function: (state, events, phase) => void. */
type StepFunction = CubePhaseStep['run'];

/** A small cube with a gap in its top layer, for the tests of the steps' order. */
function tunnelState(options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({
    layers: [['#.#'], ['###']],
    revealAll: true,
    ...options,
  });
}

/** A flat 3 x 3 field of stone, two layers deep. No square is worked unless asked. */
function fieldState(options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({
    layers: [
      ['###', '###', '###'],
      ['###', '###', '###'],
    ],
    ...options,
  });
}

/** The middle square of `fieldState`. */
const MIDDLE: Square = { x: 1, y: 1 };

/**
 * What the lava step will do for lava standing on square (x, y): the two
 * calls of design doc 5.2, "5 on a worked square / 1 beside one".
 */
function recordLava(state: GameState, phase: CubePhase, x: number, y: number): void {
  recordDamage(state, phase, 'lava', CREW.damage.lavaOn, x, y);
  recordDamageBeside(state, phase, 'lava', CREW.damage.lavaBeside, x, y);
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

const STEP_NAMES = ['slumps', 'fluids', 'gas', 'timers', 'crewEffects'];

describe('the order of the cube phase (0014 item 1)', () => {
  it('has the five steps (a) to (e), in that order', () => {
    expect(CUBE_PHASE_STEPS.map((step) => step.name)).toEqual(STEP_NAMES);
  });

  it('runs the function of each step under its name', () => {
    expect(CUBE_PHASE_STEPS.map((step) => step.run)).toEqual([
      stepSlumps,
      stepFluids,
      stepGas,
      stepTimers,
      stepCrewEffects,
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
    expect(after.crew).toEqual(state.crew);
  });

  it('uses no randomness: the RNG is where it was', () => {
    const state = tunnelState();
    expect(endShift(state).state.rng).toEqual(state.rng);
  });
});

describe('recordDamage: only a worked square is hurt (design doc 5.2)', () => {
  it('records damage for a hazard on a worked square and says so', () => {
    const state = fieldState({ worked: [MIDDLE] });
    const phase = newCubePhase();
    expect(recordDamage(state, phase, 'slump', 3, MIDDLE.x, MIDDLE.y)).toBe(true);
    expect(phase.damage).toEqual([{ amount: 3, cause: 'slump' }]);
  });

  it('records nothing for a hazard on a square the crew did not work', () => {
    const state = fieldState({ worked: [MIDDLE] });
    const phase = newCubePhase();
    // Beside the worked square, diagonal to it, and far from it.
    expect(recordDamage(state, phase, 'slump', 3, 1, 0)).toBe(false);
    expect(recordDamage(state, phase, 'water', 1, 0, 0)).toBe(false);
    expect(recordDamage(state, phase, 'explosion', 6, 2, 2)).toBe(false);
    expect(phase.damage).toEqual([]);
  });

  it('records nothing anywhere when no square was worked', () => {
    const state = fieldState();
    const phase = newCubePhase();
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        expect(recordDamage(state, phase, 'explosion', 6, x, y)).toBe(false);
        expect(recordDamageBeside(state, phase, 'lava', 1, x, y)).toBe(false);
      }
    }
    expect(phase.damage).toEqual([]);
  });

  it('keeps the kinds in the order they were first met and drops zero damage', () => {
    const state = fieldState({ worked: [MIDDLE] });
    const phase = newCubePhase();
    recordDamage(state, phase, 'slump', 3, MIDDLE.x, MIDDLE.y);
    recordDamage(state, phase, 'gas', 0, MIDDLE.x, MIDDLE.y);
    recordDamage(state, phase, 'explosion', 6, MIDDLE.x, MIDDLE.y);
    recordDamage(state, phase, 'water', 1, MIDDLE.x, MIDDLE.y);
    expect(phase.damage).toEqual([
      { amount: 3, cause: 'slump' },
      { amount: 6, cause: 'explosion' },
      { amount: 1, cause: 'water' },
    ]);
  });

  it('refuses an amount that is negative or not whole, and a square off the map', () => {
    const state = fieldState({ worked: [MIDDLE] });
    const phase = newCubePhase();
    expect(() => recordDamage(state, phase, 'slump', -1, 1, 1)).toThrow('Cannot record -1 damage');
    expect(() => recordDamageBeside(state, phase, 'lava', 1.5, 1, 1)).toThrow(
      'Cannot record 1.5 damage',
    );
    expect(() => recordDamage(state, phase, 'slump', 3, 3, 1)).toThrow('not a square');
    expect(() => recordDamageBeside(state, phase, 'lava', 1, -1, 1)).toThrow('not a square');
    expect(phase.damage).toEqual([]);
  });

  it('does not touch the crew: health changes only in step (e)', () => {
    const state = fieldState({ health: 10, worked: [MIDDLE] });
    let healthDuringStepD = -1;
    withSteps(
      {
        slumps: (current, _events, phase) => {
          recordDamage(current, phase, 'slump', 3, MIDDLE.x, MIDDLE.y);
        },
        timers: (current) => {
          healthDuringStepD = current.crew.health;
        },
      },
      () => {
        expect(endShift(state).state.crew.health).toBe(7);
      },
    );
    expect(healthDuringStepD).toBe(10);
  });
});

describe('recordDamageBeside: hazards that also hurt from the next square', () => {
  it('hurts when the hazard is on a face neighbour of a worked square', () => {
    const state = fieldState({ worked: [MIDDLE] });
    for (const [x, y] of [
      [1, 0],
      [2, 1],
      [1, 2],
      [0, 1],
    ] as const) {
      const phase = newCubePhase();
      expect(recordDamageBeside(state, phase, 'lava', 1, x, y)).toBe(true);
      expect(phase.damage).toEqual([{ amount: 1, cause: 'lava' }]);
    }
  });

  it('does not count diagonals, nor the hazard square itself', () => {
    const state = fieldState({ worked: [MIDDLE] });
    const phase = newCubePhase();
    expect(recordDamageBeside(state, phase, 'lava', 1, 0, 0)).toBe(false);
    expect(recordDamageBeside(state, phase, 'lava', 1, 2, 2)).toBe(false);
    // The worked square has no worked neighbour: "on" is `recordDamage`'s job.
    expect(recordDamageBeside(state, phase, 'lava', 1, MIDDLE.x, MIDDLE.y)).toBe(false);
    expect(phase.damage).toEqual([]);
  });

  it('lava: 5 on a worked square, 1 beside one, and the larger counts', () => {
    // Lava stands on the worked square's east neighbour, then on the square.
    const state = fieldState({ worked: [MIDDLE] });
    const phase = newCubePhase();
    recordLava(state, phase, 2, 1);
    expect(phase.damage).toEqual([{ amount: CREW.damage.lavaBeside, cause: 'lava' }]);
    recordLava(state, phase, MIDDLE.x, MIDDLE.y);
    expect(phase.damage).toEqual([{ amount: CREW.damage.lavaOn, cause: 'lava' }]);
    // More lava beside it afterwards does not bring the amount back down.
    recordLava(state, phase, 0, 1);
    expect(phase.damage).toEqual([{ amount: 5, cause: 'lava' }]);
  });

  it('a gas explosion hurts on a worked square or beside one, not further away', () => {
    const state = buildState({ layers: [['#####']], worked: [{ x: 0, y: 0 }] });
    const amount = CREW.damage.gasExplosion;
    const hurtAt = (x: number): boolean => {
      const phase = newCubePhase();
      const on = recordDamage(state, phase, 'gasExplosion', amount, x, 0);
      const beside = recordDamageBeside(state, phase, 'gasExplosion', amount, x, 0);
      return on || beside;
    };
    expect([0, 1, 2, 3, 4].map(hurtAt)).toEqual([true, true, false, false, false]);
  });
});

describe('each kind of hazard hurts at most once per shift (design doc 5.2)', () => {
  it('two slumps onto worked squares in one cube phase deal 3, not 6', () => {
    const state = fieldState({
      health: 10,
      worked: [MIDDLE, { x: 0, y: 0 }],
    });
    withSteps(
      {
        slumps: (current, _events, phase) => {
          recordDamage(current, phase, 'slump', CREW.damage.slump, MIDDLE.x, MIDDLE.y);
          recordDamage(current, phase, 'slump', CREW.damage.slump, 0, 0);
        },
      },
      () => {
        const { state: after, events } = endShift(state);
        expect(after.crew.health).toBe(7);
        expect(events.filter((event) => event.type === 'damageTaken')).toEqual([
          { type: 'damageTaken', amount: 3, cause: 'slump', health: 7 },
        ]);
      },
    );
  });

  it('a slump and a gas explosion are two kinds: they deal 6', () => {
    const state = fieldState({ health: 10, worked: [MIDDLE] });
    withSteps(
      {
        slumps: (current, _events, phase) => {
          recordDamage(current, phase, 'slump', CREW.damage.slump, MIDDLE.x, MIDDLE.y);
        },
        gas: (current, _events, phase) => {
          recordDamage(current, phase, 'gasExplosion', CREW.damage.gasExplosion, 1, 1);
        },
      },
      () => {
        const { state: after, events } = endShift(state);
        expect(after.crew.health).toBe(4);
        expect(events.filter((event) => event.type === 'damageTaken')).toEqual([
          { type: 'damageTaken', amount: 3, cause: 'slump', health: 7 },
          { type: 'damageTaken', amount: 3, cause: 'gasExplosion', health: 4 },
        ]);
      },
    );
  });

  it('a kind hurts by its largest amount, in the place it was first met', () => {
    const state = fieldState({ worked: [MIDDLE] });
    const phase = newCubePhase();
    recordDamage(state, phase, 'lava', 1, 1, 1);
    recordDamage(state, phase, 'gas', 1, 1, 1);
    recordDamage(state, phase, 'lava', 5, 1, 1);
    recordDamage(state, phase, 'lava', 2, 1, 1);
    expect(phase.damage).toEqual([
      { amount: 5, cause: 'lava' },
      { amount: 1, cause: 'gas' },
    ]);
  });

  it('once per shift, not once per run: the same kind hurts again next shift', () => {
    const slump: StepFunction = (current, _events, phase) => {
      // The stand-in works the square itself, as the player would each shift.
      markWorked(current, MIDDLE.x, MIDDLE.y);
      recordDamage(current, phase, 'slump', 3, MIDDLE.x, MIDDLE.y);
    };
    withSteps({ slumps: slump }, () => {
      const first = endShift(fieldState({ health: 10 })).state;
      expect(first.crew.health).toBe(7);
      expect(endShift(first).state.crew.health).toBe(4);
    });
  });
});

describe('step (e) applies the recorded damage (design doc 5.2 and 5.3)', () => {
  it('applies each entry in the order it was recorded, one damageTaken each', () => {
    const state = fieldState({ health: 10 });
    const events: GameEvent[] = [];
    applyRecordedDamage(state, events, [
      { amount: 3, cause: 'slump' },
      { amount: 1, cause: 'water' },
      { amount: 3, cause: 'gasExplosion' },
    ]);
    expect(events).toEqual([
      { type: 'damageTaken', amount: 3, cause: 'slump', health: 7 },
      { type: 'damageTaken', amount: 1, cause: 'water', health: 6 },
      { type: 'damageTaken', amount: 3, cause: 'gasExplosion', health: 3 },
    ]);
    expect(state.crew.health).toBe(3);
    expect(state.status).toEqual({ kind: 'active' });
  });

  it('the first entry that brings health to 0 names the loss; later damage is not applied', () => {
    const state = fieldState({ health: 6 });
    const events: GameEvent[] = [];
    applyRecordedDamage(state, events, [
      { amount: 3, cause: 'slump' },
      { amount: 6, cause: 'explosion' },
      { amount: 1, cause: 'gas' },
    ]);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'burned' });
    expect(events).toEqual([
      { type: 'damageTaken', amount: 3, cause: 'slump', health: 3 },
      // Never more than the health that is left.
      { type: 'damageTaken', amount: 3, cause: 'explosion', health: 0 },
      { type: 'runEnded', outcome: 'lost', cause: 'burned' },
    ]);
    expect(state.crew.health).toBe(0);
  });

  it('the order decides the name: the same damage the other way round is "buried"', () => {
    const state = fieldState({ health: 6 });
    applyRecordedDamage(
      state,
      [],
      [
        { amount: 3, cause: 'gasExplosion' },
        { amount: 3, cause: 'slump' },
      ],
    );
    expect(state.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'buried' });
  });

  it('the run is lost at health 0: damage equal to the health left ends it', () => {
    const state = fieldState({ health: 3 });
    applyRecordedDamage(state, [], [{ amount: 3, cause: 'slump' }]);
    expect(state.crew.health).toBe(0);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'buried' });

    const alive = fieldState({ health: 4 });
    applyRecordedDamage(alive, [], [{ amount: 3, cause: 'slump' }]);
    expect(alive.crew.health).toBe(1);
    expect(alive.status).toEqual({ kind: 'active' });
  });

  it('names each loss by its cause: buried, drowned, burned, poisoned (5.3)', () => {
    const losses: string[] = [];
    const causes: DamageCause[] = ['slump', 'water', 'lava', 'gas', 'gasExplosion', 'explosion'];
    for (const cause of causes) {
      const state = fieldState({ health: 1 });
      applyRecordedDamage(state, [], [{ amount: 1, cause }]);
      const status = state.status;
      losses.push(`${cause}: ${status.kind === 'ended' ? status.cause : 'still going'}`);
    }
    expect(losses).toEqual([
      'slump: buried',
      'water: drowned',
      'lava: burned',
      'gas: poisoned',
      'gasExplosion: burned',
      'explosion: burned',
    ]);
  });

  it('a run lost in the cube phase skips upkeep: no fuel is used, the shift does not advance', () => {
    const state = fieldState({ health: 3, fuel: 5, shift: 4, worked: [MIDDLE] });
    withSteps(
      {
        slumps: (current, _events, phase) => {
          recordDamage(current, phase, 'slump', 3, MIDDLE.x, MIDDLE.y);
        },
      },
      () => {
        const { state: after, events } = endShift(state);
        expect(after.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'buried' });
        expect(events.map((event) => event.type)).toEqual(['damageTaken', 'runEnded']);
        expect([after.fuel, after.shift]).toEqual([5, 4]);
      },
    );
  });

  it('a crew that lives goes on to upkeep', () => {
    const state = fieldState({ health: 10, fuel: 5, worked: [MIDDLE] });
    withSteps(
      {
        slumps: (current, _events, phase) => {
          recordDamage(current, phase, 'slump', 3, MIDDLE.x, MIDDLE.y);
        },
        timers: (current) => {
          // The crew is not hurt during steps (a) to (d).
          expect(current.crew.health).toBe(10);
        },
      },
      () => {
        const { state: after, events } = endShift(state);
        expect(after.crew.health).toBe(7);
        expect(events.map((event) => event.type)).toEqual([
          'damageTaken',
          'fuelChanged',
          'shiftEnded',
        ]);
      },
    );
  });

  it('a new run starts with full crew health, and the state has no air', () => {
    const state = createRun(1, 'none', 'standard');
    expect(state.crew.health).toBe(CREW.startHealth);
    expect(CREW.startHealth).toBe(10);
    expect(JSON.stringify(serialise(state))).not.toContain('"air"');
  });
});

describe('worked squares (design doc 5.2)', () => {
  it('mining a square makes it a worked square', () => {
    const state = fieldState();
    const after = applyAction(state, { type: 'mine', x: 2, y: 0, ap: 2 }).state;
    expect(workedSquares(after)).toEqual([{ x: 2, y: 0 }]);
    expect(isWorked(after, 2, 0)).toBe(true);
    expect(isWorked(after, 1, 0)).toBe(false);
    // The state the action was taken from is not changed.
    expect(workedSquares(state)).toEqual([]);
  });

  it('cutting a tree makes its square a worked square', () => {
    const state = fieldState({ surface: ['...', '.T.', '...'] });
    const cut = legalActions(state).find((action) => action.type === 'cutTree');
    if (cut === undefined) {
      throw new Error('The tree cannot be cut');
    }
    expect(workedSquares(applyAction(state, cut).state)).toEqual([MIDDLE]);
  });

  it('crafting works no square', () => {
    const state = fieldState({ stockpile: { coal: 5, timber: 5 } });
    const craft = legalActions(state).find((action) => action.type === 'craft');
    if (craft === undefined) {
      throw new Error('Nothing can be crafted');
    }
    expect(workedSquares(applyAction(state, craft).state)).toEqual([]);
  });

  it('lists the squares worked in a shift row by row, each once', () => {
    let state = fieldState({ ap: 20 });
    for (const [x, y] of [
      [2, 2],
      [0, 1],
      [2, 0],
    ] as const) {
      state = applyAction(state, { type: 'mine', x, y, ap: 2 }).state;
    }
    // (2, 0) again: now one level down, and its neighbours are higher.
    markWorked(state, 2, 0);
    expect(workedSquares(state)).toEqual([
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it('are forgotten when the shift ends: the next shift starts with none', () => {
    const mined = applyAction(fieldState(), { type: 'mine', x: 1, y: 1, ap: 2 }).state;
    expect(workedSquares(mined)).toEqual([MIDDLE]);
    const next = endShift(mined).state;
    expect(workedSquares(next)).toEqual([]);
  });

  it('a square worked last shift is safe this shift', () => {
    const mined = applyAction(fieldState({ health: 10 }), {
      type: 'mine',
      x: 1,
      y: 1,
      ap: 2,
    }).state;
    const next = endShift(mined).state;
    withSteps(
      {
        slumps: (current, _events, phase) => {
          recordDamage(current, phase, 'slump', 3, MIDDLE.x, MIDDLE.y);
        },
      },
      () => {
        const { state: after, events } = endShift(next);
        expect(after.crew.health).toBe(10);
        expect(events.some((event) => event.type === 'damageTaken')).toBe(false);
      },
    );
  });

  it('are still there during steps (a) to (d), and cleared even when the run is lost', () => {
    const state = fieldState({ health: 1, worked: [MIDDLE] });
    let seenInStepD: Square[] = [];
    withSteps(
      {
        slumps: (current, _events, phase) => {
          recordDamage(current, phase, 'slump', 3, MIDDLE.x, MIDDLE.y);
        },
        timers: (current) => {
          seenInStepD = workedSquares(current);
        },
      },
      () => {
        const after = endShift(state).state;
        expect(seenInStepD).toEqual([MIDDLE]);
        expect(after.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'buried' });
        expect(workedSquares(after)).toEqual([]);
      },
    );
  });

  it('are part of the state: saved, loaded and hashed', () => {
    const plain = fieldState();
    const worked = fieldState({ worked: [MIDDLE] });
    expect(hashState(worked)).not.toBe(hashState(plain));
    const loaded = deserialise(JSON.parse(JSON.stringify(serialise(worked))) as SerialisedState);
    expect(workedSquares(loaded)).toEqual([MIDDLE]);
    expect(hashState(loaded)).toBe(hashState(worked));
  });

  it('isWorked and markWorked refuse a square off the map', () => {
    const state = fieldState();
    expect(() => isWorked(state, 3, 0)).toThrow('not a square');
    expect(() => markWorked(state, 0, -1)).toThrow('not a square');
    expect(() => isBesideWorked(state, 0.5, 0)).toThrow('not a square');
  });
});

describe('rest (only for a crew alive after damage)', () => {
  it('the resting flag lasts one shift, whether or not the crew lives', () => {
    const alive = fieldState();
    alive.crew.resting = true;
    stepCrewEffects(alive, [], newCubePhase());
    expect(alive.crew.resting).toBe(false);

    const dying = fieldState({ health: 1, worked: [MIDDLE] });
    dying.crew.resting = true;
    const phase = newCubePhase();
    recordDamage(dying, phase, 'slump', 3, MIDDLE.x, MIDDLE.y);
    stepCrewEffects(dying, [], phase);
    expect(dying.crew.resting).toBe(false);
    expect(dying.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'buried' });
  });
});

describe('a hand-made hazard, end to end', () => {
  it('water that enters a mined square costs 1 health; water elsewhere costs none', () => {
    // Stand-in for step (b): water "enters" two squares this shift.
    const flood: StepFunction = (current, _events, phase) => {
      recordDamage(current, phase, 'water', CREW.damage.water, 1, 1);
      recordDamage(current, phase, 'water', CREW.damage.water, 0, 0);
    };
    withSteps({ fluids: flood }, () => {
      // The player mined the middle square this shift: the crew is there.
      const mined = applyAction(fieldState(), { type: 'mine', x: 1, y: 1, ap: 2 }).state;
      const hurt = endShift(mined);
      expect(hurt.state.crew.health).toBe(CREW.startHealth - 1);
      expect(hurt.events[0]).toEqual({
        type: 'damageTaken',
        amount: 1,
        cause: 'water',
        health: CREW.startHealth - 1,
      });

      // The player mined a corner the water does not reach: nobody is hurt.
      const away = applyAction(fieldState(), { type: 'mine', x: 2, y: 2, ap: 2 }).state;
      const safe = endShift(away);
      expect(safe.state.crew.health).toBe(CREW.startHealth);
      expect(safe.events.some((event) => event.type === 'damageTaken')).toBe(false);
    });
  });
});
