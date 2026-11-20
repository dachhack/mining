// What hazards do to a camp (design doc v0.2 section 8, "Vulnerability";
// issues #100 and #99). Slumps (task T8), water and lava (T10) are built;
// explosions call the same `destroyCampsAt` when their task builds them
// (T11), and tests/engine/destroy.test.ts pins that function.

import { describe, expect, it } from 'vitest';
import { CREW } from '../../src/data';
import { endShift, mineCheck } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { supportCheck } from '../../src/engine/actions/placeSupport';
import { lavaOn, setLavaOn, setWaterOn, waterOn } from '../../src/engine/standing';
import { act, buildState, findActions } from './helpers';
import type { BuildStateOptions } from './helpers';

/** Three equal rows: every test here is a strip seen from the side. */
function rows(row: string): string[] {
  return [row, row, row];
}

/**
 * A 5 x 3 strip. The camp stands on x = 1..3, on the floor of a cut 2 levels
 * deep; the squares at x = 0 are a wall of ground 2 levels above it. The
 * wall's middle block (0, 1) is cracked and due to fall at the end of this
 * shift; its slide path ends on the camp square (1, 1).
 */
function wallOverCamp(options: Partial<BuildStateOptions> = {}): GameState {
  return buildState({
    layers: [rows('#....'), rows('#....'), rows('#####'), rows('#####')],
    camps: [{ pos: { x: 2, y: 1, z: 2 }, foundedShift: 1 }],
    cracks: [{ pos: { x: 0, y: 1, z: 0 }, timer: 0 }],
    ...options,
  });
}

describe('a slump destroys a camp (design doc 8)', () => {
  it('when the block comes to rest on a camp square', () => {
    const { state: after, events } = endShift(wallOverCamp());
    expect(after.camps).toEqual([]);
    expect(events).toContainEqual({
      type: 'campDestroyed',
      pos: { x: 2, y: 1, z: 2 },
      cause: 'rockfall',
    });
    // The camp is lost: its squares can be mined again, and nothing is given back.
    expect(mineCheck(after, 2, 1).refusal).not.toBe('camp');
    expect(after.stockpile).toEqual({});
    // Nobody worked there this shift, so the crew is not hurt.
    expect(after.crew.health).toBe(CREW.startHealth);
  });

  it('when the block slumps from a camp square', () => {
    // The camp stands at ground level on x = 0..2, at the lip of a hole 2
    // levels deep at x = 3..4. Its east squares are 2 above their neighbours,
    // so they are unstable; (2, 1) is cracked and due.
    const state = buildState({
      layers: [rows('###..'), rows('###..'), rows('#####')],
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
      cracks: [{ pos: { x: 2, y: 1, z: 0 }, timer: 0 }],
    });
    const { state: after, events } = endShift(state);
    expect(after.camps).toEqual([]);
    expect(events).toContainEqual({
      type: 'campDestroyed',
      pos: { x: 1, y: 1, z: 0 },
      cause: 'rockfall',
    });
  });

  it('a slump beside a camp, neither from nor onto its squares, leaves it standing', () => {
    // The same wall, but the camp is one square further east: the block
    // lands on (1, 1), which is not a camp square.
    const state = buildState({
      layers: [rows('#.....'), rows('#.....'), rows('######'), rows('######')],
      camps: [{ pos: { x: 3, y: 1, z: 2 }, foundedShift: 1 }],
      cracks: [{ pos: { x: 0, y: 1, z: 0 }, timer: 0 }],
    });
    const { state: after, events } = endShift(state);
    expect(after.camps).toHaveLength(1);
    expect(events.filter((event) => event.type === 'campDestroyed')).toEqual([]);
  });
});

describe('a crew resting at a camp that a slump reaches', () => {
  it('is hurt by the slump, and gets no rest: the camp is gone', () => {
    const state = wallOverCamp({ health: 8 });
    const rested = act(state, { type: 'rest', x: 2, y: 1 }).state;
    const { state: after, events } = endShift(rested);
    expect(after.camps).toEqual([]);
    // 3 from the slump onto a worked square, and no rest after it.
    expect(events).toContainEqual({
      type: 'damageTaken',
      amount: CREW.damage.slump,
      cause: 'slump',
      health: 8 - CREW.damage.slump,
    });
    expect(events.filter((event) => event.type === 'healthRestored')).toEqual([]);
    expect(after.crew).toEqual({ health: 8 - CREW.damage.slump, restingAt: null });
  });

  it('is lost if the slump takes its last health', () => {
    const state = wallOverCamp({ health: CREW.damage.slump });
    const rested = act(state, { type: 'rest', x: 2, y: 1 }).state;
    const { state: after } = endShift(rested);
    expect(after.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'buried' });
  });

  it('without the rest, the same slump does not hurt the crew', () => {
    // The camp's squares are worked squares only while the crew rests there.
    const { state: after } = endShift(wallOverCamp({ health: 8 }));
    expect(after.crew.health).toBe(8);
  });
});

