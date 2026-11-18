// Scenario tests for moving the avatar (design doc 4.1; decision note 0005
// items 5 to 7; issue #5 and the coordinator's notes on it).
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
 * A stone column at x = 0 beside a pit at x = 1 that is `depth` blocks deep.
 * The avatar stands on the surface on top of the column.
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
      { type: 'move', to, drop: 0, ap: ACTION_COSTS.move },
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

describe('stepping up', () => {
  it('climbs onto a block one level up', () => {
    const state = buildState({
      revealAll: true,
      layers: [['.#'], ['##']],
      avatar: { x: 0, y: 0, z: 0 },
    });
    const to = { x: 1, y: 0, z: -1 };
    expect(findActions(state, { type: 'move', to })).toEqual([
      { type: 'move', to, drop: 0, ap: ACTION_COSTS.move },
    ]);
    const { state: after, events } = act(state, { type: 'move', to });
    expect(after.avatar.pos).toEqual(to);
    expect(events).toEqual([{ type: 'moved', from: { x: 0, y: 0, z: 0 }, to }]);
  });

  it('is refused when the cell above the avatar is solid', () => {
    // The avatar is at z = 1 under a stone ceiling; the step at x = 1 has
    // room on top of it.
    const blocked = buildState({
      revealAll: true,
      layers: [['#.'], ['.#'], ['##']],
      avatar: { x: 0, y: 0, z: 1 },
    });
    expect(moveTargets(blocked)).toEqual([]);

    // The same cube with the ceiling opened: now the step is legal.
    const open = buildState({
      revealAll: true,
      layers: [['..'], ['.#'], ['##']],
      avatar: { x: 0, y: 0, z: 1 },
    });
    expect(moveTargets(open)).toEqual([{ x: 1, y: 0, z: 0 }]);
  });

  it('is refused for a step two blocks high', () => {
    const state = buildState({
      revealAll: true,
      layers: [['.#'], ['.#'], ['##']],
      avatar: { x: 0, y: 0, z: 1 },
    });
    expect(moveTargets(state)).toEqual([]);
  });
});

describe('walking off a ledge', () => {
  // `it.each` runs the same test once for each value in the list.
  it.each([1, 2])('drops %i block(s) without damage', (depth) => {
    const state = ledge(depth);
    const to = { x: 1, y: 0, z: -1 };
    // The action says how far the avatar will drop.
    expect(findActions(state, { type: 'move', to })).toEqual([
      { type: 'move', to, drop: depth, ap: ACTION_COSTS.move },
    ]);

    const { state: after, events } = act(state, { type: 'move', to });
    const landed = { x: 1, y: 0, z: -1 + depth };
    expect(after.avatar.pos).toEqual(landed);
    expect(after.avatar.health).toBe(AVATAR.startHealth);
    expect(after.ap).toBe(SHIFT.apPerShift - ACTION_COSTS.move);
    expect(after.status).toEqual({ kind: 'active' });
    expect(events).toEqual([
      { type: 'moved', from: { x: 0, y: 0, z: -1 }, to },
      { type: 'fell', from: to, to: landed, distance: depth, kind: 'chosenDrop' },
    ]);
  });

  it('allows a drop of exactly the longest chosen drop in the data, and no longer', () => {
    expect(moveTargets(ledge(AVATAR.maxChosenDropBlocks))).toEqual([{ x: 1, y: 0, z: -1 }]);
    expect(moveTargets(ledge(AVATAR.maxChosenDropBlocks + 1))).toEqual([]);
  });

  it.each([3, 4, 5, 6])('is not a legal action when the drop is %i blocks', (depth) => {
    expect(moveTargets(ledge(depth))).toEqual([]);
  });

  it('counts the drop only as far as a ladder that would catch the avatar', () => {
    // A pit 4 deep with a ladder 2 down: the avatar lands on the ladder.
    const state = buildState({
      revealAll: true,
      layers: [['#.'], ['#.'], ['#.'], ['#.'], ['##']],
      avatar: { x: 0, y: 0, z: -1 },
      ladders: [{ x: 1, y: 0, z: 1 }],
    });
    const to = { x: 1, y: 0, z: -1 };
    const { state: after } = act(state, { type: 'move', to, drop: 2 });
    expect(after.avatar.pos).toEqual({ x: 1, y: 0, z: 1 });
    expect(after.avatar.health).toBe(AVATAR.startHealth);
  });
});
