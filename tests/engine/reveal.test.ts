// Scenario tests for light and reveal (design doc 3 and 5.1; decision note
// 0005 items 10 and 13 to 15), on small hand-built cubes.
//
// Moving is another task's module, so where a rule needs the avatar to be
// somewhere else, these tests put it there by hand and then call
// `updateReveal`, which is what the dispatcher does after every action.

import { describe, expect, it } from 'vitest';
import { AVATAR, BLOCKS, SHIFT } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { cellIndex, createRun, endShift, isRevealed, isUnderTree } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { buildState } from './helpers';

/** A row of `width` solid cells. */
function solidRow(width: number): string {
  return '#'.repeat(width);
}

/** A layer of solid stone, 3 rows deep. */
function solidLayer(width: number): string[] {
  return [solidRow(width), solidRow(width), solidRow(width)];
}

/**
 * A cube with one straight tunnel, one cell wide and one cell high, two
 * layers under the top so that daylight plays no part:
 *
 *   z = 0, 1   solid
 *   z = 2      the tunnel: row y = 1, cells x = 0 .. tunnelLength - 1
 *   z = 3, 4   solid
 *
 * The cube is two cells longer than the tunnel, so the tunnel has a dead end
 * with rock beyond it.
 */
function tunnelLayers(tunnelLength: number): string[][] {
  const width = tunnelLength + 2;
  const tunnelRow = '.'.repeat(tunnelLength) + '##';
  return [
    solidLayer(width),
    solidLayer(width),
    [solidRow(width), tunnelRow, solidRow(width)],
    solidLayer(width),
    solidLayer(width),
  ];
}

const TUNNEL_Y = 1;
const TUNNEL_Z = 2;

/** The tunnel cell at `x`. */
function inTunnel(x: number): Vec3 {
  return { x, y: TUNNEL_Y, z: TUNNEL_Z };
}

/** The wall cell beside the tunnel cell at `x`. */
function wallBeside(x: number): Vec3 {
  return { x, y: TUNNEL_Y - 1, z: TUNNEL_Z };
}

/** Put the avatar at `pos` by hand and let the light show what it shows. */
function arriveAt(state: GameState, pos: Vec3): GameEvent[] {
  const events: GameEvent[] = [];
  state.avatar.pos = { ...pos };
  updateReveal(state, events);
  return events;
}

const WITH_OIL = AVATAR.lightRadiusWithOil;
const WITHOUT_OIL = AVATAR.lightRadiusWithoutOil;

