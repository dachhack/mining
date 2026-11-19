// Scenario tests for "light matters" (issue #33; decision note 0011).
//
// With the lamp out the miner works by touch: only the six cells that share a
// face with its own are revealed. Mining still needs a revealed block, and a
// move is offered only when every cell it is judged by is revealed.
//
// Since issue #75 (decision note 0022) the lit lamp shows only exposed faces:
// cells that touch a lit open cell. It no longer shows the 17 cells the pick
// used to reach, and the pick reaches face neighbours only.
//
// Where a test needs the avatar somewhere it could not walk to in the dark, it
// is put there by hand and `updateReveal` is called, which is what the
// dispatcher does after every action.

import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../src/data';
import { endShift, isRevealed } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { act, buildState, findActions } from './helpers';

/** A layer of solid stone, `width` cells wide and `rows` rows deep. */
function solidLayer(width: number, rows: number): string[] {
  const layer: string[] = [];
  for (let y = 0; y < rows; y += 1) {
    layer.push('#'.repeat(width));
  }
  return layer;
}

// The cube most tests use: 10 wide, 5 rows, 5 layers, solid except for one
// straight tunnel, one cell wide and one cell high, along row y = 3 of layer
// z = 2, cells x = 0 .. 7. Two layers of rock above keep daylight out, and
// there is rock on every side of the tunnel to dig into.
const WIDTH = 10;
const ROWS = 5;
const TUNNEL_LENGTH = 8;
const TUNNEL_Y = 3;
const TUNNEL_Z = 2;

function tunnelLayers(): string[][] {
  const tunnel = solidLayer(WIDTH, ROWS);
  tunnel[TUNNEL_Y] = '.'.repeat(TUNNEL_LENGTH) + '#'.repeat(WIDTH - TUNNEL_LENGTH);
  return [
    solidLayer(WIDTH, ROWS),
    solidLayer(WIDTH, ROWS),
    tunnel,
    solidLayer(WIDTH, ROWS),
    solidLayer(WIDTH, ROWS),
  ];
}

/** The tunnel cell at `x`. */
function inTunnel(x: number): Vec3 {
  return { x, y: TUNNEL_Y, z: TUNNEL_Z };
}

/** The six cells that share a face with `pos`. */
function faceNeighbours(pos: Vec3): Vec3[] {
  return [
    { x: pos.x, y: pos.y - 1, z: pos.z },
    { x: pos.x + 1, y: pos.y, z: pos.z },
    { x: pos.x, y: pos.y + 1, z: pos.z },
    { x: pos.x - 1, y: pos.y, z: pos.z },
    { x: pos.x, y: pos.y, z: pos.z - 1 },
    { x: pos.x, y: pos.y, z: pos.z + 1 },
  ];
}

/** The four cells diagonally beside `pos` on its own level. */
function diagonals(pos: Vec3): Vec3[] {
  return [
    { x: pos.x + 1, y: pos.y - 1, z: pos.z },
    { x: pos.x + 1, y: pos.y + 1, z: pos.z },
    { x: pos.x - 1, y: pos.y + 1, z: pos.z },
    { x: pos.x - 1, y: pos.y - 1, z: pos.z },
  ];
}

/** The eight cells around the one below `pos`. */
function ringBelow(pos: Vec3): Vec3[] {
  const ring: Vec3[] = [];
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      if (dx !== 0 || dy !== 0) {
        ring.push({ x: pos.x + dx, y: pos.y + dy, z: pos.z + 1 });
      }
    }
  }
  return ring;
}

/** Put the avatar at `pos` by hand and reveal what it can then know. */
function arriveAt(state: GameState, pos: Vec3): void {
  state.avatar.pos = { ...pos };
  updateReveal(state, []);
}

/** The cells the legal mine actions aim at, as "x,y,z" strings, sorted. */
function mineTargets(state: GameState): string[] {
  return findActions(state, { type: 'mine' })
    .map((action) => {
      // `findActions` gives the general `Action` type; only a mine action has `target`.
      const target = (action as { target: Vec3 }).target;
      return key(target);
    })
    .sort();
}

/** The cells the legal moves go to, as "x,y,z" strings, sorted. */
function moveTargets(state: GameState): string[] {
  return findActions(state, { type: 'move' })
    .map((action) => key((action as { to: Vec3 }).to))
    .sort();
}

function key(pos: Vec3): string {
  return `${pos.x},${pos.y},${pos.z}`;
}

