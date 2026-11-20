// What hazards do to a camp (design doc v0.2 section 8, "Vulnerability";
// issue #100). Only slumps are built so far (task T8); water, lava and
// explosions call the same `destroyCampsAt` when their tasks build them
// (T10, T11), and tests/engine/destroy.test.ts pins that function.

import { describe, expect, it } from 'vitest';
import { CREW } from '../../src/data';
import { endShift, mineCheck } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { supportCheck } from '../../src/engine/actions/placeSupport';
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
