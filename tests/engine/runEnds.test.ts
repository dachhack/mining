// Every hazard, and every way a run ends (issue #108, task T15; design doc
// v0.2 sections 5.2, 5.3, 6 and 9.4).
//
// Each scenario starts from a small hand-built cube and is PLAYED: the only
// things that change the state are `applyAction` (through the helper `act`)
// and `endShift`, as in the game. So each one checks a whole chain: the
// player's action, the worked square, the hazard's step in the cube phase,
// the damage, and the run's status.
//
// For each hazard there are two tests: the crew is hurt by the amount in
// design doc 5.2, and a crew with only that much health left is lost, with
// the cause design doc 5.3 names. The rules' corner cases are tested with the
// tasks that built them (slump.test.ts, fluids.test.ts, gas.test.ts,
// explosions.test.ts, camps.test.ts, closeMine.test.ts).

import { describe, expect, it } from 'vitest';
import { CREW, HAZARDS, SHIFT } from '../../src/data';
import { depthAt, endShift, knownSquare } from '../../src/engine';
import type { GameEvent, GameState, RunStatus } from '../../src/engine';
import { act, buildState, depthText } from './helpers';
import type { BuildStateOptions } from './helpers';

/** A run that was lost with this cause. */
function lostTo(cause: string): RunStatus {
  // `as RunStatus`: the cause strings in this file are all `RunEndCause`s.
  return { kind: 'ended', outcome: 'lost', cause } as RunStatus;
}

/** The damage events in a list of events, as "cause amount" strings. */
function damageIn(events: GameEvent[]): string[] {
  const found: string[] = [];
  for (const event of events) {
    if (event.type === 'damageTaken') {
      found.push(`${event.cause} ${event.amount}`);
    }
  }
  return found;
}

/** End the shift `count` times and return the last result. */
function endShifts(state: GameState, count: number): { state: GameState; events: GameEvent[] } {
  let current = state;
  let events: GameEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = endShift(current);
    current = result.state;
    events = result.events;
  }
  return { state: current, events };
}

// ---------------------------------------------------------------------------
// Slump: buried
// ---------------------------------------------------------------------------

describe('a pit wall slumps onto the crew (6.1): buried', () => {
  // A row of five dirt squares. The player digs the middle down 2 levels,
  // which the level rule allows once the squares beside it are 1 down. The
  // two end squares then stand at the top of a fall of 2, and dirt holds 1.
  function dig(health: number): GameState {
    let state = buildState({
      layers: [['ddddd'], ['ddddd'], ['ddddd'], ['ddddd']],
      health,
      stockpile: { support: 1 },
    });
    state = act(state, { type: 'mine', x: 2, y: 0 }).state;
    state = act(state, { type: 'mine', x: 1, y: 0 }).state;
    state = act(state, { type: 'mine', x: 3, y: 0 }).state;
    state = act(state, { type: 'mine', x: 2, y: 0 }).state;
    expect(depthText(state)).toEqual(['01210']);
    return state;
  }

  /** Dig, wait for the cracks to run down, and shore the pit floor in the shift the wall falls. */
  function play(health: number): { state: GameState; events: GameEvent[] } {
    let state = dig(health);
    // The end of the first shift cracks both end squares; the countdown runs
    // through the next `crackCountdown` shifts.
    const cracked = endShift(state);
    expect(cracked.events.filter((event) => event.type === 'blockCracked')).toHaveLength(2);
    state = endShifts(cracked.state, HAZARDS.slump.crackCountdown - 1).state;
    expect(depthText(state)).toEqual(['01210']);
    // The crew works on the floor of the pit: the foot of both slide paths.
    state = act(state, { type: 'placeSupport', x: 2, y: 0 }).state;
    return endShift(state);
  }

  it('a block that comes to rest on a worked square costs 3 health', () => {
    const { state, events } = play(CREW.startHealth);
    // One block falls: it fills the floor by a level, and the other end
    // square then stands at the top of a fall of 1, which dirt holds.
    expect(events.filter((event) => event.type === 'blockFell')).toHaveLength(1);
    expect(depthText(state)).toEqual(['11110']);
    expect(damageIn(events)).toEqual([`slump ${CREW.damage.slump}`]);
    expect(state.crew.health).toBe(CREW.startHealth - CREW.damage.slump);
    expect(state.status).toEqual({ kind: 'active' });
  });

  it('with 3 health left the crew is buried and the run is lost', () => {
    const { state, events } = play(CREW.damage.slump);
    expect(state.crew.health).toBe(0);
    expect(state.status).toEqual(lostTo('buried'));
    expect(events).toContainEqual({ type: 'runEnded', outcome: 'lost', cause: 'buried' });
  });

  it('nobody is hurt if the crew works nowhere near the fall', () => {
    let state = dig(CREW.startHealth);
    state = endShifts(state, HAZARDS.slump.crackCountdown + 1).state;
    expect(state.crew.health).toBe(CREW.startHealth);
    expect(depthText(state)).not.toEqual(['01210']);
  });
});