function keys(cells: Vec3[]): string[] {
  return cells.map(key).sort();
}

/** End shifts until the lamp is out. Throws if it never goes out. */
function waitForTheLampToGoOut(start: GameState): GameState {
  let state = start;
  for (let shifts = 0; shifts < 20 && state.lampOil > 0; shifts += 1) {
    state = endShift(state).state;
  }
  if (state.lampOil > 0) {
    throw new Error('the lamp did not go out');
  }
  return state;
}

describe('with the lamp out, reach is the six cells the miner touches', () => {
  const here = inTunnel(3);

  /** A miner that has just arrived, lamp out, in a tunnel it has never seen. */
  function inTheDark(inventory: Record<string, number> = {}): GameState {
    const state = buildState({
      layers: tunnelLayers(),
      avatar: inTunnel(0),
      lampOil: 0,
      inventory,
    });
    arriveAt(state, here);
    return state;
  }

  it('reveals the six face neighbours on arrival', () => {
    const state = inTheDark();
    for (const pos of faceNeighbours(here)) {
      expect(isRevealed(state, pos), key(pos)).toBe(true);
    }
  });

  it('does not reveal the diagonals or the ring below', () => {
    const state = inTheDark();
    for (const pos of [...diagonals(here), ...ringBelow(here)]) {
      expect(isRevealed(state, pos), key(pos)).toBe(false);
    }
  });

  it('offers to mine the walls and the floor it touches, and nothing else', () => {
    const state = inTheDark();
    // East and west are the open tunnel; overhead is never mineable (0005 item 11).
    expect(mineTargets(state)).toEqual(
      keys([
        { x: here.x, y: here.y - 1, z: here.z },
        { x: here.x, y: here.y + 1, z: here.z },
        { x: here.x, y: here.y, z: here.z + 1 },
      ]),
    );
  });

  /**
   * The cells a lit lamp shows round `here` in the tunnel that the dark does
   * not: the diagonals beside it (each touches a lit tunnel cell) and the
   * floor of the tunnel cells east and west. The corners of the ring below
   * touch no open cell, so even a lit lamp does not show them (issue #75).
   */
  function shownByLight(pos: Vec3): Vec3[] {
    return [
      ...diagonals(pos),
      { x: pos.x - 1, y: pos.y, z: pos.z + 1 },
      { x: pos.x + 1, y: pos.y, z: pos.z + 1 },
    ];
  }
  function cornersBelow(pos: Vec3): Vec3[] {
    return ringBelow(pos).filter((cell) => cell.x !== pos.x && cell.y !== pos.y);
  }

  it('with the lamp lit, shows the exposed faces round it, not the corners below, and offers the 3 face blocks', () => {
    const state = buildState({ layers: tunnelLayers(), avatar: inTunnel(0), lampOil: 1 });
    arriveAt(state, here);
    for (const pos of shownByLight(here)) {
      expect(isRevealed(state, pos), key(pos)).toBe(true);
    }
    for (const pos of cornersBelow(here)) {
      expect(isRevealed(state, pos), key(pos)).toBe(false);
    }
    // Face neighbours only (issue #75): north, south and below; east and
    // west are the open tunnel.
    expect(mineTargets(state).length).toBe(3);
  });

  it('relighting the lamp (crafting oil) shows the exposed faces round it', () => {
    const dark = inTheDark({ coal: 1 });
    const { state: lit } = act(dark, { type: 'craft', recipe: 'lampOil' });

    expect(lit.lampOil).toBeGreaterThan(0);
    for (const pos of shownByLight(here)) {
      expect(isRevealed(lit, pos), key(pos)).toBe(true);
    }
    expect(mineTargets(lit).length).toBe(3);
  });

  it('keeps what was revealed when the lamp goes out', () => {
    const lit = buildState({ layers: tunnelLayers(), avatar: here, lampOil: 1 });
    updateReveal(lit, []);
    const dark = waitForTheLampToGoOut(lit);

    for (const pos of shownByLight(here)) {
      expect(isRevealed(dark, pos), key(pos)).toBe(true);
    }
    expect(mineTargets(dark).length).toBe(3);
  });
});

