// Scenario tests for moving the avatar (design doc 4.1 and 5.2; owner, issue
// #80: the miner has no gravity and moves into any open face neighbour).
//
// Cubes are drawn top layer first; each layer is a list of rows (y) and each
// row a string of cells (x). '#' is stone and '.' is open. z = -1 is the
// surface, the open air above the top layer.

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, AVATAR, SHIFT } from '../../src/data';
import type { Vec3 } from '../../src/data';
import type { GameState } from '../../src/engine';
import { act, buildState, findActions } from './helpers';

/** Where each legal move goes, in the order the engine lists them. */
function moveTargets(state: GameState): Vec3[] {
  return findActions(state, { type: 'move' }).map((action) =>
    action.type === 'move' ? action.to : { x: NaN, y: NaN, z: NaN },
  );
}

/** A corridor along y = 1 in the top layer, with a stone floor under it. */
function corridor(avatar: Vec3, ap: number = SHIFT.apPerShift): GameState {
  return buildState({
    revealAll: true,
    layers: [
      ['###', '...', '###'],
      ['###', '###', '###'],
    ],
    avatar,
    ap,
  });
}

/**
 * A stone column at x = 0 beside a shaft at x = 1 that is `depth` blocks
 * deep. The avatar stands on the surface on top of the column.
 */
function ledge(depth: number): GameState {
  const layers: string[][] = [];
  for (let z = 0; z < depth; z += 1) {
    layers.push(['#.']);
  }
  layers.push(['##']);
  return buildState({ revealAll: true, layers, avatar: { x: 0, y: 0, z: -1 } });
}

describe('walking', () => {
  it('moves the avatar into an open neighbour for 1 AP', () => {
    const state = corridor({ x: 1, y: 1, z: 0 });
    const to = { x: 2, y: 1, z: 0 };
    expect(findActions(state, { type: 'move', to })).toEqual([
      { type: 'move', to, ap: ACTION_COSTS.move },
    ]);

    const { state: after, events } = act(state, { type: 'move', to });
    expect(after.avatar.pos).toEqual(to);
    expect(after.ap).toBe(SHIFT.apPerShift - ACTION_COSTS.move);
    expect(events).toEqual([{ type: 'moved', from: { x: 1, y: 1, z: 0 }, to }]);
    // The state passed in is not changed.
    expect(state.avatar.pos).toEqual({ x: 1, y: 1, z: 0 });
  });

  it('is blocked by a solid cell', () => {
    const state = corridor({ x: 1, y: 1, z: 0 });
    expect(findActions(state, { type: 'move', to: { x: 1, y: 0, z: 0 } })).toEqual([]);
    expect(findActions(state, { type: 'move', to: { x: 1, y: 2, z: 0 } })).toEqual([]);
  });

  it('is blocked at the edge of the cube', () => {
    const state = corridor({ x: 0, y: 1, z: 0 });
    // Not out through the side, and not up onto the bedrock beyond it.
    expect(findActions(state, { type: 'move', to: { x: -1, y: 1, z: 0 } })).toEqual([]);
    expect(findActions(state, { type: 'move', to: { x: -1, y: 1, z: -1 } })).toEqual([]);
    // The only walk left is back along the corridor.
    expect(moveTargets(state).filter((to) => to.z === 0)).toEqual([{ x: 1, y: 1, z: 0 }]);
  });

  it('is blocked at the edge of the surface', () => {
    const state = buildState({
      revealAll: true,
      layers: [['##', '##']],
      avatar: { x: 0, y: 0, z: -1 },
    });
    // From the corner of the surface only the two cells on it can be reached.
    expect(moveTargets(state)).toEqual([
      { x: 1, y: 0, z: -1 },
      { x: 0, y: 1, z: -1 },
    ]);
  });

  it('has no diagonal moves', () => {
    const state = buildState({
      revealAll: true,
      layers: [['###', '###', '###']],
      avatar: { x: 1, y: 1, z: -1 },
    });
    expect(moveTargets(state)).toEqual([
      { x: 1, y: 0, z: -1 },
      { x: 2, y: 1, z: -1 },
      { x: 1, y: 2, z: -1 },
      { x: 0, y: 1, z: -1 },
    ]);
  });

  it('is not legal with 0 AP', () => {
    expect(moveTargets(corridor({ x: 1, y: 1, z: 0 }, ACTION_COSTS.move))).not.toEqual([]);
    expect(moveTargets(corridor({ x: 1, y: 1, z: 0 }, 0))).toEqual([]);
  });
});

