// Breaking into an underground space, and what then stands on the square
// (design doc v0.2 sections 6.2 and 3.4; question 80; issue #95, task T9;
// decision note 0030).
//
// An underground space is a cavern, or a water, lava or gas pocket: open
// cells under solid rock. When the block removed from a square was the roof
// of one, the whole space collapses to rubble at once and what it held is
// pushed out onto that square:
//
//   before          the mine          after
//   # # # #         # . # #           # ~ # #      ~ water standing on the
//   # ~ ~ #         # ~ ~ #           # R R #        mined square (2 units)
//   # # # #         # # # #           # # # #      R rubble
//
// So the square goes down exactly 1 level, as after any mine, and the level
// rule still holds ([Decided], design doc 4.2).
//
// WHERE THE CONTENTS ARE STORED. The state keeps water, lava and gas cell by
// cell. What stands ON a square is kept in the open cells above its top
// block, and `contentsOn` at the bottom of this file adds those cells up. A
// breach puts everything in one cell: the cell the mined block was in,
// directly above the new top. A cell stores a count 0 to 255; the data
// validator checks that the largest pocket fits.
//
// WHAT IS NOT HERE. What a breach puts on a square spreads in the cube phase:
// water and lava by cube/fluids.ts (task T10), gas by cube/gas.ts (task T11).

import { BLOCKS, HAZARDS } from '../data';
import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import { depthAt, isSquare } from './heightmap';
import {
  cellIndex,
  gasAt,
  inGrid,
  isLavaSource,
  isOpen,
  lavaAt,
  setBlock,
  setGas,
  setLava,
  setWater,
  waterAt,
} from './state';
import type { GameState } from './state';

// The six face neighbours of a cell, in a fixed order.
const FACE_STEPS: readonly Vec3[] = [
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/**
 * If the cell under the open cell `opened` is open too, `opened` was the
 * place of a roof block: collapse the space below it and put its contents on
 * the square. Returns true if a space collapsed.
 *
 * `opened` is the cell a block has just been removed from: the lowest open
 * cell of its square, with only open cells above it. The mine action calls
 * this; so should anything else that takes a square's top block away (a
 * slump, an explosion), right after it does.
 *
 * - The space is every open cell that can be reached from the cell under
 *   `opened` through faces, staying underground. A cell is underground when
 *   it lies below the top of its own square; in the square of `opened`, when
 *   it lies below `opened`.
 * - Every cell of the space becomes rubble and loses its water, lava and gas.
 *   The square's new top block is the rubble directly under `opened`.
 * - What the cells held is added up and put in `opened`, where it stands on
 *   the square: all the water, all the lava, all the gas.
 * - Lava sources (design doc 6.2): if the space held lava in more than
 *   `HAZARDS.lava.sourcePocketCellsOver` cells (or in a cell already marked
 *   as a source), the lava on the square is a source.
 * - Emits `spaceCollapsed`, which names `opened`'s square and what came out.
 *   It names no other cell: the rest of the space, now rubble, stays hidden
 *   until each square is dug down to it.
 * - Reveals nothing (the dispatcher's `updateReveal` shows the new top) and
 *   uses no randomness.
 */
export function collapseSpaceUnder(state: GameState, opened: Vec3, events: GameEvent[]): boolean {
  const start = { x: opened.x, y: opened.y, z: opened.z + 1 };
  // `inGrid` stops at the bottom of the cube: below it there is only bedrock.
  if (!inGrid(state.size, start) || !isOpen(state, start)) {
    return false;
  }

  // The layer of each square's top block, worked out once per square before
  // anything is changed. Keys are "x,y".
  const topLayers = new Map<string, number>();
  function topLayerOf(x: number, y: number): number {
    const key = `${x},${y}`;
    let top = topLayers.get(key);
    if (top === undefined) {
      // In the square being mined the roof is already gone, so `depthAt`
      // would look straight through the space: its "top" is `opened`.
      top = x === opened.x && y === opened.y ? opened.z : depthAt(state, x, y);
      topLayers.set(key, top);
    }
    return top;
  }

  // Flood fill: like a breadth-first search over the open underground cells.
  const cells: Vec3[] = [start];
  const seen = new Set<number>([cellIndex(state.size, start)]);
  for (let next = 0; next < cells.length; next += 1) {
    const cell = cells[next] as Vec3;
    for (const step of FACE_STEPS) {
      const near = { x: cell.x + step.x, y: cell.y + step.y, z: cell.z + step.z };
      if (!inGrid(state.size, near) || !isOpen(state, near)) {
        continue;
      }
      if (near.z <= topLayerOf(near.x, near.y)) {
        continue; // open to the sky: part of the pit, not of the space
      }
      const index = cellIndex(state.size, near);
      if (!seen.has(index)) {
        seen.add(index);
        cells.push(near);
      }
    }
  }

  // Add up what the space holds, and turn it to rubble.
  let water = 0;
  let lava = 0;
  let gas = 0;
  let lavaCells = 0;
  let hadSource = false;
  for (const cell of cells) {
    water += waterAt(state, cell);
    gas += gasAt(state, cell);
    const lavaHere = lavaAt(state, cell);
    lava += lavaHere;
    if (lavaHere > 0) {
      lavaCells += 1;
    }
    if (isLavaSource(state, cell)) {
      hadSource = true;
    }
    setWater(state, cell, 0);
    setLava(state, cell, 0);
    setGas(state, cell, 0);
    setBlock(state, cell, BLOCKS.rubble.code);
  }
  const lavaSource = lava > 0 && (hadSource || lavaCells > HAZARDS.lava.sourcePocketCellsOver);

  // Push the contents out onto the square. `Math.min` only guards the byte a
  // cell stores; the data validator keeps generated pockets well below it.
  if (water > 0) {
    setWater(state, opened, Math.min(255, waterAt(state, opened) + water));
  }
  if (lava > 0) {
    const sourceAlready = isLavaSource(state, opened);
    setLava(
      state,
      opened,
      Math.min(255, lavaAt(state, opened) + lava),
      lavaSource || sourceAlready,
    );
  }
  if (gas > 0) {
    setGas(state, opened, Math.min(255, gasAt(state, opened) + gas));
  }

  events.push({
    type: 'spaceCollapsed',
    pos: start,
    water,
    lava,
    gas,
    lavaSource,
  });
  return true;
}

// ---------------------------------------------------------------------------
// What stands on a square. All of it is in the open, above the top block, so
// the player sees it (design doc 3.4).
// ---------------------------------------------------------------------------

/** What stands on one square: units of water, lava and gas. */
export interface SquareContents {
  water: number;
  lava: number;
  /** True if the lava on the square is a source, which keeps pouring (design doc 6.2). */
  lavaSource: boolean;
  gas: number;
}

/**
 * What stands on the square (x, y): the water, lava and gas in the open
 * cells above its top block, added up. Nothing below the top block is read.
 * Throws if (x, y) is not a square. Does not change `state`.
 */
export function contentsOn(state: GameState, x: number, y: number): SquareContents {
  if (!isSquare(state, x, y)) {
    throw new Error(`(${x}, ${y}) is not a square of the cube`);
  }
  const contents: SquareContents = { water: 0, lava: 0, lavaSource: false, gas: 0 };
  const depth = depthAt(state, x, y);
  for (let z = 0; z < depth; z += 1) {
    const cell = { x, y, z };
    contents.water += waterAt(state, cell);
    contents.lava += lavaAt(state, cell);
    contents.gas += gasAt(state, cell);
    if (isLavaSource(state, cell)) {
      contents.lavaSource = true;
    }
  }
  return contents;
}