describe('a torch placed before the lamp goes out', () => {
  // The miner stands at tunnel cell 3 and digs a side passage north: the
  // wall beside it while the lamp is lit (so its floor is seen and it can
  // step in), then, once the lamp is out, the block beyond that.
  const here = inTunnel(3);
  const firstBlock: Vec3 = { x: here.x, y: here.y - 1, z: here.z };
  const secondBlock: Vec3 = { x: here.x, y: here.y - 2, z: here.z };

  /** Dig the side passage after the lamp has gone out, with or without a torch at `here`. */
  function digNorthInTheDark(withTorch: boolean): GameState {
    let state = buildState({
      layers: tunnelLayers(),
      avatar: here,
      lampOil: 1,
      inventory: { torch: 1 },
    });
    updateReveal(state, []);
    if (withTorch) {
      state = act(state, { type: 'placeTorch', target: here }).state;
    }
    // Lit, the newly opened cell shows its floor, so the step into it can be
    // judged (issue #75: the lamp shows only exposed faces).
    state = act(state, { type: 'mine', target: firstBlock }).state;
    state = act(state, { type: 'move', to: firstBlock }).state;
    state = waitForTheLampToGoOut(state);
    state = act(state, { type: 'mine', target: secondBlock }).state;
    // A new shift, so that what is offered next is not cut short by AP.
    return endShift(state).state;
  }

  it('without a torch, the new cell is felt but nothing around it is known', () => {
    const state = digNorthInTheDark(false);

    for (const pos of diagonals(firstBlock).filter((cell) => cell.y === secondBlock.y)) {
      expect(isRevealed(state, pos), key(pos)).toBe(false);
      expect(mineTargets(state)).not.toContain(key(pos));
    }
    // The floor of the new cell is not known. The miner has no gravity (issue
    // #80), so that does not matter: the step into it is offered.
    expect(isRevealed(state, { ...secondBlock, z: secondBlock.z + 1 })).toBe(false);
    expect(moveTargets(state)).toContain(key(secondBlock));
  });

  it('with a torch, its light shows the cells round the new cell, and they can be mined', () => {
    const state = digNorthInTheDark(true);

    expect(state.lampOil).toBe(0);
    // The new cell is two steps from the torch, so it is lit, and every cell
    // touching it is revealed: these two are diagonals of the miner's cell,
    // which the pick does not reach (issue #75), but the map shows.
    for (const pos of diagonals(firstBlock).filter((cell) => cell.y === secondBlock.y)) {
      expect(isRevealed(state, pos), key(pos)).toBe(true);
      expect(mineTargets(state)).not.toContain(key(pos));
    }
    // Its floor is revealed too.
    expect(isRevealed(state, { ...secondBlock, z: secondBlock.z + 1 })).toBe(true);
    expect(moveTargets(state)).toContain(key(secondBlock));
  });
});

describe('with the lamp out, every open cell the miner touches can be moved into (issue #80)', () => {
  it('offers a walk along a tunnel whose floor has not been seen', () => {
    const state = buildState({ layers: tunnelLayers(), avatar: inTunnel(0), lampOil: 0 });
    arriveAt(state, inTunnel(3));

    // East and west are open and felt; the rock under them is not, and it
    // does not matter: nothing has to hold the miner up.
    expect(isRevealed(state, inTunnel(4))).toBe(true);
    expect(isRevealed(state, { ...inTunnel(4), z: inTunnel(4).z + 1 })).toBe(false);
    expect(moveTargets(state)).toEqual(keys([inTunnel(2), inTunnel(4)]));
  });

  it('offers a move out over a pit, and down into it, without seeing its bottom', () => {
    // A one-row cube seen from the side. The avatar stands at (0,0,1); beside
    // it at x = 1 is the top of a pit 1 deep.
    //
    //            x: 0 1 2
    //   z = 0       # # #
    //   z = 1       @ . #
    //   z = 2       # . #
    //   z = 3       # # #
    const layers = [['###'], ['..#'], ['#.#'], ['###']];
    const overThePit: Vec3 = { x: 1, y: 0, z: 1 };
    const dark = buildState({ layers, avatar: { x: 0, y: 0, z: 1 }, lampOil: 0 });
    updateReveal(dark, []);
    expect(isRevealed(dark, { x: 1, y: 0, z: 2 })).toBe(false);
    expect(findActions(dark, { type: 'move' })).toEqual([{ type: 'move', to: overThePit, ap: 1 }]);

    const { state: over } = act(dark, { type: 'move', to: overThePit });
    // Now the cell below is felt, and open: the miner may move down into it.
    expect(findActions(over, { type: 'move', to: { x: 1, y: 0, z: 2 } })).toHaveLength(1);
  });
});
