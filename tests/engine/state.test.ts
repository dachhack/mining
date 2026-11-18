import { describe, expect, it } from 'vitest';
import { BLOCKS, NO_STRUCTURE, STRUCTURES } from '../../src/data';
import {
  addItem,
  blockAt,
  blockDefAt,
  cellCount,
  cellIndex,
  cellPosition,
  cloneState,
  countItem,
  endRun,
  inGrid,
  isOpen,
  isRevealed,
  isSolid,
  isSurface,
  removeItem,
  setBlock,
  setRevealed,
  setStructure,
  structureAt,
} from '../../src/engine/state';
import type { GameEvent } from '../../src/engine';
import { hashState } from '../../src/engine';
import { buildState, layerText } from './helpers';

// A 4 x 3 x 2 cube: different sizes on each axis, so a mixed-up axis shows.
const SIZE = { x: 4, y: 3, z: 2 };

function smallState() {
  return buildState({
    layers: [
      ['#d##', '#.##', '####'], // z = 0
      ['HHHH', 'HcHH', 'HHHH'], // z = 1
    ],
    avatar: { x: 1, y: 1, z: 0 },
  });
}

describe('coordinate helpers', () => {
  it('gives every cell its own index, and cellPosition reverses cellIndex', () => {
    const seen = new Set<number>();
    for (let z = 0; z < SIZE.z; z += 1) {
      for (let y = 0; y < SIZE.y; y += 1) {
        for (let x = 0; x < SIZE.x; x += 1) {
          const index = cellIndex(SIZE, { x, y, z });
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(cellCount(SIZE));
          expect(cellPosition(SIZE, index)).toEqual({ x, y, z });
          seen.add(index);
        }
      }
    }
    expect(seen.size).toBe(cellCount(SIZE));
    expect(cellCount(SIZE)).toBe(24);
  });

  it('stores cells layer by layer, row by row', () => {
    expect(cellIndex(SIZE, { x: 0, y: 0, z: 0 })).toBe(0);
    expect(cellIndex(SIZE, { x: 1, y: 0, z: 0 })).toBe(1);
    expect(cellIndex(SIZE, { x: 0, y: 1, z: 0 })).toBe(4);
    expect(cellIndex(SIZE, { x: 0, y: 0, z: 1 })).toBe(12);
  });

  it('refuses a position or index outside the cube', () => {
    expect(() => cellIndex(SIZE, { x: 4, y: 0, z: 0 })).toThrow('outside the cube');
    expect(() => cellIndex(SIZE, { x: 0, y: -1, z: 0 })).toThrow('outside the cube');
    expect(() => cellIndex(SIZE, { x: 0, y: 0, z: -1 })).toThrow('outside the cube');
    expect(() => cellPosition(SIZE, 24)).toThrow('outside the cube');
    expect(() => cellPosition(SIZE, -1)).toThrow('outside the cube');
  });

  it('knows the grid from the surface layer above it', () => {
    expect(inGrid(SIZE, { x: 3, y: 2, z: 1 })).toBe(true);
    expect(inGrid(SIZE, { x: 0, y: 0, z: -1 })).toBe(false);
    expect(inGrid(SIZE, { x: 0, y: 0, z: 2 })).toBe(false);
    expect(inGrid(SIZE, { x: 0, y: 3, z: 0 })).toBe(false);

    expect(isSurface(SIZE, { x: 0, y: 0, z: -1 })).toBe(true);
    expect(isSurface(SIZE, { x: 3, y: 2, z: -1 })).toBe(true);
    expect(isSurface(SIZE, { x: 4, y: 2, z: -1 })).toBe(false); // off the edge
    expect(isSurface(SIZE, { x: 0, y: 0, z: 0 })).toBe(false); // the top layer is not the surface
    expect(isSurface(SIZE, { x: 0, y: 0, z: -2 })).toBe(false);
  });
});

