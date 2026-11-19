// Scenario tests for digging down with no gravity (owner, issue #80;
// decision note 0023), through `applyAction` with nothing faked.
//
// - Mining the block underfoot moves the miner down into the cell it dug, in
//   the same action (issue #75: dig-down stays one action).
// - It goes no further: with open cells under the dug one, the miner stays
//   where it now is. It never falls, takes no fall damage, and a fall is no
//   longer a way to die.
// - It can go back up the shaft it dug, one move at a time.

import { describe, expect, it } from 'vitest';
import { AVATAR, BLOCKS, ITEMS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { isOpen, isRevealed } from '../../src/engine';
import type { GameState, StepResult } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { act, buildState, findActions } from './helpers';

const SOLID = ['###', '###', '###'];
const HOLE = ['###', '#.#', '###'];

/**
 * A 3 x 3 column of stone. The avatar stands in a pit in the top layer on a
 * single block, with `open` open cells under that block and solid rock below
 * them.
 */
function overVoid(open: number, inventory: Record<string, number> = {}): GameState {
  const layers = [HOLE, SOLID];
  for (let i = 0; i < open; i += 1) {
    layers.push(HOLE);
  }
  layers.push(SOLID);
  const state = buildState({ layers, avatar: { x: 1, y: 1, z: 0 }, inventory });
  updateReveal(state, []);
  return state;
}

/** Mine the block the avatar stands on. */
function mineUnderfoot(state: GameState): StepResult {
  const here = state.avatar.pos;
  return act(state, { type: 'mine', target: { x: here.x, y: here.y, z: here.z + 1 } });
}

describe('digging down', () => {
  it.each([0, 1, 3, 6])(
    'moves the miner into the dug cell and no further, over %i open cell(s)',
    (open) => {
      const state = overVoid(open);
      const floor: Vec3 = { x: 1, y: 1, z: 1 };
      const { state: after, events } = mineUnderfoot(state);

      expect(isOpen(after, floor)).toBe(true);
      expect(after.avatar.pos).toEqual(floor);
      expect(after.avatar.health).toBe(AVATAR.startHealth);
      expect(after.status).toEqual({ kind: 'active' });
      // The mine, its yield, then the move down; then reveal.
      expect(events.slice(0, 3)).toEqual([
        { type: 'blockMined', pos: floor, block: BLOCKS.stone.code },
        { type: 'itemGained', item: 'stone', count: 1 },
        { type: 'moved', from: { x: 1, y: 1, z: 0 }, to: floor },
      ]);
      for (const event of events.slice(3)) {
        expect(event.type).toBe('blockRevealed');
      }
      expect(events.some((event) => event.type === 'damageTaken')).toBe(false);
    },
  );

  it('reveals from the dug cell: its sides by touch', () => {
    const state = overVoid(2);
    const besideFloor: Vec3 = { x: 0, y: 1, z: 1 };
    expect(isRevealed(state, besideFloor)).toBe(false);
    const { state: after } = mineUnderfoot(state);
    expect(isRevealed(after, besideFloor)).toBe(true);
  });

  it('lets a yield that did not fit fall down the shaft past the miner', () => {
    // At the carry limit the stone is left in the mined cell. The miner moves
    // into that cell; the stone, with nothing under it, falls to the bottom.
    const stones = AVATAR.carryCapacity / ITEMS.stone.weight;
    const state = overVoid(3, { stone: stones });
    const { state: after, events } = mineUnderfoot(state);
    const floor: Vec3 = { x: 1, y: 1, z: 1 };
    const bottom: Vec3 = { x: 1, y: 1, z: 4 };
    expect(events[1]).toEqual({ type: 'itemLeft', pos: floor, item: 'stone', count: 1 });
    expect(after.avatar.pos).toEqual(floor);
    expect(after.looseItems).toEqual([{ pos: bottom, item: 'stone', count: 1 }]);
  });

  it('from the surface, moves the miner into the top layer', () => {
    const state = buildState({ layers: [SOLID, SOLID], avatar: { x: 1, y: 1, z: -1 } });
    updateReveal(state, []);
    const { state: after } = mineUnderfoot(state);
    expect(after.avatar.pos).toEqual({ x: 1, y: 1, z: 0 });
  });
});

describe('sinking a one-cell shaft and climbing back out', () => {
  it('costs no health either way, and needs no ladder', () => {
    const depth = 10;
    const layers: string[][] = [];
    for (let z = 0; z < depth + 2; z += 1) {
      layers.push(SOLID);
    }
    // Plenty of AP: this test is about the rule, not about shifts.
    let state = buildState({ layers, avatar: { x: 1, y: 1, z: -1 }, ap: 1000 });
    updateReveal(state, []);

    for (let layer = 0; layer < depth; layer += 1) {
      state = mineUnderfoot(state).state;
      expect(state.avatar.pos.z).toBe(layer);
    }
    for (let z = depth - 2; z >= -1; z -= 1) {
      const up: Vec3 = { x: 1, y: 1, z };
      expect(findActions(state, { type: 'move', to: up })).toHaveLength(1);
      state = act(state, { type: 'move', to: up }).state;
    }
    expect(state.avatar.pos).toEqual({ x: 1, y: 1, z: -1 });
    expect(state.avatar.health).toBe(AVATAR.startHealth);
    expect(state.status).toEqual({ kind: 'active' });
  });
});
