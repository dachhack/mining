// Scenario tests for the two kinds of descent (issue #34, the owner's answer
// to question 42: "a single one-block shaft should be dangerous").
//
// - A chosen drop: walking off a ledge, or climbing down off the bottom of a
//   ladder. 1 or 2 blocks, free, as before.
// - An uncontrolled fall: the block under the miner was mined. It costs
//   health from the first block.
//
// Every test here goes through `applyAction` with nothing faked, so it also
// checks that the dispatcher tells gravity which kind of fall it is.

import { describe, expect, it } from 'vitest';
import { AVATAR } from '../../src/data';
import type { Vec3 } from '../../src/data';
import type { GameState, StepResult } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { act, buildState, findActions } from './helpers';

const SOLID = ['###', '###', '###'];
const HOLE = ['###', '#.#', '###'];

/**
 * A 3 x 3 column of stone. The avatar stands in a pit in the top layer on a
 * single block, with `open` open cells under that block and solid rock below
 * them. Mining the block is a fall of `open + 1`.
 */
function overVoid(open: number, options: { health?: number; ladder?: boolean } = {}): GameState {
  const layers = [HOLE, SOLID];
  for (let i = 0; i < open; i += 1) {
    layers.push(HOLE);
  }
  layers.push(SOLID);
  const start: Vec3 = { x: 1, y: 1, z: 0 };
  const state = buildState({
    layers,
    avatar: start,
    health: options.health ?? AVATAR.startHealth,
    ladders: options.ladder === true ? [start] : [],
  });
  updateReveal(state, []);
  return state;
}

/** Mine the block the avatar stands on. */
function mineUnderfoot(state: GameState): StepResult {
  const here = state.avatar.pos;
  return act(state, { type: 'mine', target: { x: here.x, y: here.y, z: here.z + 1 } });
}

describe('the data for an uncontrolled fall', () => {
  it('is 1 health for each of the first 2 blocks', () => {
    // Pins the numbers, so a change to them is noticed. The tests below are
    // written against the data and would pass with other numbers.
    expect(AVATAR.uncontrolledFallDamagePerBlock).toBe(1);
    expect(AVATAR.freeFallBlocks).toBe(2);
    expect(AVATAR.fallDamagePerBlock).toBe(2);
    expect(AVATAR.fatalFallBlocks).toBe(6);
    expect(AVATAR.startHealth).toBe(10);
  });
});

describe('mining the block underfoot with nothing to hold the miner', () => {
  it.each([1, 2])('costs health for a fall of %i block(s)', (distance) => {
    const damage = distance * AVATAR.uncontrolledFallDamagePerBlock;
    expect(damage).toBeGreaterThan(0);
    const state = overVoid(distance - 1);

    const { state: after, events } = mineUnderfoot(state);

    expect(after.avatar.pos).toEqual({ x: 1, y: 1, z: distance });
    expect(after.avatar.health).toBe(AVATAR.startHealth - damage);
    expect(after.status).toEqual({ kind: 'active' });
    expect(events).toContainEqual({
      type: 'fell',
      from: { x: 1, y: 1, z: 0 },
      to: { x: 1, y: 1, z: distance },
      distance,
      kind: 'uncontrolled',
    });
    expect(events).toContainEqual({
      type: 'damageTaken',
      amount: damage,
      cause: 'fall',
      health: AVATAR.startHealth - damage,
    });
  });

  it.each([3, 4, 5])(
    'adds the damage for each block beyond the first 2 in a fall of %i blocks',
    (distance) => {
      const damage =
        AVATAR.freeFallBlocks * AVATAR.uncontrolledFallDamagePerBlock +
        (distance - AVATAR.freeFallBlocks) * AVATAR.fallDamagePerBlock;
      // More health than any of these falls takes, so the avatar survives.
      const health = 20;
      const { state: after, events } = mineUnderfoot(overVoid(distance - 1, { health }));

      expect(after.avatar.pos).toEqual({ x: 1, y: 1, z: distance });
      expect(after.avatar.health).toBe(health - damage);
      expect(after.status).toEqual({ kind: 'active' });
      expect(events).toContainEqual({
        type: 'damageTaken',
        amount: damage,
        cause: 'fall',
        health: health - damage,
      });
    },
  );

  it('costs 1, 2, 4, 6 and 8 health for falls of 1 to 5 blocks', () => {
    const lost = [1, 2, 3, 4, 5].map((distance) => {
      const { state: after } = mineUnderfoot(overVoid(distance - 1, { health: 20 }));
      return 20 - after.avatar.health;
    });
    expect(lost).toEqual([1, 2, 4, 6, 8]);
  });

  it('is fatal for a fall of 6 blocks, whatever the health', () => {
    const { state: after, events } = mineUnderfoot(overVoid(5, { health: 100 }));
    expect(after.avatar.pos).toEqual({ x: 1, y: 1, z: 6 });
    expect(after.avatar.health).toBe(0);
    expect(after.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });
    expect(events).toContainEqual({ type: 'runEnded', outcome: 'death', cause: 'fell' });
  });

  it('ends the run with cause "fell" when a 1-block fall takes the last health', () => {
    const state = overVoid(0, { health: AVATAR.uncontrolledFallDamagePerBlock });

    const { state: after, events } = mineUnderfoot(state);

    expect(after.avatar.health).toBe(0);
    expect(after.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });
    expect(events).toContainEqual({
      type: 'damageTaken',
      amount: AVATAR.uncontrolledFallDamagePerBlock,
      cause: 'fall',
      health: 0,
    });
    expect(events).toContainEqual({ type: 'runEnded', outcome: 'death', cause: 'fell' });
  });
});