describe('light from the lamp', () => {
  it('shows a block the light just reaches, and not the one a step further', () => {
    const state = buildState({ layers: tunnelLayers(WITH_OIL + 4), avatar: inTunnel(0) });
    updateReveal(state, []);

    // The tunnel cell `WITH_OIL` steps away is lit, so the wall beside it is seen.
    expect(isRevealed(state, wallBeside(WITH_OIL))).toBe(true);
    // The next tunnel cell is not lit. It is seen (it touches a lit cell), but
    // the wall beside it is not.
    expect(isRevealed(state, inTunnel(WITH_OIL + 1))).toBe(true);
    expect(isRevealed(state, wallBeside(WITH_OIL + 1))).toBe(false);
    expect(isRevealed(state, inTunnel(WITH_OIL + 2))).toBe(false);
  });

  it('uses the smaller radius from the data when there is no lamp oil', () => {
    expect(WITHOUT_OIL).toBeLessThan(WITH_OIL);
    const layers = tunnelLayers(WITH_OIL + 4);
    const dark = buildState({ layers, avatar: inTunnel(0), lampOil: 0 });
    const bright = buildState({ layers, avatar: inTunnel(0), lampOil: 1 });
    updateReveal(dark, []);
    updateReveal(bright, []);

    // The ceiling over the tunnel cell `WITHOUT_OIL` steps away: lit either way.
    const ceilingNear: Vec3 = { x: WITHOUT_OIL, y: TUNNEL_Y, z: TUNNEL_Z - 1 };
    expect(isRevealed(dark, ceilingNear)).toBe(true);
    // One step further, only the lamp with oil shows the wall.
    expect(isRevealed(dark, wallBeside(WITHOUT_OIL + 1))).toBe(false);
    expect(isRevealed(bright, wallBeside(WITHOUT_OIL + 1))).toBe(true);
  });

  it('does not pass through rock', () => {
    // Two one-cell chambers on the same level with one block of rock between
    // them: the second is 2 cells from the avatar in a straight line, well
    // inside the light radius, but no open path leads to it.
    expect(WITH_OIL).toBeGreaterThanOrEqual(2);
    const state = buildState({
      layers: [
        ['#####', '#####', '#####'],
        ['#####', '#####', '#####'],
        ['#####', '#.#.#', '#####'],
        ['#####', '#####', '#####'],
        ['#####', '#####', '#####'],
      ],
      avatar: { x: 1, y: 1, z: 2 },
    });
    updateReveal(state, []);

    expect(isRevealed(state, { x: 2, y: 1, z: 2 })).toBe(true); // the wall itself
    expect(isRevealed(state, { x: 3, y: 1, z: 2 })).toBe(false); // the chamber behind it
    expect(isRevealed(state, { x: 4, y: 1, z: 2 })).toBe(false); // the far wall
    expect(isRevealed(state, { x: 3, y: 1, z: 1 })).toBe(false); // the far chamber's ceiling
    // Straight down through rock: the floor is seen, the block under it is not.
    expect(isRevealed(state, { x: 1, y: 1, z: 3 })).toBe(true);
    expect(isRevealed(state, { x: 1, y: 1, z: 4 })).toBe(false);
  });

  it('goes round a corner through open cells', () => {
    // An L-shaped tunnel: the avatar cannot see the far arm in a straight
    // line, but it is 2 steps away through open cells.
    const state = buildState({
      layers: [
        ['####', '####', '####', '####'],
        ['####', '####', '####', '####'],
        ['####', '#..#', '##.#', '####'],
        ['####', '####', '####', '####'],
      ],
      avatar: { x: 1, y: 1, z: 2 },
      lampOil: 1,
    });
    updateReveal(state, []);
    // The wall at the end of the far arm touches the lit cell (2, 2, 2).
    expect(isRevealed(state, { x: 2, y: 3, z: 2 })).toBe(true);
  });
});

describe('lamp oil running out at upkeep (0005 item 15)', () => {
  it('shrinks the light radius from the next shift on', () => {
    // The last of the oil, on a shift whose upkeep burns oil.
    const length = 2 * WITH_OIL + 6;
    const state = buildState({
      layers: tunnelLayers(length),
      avatar: inTunnel(0),
      lampOil: SHIFT.lampOilPerBurn,
      shift: SHIFT.firstShiftNumber + SHIFT.lampOilBurnEveryShifts - 1,
    });
    updateReveal(state, []);
    // With oil, the wall `WITH_OIL` steps along is seen.
    expect(isRevealed(state, wallBeside(WITH_OIL))).toBe(true);

    const { state: after, events } = endShift(state);
    expect(after.lampOil).toBe(0);
    // What was seen stays seen, and the dimmer lamp shows nothing new.
    expect(isRevealed(after, wallBeside(WITH_OIL))).toBe(true);
    expect(events.filter((event) => event.type === 'blockRevealed')).toEqual([]);

    // Further along the tunnel (placed by hand), the lamp now reaches only
    // the smaller radius.
    const here = WITH_OIL + 3;
    arriveAt(after, inTunnel(here));
    expect(isRevealed(after, { x: here + WITHOUT_OIL, y: TUNNEL_Y, z: TUNNEL_Z - 1 })).toBe(true);
    expect(isRevealed(after, wallBeside(here + WITHOUT_OIL + 1))).toBe(false);

    // The same walk with oil left shows that wall.
    const withOil = buildState({ layers: tunnelLayers(length), avatar: inTunnel(0), lampOil: 5 });
    updateReveal(withOil, []);
    arriveAt(withOil, inTunnel(here));
    expect(isRevealed(withOil, wallBeside(here + WITHOUT_OIL + 1))).toBe(true);
  });
});

