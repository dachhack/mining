// UI lab 1 (issue #116): `labMine`, the mine with no turns.
//
// Layers are drawn as in helpers.ts: one string per row, y = 0 first.
import { describe, expect, it } from 'vitest';
import { BLOCKS, CONTRACT_IDS, DEFAULT_LOADOUT_ID } from '../../src/data';
import { createRun, depthAt, hashState, labMine } from '../../src/engine';
import { buildState } from './helpers';

/**
 * A 3 x 3 cube. The middle square (1, 1) is dug 1 level down and shows coal;
 * the square east of it, (2, 1), is untouched iron ore over stone.
 */
function smallCube() {
  return buildState({
    layers: [
      ['ddd', 'd.i', 'ddd'],
      ['###', '#c#', '###'],
      ['###', '###', '###'],
    ],
  });
}

describe('labMine', () => {
  it('lowers a legal square by 1 and returns its yield from the data', () => {
    const state = smallCube();
    const result = labMine(state, 2, 1); // iron ore, no higher neighbour
    expect(result.mined).toBe(true);
    expect(result.refusal).toBeNull();
    expect(result.block).toBe(BLOCKS.ironOre.code);
    expect(result.yields).toEqual(BLOCKS.ironOre.yields);
    expect(depthAt(result.state, 2, 1)).toBe(1);
  });

  it('never changes the state it is given', () => {
    const state = smallCube();
    const before = hashState(state);
    labMine(state, 2, 1);
    expect(hashState(state)).toBe(before);
  });

  it('refuses a square with a higher neighbour and changes nothing', () => {
    const state = smallCube();
    const before = hashState(state);
    // (1, 1) is 1 down; all four neighbours are higher.
    const result = labMine(state, 1, 1);
    expect(result.mined).toBe(false);
    expect(result.refusal).toBe('neighbourHigher');
    expect(result.higherNeighbours.map((n) => n.direction)).toEqual([
      'north',
      'east',
      'south',
      'west',
    ]);
    expect(result.yields).toEqual([]);
    expect(result.state).toBe(state);
    expect(hashState(state)).toBe(before);
  });

  it('refuses a tap off the cube', () => {
    const state = smallCube();
    expect(labMine(state, -1, 0).refusal).toBe('outside');
    expect(labMine(state, 3, 0).refusal).toBe('outside');
  });

  it('refuses a square dug to the bottom', () => {
    const state = buildState({ layers: [['.d']] });
    const result = labMine(state, 0, 0);
    expect(result.mined).toBe(false);
    expect(result.refusal).toBe('bottom');
  });

  it('collapses a cavern under the mined block, so the square drops exactly 1', () => {
    const state = buildState({
      layers: [['###'], ['#.#'], ['###']],
    });
    const result = labMine(state, 1, 0);
    expect(result.mined).toBe(true);
    expect(depthAt(result.state, 1, 0)).toBe(1);
  });

  it('works on a generated cube and never changes its hash', () => {
    const contract = CONTRACT_IDS[0] as string;
    const state = createRun(7, contract, DEFAULT_LOADOUT_ID);
    const before = hashState(state);
    const result = labMine(state, 0, 0);
    expect(hashState(state)).toBe(before);
    expect(result.mined).toBe(true);
    expect(depthAt(result.state, 0, 0)).toBe(1);
  });
});
