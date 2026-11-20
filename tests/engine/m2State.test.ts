// The parts of the state the M2 skeleton added (issue #50; decision note
// 0015): water, lava, gas and cracks in cells, armed charges, camps, and the
// helpers that read and change them. No rule uses them yet; these tests pin
// the helpers the M2 tasks build on.

import { describe, expect, it } from 'vitest';
import { BLOCKS, CAMPS } from '../../src/data';
import { campSquares, campsAt } from '../../src/engine/camps';
import {
  addCamp,
  armCharge,
  armedAt,
  blankState,
  clearCrack,
  crackTimerAt,
  disarmCharge,
  gasAt,
  isLavaSource,
  lavaAt,
  removeCamp,
  setBlock,
  setCrackTimer,
  setGas,
  setLava,
  setWater,
  waterAt,
} from '../../src/engine/state';
import { buildState } from './helpers';

function openState() {
  return buildState({
    layers: [
      ['...', '...', '...'],
      ['###', '###', '###'],
    ],
  });
}

describe('water, lava and gas in a cell', () => {
  it('reads back what was set, one cell at a time', () => {
    const state = openState();
    const pos = { x: 1, y: 2, z: 0 };
    setWater(state, pos, 1);
    setGas(state, pos, 4);
    expect(waterAt(state, pos)).toBe(1);
    expect(gasAt(state, pos)).toBe(4);
    expect(lavaAt(state, pos)).toBe(0);
    expect(waterAt(state, { x: 2, y: 2, z: 0 })).toBe(0);
    expect(gasAt(state, { x: 1, y: 1, z: 0 })).toBe(0);
  });

  it('keeps the source flag with the lava: lava that is removed is no longer a source', () => {
    const state = openState();
    const pos = { x: 0, y: 0, z: 0 };
    setLava(state, pos, 1, true);
    expect(lavaAt(state, pos)).toBe(1);
    expect(isLavaSource(state, pos)).toBe(true);
    setLava(state, pos, 1);
    expect(isLavaSource(state, pos)).toBe(false);
    setLava(state, pos, 1, true);
    setLava(state, pos, 0);
    expect(lavaAt(state, pos)).toBe(0);
    expect(isLavaSource(state, pos)).toBe(false);
    // A cell with no lava cannot be made a source.
    setLava(state, pos, 0, true);
    expect(isLavaSource(state, pos)).toBe(false);
  });

  it('answers "nothing" outside the grid, and refuses to write there', () => {
    const state = openState();
    for (const pos of [
      { x: 0, y: 0, z: -1 }, // the surface
      { x: -1, y: 0, z: 0 }, // bedrock beside the cube
      { x: 0, y: 0, z: 2 }, // bedrock below it
    ]) {
      expect(waterAt(state, pos)).toBe(0);
      expect(lavaAt(state, pos)).toBe(0);
      expect(isLavaSource(state, pos)).toBe(false);
      expect(gasAt(state, pos)).toBe(0);
      expect(crackTimerAt(state, pos)).toBeNull();
      expect(() => setWater(state, pos, 1)).toThrow('outside the cube');
      expect(() => setGas(state, pos, 1)).toThrow('outside the cube');
      expect(() => setCrackTimer(state, pos, 2)).toThrow('outside the cube');
    }
  });

  it('refuses a value that does not fit a cell', () => {
    const state = openState();
    const pos = { x: 0, y: 0, z: 0 };
    expect(() => setGas(state, pos, -1)).toThrow('Gas units');
    expect(() => setGas(state, pos, 256)).toThrow('Gas units');
    expect(() => setWater(state, pos, 0.5)).toThrow('Water units');
    // -1 must not quietly store 0, which would mean "no crack".
    expect(() => setCrackTimer(state, pos, -1)).toThrow('crack timer');
    expect(() => setCrackTimer(state, pos, 255)).toThrow('crack timer');
    expect(gasAt(state, pos)).toBe(0);
  });
});

describe('crack timers (0014 item 7)', () => {
  it('tells a block with a stored timer of 0 from a block that is not cracked', () => {
    const state = openState();
    const pos = { x: 1, y: 1, z: 1 };
    expect(crackTimerAt(state, pos)).toBeNull();
    setCrackTimer(state, pos, 2);
    expect(crackTimerAt(state, pos)).toBe(2);
    setCrackTimer(state, pos, 0);
    expect(crackTimerAt(state, pos)).toBe(0);
    clearCrack(state, pos);
    expect(crackTimerAt(state, pos)).toBeNull();
  });

  it('stores the number the player is shown: the timer plus 1', () => {
    const state = buildState({
      layers: [['#']],
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 2 }],
    });
    expect(Array.from(state.cracks)).toEqual([3]);
  });
});

