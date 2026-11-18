// Scenario tests for "light matters" (issue #33; decision note 0010).
//
// With the lamp out the miner works by touch: only the six cells that share a
// face with its own are revealed by reach. The diagonals and the ring of cells
// around the one below are not, and it cannot look over an edge. Mining still
// needs a revealed block, and a move is offered only when every cell it is
// judged by is revealed.
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

  it('with the lamp lit, reveals and offers all 17 cells in reach as before', () => {
    const state = buildState({ layers: tunnelLayers(), avatar: inTunnel(0), lampOil: 1 });
    arriveAt(state, here);
    for (const pos of [...diagonals(here), ...ringBelow(here)]) {
      expect(isRevealed(state, pos), key(pos)).toBe(true);
    }
    // 17 in reach, less the two open tunnel cells east and west.
    expect(mineTargets(state).length).toBe(15);
  });

  it('relighting the lamp (crafting oil) reveals the diagonals and the ring below', () => {
    const dark = inTheDark({ coal: 1 });
    const { state: lit } = act(dark, { type: 'craft', recipe: 'lampOil' });

    expect(lit.lampOil).toBeGreaterThan(0);
    for (const pos of [...diagonals(here), ...ringBelow(here)]) {
      expect(isRevealed(lit, pos), key(pos)).toBe(true);
    }
    expect(mineTargets(lit).length).toBe(15);
  });

  it('keeps what was revealed when the lamp goes out', () => {
    const lit = buildState({ layers: tunnelLayers(), avatar: here, lampOil: 1 });
    updateReveal(lit, []);
    const dark = waitForTheLampToGoOut(lit);

    for (const pos of [...diagonals(here), ...ringBelow(here)]) {
      expect(isRevealed(dark, pos), key(pos)).toBe(true);
    }
    // A full shift's AP is back, so every block in reach is affordable again.
    expect(mineTargets(dark).length).toBe(15);
  });
});

describe('a torch placed before the lamp goes out', () => {
  // The miner stands at tunnel cell 3 and digs a side passage north in the
  // dark: first the wall beside it, then the block beyond that.
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
    state = waitForTheLampToGoOut(state);
    state = act(state, { type: 'mine', target: firstBlock }).state;
    // The floor of `firstBlock` was in reach while the lamp was lit, so the
    // step into it can be judged.
    state = act(state, { type: 'move', to: firstBlock }).state;
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
    // The floor of the new cell is not known, so the step into it is not offered.
    expect(isRevealed(state, { ...secondBlock, z: secondBlock.z + 1 })).toBe(false);
    expect(moveTargets(state)).not.toContain(key(secondBlock));
  });

  it('with a torch, its light shows the cells round the new cell, and they can be mined', () => {
    const state = digNorthInTheDark(true);

    expect(state.lampOil).toBe(0);
    // The new cell is two steps from the torch, so it is lit, and every cell
    // touching it is revealed: these two are diagonals of the miner's cell.
    for (const pos of diagonals(firstBlock).filter((cell) => cell.y === secondBlock.y)) {
      expect(isRevealed(state, pos), key(pos)).toBe(true);
      expect(mineTargets(state)).toContain(key(pos));
    }
    // Its floor is revealed too, so the miner can walk on.
    expect(isRevealed(state, { ...secondBlock, z: secondBlock.z + 1 })).toBe(true);
    expect(moveTargets(state)).toContain(key(secondBlock));
  });
});

