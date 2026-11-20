// Mineral traces (decision note 0012; design doc v0.2 section 3.7; decision
// note 0026): plain rock within `TELLS.mineralTraces.distance` steps of iron
// ore, copper ore or crystal shows traces. The player sees them on every known
// top block; there is no light any more. Once seen they stay on the map.

import { describe, expect, it } from 'vitest';
import { BLOCKS, TELLS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import {
  createRun,
  deserialise,
  hashState,
  serialise,
  showsMineralTraces,
  visibleMineralTraces,
} from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { cloneState } from '../../src/engine/state';
import { carriesMineralTraces, updateMineralTraces } from '../../src/engine/tells';
import { act, buildState } from './helpers';

// A flat 5 x 1 x 3 cube with one special block (`ore`) at (1, 0, 1), under
// the second square. Seen from the side:
//
//        x  0 1 2 3 4
//   z=0     # # # # #     the top blocks
//   z=1     # i # # #     the ore
//   z=2     # # # # #
//
// So the top block at x = 1 is 1 step from the ore, those at x = 0 and x = 2
// are 2 steps, x = 3 is 3 steps and x = 4 is 4.
const ORE: Vec3 = { x: 1, y: 0, z: 1 };

function top(x: number): Vec3 {
  return { x, y: 0, z: 0 };
}

interface StripOptions {
  /** The character of the special block; see `BLOCK_CHARS` in helpers.ts. Default iron ore. */
  ore?: string;
  /** The character of the rock everything else is made of. Default stone. */
  rock?: string;
  surface?: string[];
}

function strip(options: StripOptions = {}): GameState {
  const rock = options.rock ?? '#';
  const ore = options.ore ?? 'i';
  return buildState({
    layers: [[rock.repeat(5)], [rock + ore + rock.repeat(3)], [rock.repeat(5)]],
    surface: options.surface ?? ['.....'],
    ap: 100,
  });
}

describe('mineral traces', () => {
  it('uses a distance of 2 steps (the value the scenarios below are drawn for)', () => {
    expect(TELLS.mineralTraces.distance).toBe(2);
  });

  it('shows on known top blocks 1 and 2 steps from ore, and not at 3 steps', () => {
    const state = strip();
    expect(showsMineralTraces(state, top(1))).toBe(true);
    expect(showsMineralTraces(state, top(0))).toBe(true);
    expect(showsMineralTraces(state, top(2))).toBe(true);
    expect(showsMineralTraces(state, top(3))).toBe(false);
    expect(showsMineralTraces(state, top(4))).toBe(false);
  });

  it('counts steps through the cube in 3D, not straight lines', () => {
    // Ore 2 layers under the middle of a 3 x 3 cube: only the block straight
    // above it is within 2 steps; its neighbours are 3 steps away.
    const state = buildState({
      layers: [
        ['###', '###', '###'],
        ['###', '###', '###'],
        ['###', '#i#', '###'],
      ],
    });
    expect(visibleMineralTraces(state)).toEqual([{ x: 1, y: 1, z: 0 }]);
  });

  it('comes from iron ore, copper ore and crystal', () => {
    expect(TELLS.mineralTraces.sourceBlocks).toEqual(['ironOre', 'copperOre', 'crystal']);
    for (const ore of ['i', 'u', 'x']) {
      expect(showsMineralTraces(strip({ ore }), top(1)), `ore "${ore}"`).toBe(true);
    }
  });

  it('does not come from coal or timber-root, or from any other block', () => {
    for (const ore of ['c', 't', 'U', 'r', 'k', 'R', 'd', '.']) {
      expect(visibleMineralTraces(strip({ ore })), `block "${ore}"`).toEqual([]);
    }
  });

  it('shows on dirt, stone and hard rock', () => {
    expect(TELLS.mineralTraces.shownOnBlocks).toEqual(['dirt', 'stone', 'hardRock']);
    for (const rock of ['d', '#', 'H']) {
      expect(showsMineralTraces(strip({ rock }), top(1)), `rock "${rock}"`).toBe(true);
    }
  });

  it('does not show on ore itself, on coal or timber-root, or on open space', () => {
    for (const rock of ['i', 'c', 't', 'R']) {
      expect(visibleMineralTraces(strip({ rock, ore: 'i' })), `rock "${rock}"`).toEqual([]);
    }
    expect(carriesMineralTraces(strip(), ORE)).toBe(false);
    expect(carriesMineralTraces(strip(), { x: 0, y: 0, z: -1 })).toBe(false);
  });

  it('says ore is near even though the ore itself has not been seen', () => {
    const state = strip();
    expect(state.revealed[5 + 1]).toBe(0); // the ore cell, (1, 0, 1), is not revealed
    expect(showsMineralTraces(state, top(1))).toBe(true);
  });
});

describe('when traces are seen', () => {
  it('not on a block under a tree, until the tree is cut', () => {
    const state = strip({ surface: ['.T...'] });
    expect(showsMineralTraces(state, top(1))).toBe(false);
    expect(showsMineralTraces(state, top(0))).toBe(true);

    const { state: after, events } = act(state, { type: 'cutTree', x: 1, y: 0 });
    expect(showsMineralTraces(after, top(1))).toBe(true);
    // The traces event follows the reveal of the same step.
    const types = events.map((event) => event.type);
    expect(types).toEqual(['treeCut', 'itemGained', 'blockRevealed', 'mineralTracesSeen']);
    expect(events).toContainEqual({ type: 'mineralTracesSeen', pos: top(1) });
  });

  it('on a new top block as soon as a mine uncovers it', () => {
    // Mining x = 2 uncovers (2, 0, 1), which is 1 step from the ore.
    const { state: after, events } = act(strip(), { type: 'mine', x: 2, y: 0 });
    expect(events).toContainEqual({ type: 'mineralTracesSeen', pos: { x: 2, y: 0, z: 1 } });
    expect(showsMineralTraces(after, { x: 2, y: 0, z: 1 })).toBe(true);
  });

  it('never on a block below a top', () => {
    const state = strip();
    // (0, 0, 1) is 1 step from the ore and carries traces, but is not known.
    expect(carriesMineralTraces(state, { x: 0, y: 0, z: 1 })).toBe(true);
    expect(showsMineralTraces(state, { x: 0, y: 0, z: 1 })).toBe(false);
  });

  it('does not show a flag that sits on an unrevealed block (a damaged save, say)', () => {
    const state = strip();
    state.tracesSeen[5] = 1; // cell (0, 0, 1)
    expect(showsMineralTraces(state, { x: 0, y: 0, z: 1 })).toBe(false);
    expect(visibleMineralTraces(state)).not.toContainEqual({ x: 0, y: 0, z: 1 });
  });

  it('sends one event for each block, the first time its traces are seen, in storage order', () => {
    const state = buildState({
      layers: [['#####'], ['#i###'], ['#####']],
      revealAll: false,
      revealTops: false,
    });
    state.revealed.fill(1, 0, 5); // the top layer, by hand, without noting traces
    const events: GameEvent[] = [];
    updateMineralTraces(state, events);
    expect(events).toEqual([
      { type: 'mineralTracesSeen', pos: top(0) },
      { type: 'mineralTracesSeen', pos: top(1) },
      { type: 'mineralTracesSeen', pos: top(2) },
    ]);
    const again: GameEvent[] = [];
    updateMineralTraces(state, again);
    expect(again).toEqual([]);
  });
});

describe('what stays on the map (owner, questions 51 and 54)', () => {
  it('stays after the ore is mined: the map shows what was seen', () => {
    let state = strip();
    // Dig down to the ore and take it: x = 1 needs its neighbours level first.
    state = act(state, { type: 'mine', x: 1, y: 0 }).state;
    state = act(state, { type: 'mine', x: 0, y: 0 }).state;
    state = act(state, { type: 'mine', x: 2, y: 0 }).state;
    expect(showsMineralTraces(state, { x: 2, y: 0, z: 1 })).toBe(true);
    state = act(state, { type: 'mine', x: 1, y: 0 }).state; // the ore
    expect(state.inventory['rawIronOre']).toBe(1);
    expect(showsMineralTraces(state, { x: 2, y: 0, z: 1 })).toBe(true);
    // The far top block was never within 2 steps and still shows nothing.
    expect(showsMineralTraces(state, top(4))).toBe(false);
  });

  it('goes from the map when the traced block itself is mined', () => {
    const after = act(strip(), { type: 'mine', x: 0, y: 0 }).state;
    expect(showsMineralTraces(after, top(0))).toBe(false);
  });

  it('gives false outside the cube', () => {
    const state = strip();
    expect(showsMineralTraces(state, { x: 0, y: 0, z: -1 })).toBe(false);
    expect(showsMineralTraces(state, { x: -1, y: 0, z: 0 })).toBe(false);
    expect(showsMineralTraces(state, { x: 0, y: 0, z: 9 })).toBe(false);
  });

  it('lists exactly the blocks showsMineralTraces is true for, in storage order', () => {
    expect(visibleMineralTraces(strip())).toEqual([top(0), top(1), top(2)]);
  });

  it('asking changes nothing in the state; noting changes only the traces seen', () => {
    const state = strip();
    const before = hashState(state);
    showsMineralTraces(state, top(1));
    visibleMineralTraces(state);
    carriesMineralTraces(state, top(1));
    expect(hashState(state)).toBe(before);

    const copy = cloneState(state);
    copy.tracesSeen.fill(0);
    updateMineralTraces(copy, []);
    expect(hashState(copy)).toBe(before);
  });

  it('is kept by a save and load', () => {
    const state = strip();
    const loaded = deserialise(JSON.parse(JSON.stringify(serialise(state))));
    expect(visibleMineralTraces(loaded)).toEqual(visibleMineralTraces(state));
  });
});

describe('mineral traces in generated cubes', () => {
  it('a new run shows none: no ore lies within 2 steps of the top layer', () => {
    // Iron and copper start in the middle band (layer 8), crystal deeper.
    for (const seed of [1, 7, 9, 150]) {
      const state = createRun(seed, 'none', 'standard');
      expect(visibleMineralTraces(state)).toEqual([]);
      expect(state.blocks.includes(BLOCKS.ironOre.code)).toBe(true);
    }
  });
});
