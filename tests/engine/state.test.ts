import { describe, expect, it } from 'vitest';
import { AVATAR, BLOCKS, ITEMS, NO_STRUCTURE, STRUCTURES } from '../../src/data';
import { canCarry, carriedWeight, carryCapacity } from '../../src/engine/inventory';
import {
  addItem,
  addLooseItems,
  blockAt,
  blockDefAt,
  cellCount,
  cellIndex,
  cellPosition,
  cloneState,
  countItem,
  endRun,
  inGrid,
  inventoryEntries,
  isOpen,
  isRevealed,
  isSolid,
  isSurface,
  looseItemsAt,
  removeItem,
  removeLooseItems,
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
    // Nothing revealed, so that the tests below can set the flag themselves.
    revealTops: false,
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
    // Beyond the footprint of the cube, and above the surface, is bedrock.
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
    setStructure(state, pos, STRUCTURES.support.code);
    expect(structureAt(state, pos)).toBe(STRUCTURES.support.code);

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
    expect(() => setStructure(state, { x: 0, y: 0, z: -1 }, STRUCTURES.support.code)).toThrow(
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

describe('inventoryEntries', () => {
  it('lists what is carried sorted by item id, whatever order it was added in', () => {
    const state = smallState();
    addItem(state, 'timber', 2);
    addItem(state, 'coal', 1);
    addItem(state, 'stone', 0);
    addItem(state, 'ironIngot', 6);
    removeItem(state, 'coal', 1);
    expect(Object.keys(state.inventory)).toEqual(['timber', 'coal', 'stone', 'ironIngot']);
    expect(inventoryEntries(state)).toEqual([
      { item: 'ironIngot', count: 6 },
      { item: 'timber', count: 2 },
    ]);
  });
});

describe('carry weight', () => {
  it('adds up count times weight from the data', () => {
    const state = smallState();
    expect(carriedWeight(state)).toBe(0);
    addItem(state, 'stone', 3);
    addItem(state, 'coal', 2);
    addItem(state, 'timber', 6);
    const expected = 3 * ITEMS.stone.weight + 2 * ITEMS.coal.weight + 6 * ITEMS.timber.weight;
    expect(carriedWeight(state)).toBe(expected);
    // With 0005's weights (stone 2, coal 1, timber 1) that is 14.
    expect(expected).toBe(14);
  });

  it('allows carrying exactly the capacity and nothing beyond it', () => {
    const state = smallState();
    const capacity = carryCapacity();
    expect(capacity).toBe(AVATAR.carryCapacity);
    // Fill up with coal to one short of the limit.
    const coalWeight = ITEMS.coal.weight;
    addItem(state, 'coal', Math.floor((capacity - coalWeight) / coalWeight));
    expect(carriedWeight(state)).toBe(capacity - coalWeight);

    expect(canCarry(state, 'coal', 1)).toBe(true); // exactly full
    expect(canCarry(state, 'coal', 2)).toBe(false);
    expect(canCarry(state, 'stone', 1)).toBe(ITEMS.stone.weight <= coalWeight);
    expect(canCarry(state, 'coal', 0)).toBe(true);
  });

  it('throws on an item that does not exist', () => {
    const state = smallState();
    state.inventory['jetpack'] = 1;
    expect(() => carriedWeight(state)).toThrow('Unknown item id');
    expect(() => canCarry(smallState(), 'jetpack', 1)).toThrow('Unknown item id');
  });
});

describe('loose items', () => {
  const A = { x: 1, y: 1, z: 0 };
  const B = { x: 0, y: 0, z: -1 }; // on the surface

  it('keeps one pile per cell and item, sorted by z, y, x, then item', () => {
    const state = smallState();
    addLooseItems(state, A, 'stone', 1);
    addLooseItems(state, A, 'coal', 2);
    addLooseItems(state, B, 'timber', 1);
    addLooseItems(state, A, 'stone', 3);
    expect(state.looseItems).toEqual([
      { pos: B, item: 'timber', count: 1 },
      { pos: A, item: 'coal', count: 2 },
      { pos: A, item: 'stone', count: 4 },
    ]);
    expect(looseItemsAt(state, A)).toEqual([
      { item: 'coal', count: 2 },
      { item: 'stone', count: 4 },
    ]);
    expect(looseItemsAt(state, { x: 2, y: 2, z: 0 })).toEqual([]);
  });

  it('gives the same list whatever order the piles were added in', () => {
    const one = smallState();
    addLooseItems(one, A, 'coal', 1);
    addLooseItems(one, A, 'coal', 2);
    addLooseItems(one, B, 'stone', 1);
    const other = smallState();
    addLooseItems(other, B, 'stone', 1);
    addLooseItems(other, A, 'coal', 3);
    expect(one.looseItems).toEqual(other.looseItems);
    expect(hashState(one)).toBe(hashState(other));
  });

  it('removes from a pile, and drops the pile when it is empty', () => {
    const state = smallState();
    addLooseItems(state, A, 'coal', 3);
    removeLooseItems(state, A, 'coal', 2);
    expect(looseItemsAt(state, A)).toEqual([{ item: 'coal', count: 1 }]);
    removeLooseItems(state, A, 'coal', 1);
    expect(state.looseItems).toEqual([]);
  });

  it('refuses to remove more than the cell holds, or to add outside the cube', () => {
    const state = smallState();
    addLooseItems(state, A, 'coal', 1);
    expect(() => removeLooseItems(state, A, 'coal', 2)).toThrow('it holds 1');
    expect(() => removeLooseItems(state, A, 'stone', 1)).toThrow('it holds 0');
    expect(() => removeLooseItems(state, B, 'coal', 1)).toThrow('it holds 0');
    expect(() => addLooseItems(state, { x: -1, y: 0, z: 0 }, 'coal', 1)).toThrow('outside');
    expect(() => addLooseItems(state, A, 'coal', -1)).toThrow();
    expect(looseItemsAt(state, A)).toEqual([{ item: 'coal', count: 1 }]);
  });

  it('does not keep a reference to the position it is given', () => {
    const state = smallState();
    const pos = { ...A };
    addLooseItems(state, pos, 'coal', 1);
    pos.x = 3;
    expect(looseItemsAt(state, A)).toEqual([{ item: 'coal', count: 1 }]);
  });
});

describe('endRun', () => {
  it('ends the run once and keeps the first cause', () => {
    const state = smallState();
    const events: GameEvent[] = [];
    endRun(state, 'death', 'outOfFuel', events);
    endRun(state, 'salvage', 'left', events);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'outOfFuel' });
    expect(events).toEqual([{ type: 'runEnded', outcome: 'death', cause: 'outOfFuel' }]);
  });
});

