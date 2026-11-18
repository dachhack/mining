// Mineral traces (decision note 0012): rock near ore shows a tell. The
// player first sees it on a revealed block in light, and it then stays on
// the map.

import { describe, expect, it } from 'vitest';

import { BLOCKS, TELLS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import {
  cellIndex,
  cellPosition,
  createRun,
  deserialise,
  endShift,
  hashState,
  serialise,
  showsMineralTraces,
  visibleMineralTraces,
} from '../../src/engine';
import { cloneState } from '../../src/engine/state';
import type { GameEvent, GameState } from '../../src/engine';
import { carriesMineralTraces, updateMineralTraces } from '../../src/engine/tells';
import { act, buildState, findActions } from './helpers';
import { surveyShaft } from './shaftSurvey';

// A tunnel one cell high along the middle row of layer 1, from x = 1 to
// x = 7, in a 9 x 3 x 4 cube. One special block (`ore`) sits at (1, 1, 3),
// two layers under the west end of the tunnel. Seen from the side (y = 1):
//
//        x  0 1 2 3 4 5 6 7 8
//   z=0     # # # # # # # # #
//   z=1     # . . . . . . . #     the tunnel
//   z=2     # # # # # # # # #     its floor
//   z=3     # i # # # # # # #     the ore
//
// So the floor block at x = 1 is 1 step from the ore, the one at x = 2 is 2
// steps, and the one at x = 3 is 3 steps.
const ORE: Vec3 = { x: 1, y: 1, z: 3 };
const FLOOR_1_STEP: Vec3 = { x: 1, y: 1, z: 2 };
const FLOOR_2_STEPS: Vec3 = { x: 2, y: 1, z: 2 };
const FLOOR_3_STEPS: Vec3 = { x: 3, y: 1, z: 2 };
const WEST_END: Vec3 = { x: 1, y: 1, z: 1 };
const EAST_END: Vec3 = { x: 7, y: 1, z: 1 };

interface TunnelOptions {
  /** The character of the special block; see `BLOCK_CHARS` in helpers.ts. Default iron ore. */
  ore?: string;
  /** The character of the rock everything else is made of. Default stone. */
  rock?: string;
  avatar?: Vec3;
  revealAll?: boolean;
  lampOil?: number;
  torches?: Vec3[];
}

/**
 * The tunnel cube, after the engine has noted the traces the player sees in
 * it (as the dispatcher does after every step).
 */
function tunnelState(options: TunnelOptions = {}): GameState {
  return looked(bareTunnelState(options));
}

/** Run `updateMineralTraces` on `state` and give the same state back. */
function looked(state: GameState): GameState {
  updateMineralTraces(state, []);
  return state;
}

/** The tunnel cube with no traces noted yet. */
function bareTunnelState(options: TunnelOptions = {}): GameState {
  const r = options.rock ?? '#';
  const solidRow = r.repeat(9);
  const solidLayer = [solidRow, solidRow, solidRow];
  return buildState({
    layers: [
      solidLayer,
      [solidRow, `${r}.......${r}`, solidRow],
      solidLayer,
      [solidRow, `${r}${options.ore ?? 'i'}${r.repeat(7)}`, solidRow],
    ],
    avatar: options.avatar ?? WEST_END,
    revealAll: options.revealAll ?? true,
    lampOil: options.lampOil ?? 10,
    torches: options.torches ?? [],
  });
}

/** Every cell of the cube, in storage order. */
function allCells(state: GameState): Vec3[] {
  const cells: Vec3[] = [];
  for (let index = 0; index < state.blocks.length; index += 1) {
    cells.push(cellPosition(state.size, index));
  }
  return cells;
}

describe('mineral traces', () => {
  it('uses a distance of 2 steps (the value the scenarios below are drawn for)', () => {
    expect(TELLS.mineralTraces.distance).toBe(2);
  });

  it('shows on lit, revealed rock 1 and 2 steps from ore, and not at 3 steps', () => {
    const state = tunnelState();
    expect(showsMineralTraces(state, FLOOR_1_STEP)).toBe(true);
    expect(showsMineralTraces(state, FLOOR_2_STEPS)).toBe(true);
    // In the lamp's light like the other two, but too far from the ore.
    expect(showsMineralTraces(state, FLOOR_3_STEPS)).toBe(false);
    expect(visibleMineralTraces(state)).toEqual([FLOOR_1_STEP, FLOOR_2_STEPS]);
  });

  it('counts steps through the grid, not straight lines', () => {
    // An ore block at (4, 1, 2), in the floor under the middle of the tunnel.
    const state = looked(
      buildState({
        layers: [
          ['#########', '#########', '#########'],
          ['#########', '#.......#', '#########'],
          ['#########', '####i####', '#########'],
        ],
        avatar: { x: 4, y: 1, z: 1 },
        revealAll: true,
      }),
    );
    // The top layer is always in light. (4, 1, 0) is 2 steps up from the ore;
    // (3, 1, 0) is 1 across and 2 up, which is 3 steps, although it touches
    // the first one.
    expect(showsMineralTraces(state, { x: 4, y: 1, z: 0 })).toBe(true);
    expect(showsMineralTraces(state, { x: 3, y: 1, z: 0 })).toBe(false);
    // The tunnel's side wall at (4, 0, 1) is 1 up and 1 north: 2 steps.
    expect(showsMineralTraces(state, { x: 4, y: 0, z: 1 })).toBe(true);
    // The floor blocks beside the ore are 1 step from it, 2 steps at x = 2 and 6.
    expect(showsMineralTraces(state, { x: 3, y: 1, z: 2 })).toBe(true);
    expect(showsMineralTraces(state, { x: 2, y: 1, z: 2 })).toBe(true);
    expect(showsMineralTraces(state, { x: 1, y: 1, z: 2 })).toBe(false);
  });

  it('never reports traces on an unrevealed block', () => {
    const state = tunnelState({ revealAll: false });
    // The blocks carry traces and are in the lamp's light, but are not revealed.
    expect(carriesMineralTraces(state, FLOOR_1_STEP)).toBe(true);
    expect(showsMineralTraces(state, FLOOR_1_STEP)).toBe(false);
    expect(showsMineralTraces(state, FLOOR_2_STEPS)).toBe(false);
    expect(visibleMineralTraces(state)).toEqual([]);

    // No flag was stored for the hidden blocks either.
    expect(Array.from(state.tracesSeen).every((flag) => flag === 0)).toBe(true);

    // Revealing one block shows the traces on that block only.
    state.revealed[cellIndex(state.size, FLOOR_2_STEPS)] = 1;
    updateMineralTraces(state, []);
    expect(showsMineralTraces(state, FLOOR_2_STEPS)).toBe(true);
    expect(visibleMineralTraces(state)).toEqual([FLOOR_2_STEPS]);
  });

  it('is not noticed on a revealed block that is not in light', () => {
    // The avatar is at the east end: its lamp reaches 3 steps, to x = 4.
    const state = tunnelState({ avatar: EAST_END });
    expect(showsMineralTraces(state, FLOOR_1_STEP)).toBe(false);
    expect(showsMineralTraces(state, FLOOR_2_STEPS)).toBe(false);
    expect(visibleMineralTraces(state)).toEqual([]);
  });

  it('shows by torch light as well as by lamp light', () => {
    const state = tunnelState({ avatar: EAST_END, torches: [WEST_END] });
    expect(showsMineralTraces(state, FLOOR_1_STEP)).toBe(true);
    expect(showsMineralTraces(state, FLOOR_2_STEPS)).toBe(true);
  });

  it('needs the light to touch the block: a lamp with no oil shows nothing', () => {
    // With no oil the lamp gives no light at all (decision note 0011).
    const state = tunnelState({ avatar: { x: 4, y: 1, z: 1 }, lampOil: 0 });
    expect(visibleMineralTraces(state)).toEqual([]);
    // With oil it reaches x = 1, and both traced floor blocks are in light.
    const withOil = tunnelState({ avatar: { x: 4, y: 1, z: 1 } });
    expect(visibleMineralTraces(withOil)).toEqual([FLOOR_1_STEP, FLOOR_2_STEPS]);
  });

  it('does not light a block that only touches the tunnel at an edge', () => {
    // (0, 1, 2) is 2 steps from the ore, but no face of it touches an open
    // cell: it is under the tunnel's end wall.
    const state = tunnelState();
    const underWall = { x: 0, y: 1, z: 2 };
    expect(carriesMineralTraces(state, underWall)).toBe(true);
    expect(showsMineralTraces(state, underWall)).toBe(false);
  });

  it('shows on the top layer by daylight, with the avatar anywhere', () => {
    const state = looked(
      buildState({
        layers: [
          ['###', '###', '###'],
          ['###', '#u#', '###'],
        ],
        revealAll: true,
      }),
    );
    // (1, 1, 0) is 1 step above the copper; the 4 blocks beside it are 2 steps.
    expect(visibleMineralTraces(state)).toEqual([
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 1, y: 2, z: 0 },
    ]);
  });

  it('comes from iron ore, copper ore and crystal', () => {
    for (const ore of ['i', 'u', 'x']) {
      expect(visibleMineralTraces(tunnelState({ ore }))).toEqual([FLOOR_1_STEP, FLOOR_2_STEPS]);
    }
  });

  it('does not come from coal or timber-root, or from any other block', () => {
    for (const notOre of ['c', 't', 'd', '#', 'H', 'U', 'r', 'k']) {
      const state = tunnelState({ ore: notOre });
      expect(visibleMineralTraces(state)).toEqual([]);
      for (const pos of allCells(state)) {
        expect(carriesMineralTraces(state, pos)).toBe(false);
      }
    }
  });

  it('shows on dirt, stone and hard rock', () => {
    for (const rock of ['d', '#', 'H']) {
      expect(visibleMineralTraces(tunnelState({ rock }))).toEqual([FLOOR_1_STEP, FLOOR_2_STEPS]);
    }
  });

  it('does not show on ore itself, on coal or timber-root, or on open space', () => {
    const state = looked(
      buildState({
        layers: [['.ict#']],
        avatar: { x: 0, y: 0, z: 0 },
        revealAll: true,
      }),
    );
    // All four are within 2 steps of the iron (or are it) and in daylight.
    expect(showsMineralTraces(state, { x: 0, y: 0, z: 0 })).toBe(false); // open space
    expect(showsMineralTraces(state, { x: 1, y: 0, z: 0 })).toBe(false); // the ore
    expect(showsMineralTraces(state, { x: 2, y: 0, z: 0 })).toBe(false); // coal
    expect(showsMineralTraces(state, { x: 3, y: 0, z: 0 })).toBe(false); // timber-root
    // The stone at x = 4 is 3 steps away. Move the ore's neighbours aside to
    // check the stone does show when near enough.
    const near = looked(
      buildState({ layers: [['.i#']], avatar: { x: 0, y: 0, z: 0 }, revealAll: true }),
    );
    expect(showsMineralTraces(near, { x: 2, y: 0, z: 0 })).toBe(true);
  });

  it('says ore is near even when the ore itself has not been seen', () => {
    const state = bareTunnelState({ revealAll: false });
    for (const pos of [FLOOR_1_STEP, FLOOR_2_STEPS, FLOOR_3_STEPS]) {
      state.revealed[cellIndex(state.size, pos)] = 1;
    }
    updateMineralTraces(state, []);
    expect(state.revealed[cellIndex(state.size, ORE)]).toBe(0);
    expect(visibleMineralTraces(state)).toEqual([FLOOR_1_STEP, FLOOR_2_STEPS]);
  });

  it('stays on the map when the light moves on', () => {
    // Walk the tunnel from the west end to the east end. At the east end the
    // lamp reaches only x = 4, so the traced floor blocks are in the dark.
    let state = tunnelState();
    expect(visibleMineralTraces(state)).toEqual([FLOOR_1_STEP, FLOOR_2_STEPS]);
    for (let x = 2; x <= 7; x += 1) {
      if (findActions(state, { type: 'move', to: { x, y: 1, z: 1 } }).length === 0) {
        state = endShift(state).state;
      }
      state = act(state, { type: 'move', to: { x, y: 1, z: 1 } }).state;
    }
    expect(state.avatar.pos).toEqual(EAST_END);
    expect(visibleMineralTraces(state)).toEqual([FLOOR_1_STEP, FLOOR_2_STEPS]);
    // And when the lamp goes out altogether.
    state.lampOil = 0;
    updateMineralTraces(state, []);
    expect(visibleMineralTraces(state)).toEqual([FLOOR_1_STEP, FLOOR_2_STEPS]);
  });

  it('sends one event for each block, the first time its traces are seen', () => {
    // Start at the east end, with the traced blocks out of the light.
    let state = tunnelState({ avatar: EAST_END });
    const seen: GameEvent[] = [];
    for (let x = 6; x >= 1; x -= 1) {
      if (findActions(state, { type: 'move', to: { x, y: 1, z: 1 } }).length === 0) {
        state = endShift(state).state;
      }
      const step = act(state, { type: 'move', to: { x, y: 1, z: 1 } });
      state = step.state;
      seen.push(...step.events.filter((event) => event.type === 'mineralTracesSeen'));
    }
    // The lamp reaches 3 steps: from x = 5 it first lights the tunnel cell
    // over the floor block at x = 2, and from x = 4 the one at x = 1.
    expect(seen).toEqual([
      { type: 'mineralTracesSeen', pos: FLOOR_2_STEPS },
      { type: 'mineralTracesSeen', pos: FLOOR_1_STEP },
    ]);
    // Looking again sends nothing.
    const again: GameEvent[] = [];
    updateMineralTraces(state, again);
    expect(again).toEqual([]);
  });

  it('lists newly seen blocks in storage order, after the reveal events of the step', () => {
    const state = bareTunnelState({ revealAll: false });
    // A full step: the dispatcher reveals, then notes the traces.
    const { events } = endShift(state);
    const types = events.map((event) => event.type);
    expect(types.filter((type) => type === 'mineralTracesSeen')).toHaveLength(2);
    expect(types.lastIndexOf('blockRevealed')).toBeLessThan(types.indexOf('mineralTracesSeen'));
    expect(events.filter((event) => event.type === 'mineralTracesSeen')).toEqual([
      { type: 'mineralTracesSeen', pos: FLOOR_1_STEP },
      { type: 'mineralTracesSeen', pos: FLOOR_2_STEPS },
    ]);
  });

  it('is noted when a run is created, with nothing to see on the top layer of a real cube', () => {
    const state = createRun(7, 'none', 'standard');
    expect(visibleMineralTraces(state)).toEqual([]);
  });

  // The avatar stands on a ladder in a pit; the ore is the pit's floor.
  function pitOverOre(): GameState {
    return looked(
      buildState({
        layers: [
          ['###', '#.#', '###'],
          ['###', '#i#', '###'],
        ],
        avatar: { x: 1, y: 1, z: 0 },
        revealAll: true,
        ladders: [{ x: 1, y: 1, z: 0 }],
      }),
    );
  }

  it('stays on the map after the ore is mined: the map shows what was seen', () => {
    const state = pitOverOre();
    const before = visibleMineralTraces(state);
    expect(before.length).toBeGreaterThan(0);
    const { state: after, events } = act(state, { type: 'mine', target: { x: 1, y: 1, z: 1 } });
    expect(visibleMineralTraces(after)).toEqual(before);
    // But rock first lit after the ore has gone carries none, so none is noted.
    expect(events.filter((event) => event.type === 'mineralTracesSeen')).toEqual([]);
    for (const pos of allCells(after)) {
      expect(carriesMineralTraces(after, pos)).toBe(false);
    }
  });

  it('goes from the map when the traced block itself is mined', () => {
    const state = pitOverOre();
    const wall: Vec3 = { x: 1, y: 0, z: 0 };
    expect(showsMineralTraces(state, wall)).toBe(true);
    const { state: after } = act(state, { type: 'mine', target: wall });
    expect(showsMineralTraces(after, wall)).toBe(false);
    expect(visibleMineralTraces(after)).not.toContainEqual(wall);
  });

  it('gives false outside the cube', () => {
    const state = tunnelState();
    expect(showsMineralTraces(state, { x: 1, y: 1, z: 4 })).toBe(false);
    expect(showsMineralTraces(state, { x: -1, y: 1, z: 2 })).toBe(false);
    expect(showsMineralTraces(state, { x: 1, y: 1, z: -1 })).toBe(false);
  });

  it('lists exactly the blocks showsMineralTraces is true for, in storage order', () => {
    const states = [
      tunnelState(),
      tunnelState({ avatar: EAST_END, torches: [{ x: 3, y: 1, z: 1 }] }),
      tunnelState({ avatar: { x: 4, y: 1, z: 1 }, lampOil: 0, ore: 'x', rock: 'H' }),
      tunnelState({ revealAll: false }),
    ];
    for (const state of states) {
      const expected = allCells(state).filter((pos) => showsMineralTraces(state, pos));
      expect(visibleMineralTraces(state)).toEqual(expected);
    }
  });

  it('asking changes nothing in the state; noting changes only the traces seen', () => {
    const state = tunnelState();
    const before = hashState(state);
    visibleMineralTraces(state);
    showsMineralTraces(state, FLOOR_1_STEP);
    expect(hashState(state)).toBe(before);

    const bare = bareTunnelState();
    const copy = cloneState(bare);
    updateMineralTraces(bare, []);
    expect(hashState(bare)).not.toBe(hashState(copy));
    copy.tracesSeen.set(bare.tracesSeen);
    expect(bare).toEqual(copy);
  });

  it('is kept by a save and load', () => {
    const state = tunnelState();
    const loaded = deserialise(JSON.parse(JSON.stringify(serialise(state))));
    expect(visibleMineralTraces(loaded)).toEqual([FLOOR_1_STEP, FLOOR_2_STEPS]);
    expect(hashState(loaded)).toBe(hashState(state));
  });

  it('lists the blocks of the data tables', () => {
    expect(TELLS.mineralTraces.sourceBlocks).toEqual(['ironOre', 'copperOre', 'crystal']);
    expect(TELLS.mineralTraces.shownOnBlocks).toEqual(['dirt', 'stone', 'hardRock']);
    expect(BLOCKS.ironOre.solid).toBe(true);
  });
});