describe('no gravity (issue #80)', () => {
  it('walks out over a shaft and stays there: nothing has to hold the miner up', () => {
    for (const depth of [1, 2, 6]) {
      const state = ledge(depth);
      const over = { x: 1, y: 0, z: -1 };
      const { state: after, events } = act(state, { type: 'move', to: over });
      expect(after.avatar.pos).toEqual(over);
      expect(after.avatar.health).toBe(AVATAR.startHealth);
      expect(events).toEqual([{ type: 'moved', from: { x: 0, y: 0, z: -1 }, to: over }]);
    }
  });

  it('moves down into an open cell below, one block at a time, whatever is under it', () => {
    let state = ledge(4);
    state = act(state, { type: 'move', to: { x: 1, y: 0, z: -1 } }).state;
    for (let z = 0; z < 4; z += 1) {
      const to = { x: 1, y: 0, z };
      expect(findActions(state, { type: 'move', to })).toEqual([
        { type: 'move', to, ap: ACTION_COSTS.move },
      ]);
      state = act(state, { type: 'move', to }).state;
      expect(state.avatar.pos).toEqual(to);
      state.ap = SHIFT.apPerShift; // AP is not what this test is about
    }
    // At the bottom: rock below, so no move down.
    expect(findActions(state, { type: 'move', to: { x: 1, y: 0, z: 4 } })).toEqual([]);
    expect(state.avatar.health).toBe(AVATAR.startHealth);
  });

  it('moves up a shaft into an open cell above, and out onto the surface', () => {
    let state = buildState({
      revealAll: true,
      layers: [['#.#'], ['#.#'], ['#.#'], ['###']],
      avatar: { x: 1, y: 0, z: 2 },
    });
    for (const z of [1, 0, -1]) {
      const to = { x: 1, y: 0, z };
      expect(moveTargets(state)).toContainEqual(to);
      state = act(state, { type: 'move', to }).state;
      state.ap = SHIFT.apPerShift;
    }
    expect(state.avatar.pos).toEqual({ x: 1, y: 0, z: -1 });
  });

  it('lists the moves in a fixed order: north, east, south, west, up, down', () => {
    const state = buildState({
      revealAll: true,
      layers: [
        ['#.#', '...', '#.#'],
        ['#.#', '...', '#.#'],
        ['###', '#.#', '###'],
        ['###', '###', '###'],
      ],
      avatar: { x: 1, y: 1, z: 1 },
    });
    expect(moveTargets(state)).toEqual([
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 1, z: 1 },
      { x: 1, y: 2, z: 1 },
      { x: 0, y: 1, z: 1 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 1, z: 2 },
    ]);
  });

  it('does not move up or down into rock, nor anywhere diagonal', () => {
    const state = buildState({
      revealAll: true,
      // The cells diagonally up and down from the avatar are open; above and below are rock.
      layers: [
        ['...', '.#.', '...'],
        ['#.#', '...', '#.#'],
        ['...', '.#.', '...'],
        ['###', '###', '###'],
      ],
      avatar: { x: 1, y: 1, z: 1 },
    });
    for (const to of moveTargets(state)) {
      expect(to.z).toBe(1);
    }
  });

  it('never moves up past the surface', () => {
    const state = buildState({ revealAll: true, layers: [['#']], avatar: { x: 0, y: 0, z: -1 } });
    expect(moveTargets(state)).toEqual([]);
  });
});
