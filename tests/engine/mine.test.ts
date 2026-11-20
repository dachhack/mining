// Scenario tests for mining by square (design doc v0.2 section 4.2; decision
// notes 0025 and 0026; issue #86).
//
// There is no miner: the player names a square (x, y) and its top block is
// removed. Each test builds a small cube by hand; see helpers.ts for the
// characters ('#' stone, 'd' dirt, 'H' hard rock, 'c' coal, 'i' iron ore,
// '.' open, 'R' rubble) and for the surface characters ('T' tree, 's' stump).

import { describe, expect, it } from 'vitest';
import { BLOCKS, SURFACE } from '../../src/data';
import {
  applyAction,
  blockAt,
  depthAt,
  hashState,
  isRevealed,
  legalActions,
  mineCheck,
  surfaceKindAt,
} from '../../src/engine';
import type { Action, GameState } from '../../src/engine';
import { act, buildState, findActions, layerText } from './helpers';

/** The AP it costs to mine a block of this kind. Throws for bedrock and open space, which have none. */
function costOf(
  blockId: 'stone' | 'dirt' | 'hardRock' | 'coalSeam' | 'ironOre' | 'rubble',
): number {
  const cost = BLOCKS[blockId].mineCost;
  if (cost === null) {
    throw new Error(`${blockId} cannot be mined`);
  }
  return cost;
}

/** A flat 3 x 3 x 3 cube: mixed rock on top, hard rock with iron under it, stone below. */
function flatCube(overrides: Partial<Parameters<typeof buildState>[0]> = {}): GameState {
  return buildState({
    layers: [
      ['###', '#c#', 'd##'], // z = 0
      ['HHH', 'HiH', 'HHH'], // z = 1
      ['###', '###', '###'], // z = 2
    ],
    ap: 100, // enough that AP is not what a test is about
    ...overrides,
  });
}

/** Mine the square (x, y) and return the new state. */
function mine(state: GameState, x: number, y: number): GameState {
  return act(state, { type: 'mine', x, y }).state;
}

/** The largest difference in depth between any two face neighbours. */
function steepestStep(state: GameState): number {
  let steepest = 0;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      if (x + 1 < state.size.x) {
        steepest = Math.max(steepest, Math.abs(depthAt(state, x, y) - depthAt(state, x + 1, y)));
      }
      if (y + 1 < state.size.y) {
        steepest = Math.max(steepest, Math.abs(depthAt(state, x, y) - depthAt(state, x, y + 1)));
      }
    }
  }
  return steepest;
}

describe('which squares can be mined', () => {
  it('offers every square of a flat cube, row by row, at the cost of its top block', () => {
    const stone = costOf('stone');
    const coal = costOf('coalSeam');
    const dirt = costOf('dirt');
    expect(findActions(flatCube(), { type: 'mine' })).toEqual([
      { type: 'mine', x: 0, y: 0, ap: stone },
      { type: 'mine', x: 1, y: 0, ap: stone },
      { type: 'mine', x: 2, y: 0, ap: stone },
      { type: 'mine', x: 0, y: 1, ap: stone },
      { type: 'mine', x: 1, y: 1, ap: coal },
      { type: 'mine', x: 2, y: 1, ap: stone },
      { type: 'mine', x: 0, y: 2, ap: dirt },
      { type: 'mine', x: 1, y: 2, ap: stone },
      { type: 'mine', x: 2, y: 2, ap: stone },
    ]);
  });

  it('has no reach: with one square dug, every other square is still offered', () => {
    const state = mine(flatCube(), 0, 0);
    const squares = findActions(state, { type: 'mine' }).map((action) =>
      action.type === 'mine' ? `${action.x},${action.y}` : '',
    );
    // All but (0, 0) itself, which the level rule now refuses.
    expect(squares).toEqual(['1,0', '2,0', '0,1', '1,1', '2,1', '0,2', '1,2', '2,2']);
  });

  it('mineCheck throws for a square the cube does not have', () => {
    expect(() => mineCheck(flatCube(), 3, 0)).toThrow('not a square');
    expect(() => mineCheck(flatCube(), 0, -1)).toThrow('not a square');
  });
});

