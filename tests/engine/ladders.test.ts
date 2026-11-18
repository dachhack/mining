// Scenario tests for ladders: placing them and climbing them (design doc 4.1;
// decision note 0005 items 5, 6 and 19; issue #5 and the coordinator's notes).

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, SHIFT, STRUCTURES } from '../../src/data';
import type { Vec3 } from '../../src/data';
import type { GameState } from '../../src/engine';
import { structureAt } from '../../src/engine/state';
import { act, buildState, findActions } from './helpers';

function moveTargets(state: GameState): Vec3[] {
  return findActions(state, { type: 'move' }).map((action) =>
    action.type === 'move' ? action.to : { x: NaN, y: NaN, z: NaN },
  );
}

function ladderTargets(state: GameState): Vec3[] {
  return findActions(state, { type: 'placeLadder' }).map((action) =>
    action.type === 'placeLadder' ? action.target : { x: NaN, y: NaN, z: NaN },
  );
}

/**
 * A shaft at x = 0, three cells deep, beside solid stone at x = 1, with a
 * ladder in every cell of the shaft.
 */
function ladderShaft(avatar: Vec3): GameState {
  return buildState({
    revealAll: true,
    layers: [['.#'], ['.#'], ['.#'], ['##']],
    avatar,
    ladders: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 2 },
    ],
  });
}

/**
 * A shaft at x = 0 with one ladder in its top cell, the avatar on it, and
 * `openBelow` open cells under the ladder before the floor.
 */
function ladderOverPit(openBelow: number): GameState {
  const layers: string[][] = [['.']];
  for (let i = 0; i < openBelow; i += 1) {
    layers.push(['.']);
  }
  layers.push(['#']);
  return buildState({
    revealAll: true,
    layers,
    avatar: { x: 0, y: 0, z: 0 },
    ladders: [{ x: 0, y: 0, z: 0 }],
  });
}

describe('placing a ladder', () => {
  it('puts a ladder in the avatar’s cell for 1 AP and 1 ladder', () => {
    const state = buildState({
      revealAll: true,
      layers: [['.'], ['#']],
      avatar: { x: 0, y: 0, z: 0 },
      inventory: { ladder: 2 },
    });
    const target = { x: 0, y: 0, z: 0 };
    expect(findActions(state, { type: 'placeLadder' })).toEqual([
      { type: 'placeLadder', target, ap: ACTION_COSTS.placeLadder },
    ]);

    const { state: after, events } = act(state, { type: 'placeLadder', target });
    expect(structureAt(after, target)).toBe(STRUCTURES.ladder.code);
    expect(after.inventory['ladder']).toBe(1);
    expect(after.ap).toBe(SHIFT.apPerShift - ACTION_COSTS.placeLadder);
    expect(events).toEqual([
      { type: 'structurePlaced', pos: target, structure: STRUCTURES.ladder.code },
    ]);
    // The state passed in is not changed.
    expect(structureAt(state, target)).toBe(0);
    expect(state.inventory['ladder']).toBe(2);
  });

  it('is offered for the avatar’s cell and each open face neighbour in the grid', () => {
    // The avatar is in the middle of a plus-shaped room at z = 1, with an
    // open cell above it and stone below. The corners of the room are stone.
    const state = buildState({
      revealAll: true,
      layers: [
        ['###', '#.#', '###'],
        ['#.#', '...', '#.#'],
        ['###', '###', '###'],
      ],
      avatar: { x: 1, y: 1, z: 1 },
      inventory: { ladder: 1 },
    });
    expect(ladderTargets(state)).toEqual([
      { x: 1, y: 1, z: 1 }, // own cell
      { x: 1, y: 1, z: 0 }, // above
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 1, z: 1 },
      { x: 1, y: 2, z: 1 },
      { x: 0, y: 1, z: 1 },
      // not below: it is solid
    ]);
  });

  it('can go into the open cell below the avatar', () => {
    const state = ladderOverPit(1);
    state.inventory = { ladder: 1 };
    // Its own cell has a ladder already, so only the cell below is offered.
    expect(ladderTargets(state)).toEqual([{ x: 0, y: 0, z: 1 }]);
  });

  it('is not offered for a cell that already holds a ladder or a torch', () => {
    const state = buildState({
      revealAll: true,
      layers: [['...'], ['###']],
      avatar: { x: 1, y: 0, z: 0 },
      inventory: { ladder: 3 },
      ladders: [{ x: 0, y: 0, z: 0 }],
      torches: [{ x: 2, y: 0, z: 0 }],
    });
    expect(ladderTargets(state)).toEqual([{ x: 1, y: 0, z: 0 }]);
  });

  it('is not offered on the surface (owner question 28)', () => {
    const onSurface = buildState({
      revealAll: true,
      layers: [['##']],
      avatar: { x: 0, y: 0, z: -1 },
      inventory: { ladder: 3 },
    });
    expect(ladderTargets(onSurface)).toEqual([]);

    // From the top layer, the surface cell overhead is not offered either.
    const below = buildState({
      revealAll: true,
      layers: [['.'], ['#']],
      avatar: { x: 0, y: 0, z: 0 },
      inventory: { ladder: 3 },
    });
    expect(ladderTargets(below)).toEqual([{ x: 0, y: 0, z: 0 }]);
  });

  it('is not legal without a ladder in the inventory', () => {
    const layers = [['.'], ['#']];
    const avatar = { x: 0, y: 0, z: 0 };
    expect(ladderTargets(buildState({ revealAll: true, layers, avatar }))).toEqual([]);
    expect(
      ladderTargets(buildState({ revealAll: true, layers, avatar, inventory: { ladder: 0 } })),
    ).toEqual([]);
    expect(
      ladderTargets(buildState({ revealAll: true, layers, avatar, inventory: { ladder: 1 } })),
    ).toHaveLength(1);
  });

  it('is not legal with 0 AP', () => {
    const state = buildState({
      revealAll: true,
      layers: [['.'], ['#']],
      avatar: { x: 0, y: 0, z: 0 },
      inventory: { ladder: 1 },
      ap: 0,
    });
    expect(ladderTargets(state)).toEqual([]);
  });

  it('uses up the last ladder, after which no more can be placed', () => {
    const state = buildState({
      revealAll: true,
      layers: [['..'], ['##']],
      avatar: { x: 0, y: 0, z: 0 },
      inventory: { ladder: 1 },
    });
    const { state: after } = act(state, { type: 'placeLadder', target: { x: 0, y: 0, z: 0 } });
    expect(after.inventory['ladder']).toBe(0);
    expect(ladderTargets(after)).toEqual([]);
  });
});

