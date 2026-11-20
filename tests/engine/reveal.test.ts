// What the player knows (design doc v0.2 section 3.4; decision notes 0025 and
// 0026; issue #86): every square's top block, except under a tree; nothing
// below a top. There is no light any more.

import { describe, expect, it } from 'vitest';
import { BLOCKS, SURFACE } from '../../src/data';
import { createRun, endShift, hasTree, isRevealed, knownSquare } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { setSurfaceKind } from '../../src/engine/surface/state';
import { act, buildState } from './helpers';

/** Run `updateReveal` on `state` (changing it) and return the events. */
function reveal(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  updateReveal(state, events);
  return events;
}

/** How many cells of layer `z` are revealed. */
function revealedInLayer(state: GameState, z: number): number {
  let count = 0;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      if (isRevealed(state, { x, y, z })) {
        count += 1;
      }
    }
  }
  return count;
}

describe('every top block is known', () => {
  it('reveals the top block of every square of a flat cube, and nothing under it', () => {
    const state = buildState({
      layers: [['#d'], ['ci'], ['##']],
      revealTops: false,
    });
    expect(revealedInLayer(state, 0)).toBe(0);
    const events = reveal(state);
    // In the order the cube stores cells.
    expect(events).toEqual([
      { type: 'blockRevealed', pos: { x: 0, y: 0, z: 0 }, block: BLOCKS.stone.code },
      { type: 'blockRevealed', pos: { x: 1, y: 0, z: 0 }, block: BLOCKS.dirt.code },
    ]);
    expect(revealedInLayer(state, 1)).toBe(0);
    expect(revealedInLayer(state, 2)).toBe(0);
  });

  it('in a pit, reveals the top block and the open cells above it', () => {
    // The east square is 2 levels down.
    const state = buildState({ layers: [['#.'], ['#.'], ['#c']], revealTops: false });
    reveal(state);
    expect(isRevealed(state, { x: 1, y: 0, z: 0 })).toBe(true);
    expect(isRevealed(state, { x: 1, y: 0, z: 1 })).toBe(true);
    expect(isRevealed(state, { x: 1, y: 0, z: 2 })).toBe(true);
    // The west square: its top only.
    expect(isRevealed(state, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(isRevealed(state, { x: 0, y: 0, z: 1 })).toBe(false);
  });

  it('does not look past the first solid block: an open space under it stays unknown', () => {
    const state = buildState({ layers: [['#'], ['.'], ['#']], revealTops: false });
    reveal(state);
    expect(isRevealed(state, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(isRevealed(state, { x: 0, y: 0, z: 1 })).toBe(false);
    expect(isRevealed(state, { x: 0, y: 0, z: 2 })).toBe(false);
  });

  it('copes with a square that has no block left', () => {
    const state = buildState({ layers: [['.#'], ['.#']], revealTops: false });
    reveal(state);
    expect(isRevealed(state, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(isRevealed(state, { x: 0, y: 0, z: 1 })).toBe(true);
    expect(knownSquare(state, 0, 0)).toMatchObject({ depth: 2, top: null });
  });

  it('reports each newly known cell once, and nothing when nothing is new', () => {
    const state = buildState({ layers: [['##'], ['##']], revealTops: false });
    expect(reveal(state)).toHaveLength(2);
    expect(reveal(state)).toEqual([]);
  });
});

describe('through play', () => {
  it('a mine reveals exactly the new top block', () => {
    const state = buildState({ layers: [['###'], ['#c#'], ['###']] });
    const { state: after, events } = act(state, { type: 'mine', x: 1, y: 0 });
    const reveals = events.filter((event) => event.type === 'blockRevealed');
    expect(reveals).toEqual([
      { type: 'blockRevealed', pos: { x: 1, y: 0, z: 1 }, block: BLOCKS.coalSeam.code },
    ]);
    expect(revealedInLayer(after, 1)).toBe(1);
    expect(revealedInLayer(after, 2)).toBe(0);
  });

  it('ending a shift reveals nothing new on a quiet map', () => {
    const state = buildState({ layers: [['###'], ['###']] });
    const reveals = endShift(state).events.filter((event) => event.type === 'blockRevealed');
    expect(reveals).toEqual([]);
  });
});

describe('trees hide their ground (design doc 3.2 and 3.4)', () => {
  function treeState(): GameState {
    return buildState({ layers: [['#c#'], ['###']], surface: ['.T.'] });
  }

  it('the block under a tree is not known, and the squares beside it are', () => {
    const state = treeState();
    expect(isRevealed(state, { x: 1, y: 0, z: 0 })).toBe(false);
    expect(isRevealed(state, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(isRevealed(state, { x: 2, y: 0, z: 0 })).toBe(true);
    expect(knownSquare(state, 1, 0)).toMatchObject({ depth: 0, tree: true, top: null });
  });

  it('stays unknown when the squares beside it are dug (question 92)', () => {
    let state = treeState();
    state = act(state, { type: 'mine', x: 0, y: 0 }).state;
    state = act(state, { type: 'mine', x: 2, y: 0 }).state;
    expect(isRevealed(state, { x: 1, y: 0, z: 0 })).toBe(false);
  });

  it('cutting the tree shows the block', () => {
    const { state: after, events } = act(treeState(), { type: 'cutTree', x: 1, y: 0 });
    expect(isRevealed(after, { x: 1, y: 0, z: 0 })).toBe(true);
    expect(events).toContainEqual({
      type: 'blockRevealed',
      pos: { x: 1, y: 0, z: 0 },
      block: BLOCKS.coalSeam.code,
    });
    expect(knownSquare(after, 1, 0).top?.block).toBe(BLOCKS.coalSeam.code);
  });

  it('a tree that grows back hides the block on the map, but the block stays known', () => {
    const state = act(treeState(), { type: 'cutTree', x: 1, y: 0 }).state;
    // Put the tree back by hand, as regrowth does after `SURFACE.regrowShifts`.
    setSurfaceKind(state, { x: 1, y: 0, z: -1 }, SURFACE.kinds.tree.code);
    expect(reveal(state)).toEqual([]);
    expect(isRevealed(state, { x: 1, y: 0, z: 0 })).toBe(true);
    const square = knownSquare(state, 1, 0);
    expect(square.tree).toBe(true);
    expect(square.top?.block).toBe(BLOCKS.coalSeam.code);
  });
});

describe('a new run (owner, issue #82: "Whole surface")', () => {
  it('knows the top block of every square without a tree, and nothing else', () => {
    const state = createRun(7, 'none', 'standard');
    let openGround = 0;
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const tree = hasTree(state, { x, y, z: -1 });
        expect(isRevealed(state, { x, y, z: 0 })).toBe(!tree);
        if (!tree) {
          openGround += 1;
        }
      }
    }
    // Everything revealed is one of those top blocks.
    const revealedCells = state.revealed.reduce((sum, flag) => sum + flag, 0);
    expect(revealedCells).toBe(openGround);
    expect(openGround).toBeGreaterThan(0);
  });
});