describe('what a mine does', () => {
  it('removes the top block, lowers the square by 1, gives the yield and shows the new top', () => {
    const state = flatCube();
    const before = hashState(state);
    const { state: after, events } = act(state, { type: 'mine', x: 1, y: 1 });

    expect(depthAt(after, 1, 1)).toBe(1);
    expect(layerText(after, 0)).toEqual(['###', '#.#', 'd##']);
    expect(after.inventory).toEqual({ coal: 1 });
    expect(after.ap).toBe(100 - costOf('coalSeam'));
    expect(events).toEqual([
      { type: 'blockMined', pos: { x: 1, y: 1, z: 0 }, block: BLOCKS.coalSeam.code },
      { type: 'itemGained', item: 'coal', count: 1 },
      // The block under it is the new top, and is seen for the first time.
      { type: 'blockRevealed', pos: { x: 1, y: 1, z: 1 }, block: BLOCKS.ironOre.code },
    ]);
    // The state passed in is untouched.
    expect(hashState(state)).toBe(before);
  });

  it('reveals nothing but the new top block', () => {
    const after = mine(flatCube(), 1, 1);
    expect(isRevealed(after, { x: 1, y: 1, z: 1 })).toBe(true);
    // Not the block under the new top, and not its neighbours in layer 1.
    expect(isRevealed(after, { x: 1, y: 1, z: 2 })).toBe(false);
    expect(isRevealed(after, { x: 0, y: 1, z: 1 })).toBe(false);
    expect(isRevealed(after, { x: 1, y: 0, z: 1 })).toBe(false);
  });

  it('gives nothing for a block with no yield (dirt)', () => {
    const { state: after, events } = act(flatCube(), { type: 'mine', x: 0, y: 2 });
    expect(after.inventory).toEqual({});
    // The hard rock under it is 2 steps from the iron ore: it shows traces.
    expect(events.map((event) => event.type)).toEqual([
      'blockMined',
      'blockRevealed',
      'mineralTracesSeen',
    ]);
  });

  it('does not enforce the carry limit (decision note 0026)', () => {
    // 10 stone weigh 20, the carry capacity. The 11th still goes in, and
    // nothing is left loose on the map.
    const state = flatCube({ inventory: { stone: 10 } });
    const { state: after, events } = act(state, { type: 'mine', x: 0, y: 0 });
    expect(after.inventory).toEqual({ stone: 11 });
    expect(after.looseItems).toEqual([]);
    expect(events).toContainEqual({ type: 'itemGained', item: 'stone', count: 1 });
  });
});

describe('AP cost (0005 item 12)', () => {
  it('is the mine cost of the top block, from the data', () => {
    const state = flatCube();
    expect(mineCheck(state, 0, 2).ap).toBe(costOf('dirt'));
    expect(mineCheck(state, 0, 0).ap).toBe(costOf('stone'));
    // Dig the whole top layer away.
    let dug = state;
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        dug = mine(dug, x, y);
      }
    }
    expect(mineCheck(dug, 0, 0).ap).toBe(costOf('hardRock'));
    expect(mineCheck(dug, 1, 1).ap).toBe(costOf('ironOre'));
  });

  it('a block that costs more AP than is left is not offered this shift', () => {
    // 1 AP: only the dirt square (cost 1) can be mined.
    expect(costOf('dirt')).toBe(1);
    const state = flatCube({ ap: 1 });
    expect(findActions(state, { type: 'mine' })).toEqual([{ type: 'mine', x: 0, y: 2, ap: 1 }]);
    const stone: Action = { type: 'mine', x: 0, y: 0, ap: costOf('stone') };
    expect(() => applyAction(state, stone)).toThrow('Not a legal action');
    // The rules allow it; only the AP is missing. `mineCheck` says so.
    expect(mineCheck(state, 0, 0)).toEqual({
      allowed: true,
      refusal: null,
      higherNeighbours: [],
      ap: costOf('stone'),
    });
  });
});