describe('with the lamp out, a move is offered only when it can be judged', () => {
  it('does not offer a walk onto a floor the miner has not seen, and offers it once lit', () => {
    const state = buildState({
      layers: tunnelLayers(),
      avatar: inTunnel(0),
      lampOil: 0,
      inventory: { coal: 1 },
    });
    arriveAt(state, inTunnel(3));

    // East and west are open and felt, but the rock under them is not.
    expect(isRevealed(state, inTunnel(4))).toBe(true);
    expect(findActions(state, { type: 'move' })).toEqual([]);

    const { state: lit } = act(state, { type: 'craft', recipe: 'lampOil' });
    expect(moveTargets(lit)).toEqual(keys([inTunnel(2), inTunnel(4)]));
  });

  it('still offers a walk along a tunnel whose floor was seen earlier', () => {
    const lit = buildState({ layers: tunnelLayers(), avatar: inTunnel(3), lampOil: 1 });
    updateReveal(lit, []);
    const dark = waitForTheLampToGoOut(lit);

    expect(moveTargets(dark)).toEqual(keys([inTunnel(2), inTunnel(4)]));
    // And after the step, the next one: the lamp showed 3 cells of floor each way.
    const { state: next } = act(dark, { type: 'move', to: inTunnel(4) });
    expect(moveTargets(next)).toEqual(keys([inTunnel(3), inTunnel(5)]));
  });

  // A one-row cube seen from the side. The avatar stands at (0,0,1); beside
  // it at x = 1 is the top of a pit 1 deep.
  //
  //            x: 0 1 2
  //   z = 0       # # #
  //   z = 1       @ . #
  //   z = 2       # . #
  //   z = 3       # # #
  const pitLayers = [['###'], ['..#'], ['#.#'], ['###']];
  const besideThePit: Vec3 = { x: 0, y: 0, z: 1 };
  const overThePit: Vec3 = { x: 1, y: 0, z: 1 };

  it('does not offer a walk off an edge whose drop it cannot judge, and offers it once lit', () => {
    const dark = buildState({
      layers: pitLayers,
      avatar: besideThePit,
      lampOil: 0,
      inventory: { coal: 1 },
    });
    updateReveal(dark, []);

    // No looking over the edge in the dark: the pit is not seen.
    expect(isRevealed(dark, { x: 1, y: 0, z: 2 })).toBe(false);
    expect(findActions(dark, { type: 'move' })).toEqual([]);

    const { state: lit } = act(dark, { type: 'craft', recipe: 'lampOil' });
    expect(findActions(lit, { type: 'move' })).toEqual([
      { type: 'move', to: overThePit, drop: 1, ap: 1 },
    ]);
  });

  it('does not offer a climb down off a ladder whose drop it cannot judge', () => {
    // A shaft seen from the side, the avatar on a single ladder at its top
    // with the floor 2 below: (1,0,0) ladder, (1,0,1) open, (1,0,2) rock.
    const layers = [['#.#'], ['#.#'], ['###'], ['###']];
    const top: Vec3 = { x: 1, y: 0, z: 0 };
    const dark = buildState({
      layers,
      avatar: top,
      ladders: [top],
      lampOil: 0,
      inventory: { coal: 1 },
    });
    updateReveal(dark, []);

    // The cell below is felt; what is under it is not.
    expect(findActions(dark, { type: 'move', to: { x: 1, y: 0, z: 1 } })).toEqual([]);

    const { state: lit } = act(dark, { type: 'craft', recipe: 'lampOil' });
    expect(findActions(lit, { type: 'move', to: { x: 1, y: 0, z: 1 } })).toEqual([
      { type: 'move', to: { x: 1, y: 0, z: 1 }, drop: 0, ap: 1 },
    ]);
  });

  it('offers a climb down onto a ladder it can feel, whatever is under that', () => {
    const layers = [['#.#'], ['#.#'], ['#.#'], ['#.#'], ['#.#'], ['###']];
    const top: Vec3 = { x: 1, y: 0, z: 0 };
    const next: Vec3 = { x: 1, y: 0, z: 1 };
    const dark = buildState({ layers, avatar: top, ladders: [top, next], lampOil: 0 });
    updateReveal(dark, []);

    expect(findActions(dark, { type: 'move', to: next })).toEqual([
      { type: 'move', to: next, drop: 0, ap: 1 },
    ]);
  });

  it('does not offer a step up onto a cell it has not seen, and offers it once lit', () => {
    // Seen from the side: the avatar at (0,0,1) with headroom, a block beside
    // it at (1,0,1) and an open cell on top of that block at (1,0,0).
    //
    //            x: 0 1 2
    //   z = 0       . . #
    //   z = 1       @ # #
    //   z = 2       # # #
    //
    // Two layers of rock above keep daylight out; they shift every z by 2.
    const layers = [['###'], ['###'], ['..#'], ['.##'], ['###']];
    const start: Vec3 = { x: 0, y: 0, z: 3 };
    const onTop: Vec3 = { x: 1, y: 0, z: 2 };
    const dark = buildState({ layers, avatar: start, lampOil: 0, inventory: { coal: 1 } });
    updateReveal(dark, []);

    expect(isRevealed(dark, onTop)).toBe(false);
    expect(findActions(dark, { type: 'move' })).toEqual([]);

    const { state: lit } = act(dark, { type: 'craft', recipe: 'lampOil' });
    expect(findActions(lit, { type: 'move' })).toEqual([
      { type: 'move', to: onTop, drop: 0, ap: 1 },
    ]);
  });
});