// Issue #33 (decision note 0011): with the lamp out the miner knows the six
// blocks it touches, but knowing a block by touch is not seeing it in light.
describe('mineral traces with the lamp out', () => {
  /** The events of noticing traces in `state` now, and the state itself. */
  function lookedWithEvents(state: GameState): GameEvent[] {
    const events: GameEvent[] = [];
    updateMineralTraces(state, events);
    return events;
  }

  it('are not noticed on the blocks the miner touches', () => {
    // At the west end the miner stands on the traced floor block.
    const state = bareTunnelState({ avatar: WEST_END, lampOil: 0 });
    const events = lookedWithEvents(state);

    expect(carriesMineralTraces(state, FLOOR_1_STEP)).toBe(true);
    expect(state.tracesSeen[cellIndex(state.size, FLOOR_1_STEP)]).toBe(0);
    expect(showsMineralTraces(state, FLOOR_1_STEP)).toBe(false);
    expect(visibleMineralTraces(state)).toEqual([]);
    expect(events).toEqual([]);
  });

  it('are not noticed through real play either: arriving and ending shifts in the dark', () => {
    // Nothing revealed to start with; the engine reveals the six touched cells.
    const built = bareTunnelState({ avatar: WEST_END, lampOil: 0, revealAll: false });
    const { state, events } = endShift(built);

    expect(state.revealed[cellIndex(state.size, FLOOR_1_STEP)]).toBe(1);
    expect(showsMineralTraces(state, FLOOR_1_STEP)).toBe(false);
    expect(events.filter((event) => event.type === 'mineralTracesSeen')).toEqual([]);
  });

  it('are noticed once the lamp is lit again', () => {
    const dark = looked(bareTunnelState({ avatar: WEST_END, lampOil: 0 }));
    dark.inventory = { coal: 1 };
    const { state: lit, events } = act(dark, { type: 'craft', recipe: 'lampOil' });

    expect(showsMineralTraces(lit, FLOOR_1_STEP)).toBe(true);
    expect(showsMineralTraces(lit, FLOOR_2_STEPS)).toBe(true);
    expect(events).toContainEqual({ type: 'mineralTracesSeen', pos: FLOOR_1_STEP });
  });

  it('are still shown by a torch', () => {
    // The miner is far away at the east end; the torch is over the traced floor.
    const state = bareTunnelState({ avatar: EAST_END, lampOil: 0, torches: [WEST_END] });
    const events = lookedWithEvents(state);

    expect(showsMineralTraces(state, FLOOR_1_STEP)).toBe(true);
    expect(showsMineralTraces(state, FLOOR_2_STEPS)).toBe(true);
    expect(events).toEqual([
      { type: 'mineralTracesSeen', pos: FLOOR_1_STEP },
      { type: 'mineralTracesSeen', pos: FLOOR_2_STEPS },
    ]);
  });

  it('stay on the map when the lamp goes out after they were seen', () => {
    let state = tunnelState({ avatar: WEST_END, lampOil: 1 });
    expect(showsMineralTraces(state, FLOOR_1_STEP)).toBe(true);
    for (let shifts = 0; shifts < 20 && state.lampOil > 0; shifts += 1) {
      state = endShift(state).state;
    }
    expect(state.lampOil).toBe(0);
    expect(showsMineralTraces(state, FLOOR_1_STEP)).toBe(true);
    expect(showsMineralTraces(state, FLOOR_2_STEPS)).toBe(true);
  });
});