describe('the level rule (design doc 4.2, [Decided]: after mining, at most 1 step)', () => {
  it('refuses a second mine of a square whose neighbours are all higher, and says which', () => {
    const state = mine(flatCube(), 1, 1);
    expect(mineCheck(state, 1, 1)).toEqual({
      allowed: false,
      refusal: 'neighbourHigher',
      higherNeighbours: [
        { direction: 'north', x: 1, y: 0, depth: 0 },
        { direction: 'east', x: 2, y: 1, depth: 0 },
        { direction: 'south', x: 1, y: 2, depth: 0 },
        { direction: 'west', x: 0, y: 1, depth: 0 },
      ],
      ap: null,
    });
    expect(findActions(state, { type: 'mine', x: 1, y: 1 })).toEqual([]);
  });

  it('a refused mine changes nothing', () => {
    const state = mine(flatCube(), 1, 1);
    const before = hashState(state);
    const again: Action = { type: 'mine', x: 1, y: 1, ap: costOf('ironOre') };
    expect(() => applyAction(state, again)).toThrow('Not a legal action');
    expect(hashState(state)).toBe(before);
    expect(depthAt(state, 1, 1)).toBe(1);
    expect(state.ap).toBe(100 - costOf('coalSeam'));
  });

  it('allows it again once the four face neighbours are level; diagonals do not count', () => {
    let state = mine(flatCube(), 1, 1);
    // Three of the four: still refused, and only the fourth is named.
    state = mine(state, 1, 0);
    state = mine(state, 2, 1);
    state = mine(state, 1, 2);
    expect(mineCheck(state, 1, 1).higherNeighbours).toEqual([
      { direction: 'west', x: 0, y: 1, depth: 0 },
    ]);
    state = mine(state, 0, 1);
    // The four corners are still at depth 0: they are not face neighbours.
    expect(depthAt(state, 0, 0)).toBe(0);
    expect(mineCheck(state, 1, 1).allowed).toBe(true);
    state = mine(state, 1, 1);
    expect(depthAt(state, 1, 1)).toBe(2);
    expect(steepestStep(state)).toBe(1);
  });

  it('ignores the wall round the cube: a corner square has only 2 neighbours', () => {
    let state = mine(flatCube(), 0, 0);
    expect(mineCheck(state, 0, 0).higherNeighbours.map((n) => n.direction)).toEqual([
      'east',
      'south',
    ]);
    state = mine(mine(state, 1, 0), 0, 1);
    expect(mineCheck(state, 0, 0).allowed).toBe(true);
  });

  it('holds after every mine of a long greedy dig', () => {
    // Always mine the first legal square in the list: 60 mines.
    let state = flatCube({ ap: 1000 });
    for (let step = 0; step < 60; step += 1) {
      const first = findActions(state, { type: 'mine' })[0];
      if (first === undefined) {
        break;
      }
      state = applyAction(state, first).state;
      expect(steepestStep(state)).toBeLessThanOrEqual(1);
    }
  });
});

describe('the bottom of the cube', () => {
  it('a square with no block left cannot be mined, and the rest of the cube can', () => {
    let state = buildState({ layers: [['##']], ap: 100 });
    state = mine(state, 0, 0);
    expect(depthAt(state, 0, 0)).toBe(1); // the whole column is gone
    expect(mineCheck(state, 0, 0)).toEqual({
      allowed: false,
      refusal: 'bottom',
      higherNeighbours: [],
      ap: null,
    });
    expect(findActions(state, { type: 'mine' })).toEqual([
      { type: 'mine', x: 1, y: 0, ap: costOf('stone') },
    ]);
    // Mining everything away leaves no mine at all; the run goes on.
    state = mine(state, 1, 0);
    expect(findActions(state, { type: 'mine' })).toEqual([]);
    expect(legalActions(state).map((action) => action.type)).toEqual(['leave']);
  });
});

describe('trees (design doc 3.2 and 4.2)', () => {
  it('a square with a tree cannot be mined: cut it first', () => {
    const state = flatCube({ surface: ['...', '.T.', '...'] });
    expect(mineCheck(state, 1, 1)).toEqual({
      allowed: false,
      refusal: 'tree',
      higherNeighbours: [],
      ap: null,
    });
    expect(findActions(state, { type: 'mine', x: 1, y: 1 })).toEqual([]);
    const cut = act(state, { type: 'cutTree', x: 1, y: 1 }).state;
    expect(mineCheck(cut, 1, 1).allowed).toBe(true);
  });

  it('mining a stump square removes the stump for good', () => {
    const state = flatCube({ surface: ['...', '.s.', '...'] });
    const after = mine(state, 1, 1);
    expect(surfaceKindAt(after, { x: 1, y: 1, z: -1 })).toBe(SURFACE.kinds.meadow.code);
  });
});