describe('what is at (x, y, z)', () => {
  it('answers the stored block inside the grid', () => {
    const state = smallState();
    expect(blockAt(state, { x: 0, y: 0, z: 0 })).toBe(BLOCKS.stone.code);
    expect(blockAt(state, { x: 1, y: 0, z: 0 })).toBe(BLOCKS.dirt.code);
    expect(blockAt(state, { x: 1, y: 1, z: 0 })).toBe(BLOCKS.air.code);
    expect(blockAt(state, { x: 1, y: 1, z: 1 })).toBe(BLOCKS.coalSeam.code);
    expect(blockAt(state, { x: 3, y: 2, z: 1 })).toBe(BLOCKS.hardRock.code);
    expect(blockDefAt(state, { x: 1, y: 1, z: 1 }).name).toBe('Coal seam');
  });

  it('answers bedrock beyond each side and below the bottom (0005 item 1)', () => {
    const state = smallState();
    const outside = [
      { x: -1, y: 1, z: 0 },
      { x: 4, y: 1, z: 0 },
      { x: 1, y: -1, z: 0 },
      { x: 1, y: 3, z: 0 },
      { x: 1, y: 1, z: 2 },
      { x: 1, y: 1, z: 99 },
    ];
    for (const pos of outside) {
      expect(blockAt(state, pos)).toBe(BLOCKS.bedrock.code);
      expect(isSolid(state, pos)).toBe(true);
      expect(isOpen(state, pos)).toBe(false);
      expect(blockDefAt(state, pos).mineCost).toBeNull();
    }
  });

  it('answers open air on the surface layer, and bedrock around and above it (0005 item 2)', () => {
    const state = smallState();
    for (let y = 0; y < SIZE.y; y += 1) {
      for (let x = 0; x < SIZE.x; x += 1) {
        expect(blockAt(state, { x, y, z: -1 })).toBe(BLOCKS.air.code);
        expect(isOpen(state, { x, y, z: -1 })).toBe(true);
      }
    }
    // The avatar cannot leave the footprint of the cube, or go higher.
    expect(blockAt(state, { x: -1, y: 0, z: -1 })).toBe(BLOCKS.bedrock.code);
    expect(blockAt(state, { x: 0, y: 3, z: -1 })).toBe(BLOCKS.bedrock.code);
    expect(blockAt(state, { x: 0, y: 0, z: -2 })).toBe(BLOCKS.bedrock.code);
  });

  it('tells solid cells from open ones', () => {
    const state = smallState();
    expect(isSolid(state, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(isOpen(state, { x: 1, y: 1, z: 0 })).toBe(true);
    expect(isSolid(state, { x: 1, y: 1, z: 0 })).toBe(false);
  });

  it('reads and writes blocks, structures and the revealed flag', () => {
    const state = smallState();
    const pos = { x: 2, y: 1, z: 0 };

    setBlock(state, pos, BLOCKS.air.code);
    expect(blockAt(state, pos)).toBe(BLOCKS.air.code);
    expect(layerText(state, 0)).toEqual(['#d##', '#..#', '####']);

    expect(structureAt(state, pos)).toBe(NO_STRUCTURE);
    setStructure(state, pos, STRUCTURES.ladder.code);
    expect(structureAt(state, pos)).toBe(STRUCTURES.ladder.code);

    expect(isRevealed(state, pos)).toBe(false);
    setRevealed(state, pos, true);
    expect(isRevealed(state, pos)).toBe(true);
    setRevealed(state, pos, false);
    expect(isRevealed(state, pos)).toBe(false);

    // Only that one cell changed.
    expect(isRevealed(state, { x: 1, y: 1, z: 0 })).toBe(false);
    expect(structureAt(state, { x: 1, y: 1, z: 0 })).toBe(NO_STRUCTURE);
  });

  it('has no structures outside the grid, and counts everything outside as known', () => {
    const state = smallState();
    expect(structureAt(state, { x: 0, y: 0, z: -1 })).toBe(NO_STRUCTURE);
    expect(structureAt(state, { x: -1, y: 0, z: 0 })).toBe(NO_STRUCTURE);
    expect(isRevealed(state, { x: 0, y: 0, z: -1 })).toBe(true);
    expect(isRevealed(state, { x: -1, y: 0, z: 0 })).toBe(true);
    expect(() => setStructure(state, { x: 0, y: 0, z: -1 }, STRUCTURES.ladder.code)).toThrow(
      'outside the cube',
    );
    expect(() => setBlock(state, { x: 0, y: 0, z: 2 }, BLOCKS.air.code)).toThrow(
      'outside the cube',
    );
  });
});

describe('inventory bookkeeping', () => {
  it('counts, adds and removes items', () => {
    const state = smallState();
    expect(countItem(state, 'coal')).toBe(0);
    addItem(state, 'coal', 3);
    addItem(state, 'coal', 1);
    expect(countItem(state, 'coal')).toBe(4);
    removeItem(state, 'coal', 4);
    expect(countItem(state, 'coal')).toBe(0);
  });

  it('refuses to remove more than is carried, or to add a negative count', () => {
    const state = buildState({ layers: [['#']], inventory: { coal: 1 } });
    expect(() => removeItem(state, 'coal', 2)).toThrow('carries 1');
    expect(() => removeItem(state, 'timber', 1)).toThrow('carries 0');
    expect(() => addItem(state, 'coal', -1)).toThrow();
    expect(countItem(state, 'coal')).toBe(1);
  });
});

describe('endRun', () => {
  it('ends the run once and keeps the first cause', () => {
    const state = smallState();
    const events: GameEvent[] = [];
    endRun(state, 'death', 'fell', events);
    endRun(state, 'salvage', 'left', events);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });
    expect(events).toEqual([{ type: 'runEnded', outcome: 'death', cause: 'fell' }]);
  });
});