// ---------------------------------------------------------------------------
// Water: drowned
// ---------------------------------------------------------------------------

describe('water floods a worked square (6.2, 6.3): drowned', () => {
  // Three squares in a row; the second and third are already 1 level down.
  // Under the first lies a sealed pocket of two cells of water.
  function wetCube(options: Omit<BuildStateOptions, 'layers'>): GameState {
    return buildState({
      layers: [['#..'], ['.##'], ['.##'], ['###'], ['###']],
      water: [
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 2 },
      ],
      ...options,
    });
  }

  /** Mine into the pocket, then dig the square beside it deeper, and end the shift. */
  function play(health: number): { state: GameState; events: GameEvent[]; breach: GameEvent[] } {
    let state = wetCube({ health });
    const breach = act(state, { type: 'mine', x: 0, y: 0 });
    state = act(breach.state, { type: 'mine', x: 1, y: 0 }).state;
    const ended = endShift(state);
    return { state: ended.state, events: ended.events, breach: breach.events };
  }

  it('the pocket collapses and its water stands on the mined square', () => {
    const { breach } = play(CREW.startHealth);
    const collapse = breach.find((event) => event.type === 'spaceCollapsed');
    expect(collapse).toMatchObject({ water: 2, lava: 0, gas: 0 });
  });

  it('water that flows into a worked square costs 1 health', () => {
    const { state, events } = play(CREW.startHealth);
    expect(events.some((event) => event.type === 'fluidMoved' && event.fluid === 'water')).toBe(
      true,
    );
    expect(damageIn(events)).toEqual([`water ${CREW.damage.water}`]);
    expect(state.crew.health).toBe(CREW.startHealth - CREW.damage.water);
    expect(knownSquare(state, 1, 0).contents.water).toBeGreaterThan(0);
  });

  it('with 1 health left the crew is drowned and the run is lost', () => {
    const { state } = play(CREW.damage.water);
    expect(state.status).toEqual(lostTo('drowned'));
  });
});

// ---------------------------------------------------------------------------
// Lava: burned
// ---------------------------------------------------------------------------

describe('lava stands on a worked square (6.2, 6.4): burned', () => {
  /** Mine into a pocket of one cell of lava under the middle square, and end the shift. */
  function play(health: number): { state: GameState; events: GameEvent[] } {
    const state = buildState({
      layers: [['###'], ['#.#'], ['###'], ['###']],
      lava: [{ x: 1, y: 0, z: 1 }],
      health,
    });
    const mined = act(state, { type: 'mine', x: 1, y: 0 }).state;
    expect(knownSquare(mined, 1, 0).contents.lava).toBe(1);
    return endShift(mined);
  }

  it('lava on the square the crew mined costs 5 health', () => {
    const { state, events } = play(CREW.startHealth);
    expect(damageIn(events)).toEqual([`lava ${CREW.damage.lavaOn}`]);
    expect(state.crew.health).toBe(CREW.startHealth - CREW.damage.lavaOn);
  });

  it('with 5 health left the crew is burned and the run is lost', () => {
    const { state } = play(CREW.damage.lavaOn);
    expect(state.status).toEqual(lostTo('burned'));
  });

  it('a square with lava on it cannot be mined (4.2)', () => {
    const { state } = play(CREW.startHealth);
    expect(() => act(state, { type: 'mine', x: 1, y: 0 })).toThrow(/found 0/);
  });
});

// ---------------------------------------------------------------------------
// Gas: poisoned, and a gas explosion: burned
// ---------------------------------------------------------------------------