describe('mineral traces in generated cubes', () => {
  // The full figures over 1,000 seeds are in decision note 0012. This keeps
  // the two facts they rest on from regressing, on fewer seeds.
  it('a start-cell shaft to layer 12 sees traces at least as often, and as early, as ore', () => {
    let sawTraces = 0;
    let sawOre = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const survey = surveyShaft(seed, 12);
      expect(survey.reachedLayer).toBe(12);
      if (survey.tracesFirstSeenAt !== null) {
        sawTraces += 1;
      }
      if (survey.oreFirstSeenAt !== null) {
        sawOre += 1;
        // Wherever the shaft shows ore, it showed traces first or with it.
        expect(survey.tracesFirstSeenAt).not.toBeNull();
        expect(survey.tracesFirstSeenAt ?? Infinity).toBeLessThanOrEqual(survey.oreFirstSeenAt);
      }
      // No ore lies above the middle band, so nothing shows before layer 5:
      // the miner sees the floor one layer down, 2 steps above layer 8.
      if (survey.tracesFirstSeenAt !== null) {
        expect(survey.tracesFirstSeenAt).toBeGreaterThanOrEqual(5);
      }
    }
    expect(sawOre).toBeGreaterThan(0);
    expect(sawTraces).toBeGreaterThan(sawOre);
  });
});
