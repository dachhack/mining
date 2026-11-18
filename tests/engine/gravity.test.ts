// Scenario tests for gravity (design doc 5.2 and 5.3; decision note 0005
// items 5, 7 and 17; issue #5 and the coordinator's notes on it).
//
// A fall longer than 2 blocks is never offered as a move. It happens when the
// avatar's floor is mined above a void (task 4). So these tests build a state
// in which the avatar already has nothing under it and call `settle`, the
// function the dispatcher calls after every action.

import { describe, expect, it } from 'vitest';
import { AVATAR } from '../../src/data';
import { hashState } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { settle } from '../../src/engine/gravity';
import { buildState } from './helpers';

/**
 * A one-cell-wide shaft with the avatar at the top of it, in mid-air, and the
 * floor `depth` blocks below.
 */
function overShaft(depth: number, health: number = AVATAR.startHealth): GameState {
  const layers: string[][] = [];
  for (let z = 0; z <= depth; z += 1) {
    layers.push(['.']);
  }
  layers.push(['#']);
  return buildState({ layers, avatar: { x: 0, y: 0, z: 0 }, health });
}

/** Run `settle` on `state` (changing it) and return the events. */
function runSettle(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  settle(state, events);
  return events;
}

describe('the avatar falling', () => {
  it.each([1, 2])('falls %i block(s) without damage', (depth) => {
    const state = overShaft(depth);
    const events = runSettle(state);
    expect(state.avatar.pos).toEqual({ x: 0, y: 0, z: depth });
    expect(state.avatar.health).toBe(AVATAR.startHealth);
    expect(state.status).toEqual({ kind: 'active' });
    expect(events).toEqual([
      { type: 'fell', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: depth }, distance: depth },
    ]);
  });

  it.each([3, 4, 5])(
    'takes damage for each block beyond the free ones in a %i-block fall',
    (depth) => {
      const damage = (depth - AVATAR.freeFallBlocks) * AVATAR.fallDamagePerBlock;
      const state = overShaft(depth);
      const events = runSettle(state);
      expect(state.avatar.pos).toEqual({ x: 0, y: 0, z: depth });
      expect(state.avatar.health).toBe(AVATAR.startHealth - damage);
      expect(state.status).toEqual({ kind: 'active' });
      expect(events).toEqual([
        { type: 'fell', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: depth }, distance: depth },
        { type: 'damageTaken', amount: damage, cause: 'fall', health: AVATAR.startHealth - damage },
      ]);
    },
  );

  it('uses the design-doc numbers: 2, 4 and 6 damage for falls of 3, 4 and 5', () => {
    // Pins the data itself, so a change to it is noticed.
    const healthAfter = [3, 4, 5].map((depth) => {
      const state = overShaft(depth, 10);
      runSettle(state);
      return state.avatar.health;
    });
    expect(healthAfter).toEqual([8, 6, 4]);
  });

  it('dies of a fall of 6 blocks, whatever its health', () => {
    expect(AVATAR.fatalFallBlocks).toBe(6);
    const state = overShaft(6, 100);
    const events = runSettle(state);
    expect(state.avatar.pos).toEqual({ x: 0, y: 0, z: 6 });
    expect(state.avatar.health).toBe(0);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });
    expect(events).toEqual([
      { type: 'fell', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 6 }, distance: 6 },
      { type: 'damageTaken', amount: 100, cause: 'fall', health: 0 },
      { type: 'runEnded', outcome: 'death', cause: 'fell' },
    ]);
  });

  it('dies when fall damage takes its health to 0', () => {
    // A 3-block fall does 2 damage, exactly the health left.
    const state = overShaft(3, 2);
    const events = runSettle(state);
    expect(state.avatar.health).toBe(0);
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });
    expect(events).toEqual([
      { type: 'fell', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 3 }, distance: 3 },
      { type: 'damageTaken', amount: 2, cause: 'fall', health: 0 },
      { type: 'runEnded', outcome: 'death', cause: 'fell' },
    ]);
  });

  it('never has less than 0 health', () => {
    // A 4-block fall would do 4 damage; the avatar has 1.
    const state = overShaft(4, 1);
    const events = runSettle(state);
    expect(state.avatar.health).toBe(0);
    expect(events[1]).toEqual({ type: 'damageTaken', amount: 1, cause: 'fall', health: 0 });
    expect(state.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });
  });

  it('survives a hurtful fall that leaves it some health', () => {
    const state = overShaft(3, 3);
    runSettle(state);
    expect(state.avatar.health).toBe(1);
    expect(state.status).toEqual({ kind: 'active' });
  });

  it('falls from the surface when the top-layer cell under it is open', () => {
    // No special footing on the surface (0005 item 5).
    const state = buildState({
      layers: [['.'], ['#']],
      avatar: { x: 0, y: 0, z: -1 },
    });
    const events = runSettle(state);
    expect(state.avatar.pos).toEqual({ x: 0, y: 0, z: 0 });
    expect(events).toEqual([
      { type: 'fell', from: { x: 0, y: 0, z: -1 }, to: { x: 0, y: 0, z: 0 }, distance: 1 },
    ]);
  });

  it('stops on the bedrock under the cube', () => {
    const state = buildState({ layers: [['.'], ['.']], avatar: { x: 0, y: 0, z: 0 } });
    runSettle(state);
    expect(state.avatar.pos).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('does not fall while it stands in a ladder cell over a void', () => {
    const state = buildState({
      layers: [['.'], ['.'], ['.'], ['#']],
      avatar: { x: 0, y: 0, z: 0 },
      ladders: [{ x: 0, y: 0, z: 0 }],
    });
    const before = hashState(state);
    expect(runSettle(state)).toEqual([]);
    expect(hashState(state)).toBe(before);
  });

  it('is caught by a ladder on the way down', () => {
    const state = buildState({
      layers: [['.'], ['.'], ['.'], ['.'], ['#']],
      avatar: { x: 0, y: 0, z: 0 },
      ladders: [{ x: 0, y: 0, z: 1 }],
    });
    runSettle(state);
    expect(state.avatar.pos).toEqual({ x: 0, y: 0, z: 1 });
  });
});