/**
 * A 5 x 3 strip. The camp stands on x = 1..3, on a floor 2 levels deep. The
 * square (4, 1) east of it is a hole 3 deep, between two squares of ground:
 * whatever is put in the hole can only flow west, onto the camp square (3, 1).
 */
function holeBesideCamp(options: Partial<BuildStateOptions> = {}): GameState {
  return buildState({
    layers: [
      ['....#', '.....', '....#'],
      ['#...#', '#....', '#...#'],
      ['#####', '####.', '#####'],
      rows('#####'),
      rows('#####'),
    ],
    camps: [{ pos: { x: 2, y: 1, z: 2 }, foundedShift: 1 }],
    ...options,
  });
}

describe('water and lava destroy a camp (design doc 6.3, 6.4 and 8)', () => {
  it('water that flows onto a camp square destroys the camp', () => {
    const state = holeBesideCamp();
    setWaterOn(state, 4, 1, 3); // full: its surface is 2 above the camp's floor
    const { state: after, events } = endShift(state);
    expect(waterOn(after, 3, 1)).toBe(1);
    expect(after.camps).toEqual([]);
    expect(events).toContainEqual({
      type: 'campDestroyed',
      pos: { x: 2, y: 1, z: 2 },
      cause: 'water',
    });
    expect(mineCheck(after, 2, 1).refusal).not.toBe('camp');
  });

  it('water that stays beside the camp leaves it standing', () => {
    const state = holeBesideCamp();
    setWaterOn(state, 4, 1, 1); // its surface is level with the camp's floor
    const { state: after, events } = endShift(state);
    expect(after.camps).toHaveLength(1);
    expect(events.filter((event) => event.type === 'campDestroyed')).toEqual([]);
  });

  it('lava that flows onto a camp square destroys the camp, in a shift in which lava flows', () => {
    const odd = holeBesideCamp({ shift: 1 });
    setLavaOn(odd, 4, 1, 3, false);
    expect(endShift(odd).state.camps).toHaveLength(1);

    const even = holeBesideCamp({ shift: 2 });
    setLavaOn(even, 4, 1, 3, false);
    const { state: after, events } = endShift(even);
    expect(lavaOn(after, 3, 1)).toBe(1);
    expect(after.camps).toEqual([]);
    expect(events).toContainEqual({
      type: 'campDestroyed',
      pos: { x: 2, y: 1, z: 2 },
      cause: 'lava',
    });
  });

  it('a crew resting at a camp that lava reaches is burned and gets no rest', () => {
    const state = holeBesideCamp({ shift: 2, health: 8 });
    setLavaOn(state, 4, 1, 3, false);
    const rested = act(state, { type: 'rest', x: 2, y: 1 }).state;
    const { state: after, events } = endShift(rested);
    expect(after.camps).toEqual([]);
    // The camp's squares are worked while the crew rests: lava on one takes 5.
    expect(events).toContainEqual({
      type: 'damageTaken',
      amount: CREW.damage.lavaOn,
      cause: 'lava',
      health: 8 - CREW.damage.lavaOn,
    });
    expect(events.filter((event) => event.type === 'healthRestored')).toEqual([]);
  });

  it('a crew resting at a camp that water reaches loses 1 and gets no rest', () => {
    const state = holeBesideCamp({ health: 8 });
    setWaterOn(state, 4, 1, 3);
    const rested = act(state, { type: 'rest', x: 2, y: 1 }).state;
    const { state: after, events } = endShift(rested);
    expect(after.camps).toEqual([]);
    expect(after.crew.health).toBe(8 - CREW.damage.water);
    expect(events.filter((event) => event.type === 'healthRestored')).toEqual([]);
  });
});

describe('nothing is placed on a camp square (design doc 4.1)', () => {
  it('a support is refused on the 9 squares, with the reason "camp"', () => {
    const state = buildState({
      layers: [rows('#####'), rows('#####')],
      stockpile: { support: 1 },
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
    });
    expect(supportCheck(state, 1, 1)).toEqual({ allowed: false, refusal: 'camp', ap: null });
    expect(supportCheck(state, 3, 1).allowed).toBe(true);
    // 15 squares, less the camp's 9.
    expect(findActions(state, { type: 'placeSupport' })).toHaveLength(6);
  });
});
