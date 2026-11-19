// The surface forest (issue #70; decision note 0020): trees block walking and
// hide the ground under them, the miner cuts them for timber, and they grow
// back on stumps left alone for `SURFACE.regrowShifts` shifts.
//
// Each test builds a small cube by hand. The surface is drawn with the
// characters of `SURFACE_CHARS` in helpers.ts: '.' meadow, 'T' tree,
// 's' stump, 'p' path, 'o' outcrop.

import { describe, expect, it } from 'vitest';
import { BLOCKS, ITEMS, SURFACE } from '../../src/data';
import {
  carryCapacity,
  createRun,
  deserialise,
  endShift,
  hasStump,
  hasTree,
  isRevealed,
  previewCubePhase,
  serialise,
  stumpAgeAt,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { act, buildState, findActions } from './helpers';

const TIMBER = SURFACE.cutTree.yields[0]?.count ?? 0;

/**
 * A 3 x 3 x 2 cube of dirt, the miner on the surface in the middle, a tree
 * east of it and a tree south-east of it (diagonal), the rest meadow.
 * Reveal is run once, as `createRun` does.
 */
function forestState(overrides: Partial<Parameters<typeof buildState>[0]> = {}): GameState {
  const state = buildState({
    layers: [
      ['ddd', 'ddc', 'ddd'],
      ['ddd', 'ddd', 'ddd'],
    ],
    surface: ['...', '..T', '..T'],
    avatar: { x: 1, y: 1, z: -1 },
    ...overrides,
  });
  updateReveal(state, []);
  return state;
}

const EAST = { x: 2, y: 1, z: -1 };
const SOUTH_EAST = { x: 2, y: 2, z: -1 };
const UNDER_EAST = { x: 2, y: 1, z: 0 };
const UNDER_SOUTH_EAST = { x: 2, y: 2, z: 0 };

describe('a tree hides the ground under it (issue #70 item 1)', () => {
  it('daylight, the lamp and the pick do not reveal the block under a tree', () => {
    const state = forestState();
    expect(isRevealed(state, UNDER_EAST)).toBe(false);
    expect(isRevealed(state, UNDER_SOUTH_EAST)).toBe(false);
    // The rest of the top layer is in daylight.
    expect(isRevealed(state, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(isRevealed(state, { x: 1, y: 2, z: 0 })).toBe(true);
  });

  it('nor does it with the lamp out', () => {
    const state = forestState({ lampOil: 0 });
    expect(isRevealed(state, UNDER_EAST)).toBe(false);
  });

  it('from underground, the block beside an open cell is revealed as usual', () => {
    // The miner stands in a hole in layer 0 beside the ground under a tree:
    // light from its own cell shows it (seen from the side, not from above).
    const state = forestState({
      layers: [
        ['ddd', 'd.c', 'ddd'],
        ['ddd', 'ddd', 'ddd'],
      ],
      avatar: { x: 1, y: 1, z: 0 },
    });
    expect(isRevealed(state, UNDER_EAST)).toBe(true);
  });
});

describe('a tree blocks walking (issue #70 items 1 and 4)', () => {
  it('a walk into a tree is not offered; walks onto open ground are', () => {
    const state = forestState();
    expect(findActions(state, { type: 'move', to: EAST })).toEqual([]);
    expect(findActions(state, { type: 'move', to: { x: 0, y: 1, z: -1 } })).toHaveLength(1);
  });

  it('from a hole, the way out is straight up, never diagonally into a tree (issue #80)', () => {
    // A hole at (1, 1, 0) under a meadow: the miner stands in it. The tree
    // east of the cell above is not a face neighbour, so it is no way out;
    // the meadow straight above is.
    const state = forestState({
      layers: [
        ['ddd', 'd.d', 'ddd'],
        ['ddd', 'ddd', 'ddd'],
      ],
      avatar: { x: 1, y: 1, z: 0 },
    });
    expect(findActions(state, { type: 'move', to: EAST })).toEqual([]);
    expect(findActions(state, { type: 'move', to: { x: 0, y: 1, z: -1 } })).toEqual([]);
    expect(findActions(state, { type: 'move', to: { x: 1, y: 1, z: -1 } })).toHaveLength(1);
  });

  it('a tree over a hole dug under it from the side is a roof: no move up out of it', () => {
    // The miner stands at (2, 1, 0), under the east tree, in a hole dug from
    // the hole at (1, 1, 0). The tree overhead blocks the move up (review of
    // PR #72; issue #80).
    const state = forestState({
      layers: [
        ['ddd', 'd..', 'ddd'],
        ['ddd', 'ddd', 'ddd'],
      ],
      surface: ['...', '..T', '...'],
      avatar: { x: 2, y: 1, z: 0 },
    });
    expect(findActions(state, { type: 'move', to: EAST })).toEqual([]);
    // Back west into the hole, from where the move up is offered.
    const west = act(state, { type: 'move', to: { x: 1, y: 1, z: 0 } }).state;
    expect(findActions(west, { type: 'move', to: { x: 1, y: 1, z: -1 } })).toHaveLength(1);
  });

  it('a cut tree leaves a stump, which can be walked on', () => {
    const { state } = act(forestState(), { type: 'cutTree', target: EAST });
    expect(findActions(state, { type: 'move', to: EAST })).toHaveLength(1);
  });
});

describe('cutting a tree (issue #70 item 3)', () => {
  it('is offered for a tree beside the miner, in the four directions only, at its cost', () => {
    const state = forestState();
    const cuts = findActions(state, { type: 'cutTree' });
    // East only: the tree south-east is diagonal.
    expect(cuts).toEqual([{ type: 'cutTree', target: EAST, ap: SURFACE.cutTree.ap }]);
    expect(findActions(state, { type: 'cutTree', target: SOUTH_EAST })).toEqual([]);
  });

  it('is not offered underground', () => {
    const state = forestState({
      layers: [
        ['ddd', 'd.d', 'ddd'],
        ['ddd', 'ddd', 'ddd'],
      ],
      avatar: { x: 1, y: 1, z: 0 },
    });
    expect(findActions(state, { type: 'cutTree' })).toEqual([]);
  });

  it('is not offered with too little AP', () => {
    const state = forestState({ ap: SURFACE.cutTree.ap - 1 });
    expect(findActions(state, { type: 'cutTree' })).toEqual([]);
  });

  it('leaves a stump, gives the timber, and reveals the ground under it', () => {
    const before = forestState();
    const { state, events } = act(before, { type: 'cutTree', target: EAST });
    expect(hasTree(state, EAST)).toBe(false);
    expect(hasStump(state, EAST)).toBe(true);
    expect(stumpAgeAt(state, EAST)).toBe(0);
    expect(state.ap).toBe(before.ap - SURFACE.cutTree.ap);
    expect(state.inventory['timber']).toBe(TIMBER);
    expect(isRevealed(state, UNDER_EAST)).toBe(true);
    expect(events).toContainEqual({ type: 'treeCut', pos: EAST });
    expect(events).toContainEqual({ type: 'itemGained', item: 'timber', count: TIMBER });
    expect(events).toContainEqual({
      type: 'blockRevealed',
      pos: UNDER_EAST,
      block: BLOCKS.coalSeam.code,
    });
  });

  it('leaves timber too heavy to carry lying on the stump, as mining does', () => {
    // A pack full of stone: the timber does not fit.
    const full = Math.floor(carryCapacity() / ITEMS.stone.weight);
    const { state, events } = act(forestState({ inventory: { stone: full } }), {
      type: 'cutTree',
      target: EAST,
    });
    expect(state.inventory['timber'] ?? 0).toBe(0);
    expect(state.looseItems).toEqual([{ pos: EAST, item: 'timber', count: TIMBER }]);
    expect(events).toContainEqual({ type: 'itemLeft', pos: EAST, item: 'timber', count: TIMBER });
  });
});

describe('mining down under a tree (issue #70 item 4)', () => {
  it('is not offered from the surface, even when the block under the tree is known', () => {
    // Make the ground under the trees known (a regrown tree stands over
    // ground the miner remembers). Since issue #75 the pick reaches only the
    // block underfoot from the surface, and the miner never stands in a tree.
    const state = forestState();
    state.revealed[2 + 3 * 2] = 1;
    state.revealed[2 + 3 * 1] = 1;
    expect(findActions(state, { type: 'mine', target: UNDER_SOUTH_EAST })).toEqual([]);
    expect(findActions(state, { type: 'mine', target: UNDER_EAST })).toEqual([]);
    // Only the block underfoot.
    expect(findActions(state, { type: 'mine' })).toEqual([
      { type: 'mine', target: { x: 1, y: 1, z: 0 }, ap: 1 },
    ]);
  });

  it('is offered from the stump once the tree is cut: walk onto it and dig down', () => {
    let state = act(forestState(), { type: 'cutTree', target: EAST }).state;
    state = act(state, { type: 'move', to: EAST }).state;
    expect(findActions(state, { type: 'mine', target: UNDER_EAST })).toHaveLength(1);
  });

  it('from underground the block under a tree is mined like any other', () => {
    const state = forestState({
      layers: [
        ['ddd', 'd.c', 'ddd'],
        ['ddd', 'ddd', 'ddd'],
      ],
      avatar: { x: 1, y: 1, z: 0 },
    });
    expect(findActions(state, { type: 'mine', target: UNDER_EAST })).toHaveLength(1);
  });
});

/** End `count` shifts in a row. */
function endShifts(start: GameState, count: number): GameState {
  let state = start;
  for (let i = 0; i < count; i += 1) {
    state = endShift(state).state;
  }
  return state;
}

/**
 * Walk onto the stump east of the miner, dig out the ground under it (a safe
 * one-block drop, issue #75), and step back up west, off the stump.
 */
function digUnderEastStump(start: GameState): GameState {
  let state = act(start, { type: 'move', to: EAST }).state;
  state = act(state, { type: 'mine', target: UNDER_EAST }).state;
  state = endShift(state).state; // fresh AP
  // Digging down put the miner in the hole: up out of it, then back west.
  state = act(state, { type: 'move', to: EAST }).state;
  return act(state, { type: 'move', to: { x: 1, y: 1, z: -1 } }).state;
}

/** The forest state with the east tree cut; the miner stays beside the stump. */
function cutBesideMiner(overrides: Partial<Parameters<typeof buildState>[0]> = {}): GameState {
  let state = forestState({ fuel: 50, ...overrides });
  state = act(state, { type: 'cutTree', target: EAST }).state;
  return state;
}

describe('regrowth (issue #70 item 5)', () => {
  const N = SURFACE.regrowShifts;

  it('a tree grows back at the end of the shift that makes N since the cut', () => {
    const cut = cutBesideMiner();
    const almost = endShifts(cut, N - 1);
    expect(hasStump(almost, EAST)).toBe(true);
    expect(stumpAgeAt(almost, EAST)).toBe(N - 1);
    const { state, events } = endShift(almost);
    expect(hasTree(state, EAST)).toBe(true);
    expect(stumpAgeAt(state, EAST)).toBe(0);
    expect(events).toContainEqual({ type: 'treeGrew', pos: EAST });
    // It blocks the way again; the ground under it stays known.
    expect(findActions(state, { type: 'move', to: EAST })).toEqual([]);
    expect(isRevealed(state, UNDER_EAST)).toBe(true);
    expect(findActions(state, { type: 'mine', target: UNDER_EAST })).toEqual([]);
  });

  it('happens after the cube phase and before upkeep', () => {
    const almost = endShifts(cutBesideMiner(), N - 1);
    const types = endShift(almost).events.map((event) => event.type);
    expect(types.indexOf('treeGrew')).toBeLessThan(types.indexOf('fuelChanged'));
  });

  it('waits while the miner stands on the stump, and grows once it is clear', () => {
    let state = cutBesideMiner();
    state = act(state, { type: 'move', to: EAST }).state; // onto the stump
    state = endShifts(state, N + 2);
    expect(hasStump(state, EAST)).toBe(true);
    expect(stumpAgeAt(state, EAST)).toBe(N);
    state = act(state, { type: 'move', to: { x: 1, y: 1, z: -1 } }).state; // off it
    const { state: after, events } = endShift(state);
    expect(hasTree(after, EAST)).toBe(true);
    expect(events).toContainEqual({ type: 'treeGrew', pos: EAST });
  });

  it('waits while loose items lie on the stump', () => {
    let state = cutBesideMiner();
    state = act(state, { type: 'move', to: EAST }).state;
    state = act(state, { type: 'drop', item: 'timber', count: TIMBER }).state;
    state = act(state, { type: 'move', to: { x: 1, y: 1, z: -1 } }).state;
    state = endShifts(state, N + 1);
    expect(hasStump(state, EAST)).toBe(true);
    // Picked up again: the tree grows at the next end of shift.
    state = act(state, { type: 'pickUp', from: EAST, item: 'timber' }).state;
    expect(hasTree(endShift(state).state, EAST)).toBe(true);
  });

  it('does not happen while the ground under the stump is mined out, and the count starts again', () => {
    let state = cutBesideMiner();
    state = endShifts(state, 3);
    expect(stumpAgeAt(state, EAST)).toBe(3);
    state = digUnderEastStump(state);
    state = endShifts(state, N + 3);
    expect(hasStump(state, EAST)).toBe(true);
    expect(stumpAgeAt(state, EAST)).toBe(0);
  });

  it('counts again from the start once the stump has ground again', () => {
    // A stump over a hole, then the hole is filled (as rubble or sealant
    // would): N more shifts, not fewer.
    let state = cutBesideMiner();
    state = digUnderEastStump(state); // ends one shift
    state = endShifts(state, 1);
    state.blocks[2 + 3 * 1] = BLOCKS.dirt.code; // ground again, put in by hand
    state = endShifts(state, N - 1);
    expect(hasStump(state, EAST)).toBe(true);
    expect(hasTree(endShift(state).state, EAST)).toBe(true);
  });

  it('paths, meadows and outcrops never grow trees', () => {
    const state = forestState({ surface: ['p.o', '...', '...'], fuel: 50 });
    const later = endShifts(state, N + 2);
    expect(Array.from(later.surface)).toEqual(Array.from(state.surface));
  });

  it('the forecast says where a tree will grow, and it does', () => {
    const almost = endShifts(cutBesideMiner(), N - 1);
    expect(previewCubePhase(almost).regrowth).toEqual([EAST]);
    expect(previewCubePhase(endShifts(cutBesideMiner(), N - 2)).regrowth).toEqual([]);
    // With the miner on the stump, no tree is forecast.
    const standing = act(almost, { type: 'move', to: EAST }).state;
    expect(previewCubePhase(standing).regrowth).toEqual([]);
  });
});

describe('the surface in saves (issue #70)', () => {
  it('a save keeps the surface and the stumps', () => {
    const state = endShifts(cutBesideMiner(), 4);
    const loaded = deserialise(JSON.parse(JSON.stringify(serialise(state))));
    expect(Array.from(loaded.surface)).toEqual(Array.from(state.surface));
    expect(Array.from(loaded.stumpAge)).toEqual(Array.from(state.stumpAge));
    expect(stumpAgeAt(loaded, EAST)).toBe(4);
  });

  it('a new run has a forest', () => {
    const state = createRun(7, 'none', 'standard');
    expect(Array.from(state.surface).some((code) => code === SURFACE.kinds.tree.code)).toBe(true);
  });
});
