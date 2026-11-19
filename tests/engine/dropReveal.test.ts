// Scenario tests for issue #15: the action list must not show anything the
// avatar cannot know (pillar 1; agent plan 3.1).
//
// A walk off an edge, and a climb down off the bottom of a ladder, are judged
// by the cells straight below. With the lamp out some of those cells used to
// be unrevealed, so whether the move was offered, and its `drop` value, gave
// away what they held.
//
// The first fix (#15) revealed those cells whatever the light. Since issue
// #33 (decision note 0011) the avatar looks over an edge only with the lamp
// lit; with it out the cells stay unrevealed and the move is not offered.
// Either way the action list must not depend on an unrevealed cell, and the
// general check below is made in both lights.

import { describe, expect, it } from 'vitest';
import { AVATAR, BLOCKS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { endShift, isRevealed, legalActions } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { cellPosition, cloneState, isOpen, setBlock } from '../../src/engine/state';
import { buildState, findActions } from './helpers';

/** Lamp oil that outlasts the one upkeep `stateAfterAShift` runs. */
const PLENTY_OF_OIL = 10;

/**
 * Build a state with `lampOil` oil and no AP to waste, then end one shift, so
 * that `updateReveal` has run in that light, as it would in play.
 * The fuel default (10) is plenty for one upkeep.
 */
function stateAfterAShift(
  lampOil: number,
  layers: string[][],
  avatar: Vec3,
  ladders: Vec3[] = [],
): GameState {
  const built = buildState({ layers, avatar, ladders, lampOil, ap: 0 });
  return endShift(built).state;
}

function stateWithLampOut(layers: string[][], avatar: Vec3, ladders: Vec3[] = []): GameState {
  return stateAfterAShift(0, layers, avatar, ladders);
}

function stateWithLampLit(layers: string[][], avatar: Vec3, ladders: Vec3[] = []): GameState {
  return stateAfterAShift(PLENTY_OF_OIL, layers, avatar, ladders);
}

/**
 * The in-grid cells whose content changes `legalActions`: each cell in turn
 * is swapped (open becomes stone, solid becomes air) in a copy of the state,
 * and the action list of the copy is compared with the original's.
 */
function cellsThatChangeTheActionList(state: GameState): Vec3[] {
  const before = JSON.stringify(legalActions(state));
  const found: Vec3[] = [];
  const cells = state.size.x * state.size.y * state.size.z;
  for (let index = 0; index < cells; index += 1) {
    const pos = cellPosition(state.size, index);
    const changed = cloneState(state);
    setBlock(changed, pos, isOpen(state, pos) ? BLOCKS.stone.code : BLOCKS.air.code);
    if (JSON.stringify(legalActions(changed)) !== before) {
      found.push(pos);
    }
  }
  return found;
}

/** The cells of `cells` that are not revealed in `state`. */
function unrevealed(state: GameState, cells: Vec3[]): Vec3[] {
  return cells.filter((pos) => !isRevealed(state, pos));
}

/**
 * The issue's reproduction, a 3 x 1 x 5 cube seen from the side (x across,
 * z down). `@` is the avatar; the cell marked `?` is `shaft`:
 *
 *   z = 0   @ . #
 *   z = 1   # . #
 *   z = 2   # ? #
 *   z = 3   # # #
 *   z = 4   # # #
 */
function edgeLayers(shaft: string): string[][] {
  return [['..#'], ['#.#'], [`#${shaft}#`], ['###'], ['###']];
}

const EDGE_AVATAR: Vec3 = { x: 0, y: 0, z: 0 };

describe('issue #15: the move list shows only what is revealed', () => {
  it('with the lamp lit, reveals the cells a walk off an edge is judged by', () => {
    // A drop of 1: the move depends on (1,0,1) and (1,0,2).
    const shallow = stateWithLampLit(edgeLayers('#'), EDGE_AVATAR);
    expect(findActions(shallow, { type: 'move' })).toEqual([
      { type: 'move', to: { x: 1, y: 0, z: 0 }, drop: 1, ap: 1 },
    ]);
    expect(isRevealed(shallow, { x: 1, y: 0, z: 1 })).toBe(true);
    expect(isRevealed(shallow, { x: 1, y: 0, z: 2 })).toBe(true);

    // A drop of 2: the move depends on (1,0,3) as well.
    const deep = stateWithLampLit(edgeLayers('.'), EDGE_AVATAR);
    expect(findActions(deep, { type: 'move' })).toEqual([
      { type: 'move', to: { x: 1, y: 0, z: 0 }, drop: 2, ap: 1 },
    ]);
    expect(isRevealed(deep, { x: 1, y: 0, z: 1 })).toBe(true);
    expect(isRevealed(deep, { x: 1, y: 0, z: 2 })).toBe(true);
    expect(isRevealed(deep, { x: 1, y: 0, z: 3 })).toBe(true);
  });

  it('with the lamp out, does not reveal them and does not offer the walk (issue #33)', () => {
    for (const shaft of ['#', '.']) {
      const state = stateWithLampOut(edgeLayers(shaft), EDGE_AVATAR);
      // (1,0,1) is under the open cell beside the avatar: not touched, not seen.
      expect(isRevealed(state, { x: 1, y: 0, z: 1 })).toBe(false);
      expect(isRevealed(state, { x: 1, y: 0, z: 2 })).toBe(false);
      expect(findActions(state, { type: 'move' })).toEqual([]);
    }
  });

  // The general form: in each state, no cell the player has not seen may
  // change the action list. Each entry is a name, then the layers, the
  // avatar's cell and the ladders; each is tried with the lamp out and lit.
  type Scene = [string, string[][], Vec3, Vec3[]];
  const scenes: Scene[] = [
    ['an edge with a drop of 1', edgeLayers('#'), EDGE_AVATAR, []],
    ['an edge with a drop of 2', edgeLayers('.'), EDGE_AVATAR, []],
    [
      // The shaft beside the avatar is 4 deep: too far to choose.
      'an edge with a drop too long to choose',
      [['..#'], ['#.#'], ['#.#'], ['#.#'], ['#.#'], ['###']],
      EDGE_AVATAR,
      [],
    ],
    [
      // The avatar is on the surface, beside a hole in the top layer.
      'the surface beside a hole 2 deep',
      [['#.#'], ['#.#'], ['###'], ['###']],
      { x: 0, y: 0, z: -1 },
      [],
    ],
    [
      'the surface beside a hole 3 deep',
      [['#.#'], ['#.#'], ['#.#'], ['###']],
      { x: 0, y: 0, z: -1 },
      [],
    ],
    [
      // The avatar is on a single ladder at the top of a shaft; the climb
      // down is a drop of 1 past the ladder's foot.
      'the bottom of a ladder, floor 2 below',
      [['#.#'], ['#.#'], ['#.#'], ['###'], ['###']],
      { x: 1, y: 0, z: 0 },
      [{ x: 1, y: 0, z: 0 }],
    ],
    [
      'the bottom of a ladder, floor 3 below',
      [['#.#'], ['#.#'], ['#.#'], ['#.#'], ['###']],
      { x: 1, y: 0, z: 0 },
      [{ x: 1, y: 0, z: 0 }],
    ],
    [
      // A wider room, with edges on two sides of the avatar at once.
      'a ledge between two pits',
      [
        ['#####', '.....', '#####'],
        ['#####', '.#.#.', '#####'],
        ['#####', '.#.#.', '#####'],
        ['#####', '##.#.', '#####'],
        ['#####', '#####', '#####'],
      ],
      { x: 1, y: 1, z: 0 },
      [],
    ],
    [
      // Headroom and a block to step up onto, two layers down (issue #19):
      // the cell on top of the block is not one the avatar touches.
      'a step up, under two layers of rock',
      [['###'], ['###'], ['..#'], ['.##'], ['###']],
      { x: 0, y: 0, z: 3 },
      [],
    ],
  ];

  it.each(scenes)(
    'changing an unrevealed cell does not change the action list, lamp out: %s',
    (_name, layers, avatar, ladders) => {
      const state = stateWithLampOut(layers, avatar, ladders);
      expect(unrevealed(state, cellsThatChangeTheActionList(state))).toEqual([]);
    },
  );

  it.each(scenes)(
    'changing an unrevealed cell does not change the action list, lamp lit: %s',
    (_name, layers, avatar, ladders) => {
      const state = stateWithLampLit(layers, avatar, ladders);
      expect(unrevealed(state, cellsThatChangeTheActionList(state))).toEqual([]);
    },
  );
});

// Owner question 40 let the miner "look over an edge" with the lamp lit:
// see down a drop beside it as far as a move would need. Issue #75 (decision
// note 0022) removed that: only exposed faces are known, so a drop is seen
// only as far as light goes down it. These tests pin what light shows now.
describe('no looking over an edge (issue #75): light alone shows a drop', () => {
  /** A 3 x 1 cube: the avatar at (0,0,0) beside a shaft `depth` cells deep at x = 1. */
  function shaftLayers(depth: number): string[][] {
    const layers: string[][] = [['..#']];
    for (let z = 1; z <= depth; z += 1) {
      layers.push(['#.#']);
    }
    layers.push(['###'], ['###']);
    return layers;
  }

  it('light shows a shallow shaft down to its first solid block, and no further', () => {
    const state = stateWithLampLit(shaftLayers(1), EDGE_AVATAR);
    // (1,0,1) is open and lit, (1,0,2) is the floor of the shaft.
    expect(isRevealed(state, { x: 1, y: 0, z: 2 })).toBe(true);
    expect(isRevealed(state, { x: 1, y: 0, z: 3 })).toBe(false);
  });

  it('a shaft deeper than the light reaches is seen only as far as the light goes', () => {
    const radius = AVATAR.lightRadiusWithOil;
    const state = stateWithLampLit(shaftLayers(radius + 4), EDGE_AVATAR);
    // The light goes 1 step sideways, then down: the last lit cell is
    // (1,0,radius-1), and the cell under it is seen.
    for (let z = 1; z <= radius; z += 1) {
      expect(isRevealed(state, { x: 1, y: 0, z }), `z${z}`).toBe(true);
    }
    expect(isRevealed(state, { x: 1, y: 0, z: radius + 1 })).toBe(false);
    // The drop is too long to choose, so the walk is not offered.
    expect(findActions(state, { type: 'move' })).toEqual([]);
  });

  it('sees nothing over an edge with the lamp out (issue #33)', () => {
    const state = stateWithLampOut(shaftLayers(2), EDGE_AVATAR);
    for (let z = 1; z <= 3; z += 1) {
      expect(isRevealed(state, { x: 1, y: 0, z })).toBe(false);
    }
  });

  it('does not see under a solid neighbour', () => {
    // The avatar is in a one-cell pit: every sideways neighbour is solid.
    const state = stateWithLampLit([['#.#'], ['###'], ['###'], ['###']], { x: 1, y: 0, z: 0 });
    expect(isRevealed(state, { x: 0, y: 0, z: 1 })).toBe(false);
    expect(isRevealed(state, { x: 2, y: 0, z: 1 })).toBe(false);
  });

  it('on a ladder, light down the shaft shows its floor, and a drop too long is not offered', () => {
    // A shaft 4 deep at x = 1, the avatar in its top cell on a ladder.
    const layers = [['#.#'], ['#.#'], ['#.#'], ['#.#'], ['###']];
    const top = { x: 1, y: 0, z: 0 };
    const onLadder = stateWithLampLit(layers, top, [top]);
    expect(isRevealed(onLadder, { x: 1, y: 0, z: 4 })).toBe(true);
    // The floor is 3 below the ladder's foot: too far, so no climb down.
    expect(findActions(onLadder, { type: 'move', to: { x: 1, y: 0, z: 1 } })).toEqual([]);
  });

  it('emits a blockRevealed event for each cell light shows down the edge', () => {
    const state = buildState({ layers: shaftLayers(2), avatar: EDGE_AVATAR });
    const events: GameEvent[] = [];
    updateReveal(state, events);
    expect(events).toContainEqual({
      type: 'blockRevealed',
      pos: { x: 1, y: 0, z: 2 },
      block: BLOCKS.air.code,
    });
    expect(events).toContainEqual({
      type: 'blockRevealed',
      pos: { x: 1, y: 0, z: 3 },
      block: BLOCKS.stone.code,
    });
  });
});