describe('mining the block underfoot while a ladder holds the miner', () => {
  it.each([0, 1, 4, 5])('does not fall or lose health over %i open cell(s)', (open) => {
    const state = overVoid(open, { ladder: true });

    const { state: after, events } = mineUnderfoot(state);

    expect(after.avatar.pos).toEqual({ x: 1, y: 1, z: 0 });
    expect(after.avatar.health).toBe(AVATAR.startHealth);
    expect(after.status).toEqual({ kind: 'active' });
    expect(events.filter((event) => event.type === 'fell')).toEqual([]);
    expect(events.filter((event) => event.type === 'damageTaken')).toEqual([]);
  });
});

describe('a chosen drop', () => {
  it.each([1, 2])('is still free when the miner walks off a ledge of %i block(s)', (drop) => {
    // The avatar stands on the left column; the right column is `drop` lower.
    const layers: string[][] = [];
    for (let z = 0; z < drop; z += 1) {
      layers.push(['#.']);
    }
    layers.push(['##']);
    const state = buildState({ layers, avatar: { x: 0, y: 0, z: -1 } });
    updateReveal(state, []);

    const { state: after, events } = act(state, { type: 'move', to: { x: 1, y: 0, z: -1 } });

    expect(after.avatar.pos).toEqual({ x: 1, y: 0, z: -1 + drop });
    expect(after.avatar.health).toBe(AVATAR.startHealth);
    expect(events).toContainEqual({
      type: 'fell',
      from: { x: 1, y: 0, z: -1 },
      to: { x: 1, y: 0, z: -1 + drop },
      distance: drop,
      kind: 'chosenDrop',
    });
    expect(events.filter((event) => event.type === 'damageTaken')).toEqual([]);
  });

  it('is still free when the miner climbs down off the bottom of a ladder', () => {
    // A ladder in the top cell of a shaft 3 deep: stepping off it is 1 block
    // climbed and 1 block dropped.
    const state = buildState({
      layers: [['.'], ['.'], ['.'], ['#']],
      avatar: { x: 0, y: 0, z: 0 },
      ladders: [{ x: 0, y: 0, z: 0 }],
    });
    updateReveal(state, []);

    const { state: after, events } = act(state, { type: 'move', to: { x: 0, y: 0, z: 1 } });

    expect(after.avatar.pos).toEqual({ x: 0, y: 0, z: 2 });
    expect(after.avatar.health).toBe(AVATAR.startHealth);
    expect(events.filter((event) => event.type === 'damageTaken')).toEqual([]);
  });
});

describe('sinking a bare one-cell shaft by mining underfoot', () => {
  it('kills in ten layers from full health', () => {
    const layersToDie = Math.ceil(AVATAR.startHealth / AVATAR.uncontrolledFallDamagePerBlock);
    expect(layersToDie).toBe(10);

    const layers: string[][] = [];
    for (let z = 0; z < layersToDie + 2; z += 1) {
      layers.push(SOLID);
    }
    // Plenty of AP: this test is about health, not about shifts.
    let state = buildState({ layers, avatar: { x: 1, y: 1, z: -1 }, ap: 1000 });
    updateReveal(state, []);

    for (let layer = 1; layer < layersToDie; layer += 1) {
      state = mineUnderfoot(state).state;
      expect(state.avatar.pos.z).toBe(layer - 1);
      expect(state.avatar.health).toBe(
        AVATAR.startHealth - layer * AVATAR.uncontrolledFallDamagePerBlock,
      );
      expect(state.status).toEqual({ kind: 'active' });
    }

    const last = mineUnderfoot(state);
    expect(last.state.avatar.health).toBe(0);
    expect(last.state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });
  });

  it('costs nothing when a ladder is placed in the cell before each block is mined', () => {
    // The intended safe way: place a ladder in your own cell, mine below,
    // climb down, and so on. Costs a ladder and an AP per layer.
    const depth = 4;
    const layers: string[][] = [];
    for (let z = 0; z < depth + 2; z += 1) {
      layers.push(SOLID);
    }
    // Start one layer down, in a pit: nothing can be placed on the surface.
    layers[0] = HOLE;
    let state = buildState({
      layers,
      avatar: { x: 1, y: 1, z: 0 },
      ap: 1000,
      inventory: { ladder: depth + 1 },
    });
    updateReveal(state, []);

    state = act(state, { type: 'placeLadder', target: { x: 1, y: 1, z: 0 } }).state;
    for (let z = 0; z < depth; z += 1) {
      const here: Vec3 = { x: 1, y: 1, z };
      const below: Vec3 = { x: 1, y: 1, z: z + 1 };
      state = mineUnderfoot(state).state;
      expect(state.avatar.pos).toEqual(here);
      // Ladder the new cell from above, then climb down into it.
      state = act(state, { type: 'placeLadder', target: below }).state;
      expect(findActions(state, { type: 'move', to: below })).toHaveLength(1);
      state = act(state, { type: 'move', to: below }).state;
      expect(state.avatar.pos).toEqual(below);
    }
    expect(state.avatar.health).toBe(AVATAR.startHealth);
  });
});