describe('climbing a ladder', () => {
  it('goes up a ladder shaft one cell per move, 1 AP each', () => {
    const bottom = ladderShaft({ x: 0, y: 0, z: 2 });
    expect(findActions(bottom, { type: 'move', to: { x: 0, y: 0, z: 1 } })).toEqual([
      { type: 'move', to: { x: 0, y: 0, z: 1 }, drop: 0, ap: ACTION_COSTS.move },
    ]);

    const first = act(bottom, { type: 'move', to: { x: 0, y: 0, z: 1 } });
    expect(first.state.avatar.pos).toEqual({ x: 0, y: 0, z: 1 });
    expect(first.events).toEqual([
      { type: 'moved', from: { x: 0, y: 0, z: 2 }, to: { x: 0, y: 0, z: 1 } },
    ]);

    const second = act(first.state, { type: 'move', to: { x: 0, y: 0, z: 0 } });
    expect(second.state.avatar.pos).toEqual({ x: 0, y: 0, z: 0 });
    expect(second.state.ap).toBe(SHIFT.apPerShift - 2 * ACTION_COSTS.move);
  });

  it('steps off at the top of the shaft onto the surface', () => {
    const top = ladderShaft({ x: 0, y: 0, z: 0 });
    // No ladder can stand on the surface, so there is no climb straight up;
    // the way out is the step up onto the block beside the shaft.
    expect(findActions(top, { type: 'move', to: { x: 0, y: 0, z: -1 } })).toEqual([]);
    const { state: after } = act(top, { type: 'move', to: { x: 1, y: 0, z: -1 } });
    expect(after.avatar.pos).toEqual({ x: 1, y: 0, z: -1 });
    expect(after.status).toEqual({ kind: 'active' });
  });

  it('goes down a ladder shaft', () => {
    const top = ladderShaft({ x: 0, y: 0, z: 0 });
    const { state: after, events } = act(top, { type: 'move', to: { x: 0, y: 0, z: 1 } });
    expect(after.avatar.pos).toEqual({ x: 0, y: 0, z: 1 });
    expect(events).toEqual([
      { type: 'moved', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 1 } },
    ]);
  });

  it('lists the climb up and the climb down from the middle of a shaft', () => {
    expect(moveTargets(ladderShaft({ x: 0, y: 0, z: 1 }))).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 2 },
    ]);
  });

  it('needs a ladder in the cell above to climb up', () => {
    const state = buildState({
      revealAll: true,
      layers: [['.'], ['.'], ['#']],
      avatar: { x: 0, y: 0, z: 1 },
      ladders: [{ x: 0, y: 0, z: 1 }],
    });
    expect(moveTargets(state)).toEqual([]);
  });

  it('needs a ladder in the avatar’s own cell to climb up', () => {
    // "On a ladder" (0005 item 6): a ladder overhead alone is out of reach.
    const state = buildState({
      revealAll: true,
      layers: [['.'], ['.'], ['#']],
      avatar: { x: 0, y: 0, z: 1 },
      ladders: [{ x: 0, y: 0, z: 0 }],
    });
    expect(moveTargets(state)).toEqual([]);
  });

  it('cannot climb up into a solid cell', () => {
    const state = buildState({
      revealAll: true,
      layers: [['#'], ['.'], ['#']],
      avatar: { x: 0, y: 0, z: 1 },
      ladders: [{ x: 0, y: 0, z: 1 }],
    });
    expect(moveTargets(state)).toEqual([]);
  });

  it('holds the avatar when it walks into a ladder cell over a void', () => {
    // The ladder is at the top of a pit 3 deep, which would otherwise be too
    // deep to walk into.
    const state = buildState({
      revealAll: true,
      layers: [['#.'], ['#.'], ['#.'], ['##']],
      avatar: { x: 0, y: 0, z: -1 },
      ladders: [{ x: 1, y: 0, z: 0 }],
    });
    // Walking onto the surface cell over the shaft drops 1, onto the ladder.
    const { state: after, events } = act(state, { type: 'move', to: { x: 1, y: 0, z: -1 } });
    expect(after.avatar.pos).toEqual({ x: 1, y: 0, z: 0 });
    expect(events.map((event) => event.type)).toEqual(['moved', 'fell']);
  });
});

