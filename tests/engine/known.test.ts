// What the player sees of a cell, and the cube the forecast runs on
// (0014 items 3 and 4; decision note 0015).

import { describe, expect, it } from 'vitest';
import { BLOCKS, NO_STRUCTURE, STRUCTURES } from '../../src/data';
import { hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { knownCell, knownCube } from '../../src/engine/known';
import {
  armCharge,
  cellIndex,
  cloneState,
  setBlock,
  setCrackTimer,
  setGas,
  setLava,
  setRevealed,
  setStructure,
  setWater,
} from '../../src/engine/state';
import { buildState } from './helpers';

// A 3 x 1 x 3 cube. The left column (x = 0) is revealed, the right two are not.
const SEEN = { x: 0, y: 0, z: 1 };
const UNSEEN = { x: 2, y: 0, z: 1 };

function halfSeenState(): GameState {
  const state = buildState({
    layers: [['#..'], ['...'], ['#U#']],
    revealTops: false,
    looseItems: [
      { pos: SEEN, item: 'coal', count: 2 },
      { pos: UNSEEN, item: 'stone', count: 1 },
      { pos: { x: 2, y: 0, z: -1 }, item: 'timber', count: 1 }, // on the surface
    ],
  });
  for (let z = 0; z < 3; z += 1) {
    setRevealed(state, { x: 0, y: 0, z }, true);
  }
  // The same contents in a seen cell and in an unseen one.
  for (const pos of [SEEN, UNSEEN]) {
    setWater(state, pos, 1);
    setGas(state, pos, 3);
    setStructure(state, pos, STRUCTURES.explosive.code);
    armCharge(state, pos, 'explosive');
  }
  setLava(state, { x: 1, y: 0, z: 1 }, 1, true);
  setCrackTimer(state, { x: 0, y: 0, z: 0 }, 1);
  setCrackTimer(state, { x: 0, y: 0, z: 2 }, 0);
  armCharge(state, { x: 1, y: 0, z: 2 }, 'unstableOre');
  return state;
}

describe('knownCell (0014 item 3)', () => {
  it('gives the current contents of a revealed cell', () => {
    const state = halfSeenState();
    expect(knownCell(state, SEEN)).toEqual({
      block: BLOCKS.air.code,
      water: 1,
      lava: 0,
      lavaSource: false,
      gas: 3,
      crackTimer: null,
      structure: STRUCTURES.explosive.code,
      armed: 'explosive',
      looseItems: [{ item: 'coal', count: 2 }],
    });
    expect(knownCell(state, { x: 0, y: 0, z: 0 })?.crackTimer).toBe(1);
    // A stored timer of 0 is still a crack.
    expect(knownCell(state, { x: 0, y: 0, z: 2 })?.crackTimer).toBe(0);
  });

  it('gives nothing at all for a cell that is not revealed', () => {
    const state = halfSeenState();
    expect(knownCell(state, UNSEEN)).toBeNull();
    expect(knownCell(state, { x: 1, y: 0, z: 1 })).toBeNull();
  });

  it('knows the surface and the bedrock, which hold nothing', () => {
    const state = halfSeenState();
    const empty = {
      water: 0,
      lava: 0,
      lavaSource: false,
      gas: 0,
      crackTimer: null,
      structure: NO_STRUCTURE,
      armed: null,
    };
    expect(knownCell(state, { x: 2, y: 0, z: -1 })).toEqual({
      ...empty,
      block: BLOCKS.air.code,
      looseItems: [{ item: 'timber', count: 1 }],
    });
    expect(knownCell(state, { x: -1, y: 0, z: 1 })).toEqual({
      ...empty,
      block: BLOCKS.bedrock.code,
      looseItems: [],
    });
  });
});

describe('knownCube (0014 item 4)', () => {
  it('keeps every revealed cell as it is', () => {
    const state = halfSeenState();
    const copy = knownCube(state);
    for (let z = 0; z < 3; z += 1) {
      const pos = { x: 0, y: 0, z };
      expect(knownCell(copy, pos)).toEqual(knownCell(state, pos));
    }
    expect(copy.crew).toEqual(state.crew);
    expect(copy.revealed).toEqual(state.revealed);
  });

  it('makes every unrevealed cell plain rock with nothing in it', () => {
    const copy = knownCube(halfSeenState());
    for (const pos of [UNSEEN, { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 2 }, { x: 2, y: 0, z: 0 }]) {
      const index = cellIndex(copy.size, pos);
      expect(copy.blocks[index]).toBe(BLOCKS.stone.code);
      expect(copy.water[index]).toBe(0);
      expect(copy.lava[index]).toBe(0);
      expect(copy.lavaSource[index]).toBe(0);
      expect(copy.gas[index]).toBe(0);
      expect(copy.cracks[index]).toBe(0);
      expect(copy.structures[index]).toBe(NO_STRUCTURE);
    }
    // Loose items and armed charges in unseen cells are gone; the rest stay.
    expect(copy.looseItems).toEqual([
      { pos: { x: 2, y: 0, z: -1 }, item: 'timber', count: 1 },
      { pos: SEEN, item: 'coal', count: 2 },
    ]);
    expect(copy.armed).toEqual([{ pos: SEEN, kind: 'explosive' }]);
  });

  it('does not change the state it copies', () => {
    const state = halfSeenState();
    const before = hashState(state);
    knownCube(state);
    expect(hashState(state)).toBe(before);
  });

  it('is the same whatever the unrevealed cells hold', () => {
    const state = halfSeenState();
    const expected = hashState(knownCube(state));

    // Each entry changes something in an unrevealed cell of a fresh copy.
    const changes: Record<string, (s: GameState) => void> = {
      'rock to open': (s) => setBlock(s, { x: 1, y: 0, z: 2 }, BLOCKS.air.code),
      'open to ore': (s) => setBlock(s, UNSEEN, BLOCKS.ironOre.code),
      'no water': (s) => setWater(s, UNSEEN, 0),
      'more gas': (s) => setGas(s, UNSEEN, 9),
      'no lava': (s) => setLava(s, { x: 1, y: 0, z: 1 }, 0),
      'lava that is not a source': (s) => setLava(s, { x: 1, y: 0, z: 1 }, 1, false),
      'a crack': (s) => setCrackTimer(s, { x: 2, y: 0, z: 2 }, 0),
      'another structure': (s) => setStructure(s, UNSEEN, STRUCTURES.pump.code),
      'no armed charges': (s) => {
        s.armed = s.armed.filter((charge) => charge.pos.x === 0);
      },
      'no loose items': (s) => {
        s.looseItems = s.looseItems.filter((loose) => loose.pos.x !== 2 || loose.pos.z === -1);
      },
    };
    for (const [name, change] of Object.entries(changes)) {
      const changed = cloneState(state);
      change(changed);
      expect(hashState(changed), `"${name}" must change the true state`).not.toBe(hashState(state));
      expect(hashState(knownCube(changed)), `"${name}" must not change the known cube`).toBe(
        expected,
      );
    }
  });

  it('does change when a revealed cell changes', () => {
    const state = halfSeenState();
    const changed = cloneState(state);
    setGas(changed, SEEN, 1);
    expect(hashState(knownCube(changed))).not.toBe(hashState(knownCube(state)));
  });
});