describe('cloneState', () => {
  it('makes an equal copy that shares nothing with the original', () => {
    const state = buildState({
      layers: [['#.'], ['##']],
      inventory: { timber: 2 },
      looseItems: [{ pos: { x: 1, y: 0, z: 0 }, item: 'stone', count: 1 }],
      supports: [{ x: 1, y: 0, z: 0 }],
      armed: [{ pos: { x: 0, y: 0, z: 0 }, kind: 'unstableOre' }],
      camps: [{ pos: { x: 1, y: 0, z: 0 }, foundedShift: 1, stash: { coal: 2 } }],
    });
    const before = hashState(state);
    const copy = cloneState(state);
    expect(copy).toEqual(state);

    // Change every part of the copy.
    copy.blocks.fill(0);
    copy.revealed.fill(1);
    copy.water.fill(1);
    copy.lava.fill(1);
    copy.lavaSource.fill(1);
    copy.gas.fill(1);
    copy.cracks.fill(1);
    copy.structures.fill(0);
    copy.rng.s += 1;
    copy.size.x = 99;
    copy.crew.health -= 1;
    copy.worked.fill(1);
    copy.crew.resting = true;
    copy.armed.push({ pos: { x: 0, y: 0, z: 1 }, kind: 'unstableOre' });
    const firstCamp = copy.camps[0];
    if (firstCamp !== undefined) {
      firstCamp.pos.x = 0;
      firstCamp.stash['coal'] = 9;
    }
    copy.camps.push({ pos: { x: 0, y: 0, z: 0 }, foundedShift: 1, stash: {} });
    copy.inventory['timber'] = 0;
    copy.looseItems.push({ pos: { x: 0, y: 0, z: -1 }, item: 'coal', count: 1 });
    const firstLoose = copy.looseItems[0];
    if (firstLoose !== undefined) {
      firstLoose.count = 5;
      firstLoose.pos.x = 0;
    }
    copy.status = { kind: 'ended', outcome: 'death', cause: 'outOfFuel' };

    expect(hashState(state)).toBe(before);
    expect(state.looseItems).toEqual([{ pos: { x: 1, y: 0, z: 0 }, item: 'stone', count: 1 }]);
  });
});

describe('buildState (the test helper)', () => {
  it('reads the drawing with x along a row, y down the rows, z down the layers', () => {
    const state = smallState();
    expect(state.size).toEqual(SIZE);
    expect(layerText(state, 0)).toEqual(['#d##', '#.##', '####']);
    expect(layerText(state, 1)).toEqual(['HHHH', 'HcHH', 'HHHH']);
  });

  it('rejects a drawing with ragged rows or an unknown character', () => {
    expect(() => buildState({ layers: [['##', '#']] })).toThrow('expected 2');
    expect(() => buildState({ layers: [['##'], ['##', '##']] })).toThrow('expected 1');
    expect(() => buildState({ layers: [['#?']] })).toThrow('Unknown block character');
    expect(() => buildState({ layers: [] })).toThrow();
  });
});