describe('gas lies on a worked square (6.2, 6.5): poisoned', () => {
  /** Five squares in a row with a pocket of one cell of gas under the first. */
  function gasCube(options: Omit<BuildStateOptions, 'layers'>): GameState {
    return buildState({
      layers: [['#####'], ['.####'], ['#####'], ['#####']],
      gas: [{ pos: { x: 0, y: 0, z: 1 }, units: HAZARDS.gas.pocketUnitsPerCell }],
      ...options,
    });
  }

  it('gas on the square the crew mined costs 1 health', () => {
    const mined = act(gasCube({}), { type: 'mine', x: 0, y: 0 }).state;
    expect(knownSquare(mined, 0, 0).contents.gas).toBe(HAZARDS.gas.pocketUnitsPerCell);
    const { state, events } = endShift(mined);
    expect(damageIn(events)).toEqual([`gas ${CREW.damage.gas}`]);
    expect(state.crew.health).toBe(CREW.startHealth - CREW.damage.gas);
    // Gas is heavier than air: it stays in the hole, and hurts again only if
    // the crew works there again.
    expect(knownSquare(state, 0, 0).contents.gas).toBe(HAZARDS.gas.pocketUnitsPerCell);
    expect(damageIn(endShift(state).events)).toEqual([]);
  });

  it('with 1 health left the crew is poisoned and the run is lost', () => {
    const mined = act(gasCube({ health: CREW.damage.gas }), { type: 'mine', x: 0, y: 0 }).state;
    expect(endShift(mined).state.status).toEqual(lostTo('poisoned'));
  });

  /** Release the gas, then set a charge two squares along: its blast is beside the gas. */
  function ignite(health: number): { state: GameState; events: GameEvent[] } {
    let state = gasCube({ health, stockpile: { explosive: 1 } });
    state = act(state, { type: 'mine', x: 0, y: 0 }).state;
    state = act(state, { type: 'placeExplosive', x: 2, y: 0 }).state;
    return endShift(state);
  }

  it('a charge beside the gas sets it off: 3 health for the gas explosion, and no gas left', () => {
    const { state, events } = ignite(CREW.startHealth);
    const kinds = events.flatMap((event) => (event.type === 'exploded' ? [event.kind] : []));
    expect(kinds).toEqual(['explosive', 'gas']);
    // The charge's own blast (squares 1 to 3) misses the worked square 0, so
    // only the gas explosion hurts; gas that burnt does not also poison.
    expect(damageIn(events)).toEqual([`gasExplosion ${CREW.damage.gasExplosion}`]);
    expect(state.crew.health).toBe(CREW.startHealth - CREW.damage.gasExplosion);
    expect(knownSquare(state, 0, 0).contents.gas).toBe(0);
  });

  it('with 3 health left the crew is burned by the gas explosion and the run is lost', () => {
    expect(ignite(CREW.damage.gasExplosion).state.status).toEqual(lostTo('burned'));
  });
});

// ---------------------------------------------------------------------------
// Explosions: a charge, and unstable ore: burned
// ---------------------------------------------------------------------------