describe('loose items falling', () => {
  it('fall straight down to the first solid block', () => {
    const state = buildState({
      layers: [['#.'], ['#.'], ['#.'], ['##']],
      looseItems: [{ pos: { x: 1, y: 0, z: 0 }, item: 'coal', count: 3 }],
    });
    const events = runSettle(state);
    expect(state.looseItems).toEqual([{ pos: { x: 1, y: 0, z: 2 }, item: 'coal', count: 3 }]);
    expect(events).toEqual([
      {
        type: 'itemFell',
        from: { x: 1, y: 0, z: 0 },
        to: { x: 1, y: 0, z: 2 },
        item: 'coal',
        count: 3,
      },
    ]);
  });

  it('fall from the surface into an open shaft', () => {
    const state = buildState({
      layers: [['#.'], ['##']],
      looseItems: [{ pos: { x: 1, y: 0, z: -1 }, item: 'stone', count: 1 }],
    });
    runSettle(state);
    expect(state.looseItems).toEqual([{ pos: { x: 1, y: 0, z: 0 }, item: 'stone', count: 1 }]);
  });

  it('join a pile of the same item where they land, and fall through a ladder', () => {
    const state = buildState({
      layers: [['#.'], ['#.'], ['#.'], ['##']],
      ladders: [{ x: 1, y: 0, z: 1 }],
      looseItems: [
        { pos: { x: 1, y: 0, z: 0 }, item: 'coal', count: 2 },
        { pos: { x: 1, y: 0, z: 0 }, item: 'stone', count: 1 },
        { pos: { x: 1, y: 0, z: 2 }, item: 'coal', count: 1 },
      ],
    });
    const events = runSettle(state);
    expect(state.looseItems).toEqual([
      { pos: { x: 1, y: 0, z: 2 }, item: 'coal', count: 3 },
      { pos: { x: 1, y: 0, z: 2 }, item: 'stone', count: 1 },
    ]);
    expect(events.map((event) => event.type)).toEqual(['itemFell', 'itemFell']);
  });
});

describe('settle with nothing to do', () => {
  it('changes nothing and emits nothing', () => {
    const state = buildState({
      layers: [['#.'], ['##']],
      avatar: { x: 0, y: 0, z: -1 },
      looseItems: [
        { pos: { x: 1, y: 0, z: 0 }, item: 'coal', count: 1 },
        { pos: { x: 0, y: 0, z: -1 }, item: 'stone', count: 1 },
      ],
    });
    const before = hashState(state);
    expect(runSettle(state)).toEqual([]);
    expect(hashState(state)).toBe(before);
  });
});