describe('what stays revealed', () => {
  it('keeps blocks revealed after the avatar walks away', () => {
    const length = 2 * WITH_OIL + 6;
    const state = buildState({ layers: tunnelLayers(length), avatar: inTunnel(0) });
    updateReveal(state, []);
    const farEnd = length - 1;
    expect(isRevealed(state, wallBeside(0))).toBe(true);
    expect(isRevealed(state, wallBeside(farEnd))).toBe(false);

    arriveAt(state, inTunnel(farEnd));

    expect(isRevealed(state, wallBeside(farEnd))).toBe(true);
    // The start is now far outside the light, and is still known.
    expect(isRevealed(state, wallBeside(0))).toBe(true);
  });

  it('reports each newly seen cell once, and nothing when nothing is new', () => {
    const state = buildState({ layers: tunnelLayers(WITH_OIL + 4), avatar: inTunnel(0) });
    const first: GameEvent[] = [];
    updateReveal(state, first);

    const revealedCount = state.revealed.reduce((sum, flag) => sum + flag, 0);
    expect(first.length).toBe(revealedCount);
    for (const event of first) {
      expect(event.type).toBe('blockRevealed');
    }
    // The event carries the block that is there.
    expect(first).toContainEqual({
      type: 'blockRevealed',
      pos: wallBeside(0),
      block: BLOCKS.stone.code,
    });
    expect(first).toContainEqual({
      type: 'blockRevealed',
      pos: inTunnel(0),
      block: BLOCKS.air.code,
    });

    // The events come in the order the cube stores cells (top layer first,
    // then row by row), whatever order the light found them in.
    const indexes = first.map((event) =>
      event.type === 'blockRevealed' ? cellIndex(state.size, event.pos) : -1,
    );
    const ascending = indexes.slice().sort((x, y) => x - y);
    expect(indexes).toEqual(ascending);

    const second: GameEvent[] = [];
    updateReveal(state, second);
    expect(second).toEqual([]);
  });
});

describe('the surface (owner, after PR #72: only what has been discovered)', () => {
  // Daylight no longer reveals the whole top layer. On the surface it does the
  // lamp's work round the miner, lamp oil or not: light spreads over the
  // surface cells as far as the lamp's radius and shows the blocks under
  // them, and the pick's reach shows the rest of what it touches.
  const width = WITH_OIL + 6;
  function row(): GameState {
    return buildState({
      layers: [['#'.repeat(width)], ['#'.repeat(width)], ['#'.repeat(width)]],
      avatar: { x: 0, y: 0, z: -1 },
    });
  }

  it('reveals the top layer only as far as the light reaches, and nothing of layer 1', () => {
    const state = row();
    updateReveal(state, []);
    for (let x = 0; x < width; x += 1) {
      expect(isRevealed(state, { x, y: 0, z: 0 }), `x${x}`).toBe(x <= WITH_OIL);
      expect(isRevealed(state, { x, y: 0, z: 1 })).toBe(false);
    }
  });

  it('does the same with the lamp out: on the surface daylight does its work', () => {
    const state = row();
    state.lampOil = 0;
    updateReveal(state, []);
    for (let x = 0; x < width; x += 1) {
      expect(isRevealed(state, { x, y: 0, z: 0 }), `x${x}`).toBe(x <= WITH_OIL);
    }
  });

  it('reveals more as the miner walks, and what was seen stays seen', () => {
    const state = row();
    updateReveal(state, []);
    state.avatar.pos = { x: width - 1, y: 0, z: -1 };
    updateReveal(state, []);
    for (let x = 0; x < width; x += 1) {
      const near = x <= WITH_OIL || x >= width - 1 - WITH_OIL;
      expect(isRevealed(state, { x, y: 0, z: 0 }), `x${x}`).toBe(near);
    }
  });

  it('a new run knows only the ground round the start, never under a tree', () => {
    const state = createRun(1, 'none', 'standard');
    const start = state.avatar.pos;
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const ground = { x, y, z: 0 };
        if (isRevealed(state, ground)) {
          expect(isUnderTree(state, ground)).toBe(false);
          expect(Math.abs(x - start.x) + Math.abs(y - start.y)).toBeLessThanOrEqual(WITH_OIL);
        }
        expect(isRevealed(state, { x, y, z: 1 })).toBe(false);
      }
    }
  });

  it('a pit far from the miner is not seen, and daylight does not shine down it', () => {
    const pitX = width - 1;
    const state = buildState({
      layers: [['#'.repeat(width - 1) + '.'], ['#'.repeat(width)], ['#'.repeat(width)]],
      avatar: { x: 0, y: 0, z: -1 },
    });
    updateReveal(state, []);
    expect(isRevealed(state, { x: pitX, y: 0, z: 0 })).toBe(false);
    expect(isRevealed(state, { x: pitX, y: 0, z: 1 })).toBe(false);
  });
});