describe('setBlock keeps cracks and armed ore with their block', () => {
  it('a block that replaces a cracked block, or open space, has no crack', () => {
    const state = buildState({
      layers: [['##']],
      cracks: [
        { pos: { x: 0, y: 0, z: 0 }, timer: 1 },
        { pos: { x: 1, y: 0, z: 0 }, timer: 0 },
      ],
    });
    setBlock(state, { x: 0, y: 0, z: 0 }, BLOCKS.air.code); // mined out
    setBlock(state, { x: 1, y: 0, z: 0 }, BLOCKS.rubble.code);
    expect(crackTimerAt(state, { x: 0, y: 0, z: 0 })).toBeNull();
    expect(crackTimerAt(state, { x: 1, y: 0, z: 0 })).toBeNull();
  });

  it('setting the block a cell already has keeps its crack', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const state = buildState({ layers: [['#']], cracks: [{ pos, timer: 1 }] });
    setBlock(state, pos, BLOCKS.stone.code);
    expect(crackTimerAt(state, pos)).toBe(1);
  });

  it('armed unstable ore that is mined out is no longer armed; an explosive stays', () => {
    const ore = { x: 0, y: 0, z: 1 };
    const open = { x: 1, y: 0, z: 0 };
    const state = buildState({
      layers: [['#.'], ['U#']],
      armed: [
        { pos: ore, kind: 'unstableOre' },
        { pos: open, kind: 'explosive' },
      ],
    });
    setBlock(state, ore, BLOCKS.air.code);
    expect(state.armed).toEqual([{ pos: open, kind: 'explosive' }]);
  });
});

describe('armed charges', () => {
  it('keeps the list sorted by z, then y, then x, with one entry for a cell', () => {
    const state = openState();
    armCharge(state, { x: 1, y: 0, z: 1 }, 'unstableOre');
    armCharge(state, { x: 2, y: 1, z: 0 }, 'explosive');
    armCharge(state, { x: 0, y: 1, z: 0 }, 'explosive');
    armCharge(state, { x: 2, y: 0, z: 0 }, 'explosive');
    // Arming a cell that is already armed changes nothing.
    armCharge(state, { x: 1, y: 0, z: 1 }, 'unstableOre');
    expect(state.armed).toEqual([
      { pos: { x: 2, y: 0, z: 0 }, kind: 'explosive' },
      { pos: { x: 0, y: 1, z: 0 }, kind: 'explosive' },
      { pos: { x: 2, y: 1, z: 0 }, kind: 'explosive' },
      { pos: { x: 1, y: 0, z: 1 }, kind: 'unstableOre' },
    ]);
    expect(armedAt(state, { x: 1, y: 0, z: 1 })).toBe('unstableOre');
    expect(armedAt(state, { x: 1, y: 1, z: 1 })).toBeNull();
  });

  it('disarms one cell and leaves the others', () => {
    const state = openState();
    armCharge(state, { x: 1, y: 0, z: 1 }, 'unstableOre');
    armCharge(state, { x: 0, y: 0, z: 0 }, 'explosive');
    disarmCharge(state, { x: 1, y: 0, z: 1 });
    disarmCharge(state, { x: 2, y: 2, z: 0 }); // not armed: nothing happens
    expect(state.armed).toEqual([{ pos: { x: 0, y: 0, z: 0 }, kind: 'explosive' }]);
  });

  it('keeps its own copy of the position, and refuses one outside the grid', () => {
    const state = openState();
    const pos = { x: 0, y: 0, z: 0 };
    armCharge(state, pos, 'explosive');
    pos.x = 2;
    expect(state.armed).toEqual([{ pos: { x: 0, y: 0, z: 0 }, kind: 'explosive' }]);
    expect(() => armCharge(state, { x: 0, y: 0, z: -1 }, 'explosive')).toThrow('outside the cube');
  });
});

describe('camps', () => {
  it('a new camp records where and when it was founded, and holds nothing (no stash)', () => {
    const state = openState();
    state.shift = 12;
    const camp = addCamp(state, { x: 1, y: 1, z: 0 });
    expect(camp).toEqual({ pos: { x: 1, y: 1, z: 0 }, foundedShift: 12 });
    expect(state.camps).toEqual([camp]);
    // The object returned is the one in the list.
    expect(state.camps[0]).toBe(camp);
  });

  it('keeps the list sorted by position, and removes a camp by identity', () => {
    const state = blankState({ x: 3, y: 3, z: 6 }, 1);
    const deep = addCamp(state, { x: 1, y: 1, z: 5 });
    const shallow = addCamp(state, { x: 1, y: 1, z: 2 });
    expect(state.camps.map((camp) => camp.pos.z)).toEqual([2, 5]);
    removeCamp(state, shallow);
    expect(state.camps).toEqual([deep]);
    expect(() => addCamp(state, { x: 1, y: 1, z: -1 })).toThrow('outside the cube');
  });

  it('a camp covers the 3 x 3 squares round its centre', () => {
    // The number this test is written for (design doc 8).
    expect(CAMPS.halfWidth).toBe(1);
    const camp = { pos: { x: 5, y: 6, z: 10 }, foundedShift: 1 };
    const squares = campSquares(camp);
    expect(squares).toHaveLength(9);
    expect(squares[0]).toEqual({ x: 4, y: 5 }); // row by row: y, then x
    expect(squares[8]).toEqual({ x: 6, y: 7 });
    expect(new Set(squares.map((square) => `${square.x},${square.y}`)).size).toBe(9);
  });

  it("campsAt finds the camp standing on a cell's square, whatever the layer", () => {
    const state = blankState({ x: 8, y: 8, z: 6 }, 1);
    const camp = addCamp(state, { x: 2, y: 2, z: 3 });
    expect(campsAt(state, { x: 2, y: 2, z: 3 })).toEqual([camp]);
    expect(campsAt(state, { x: 3, y: 1, z: 2 })).toEqual([camp]); // a corner square
    expect(campsAt(state, { x: 2, y: 2, z: 0 })).toEqual([camp]); // high above it
    expect(campsAt(state, { x: 4, y: 2, z: 3 })).toEqual([]); // beside it
  });
});
