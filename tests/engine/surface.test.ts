// The surface forest (issue #70; decision note 0020; design doc v0.2 section
// 3.2): trees hide the ground under them, any tree can be cut for timber, and
// trees grow back on stumps left alone for `SURFACE.regrowShifts` shifts,
// unless the square has been mined.
//
// Each test builds a small cube by hand. The surface is drawn with the
// characters of `SURFACE_CHARS` in helpers.ts: '.' meadow, 'T' tree,
// 's' stump, 'p' path, 'o' outcrop.

import { describe, expect, it } from 'vitest';
import { BLOCKS, SURFACE } from '../../src/data';
import {
  createRun,
  deserialise,
  endShift,
  hasStump,
  hasTree,
  isRevealed,
  knownSquare,
  previewCubePhase,
  serialise,
  shiftsUntilRegrowth,
  stumpAgeAt,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setBlock } from '../../src/engine/state';
import { act, buildState, findActions } from './helpers';

const TIMBER = SURFACE.cutTree.yields[0]?.count ?? 0;

/**
 * A 3 x 3 x 2 cube of dirt with coal under the east tree. Two trees, east and
 * south-east of the middle; the rest meadow.
 */
function forestState(overrides: Partial<Parameters<typeof buildState>[0]> = {}): GameState {
  return buildState({
    layers: [
      ['ddd', 'ddc', 'ddd'],
      ['ddd', 'ddd', 'ddd'],
    ],
    surface: ['...', '..T', '..T'],
    ...overrides,
  });
}

// The east tree's surface cell, and the layer-0 block under it.
const EAST = { x: 2, y: 1, z: -1 };
const UNDER_EAST = { x: 2, y: 1, z: 0 };

/** End `count` shifts in a row. */
function endShifts(state: GameState, count: number): GameState {
  let current = state;
  for (let i = 0; i < count; i += 1) {
    current = endShift(current).state;
  }
  return current;
}

/** The forest with the east tree cut, and fuel for many shifts. */
function cutEastTree(): GameState {
  return act(forestState({ fuel: 50 }), { type: 'cutTree', x: 2, y: 1 }).state;
}

describe('cutting a tree (design doc 3.2 and 4.1)', () => {
  it('is offered for every tree on the map, wherever it is, at its cost', () => {
    expect(findActions(forestState(), { type: 'cutTree' })).toEqual([
      { type: 'cutTree', x: 2, y: 1, ap: SURFACE.cutTree.ap },
      { type: 'cutTree', x: 2, y: 2, ap: SURFACE.cutTree.ap },
    ]);
  });

  it('is not offered where there is no tree, or with too little AP', () => {
    expect(findActions(forestState(), { type: 'cutTree', x: 0, y: 0 })).toEqual([]);
    const tired = forestState({ ap: SURFACE.cutTree.ap - 1 });
    expect(findActions(tired, { type: 'cutTree' })).toEqual([]);
  });

  it('leaves a stump, gives the timber, and shows the block under it', () => {
    const state = forestState();
    expect(isRevealed(state, UNDER_EAST)).toBe(false);
    const { state: after, events } = act(state, { type: 'cutTree', x: 2, y: 1 });
    expect(hasTree(after, EAST)).toBe(false);
    expect(hasStump(after, EAST)).toBe(true);
    expect(stumpAgeAt(after, EAST)).toBe(0);
    expect(after.stockpile).toEqual({ timber: TIMBER });
    expect(after.ap).toBe(state.ap - SURFACE.cutTree.ap);
    expect(events).toEqual([
      { type: 'treeCut', pos: EAST },
      { type: 'itemGained', item: 'timber', count: TIMBER },
      { type: 'blockRevealed', pos: UNDER_EAST, block: BLOCKS.coalSeam.code },
    ]);
    expect(knownSquare(after, 2, 1).top?.block).toBe(BLOCKS.coalSeam.code);
  });

  it('the timber goes into the stockpile, which has no limit (issue #92)', () => {
    // Far past the old carry capacity (10 stone filled it).
    const full = forestState({ stockpile: { stone: 500, timber: 300 } });
    const after = act(full, { type: 'cutTree', x: 2, y: 1 }).state;
    expect(after.stockpile).toEqual({ stone: 500, timber: 300 + TIMBER });
  });
});