describe('breaking into an open space (decision note 0026, until task T9)', () => {
  // The middle column, from the top: stone, two open cells, stone, stone.
  //        x  0 1 2
  //   z=0     # # #
  //   z=1     # . #
  //   z=2     # . #
  //   z=3     # # #
  //   z=4     # # #
  function cavernCube(): GameState {
    return buildState({
      layers: [['###'], ['#.#'], ['#.#'], ['###'], ['###']],
      ap: 100,
    });
  }

  it('the open cells directly below fill with rubble, so the square drops exactly 1', () => {
    const { state: after, events } = act(cavernCube(), { type: 'mine', x: 1, y: 0 });
    expect(depthAt(after, 1, 0)).toBe(1);
    expect(layerText(after, 1)).toEqual(['#R#']);
    expect(layerText(after, 2)).toEqual(['#R#']);
    expect(layerText(after, 3)).toEqual(['###']); // the floor of the space is as it was
    expect(steepestStep(after)).toBe(1);
    expect(events).toEqual([
      { type: 'blockMined', pos: { x: 1, y: 0, z: 0 }, block: BLOCKS.stone.code },
      { type: 'itemGained', item: 'stone', count: 1 },
      { type: 'roofCollapsed', pos: { x: 1, y: 0, z: 1 } },
      { type: 'blockRevealed', pos: { x: 1, y: 0, z: 1 }, block: BLOCKS.rubble.code },
    ]);
    // Only the new top is known; the rubble under it is not.
    expect(isRevealed(after, { x: 1, y: 0, z: 2 })).toBe(false);
  });

  it('the event does not say how deep the space was', () => {
    // The same mine over a space 1 cell deep and over one 3 cells deep.
    const shallow = buildState({ layers: [['#'], ['.'], ['#'], ['#'], ['#']] });
    const deep = buildState({ layers: [['#'], ['.'], ['.'], ['.'], ['#']] });
    const shallowEvents = act(shallow, { type: 'mine', x: 0, y: 0 }).events;
    const deepEvents = act(deep, { type: 'mine', x: 0, y: 0 }).events;
    expect(deepEvents).toEqual(shallowEvents);
  });

  it('rubble is cheap to dig and gives nothing', () => {
    let state = mine(cavernCube(), 1, 0);
    state = mine(mine(state, 0, 0), 2, 0);
    const { state: after, events } = act(state, { type: 'mine', x: 1, y: 0 });
    expect(state.ap - after.ap).toBe(costOf('rubble'));
    expect(events.map((event) => event.type)).toEqual(['blockMined', 'blockRevealed']);
  });

  it('a space that is not directly under the mined block is left alone', () => {
    // Stone, stone, open, stone: the first mine does not reach the space.
    const state = buildState({ layers: [['#'], ['#'], ['.'], ['#']], ap: 100 });
    const first = act(state, { type: 'mine', x: 0, y: 0 });
    expect(first.events.map((event) => event.type)).not.toContain('roofCollapsed');
    expect(blockAt(first.state, { x: 0, y: 0, z: 2 })).toBe(BLOCKS.air.code);
    // The second mine takes its roof.
    const second = act(first.state, { type: 'mine', x: 0, y: 0 });
    expect(second.events).toContainEqual({ type: 'roofCollapsed', pos: { x: 0, y: 0, z: 2 } });
    expect(depthAt(second.state, 0, 0)).toBe(2);
  });

  it('a space that reaches the bottom of the cube fills to the bottom', () => {
    const state = buildState({ layers: [['#'], ['.'], ['.']] });
    const after = mine(state, 0, 0);
    expect(layerText(after, 1)).toEqual(['R']);
    expect(layerText(after, 2)).toEqual(['R']);
    expect(depthAt(after, 0, 0)).toBe(1);
  });
});