describe('a blast includes a worked square (6.6): burned', () => {
  /** Set a charge in the middle of a row and then mine the square beside it. */
  function charge(health: number): { state: GameState; events: GameEvent[] } {
    let state = buildState({
      layers: [['#####'], ['#####'], ['#####']],
      health,
      stockpile: { explosive: 1 },
    });
    state = act(state, { type: 'placeExplosive', x: 2, y: 0 }).state;
    state = act(state, { type: 'mine', x: 3, y: 0 }).state;
    return endShift(state);
  }

  it('working inside the blast of your own charge costs 6 health', () => {
    const { state, events } = charge(CREW.startHealth);
    expect(damageIn(events)).toEqual([`explosion ${CREW.damage.explosion}`]);
    expect(state.crew.health).toBe(CREW.startHealth - CREW.damage.explosion);
    // The blast took the top block of its 3 squares, level rule or not.
    expect(depthText(state)).toEqual(['01120']);
  });

  it('with 6 health left the crew is burned and the run is lost', () => {
    expect(charge(CREW.damage.explosion).state.status).toEqual(lostTo('burned'));
  });

  it('placing the charge alone hurts nobody: the crew withdraws (5.2)', () => {
    let state = buildState({ layers: [['#####'], ['#####']], stockpile: { explosive: 1 } });
    state = act(state, { type: 'placeExplosive', x: 2, y: 0 }).state;
    const { state: after, events } = endShift(state);
    expect(damageIn(events)).toEqual([]);
    expect(after.crew.health).toBe(CREW.startHealth);
  });

  /** A row with unstable ore in sight at its middle; the crew mines the block beside it. */
  function ore(options: Omit<BuildStateOptions, 'layers'>): GameState {
    return buildState({ layers: [['##U##'], ['#####'], ['#####']], ...options });
  }

  it('mining beside unstable ore arms it: it goes off and costs 6 health', () => {
    const mined = act(ore({}), { type: 'mine', x: 1, y: 0 });
    expect(mined.events.some((event) => event.type === 'oreArmed')).toBe(true);
    const { state, events } = endShift(mined.state);
    const kinds = events.flatMap((event) => (event.type === 'exploded' ? [event.kind] : []));
    expect(kinds).toEqual(['unstableOre']);
    expect(damageIn(events)).toEqual([`explosion ${CREW.damage.explosion}`]);
    expect(state.crew.health).toBe(CREW.startHealth - CREW.damage.explosion);
    // No rare ore: the ore is destroyed with no yield.
    expect(state.stockpile['rareOre'] ?? 0).toBe(0);
  });

  it('with 6 health left the crew is burned by the ore and the run is lost', () => {
    const mined = act(ore({ health: CREW.damage.explosion }), { type: 'mine', x: 1, y: 0 }).state;
    expect(endShift(mined).state.status).toEqual(lostTo('burned'));
  });

  it('braced first, the ore stays quiet; mined first, it yields rare ore', () => {
    let braced = ore({ stockpile: { support: 1 } });
    braced = act(braced, { type: 'placeSupport', x: 2, y: 0 }).state;
    braced = act(braced, { type: 'mine', x: 1, y: 0 }).state;
    const afterBraced = endShift(braced);
    expect(afterBraced.events.some((event) => event.type === 'exploded')).toBe(false);
    expect(afterBraced.state.crew.health).toBe(CREW.startHealth);

    const first = act(ore({}), { type: 'mine', x: 2, y: 0 }).state;
    expect(first.stockpile['rareOre']).toBe(1);
    expect(endShift(first).events.some((event) => event.type === 'exploded')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The ways a run ends without losing the crew
// ---------------------------------------------------------------------------

describe('out of fuel (4, 5.3)', () => {
  const FLAT = [['###'], ['###']];

  it('the run is lost when fuel is already 0 as upkeep comes: one last shift after it reaches 0', () => {
    const state = buildState({ layers: FLAT, fuel: SHIFT.fuelPerShift });
    const first = endShift(state);
    expect(first.state.fuel).toBe(0);
    expect(first.state.status).toEqual({ kind: 'active' });
    const second = endShift(first.state);
    expect(second.state.status).toEqual(lostTo('outOfFuel'));
    expect(second.events).toContainEqual({
      type: 'runEnded',
      outcome: 'lost',
      cause: 'outOfFuel',
    });
    // The crew was never hurt: this ending is not a crew loss.
    expect(second.state.crew.health).toBe(CREW.startHealth);
  });

  it('coal crafted in that last shift keeps the run going (owner, question 19)', () => {
    const state = buildState({ layers: FLAT, fuel: SHIFT.fuelPerShift, stockpile: { coal: 1 } });
    const atZero = endShift(state).state;
    expect(atZero.fuel).toBe(0);
    const crafted = act(atZero, { type: 'craft', recipe: 'fuel' }).state;
    expect(crafted.fuel).toBe(3);
    const next = endShift(crafted).state;
    expect(next.status).toEqual({ kind: 'active' });
    expect(next.fuel).toBe(3 - SHIFT.fuelPerShift);
  });
});

describe('closing the mine, and the outcomes that exist before contracts (9.3, 9.4)', () => {
  const FLAT = [['#c#'], ['###']];

  it('closing the mine ends the run alive, as salvage', () => {
    const state = buildState({ layers: FLAT });
    const { state: closed, events } = act(state, { type: 'closeMine' });
    expect(closed.status).toEqual({ kind: 'ended', outcome: 'salvage', cause: 'mineClosed' });
    expect(events).toEqual([{ type: 'runEnded', outcome: 'salvage', cause: 'mineClosed' }]);
    expect(closed.crew.health).toBe(CREW.startHealth);
  });

  it('it is salvage whatever the stockpile holds: no contract, so no deliverables', () => {
    // Until contracts are built (M4) there is no "partial" and no "full
    // success": a closed mine is salvage even with ore and a keystone in the
    // stockpile.
    let state = buildState({
      layers: FLAT,
      stockpile: { rawIronOre: 5, crystal: 2, relic: 1, keystone: 1 },
    });
    state = act(state, { type: 'mine', x: 1, y: 0 }).state;
    expect(state.stockpile['coal']).toBe(1);
    // Taking a keystone-sized haul did not end the run by itself.
    expect(state.status).toEqual({ kind: 'active' });
    const closed = act(state, { type: 'closeMine' }).state;
    expect(closed.status).toEqual({ kind: 'ended', outcome: 'salvage', cause: 'mineClosed' });
  });

  it('it can be closed with no AP left, and in the last shift of fuel', () => {
    const state = buildState({ layers: FLAT, ap: 0, fuel: 0 });
    expect(act(state, { type: 'closeMine' }).state.status).toEqual({
      kind: 'ended',
      outcome: 'salvage',
      cause: 'mineClosed',
    });
  });

  it('once a run has ended nothing more can be done', () => {
    const closed = act(buildState({ layers: FLAT }), { type: 'closeMine' }).state;
    expect(() => endShift(closed)).toThrow(/ended/);
    expect(() => act(closed, { type: 'mine', x: 0, y: 0 })).toThrow(/found 0/);
    expect(depthAt(closed, 0, 0)).toBe(0);
  });
});
