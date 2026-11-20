// The three helpers that destroy something at the moment of an event
// (design doc 4; 0014 item 2; decision note 0015).

import { describe, expect, it } from 'vitest';
import { NO_STRUCTURE, STRUCTURES } from '../../src/data';
import type { GameEvent } from '../../src/engine';
import { destroyCampsAt, destroyLooseItems, destroyStructure } from '../../src/engine/destroy';
import { looseItemsAt, structureAt } from '../../src/engine/state';
import { buildState } from './helpers';

const HERE = { x: 1, y: 0, z: 0 };
const BESIDE = { x: 2, y: 0, z: 0 };

describe('destroyStructure', () => {
  it('removes the structure at once and says what it was', () => {
    const state = buildState({
      layers: [['....'], ['####']],
      structures: [{ pos: HERE, structure: 'pump' }],
      supports: [BESIDE],
    });
    const events: GameEvent[] = [];
    expect(destroyStructure(state, HERE, 'rockfall', events)).toBe(STRUCTURES.pump.code);
    // Gone now: a later step of the same cube phase does not find it.
    expect(structureAt(state, HERE)).toBe(NO_STRUCTURE);
    expect(structureAt(state, BESIDE)).toBe(STRUCTURES.support.code);
    expect(events).toEqual([
      {
        type: 'structureDestroyed',
        pos: HERE,
        structure: STRUCTURES.pump.code,
        cause: 'rockfall',
      },
    ]);
  });

  it('does nothing in a cell with no structure, or outside the grid', () => {
    const state = buildState({ layers: [['....'], ['####']] });
    const events: GameEvent[] = [];
    expect(destroyStructure(state, HERE, 'lava', events)).toBe(NO_STRUCTURE);
    expect(destroyStructure(state, { x: 0, y: 0, z: -1 }, 'lava', events)).toBe(NO_STRUCTURE);
    expect(events).toEqual([]);
  });

  it('a destroyed explosive is disarmed: it will not go off', () => {
    const state = buildState({
      layers: [['....'], ['##U#']],
      structures: [{ pos: HERE, structure: 'explosive' }],
      armed: [
        { pos: HERE, kind: 'explosive' },
        { pos: { x: 2, y: 0, z: 1 }, kind: 'unstableOre' },
      ],
    });
    destroyStructure(state, HERE, 'rockfall', []);
    expect(state.armed).toEqual([{ pos: { x: 2, y: 0, z: 1 }, kind: 'unstableOre' }]);
  });

  it('gives nothing back to the avatar', () => {
    const state = buildState({ layers: [['....'], ['####']], supports: [HERE] });
    destroyStructure(state, HERE, 'noHold', []);
    expect(state.inventory).toEqual({});
    expect(state.looseItems).toEqual([]);
  });
});

describe('destroyLooseItems', () => {
  it('destroys every pile in the cell and no other', () => {
    const state = buildState({
      layers: [['....'], ['####']],
      looseItems: [
        { pos: HERE, item: 'stone', count: 2 },
        { pos: HERE, item: 'coal', count: 1 },
        { pos: BESIDE, item: 'coal', count: 4 },
      ],
    });
    const events: GameEvent[] = [];
    expect(destroyLooseItems(state, HERE, 'lava', events)).toBe(2);
    expect(looseItemsAt(state, HERE)).toEqual([]);
    expect(looseItemsAt(state, BESIDE)).toEqual([{ item: 'coal', count: 4 }]);
    expect(events).toEqual([
      { type: 'looseItemsDestroyed', pos: HERE, item: 'coal', count: 1, cause: 'lava' },
      { type: 'looseItemsDestroyed', pos: HERE, item: 'stone', count: 2, cause: 'lava' },
    ]);
    expect(destroyLooseItems(state, HERE, 'lava', events)).toBe(0);
    expect(events).toHaveLength(2);
  });
});

describe('destroyCampsAt', () => {
  /** A 5 x 5 x 4 open cube with one camp in the middle of layer 2. */
  function campState() {
    const open = ['.....', '.....', '.....', '.....', '.....'];
    return buildState({
      layers: [open, open, open, ['#####', '#####', '#####', '#####', '#####']],
      camps: [{ pos: { x: 2, y: 2, z: 2 }, foundedShift: 3, stash: { coal: 5 } }],
    });
  }

  it('destroys a camp when the event touches any of its cells, and its stash is lost', () => {
    const state = campState();
    const events: GameEvent[] = [];
    // A top corner of the camp.
    expect(destroyCampsAt(state, { x: 1, y: 3, z: 1 }, 'water', events)).toBe(1);
    expect(state.camps).toEqual([]);
    expect(events).toEqual([{ type: 'campDestroyed', pos: { x: 2, y: 2, z: 2 }, cause: 'water' }]);
    // The stash is not dropped anywhere.
    expect(state.looseItems).toEqual([]);
    expect(state.inventory).toEqual({});
  });

  it('leaves a camp alone when the cell is not one of its own', () => {
    const state = campState();
    const events: GameEvent[] = [];
    expect(destroyCampsAt(state, { x: 4, y: 2, z: 2 }, 'explosion', events)).toBe(0);
    expect(destroyCampsAt(state, { x: 2, y: 2, z: 0 }, 'rockfall', events)).toBe(0);
    expect(state.camps).toHaveLength(1);
    expect(events).toEqual([]);
  });
});
