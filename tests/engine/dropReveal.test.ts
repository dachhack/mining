// Scenario tests for issue #15: the action list must not show anything the
// avatar cannot know (pillar 1; agent plan 3.1).
//
// A walk off an edge, and a climb down off the bottom of a ladder, are judged
// by the cells straight below. With the lamp out (light radius 1) some of
// those cells used to be unrevealed, so whether the move was offered, and its
// `drop` value, gave away what they held.

import { describe, expect, it } from 'vitest';
import { AVATAR, BLOCKS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { endShift, isRevealed, legalActions } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { edgeLookCells, updateReveal } from '../../src/engine/reveal';
import { cellPosition, cloneState, isOpen, setBlock } from '../../src/engine/state';
import { buildState, findActions } from './helpers';

/**
 * Build a state with no lamp oil and no AP to waste, then end one shift, so
 * that `updateReveal` has run with the lamp out, as it would in play.
 * The fuel default (10) is plenty for one upkeep.
 */
function stateWithLampOut(layers: string[][], avatar: Vec3, ladders: Vec3[] = []): GameState {
  const built = buildState({ layers, avatar, ladders, lampOil: 0, ap: 0 });
  return endShift(built).state;
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

describe('issue #15: with the lamp out, the move list shows only what is revealed', () => {
  it('reveals the cells a walk off an edge is judged by', () => {
    // A drop of 1: the move depends on (1,0,1) and (1,0,2).
    const shallow = stateWithLampOut(edgeLayers('#'), EDGE_AVATAR);
    expect(findActions(shallow, { type: 'move' })).toEqual([
      { type: 'move', to: { x: 1, y: 0, z: 0 }, drop: 1, ap: 1 },
    ]);
    expect(isRevealed(shallow, { x: 1, y: 0, z: 1 })).toBe(true);
    expect(isRevealed(shallow, { x: 1, y: 0, z: 2 })).toBe(true);

    // A drop of 2: the move depends on (1,0,3) as well.
    const deep = stateWithLampOut(edgeLayers('.'), EDGE_AVATAR);
    expect(findActions(deep, { type: 'move' })).toEqual([
      { type: 'move', to: { x: 1, y: 0, z: 0 }, drop: 2, ap: 1 },
    ]);
    expect(isRevealed(deep, { x: 1, y: 0, z: 1 })).toBe(true);
    expect(isRevealed(deep, { x: 1, y: 0, z: 2 })).toBe(true);
    expect(isRevealed(deep, { x: 1, y: 0, z: 3 })).toBe(true);
  });

  // The general form: in each state, no cell the player has not seen may
  // change the action list. Each entry is a name, then the state.
  const lampOutStates: [string, GameState][] = [
    ['an edge with a drop of 1', stateWithLampOut(edgeLayers('#'), EDGE_AVATAR)],
    ['an edge with a drop of 2', stateWithLampOut(edgeLayers('.'), EDGE_AVATAR)],
    [
      // The shaft beside the avatar is 4 deep: too far to choose.
      'an edge with a drop too long to choose',
      stateWithLampOut([['..#'], ['#.#'], ['#.#'], ['#.#'], ['#.#'], ['###']], EDGE_AVATAR),
    ],
    [
      // The avatar is on the surface, beside a hole in the top layer.
      'the surface beside a hole 2 deep',
      stateWithLampOut([['#.#'], ['#.#'], ['###'], ['###']], { x: 0, y: 0, z: -1 }),
    ],
    [
      'the surface beside a hole 3 deep',
      stateWithLampOut([['#.#'], ['#.#'], ['#.#'], ['###']], { x: 0, y: 0, z: -1 }),
    ],
    [
      // The avatar is on a single ladder at the top of a shaft; the climb
      // down is a drop of 1 past the ladder's foot.
      'the bottom of a ladder, floor 2 below',
      stateWithLampOut([['#.#'], ['#.#'], ['#.#'], ['###'], ['###']], { x: 1, y: 0, z: 0 }, [
        { x: 1, y: 0, z: 0 },
      ]),
    ],
    [
      'the bottom of a ladder, floor 3 below',
      stateWithLampOut([['#.#'], ['#.#'], ['#.#'], ['#.#'], ['###']], { x: 1, y: 0, z: 0 }, [
        { x: 1, y: 0, z: 0 },
      ]),
    ],
    [
      // A wider room, with edges on two sides of the avatar at once.
      'a ledge between two pits',
      stateWithLampOut(
        [
          ['#####', '.....', '#####'],
          ['#####', '.#.#.', '#####'],
          ['#####', '.#.#.', '#####'],
          ['#####', '##.#.', '#####'],
          ['#####', '#####', '#####'],
        ],
        { x: 1, y: 1, z: 0 },
      ),
    ],
  ];

  it.each(lampOutStates)(
    'changing an unrevealed cell does not change the action list: %s',
    (_name, state) => {
      expect(unrevealed(state, cellsThatChangeTheActionList(state))).toEqual([]);
    },
  );
});

// The rule itself (owner question 40): how far the avatar sees over an edge.
describe('looking over an edge (question 40)', () => {
  /** A 3 x 1 cube: the avatar at (0,0,0) beside a shaft `depth` cells deep at x = 1. */
  function shaftLayers(depth: number): string[][] {
    const layers: string[][] = [['..#']];
    for (let z = 1; z <= depth; z += 1) {
      layers.push(['#.#']);
    }
    layers.push(['###'], ['###']);
    return layers;
  }

  it('sees down to the first solid block, and no further', () => {
    const state = stateWithLampOut(shaftLayers(1), EDGE_AVATAR);
    // (1,0,1) is open, (1,0,2) is the floor of the shaft.
    expect(edgeLookCells(state)).toEqual([
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 2 },
    ]);
    expect(isRevealed(state, { x: 1, y: 0, z: 2 })).toBe(true);
    expect(isRevealed(state, { x: 1, y: 0, z: 3 })).toBe(false);
  });

  it('sees one cell past the longest drop a move may choose, and no further', () => {
    const lastSeen = AVATAR.maxChosenDropBlocks + 1;
    // A shaft much deeper than that.
    const state = stateWithLampOut(shaftLayers(lastSeen + 3), EDGE_AVATAR);
    expect(edgeLookCells(state)).toHaveLength(lastSeen);
    for (let z = 1; z <= lastSeen; z += 1) {
      expect(isRevealed(state, { x: 1, y: 0, z })).toBe(true);
    }
    expect(isRevealed(state, { x: 1, y: 0, z: lastSeen + 1 })).toBe(false);
    // The drop is too long to choose, so the walk is not offered.
    expect(findActions(state, { type: 'move' })).toEqual([]);
  });

  it('sees only straight down: the walls of the shaft stay unknown', () => {
    const state = stateWithLampOut(shaftLayers(2), EDGE_AVATAR);
    expect(isRevealed(state, { x: 1, y: 0, z: 2 })).toBe(true);
    expect(isRevealed(state, { x: 2, y: 0, z: 2 })).toBe(false);
    expect(isRevealed(state, { x: 0, y: 0, z: 2 })).toBe(false);
  });

  it('does not look under a solid neighbour', () => {
    // The avatar is in a one-cell pit: every sideways neighbour is solid.
    const state = stateWithLampOut([['#.#'], ['###'], ['###'], ['###']], { x: 1, y: 0, z: 0 });
    expect(edgeLookCells(state)).toEqual([]);
    expect(isRevealed(state, { x: 0, y: 0, z: 2 })).toBe(false);
    expect(isRevealed(state, { x: 2, y: 0, z: 2 })).toBe(false);
  });

  it('looks down its own column only when it is on a ladder', () => {
    // A shaft 4 deep at x = 1, the avatar in its top cell.
    const layers = [['#.#'], ['#.#'], ['#.#'], ['#.#'], ['###']];
    const top = { x: 1, y: 0, z: 0 };

    const onLadder = stateWithLampOut(layers, top, [top]);
    expect(edgeLookCells(onLadder)).toEqual([
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 2 },
      { x: 1, y: 0, z: 3 },
    ]);
    expect(isRevealed(onLadder, { x: 1, y: 0, z: 3 })).toBe(true);
    // The floor is 3 below the ladder's foot: too far, so no climb down.
    expect(findActions(onLadder, { type: 'move', to: { x: 1, y: 0, z: 1 } })).toEqual([]);

    // Without the ladder (the avatar is put there by hand; it would fall in
    // play) only light and reach reveal: one cell less.
    const noLadder = buildState({ layers, avatar: top, lampOil: 0 });
    updateReveal(noLadder, []);
    expect(edgeLookCells(noLadder)).toEqual([]);
    expect(isRevealed(noLadder, { x: 1, y: 0, z: 2 })).toBe(true);
    expect(isRevealed(noLadder, { x: 1, y: 0, z: 3 })).toBe(false);
  });

  it('emits a blockRevealed event for each cell seen over the edge', () => {
    const state = buildState({ layers: shaftLayers(2), avatar: EDGE_AVATAR, lampOil: 0 });
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