describe('only exposed faces are known (issue #75; replaces reach, 0005 item 10)', () => {
  // The avatar walks to the dead end of a tunnel that is longer than its
  // light. Before issue #75 the lit lamp revealed all 17 cells the pick could
  // reach and the cell overhead. Now it reveals only cells that touch a lit
  // open cell, and always the six cells touching the avatar's own.
  const length = WITH_OIL + 4;
  const end = length - 1;
  const level = TUNNEL_Z;
  // Cells round the dead end that touch no open cell: the diagonals beyond
  // the end, and the corners and the front of the ring below.
  const hidden: Vec3[] = [
    { x: end + 1, y: TUNNEL_Y - 1, z: level },
    { x: end + 1, y: TUNNEL_Y + 1, z: level },
    { x: end + 1, y: TUNNEL_Y, z: level + 1 },
    { x: end + 1, y: TUNNEL_Y - 1, z: level + 1 },
    { x: end + 1, y: TUNNEL_Y + 1, z: level + 1 },
    { x: end - 1, y: TUNNEL_Y - 1, z: level + 1 },
    { x: end - 1, y: TUNNEL_Y + 1, z: level + 1 },
  ];
  const faces: Vec3[] = [
    { x: end + 1, y: TUNNEL_Y, z: level },
    { x: end, y: TUNNEL_Y - 1, z: level },
    { x: end, y: TUNNEL_Y + 1, z: level },
    { x: end, y: TUNNEL_Y, z: level - 1 },
    { x: end, y: TUNNEL_Y, z: level + 1 },
  ];

  function atStart(): GameState {
    const state = buildState({ layers: tunnelLayers(length), avatar: inTunnel(0), lampOil: 1 });
    updateReveal(state, []);
    return state;
  }

  it('on arrival reveals the faces round the avatar, and not the cells that touch no open cell', () => {
    const state = atStart();
    for (const pos of [...hidden, ...faces]) {
      expect(isRevealed(state, pos)).toBe(false);
    }

    arriveAt(state, inTunnel(end));

    for (const pos of faces) {
      expect(isRevealed(state, pos), `${pos.x},${pos.y},${pos.z}`).toBe(true);
    }
    for (const pos of hidden) {
      expect(isRevealed(state, pos), `${pos.x},${pos.y},${pos.z}`).toBe(false);
    }
  });

  it('keeps the faces revealed after the avatar leaves', () => {
    const state = atStart();
    arriveAt(state, inTunnel(end));
    arriveAt(state, inTunnel(0));
    for (const pos of faces) {
      expect(isRevealed(state, pos)).toBe(true);
    }
  });

  it('does not reveal a block 2 away through solid rock', () => {
    const state = atStart();
    arriveAt(state, inTunnel(end));
    expect(isRevealed(state, { x: end + 2, y: TUNNEL_Y, z: level })).toBe(false); // 2 ahead
    expect(isRevealed(state, { x: end, y: TUNNEL_Y, z: level + 2 })).toBe(false); // 2 below
    expect(isRevealed(state, { x: end + 2, y: TUNNEL_Y - 1, z: level + 1 })).toBe(false);
    // Reach covers one cell overhead, not the ring around it.
    expect(isRevealed(state, { x: end + 1, y: TUNNEL_Y - 1, z: level - 1 })).toBe(false);
  });

  it('skips reach cells outside the grid without throwing', () => {
    // On the surface in a corner: most of the reach is outside the cube.
    const state = buildState({ layers: [['##', '##']], avatar: { x: 0, y: 0, z: -1 } });
    expect(() => updateReveal(state, [])).not.toThrow();
    // And in the bottom corner of a cube, in a pit.
    const pit = buildState({ layers: [['.#', '##']], avatar: { x: 0, y: 0, z: 0 } });
    expect(() => updateReveal(pit, [])).not.toThrow();
  });
});