describe('climbing down off the bottom of a ladder', () => {
  it('steps down onto a floor one block below', () => {
    const state = ladderOverPit(1);
    expect(findActions(state, { type: 'move' })).toEqual([
      { type: 'move', to: { x: 0, y: 0, z: 1 }, drop: 0, ap: ACTION_COSTS.move },
    ]);
    const { state: after, events } = act(state, { type: 'move', to: { x: 0, y: 0, z: 1 } });
    expect(after.avatar.pos).toEqual({ x: 0, y: 0, z: 1 });
    expect(events.map((event) => event.type)).toEqual(['moved']);
  });

  it('may end 2 blocks below the ladder cell, and the action shows the drop', () => {
    const state = ladderOverPit(2);
    expect(findActions(state, { type: 'move' })).toEqual([
      { type: 'move', to: { x: 0, y: 0, z: 1 }, drop: 1, ap: ACTION_COSTS.move },
    ]);
    const { state: after, events } = act(state, { type: 'move', to: { x: 0, y: 0, z: 1 } });
    expect(after.avatar.pos).toEqual({ x: 0, y: 0, z: 2 });
    expect(events).toEqual([
      { type: 'moved', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 1 } },
      { type: 'fell', from: { x: 0, y: 0, z: 1 }, to: { x: 0, y: 0, z: 2 }, distance: 1 },
    ]);
  });

  it('is not legal when the avatar would end 3 blocks below the ladder cell', () => {
    expect(moveTargets(ladderOverPit(3))).toEqual([]);
  });

  it('is legal onto a ladder below, however deep the shaft under it', () => {
    const state = buildState({
      revealAll: true,
      layers: [['.'], ['.'], ['.'], ['.'], ['.'], ['#']],
      avatar: { x: 0, y: 0, z: 0 },
      ladders: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ],
    });
    expect(findActions(state, { type: 'move' })).toEqual([
      { type: 'move', to: { x: 0, y: 0, z: 1 }, drop: 0, ap: ACTION_COSTS.move },
    ]);
  });
});