describe('cloneState', () => {
  it('makes an equal copy that shares nothing with the original', () => {
    const state = buildState({
      layers: [['#.'], ['##']],
      avatar: { x: 1, y: 0, z: 0 },
      inventory: { timber: 2 },
      looseItems: [{ pos: { x: 1, y: 0, z: 0 }, item: 'stone', count: 1 }],
      ladders: [{ x: 1, y: 0, z: 0 }],
    });
    const before = hashState(state);
    const copy = cloneState(state);
    expect(copy).toEqual(state);

    // Change every part of the copy.
    copy.blocks.fill(0);
    copy.revealed.fill(1);
    copy.fluid.fill(1);
    copy.gas.fill(1);
    copy.structures.fill(0);
    copy.rng.s += 1;
    copy.size.x = 99;
    copy.avatar.pos.z = 1;
    copy.avatar.health -= 1;
    copy.inventory['timber'] = 0;
    copy.looseItems.push({ pos: { x: 0, y: 0, z: -1 }, item: 'coal', count: 1 });
    const firstLoose = copy.looseItems[0];
    if (firstLoose !== undefined) {
      firstLoose.count = 5;
      firstLoose.pos.x = 0;
    }
    copy.status = { kind: 'ended', outcome: 'death', cause: 'fell' };

    expect(hashState(state)).toBe(before);
    expect(state.avatar.pos).toEqual({ x: 1, y: 0, z: 0 });
    expect(state.looseItems).toEqual([{ pos: { x: 1, y: 0, z: 0 }, item: 'stone', count: 1 }]);
  });
});

describe('buildState (the test helper)', () => {
  it('reads the drawing with x along a row, y down the rows, z down the layers', () => {
    const state = smallState();
    expect(state.size).toEqual(SIZE);
    expect(layerText(state, 0)).toEqual(['#d##', '#.##', '####']);
    expect(layerText(state, 1)).toEqual(['HHHH', 'HcHH', 'HHHH']);
    expect(state.avatar.pos).toEqual({ x: 1, y: 1, z: 0 });
  });

  it('rejects a drawing with ragged rows or an unknown character', () => {
    expect(() => buildState({ layers: [['##', '#']] })).toThrow('expected 2');
    expect(() => buildState({ layers: [['##'], ['##', '##']] })).toThrow('expected 1');
    expect(() => buildState({ layers: [['#?']] })).toThrow('Unknown block character');
    expect(() => buildState({ layers: [] })).toThrow();
  });
});