describe('regrowth (design doc 3.2)', () => {
  const N = SURFACE.regrowShifts;

  it('a tree grows back at the end of the shift that makes N since the cut', () => {
    const almost = endShifts(cutEastTree(), N - 1);
    expect(hasStump(almost, EAST)).toBe(true);
    expect(stumpAgeAt(almost, EAST)).toBe(N - 1);
    const { state, events } = endShift(almost);
    expect(hasTree(state, EAST)).toBe(true);
    expect(stumpAgeAt(state, EAST)).toBe(0);
    expect(events).toContainEqual({ type: 'treeGrew', pos: EAST });
    // The square must be cut again before it can be mined; the block under
    // the tree stays known.
    expect(findActions(state, { type: 'mine', x: 2, y: 1 })).toEqual([]);
    expect(findActions(state, { type: 'cutTree', x: 2, y: 1 })).toHaveLength(1);
    expect(isRevealed(state, UNDER_EAST)).toBe(true);
  });

  it('happens after the cube phase and before upkeep', () => {
    const almost = endShifts(cutEastTree(), N - 1);
    const types = endShift(almost).events.map((event) => event.type);
    expect(types.indexOf('treeGrew')).toBeLessThan(types.indexOf('fuelChanged'));
  });

  it('a square that has been mined never grows a tree again', () => {
    // Owner: "Trees grow back if their spot isnt mined in a few turns".
    let state = cutEastTree();
    state = endShifts(state, 3);
    state = act(state, { type: 'mine', x: 2, y: 1 }).state;
    expect(hasStump(state, EAST)).toBe(false);
    expect(stumpAgeAt(state, EAST)).toBe(0);
    state = endShifts(state, N + 3);
    expect(hasTree(state, EAST)).toBe(false);
    expect(previewCubePhase(state).regrowth).toEqual([]);
  });

  it('rule 1: a stump whose ground was taken without a mine does not grow, and counts again from 0', () => {
    // A mine turns a stump to meadow (the test above). A hazard that takes
    // the layer-0 block (a slump, an explosion: tasks T8 and T11) does not,
    // so the stump is still there with no ground under it. No hazard is
    // built yet, so the block is taken by hand here (issue #88 item 3).
    let state = endShifts(cutEastTree(), 3);
    expect(stumpAgeAt(state, EAST)).toBe(3);
    setBlock(state, UNDER_EAST, BLOCKS.air.code);

    // With no ground the count goes back to 0 and stays there, however long.
    expect(shiftsUntilRegrowth(state, EAST)).toBeNull();
    state = endShift(state).state;
    expect(hasStump(state, EAST)).toBe(true);
    expect(stumpAgeAt(state, EAST)).toBe(0);
    state = endShifts(state, N + 3);
    expect(hasStump(state, EAST)).toBe(true);
    expect(hasTree(state, EAST)).toBe(false);
    expect(stumpAgeAt(state, EAST)).toBe(0);
    expect(previewCubePhase(state).regrowth).toEqual([]);

    // Ground again (rubble coming to rest, say; put there by hand): the
    // count starts from 0, so the tree takes the full N shifts.
    setBlock(state, UNDER_EAST, BLOCKS.rubble.code);
    expect(shiftsUntilRegrowth(state, EAST)).toBe(N);
    state = endShifts(state, N - 1);
    expect(hasStump(state, EAST)).toBe(true);
    expect(stumpAgeAt(state, EAST)).toBe(N - 1);
    expect(hasTree(endShift(state).state, EAST)).toBe(true);
  });

  it('nothing holds a tree back once its count is full: there are no loose items (issue #92)', () => {
    // Before issue #92 a pile of loose items on a stump made the tree wait.
    // Nothing can lie on a stump now; a full stockpile does not matter.
    const state = endShifts(cutEastTree(), N - 1);
    state.stockpile = { timber: 500, stone: 500 };
    expect(previewCubePhase(state).regrowth).toEqual([EAST]);
    expect(hasTree(endShift(state).state, EAST)).toBe(true);
  });

  it('paths, meadows and outcrops never grow trees', () => {
    const state = forestState({ surface: ['p.o', '...', '...'], fuel: 50 });
    const later = endShifts(state, N + 2);
    expect(Array.from(later.surface)).toEqual(Array.from(state.surface));
  });

  it('the forecast says where a tree will grow, and it does', () => {
    const almost = endShifts(cutEastTree(), N - 1);
    expect(previewCubePhase(almost).regrowth).toEqual([EAST]);
    expect(previewCubePhase(endShifts(cutEastTree(), N - 2)).regrowth).toEqual([]);
    expect(hasTree(endShift(almost).state, EAST)).toBe(true);
  });
});

describe('the surface in saves (issue #70)', () => {
  it('a save keeps the surface and the stumps', () => {
    const state = endShifts(cutEastTree(), 4);
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
