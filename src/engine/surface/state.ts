// Reading and changing the surface (issue #70; decision note 0020).
//
// The surface is the layer of open air directly above layer 0 (`z = -1`),
// one cell for each column of the cube. `GameState.surface` holds the kind of
// each cell (tree, stump, dirt path, meadow, stone outcrop) and
// `GameState.stumpAge` how far a stump's regrowth count has gone. Only this
// file knows how those two arrays are laid out.
//
// A tree is not a block: `blockAt` still answers "open air" for every surface
// cell, so water, gas and air paths treat the forest as open air, as they
// treated the bare surface. What a tree changes is said where it matters:
// walking (actions/move.ts), light and reveal (reveal.ts), mining the ground
// under it (actions/mine.ts), and cutting (actions/cutTree.ts).

import { SURFACE, WORLD } from '../../data';
import type { Vec3 } from '../../data';
import { isSurface } from '../state';
import type { GameState } from '../state';

/**
 * Where the surface cell above column (x, y) lives in the surface arrays:
 * row by row, like one layer of the cube. Throws outside the footprint.
 */
function surfaceIndex(state: GameState, pos: Vec3): number {
  if (!isSurface(state.size, pos)) {
    throw new Error(`(${pos.x}, ${pos.y}, ${pos.z}) is not a surface cell`);
  }
  return pos.x + state.size.x * pos.y;
}

/**
 * The surface cell directly above the column of `pos`: the cell at
 * `z = -1` with the same x and y.
 */
export function surfaceCellAbove(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y, z: WORLD.surfaceZ };
}

/**
 * The kind code (`SURFACE.kinds`) of the surface cell `pos`. Throws if `pos`
 * is not a surface cell.
 */
export function surfaceKindAt(state: GameState, pos: Vec3): number {
  return state.surface[surfaceIndex(state, pos)] as number;
}

/** Make the surface cell `pos` a cell of another kind. */
export function setSurfaceKind(state: GameState, pos: Vec3, code: number): void {
  state.surface[surfaceIndex(state, pos)] = code;
}

/** How far the stump at `pos` has counted towards regrowing (0 for any other kind). */
export function stumpAgeAt(state: GameState, pos: Vec3): number {
  return state.stumpAge[surfaceIndex(state, pos)] as number;
}

export function setStumpAge(state: GameState, pos: Vec3, age: number): void {
  if (!Number.isInteger(age) || age < 0 || age > 255) {
    throw new Error(`A stump's age must be a whole number 0 to 255, but is ${age}`);
  }
  state.stumpAge[surfaceIndex(state, pos)] = age;
}

/**
 * True if `pos` is a surface cell with a tree in it. Answers for any
 * position: a cell that is not on the surface never holds a tree.
 */
export function hasTree(state: GameState, pos: Vec3): boolean {
  return isSurface(state.size, pos) && surfaceKindAt(state, pos) === SURFACE.kinds.tree.code;
}

/** True if `pos` is a surface cell with a stump in it. Answers for any position. */
export function hasStump(state: GameState, pos: Vec3): boolean {
  return isSurface(state.size, pos) && surfaceKindAt(state, pos) === SURFACE.kinds.stump.code;
}

/**
 * True if `pos` is a cell of layer 0 with a tree directly above it: the
 * ground a tree hides (issue #70 item 1). Answers for any position.
 */
export function isUnderTree(state: GameState, pos: Vec3): boolean {
  return pos.z === 0 && hasTree(state, surfaceCellAbove(pos));
}

/** Every surface cell, row by row (y, then x): the order the surface arrays store them in. */
export function surfaceCells(state: GameState): Vec3[] {
  const cells: Vec3[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      cells.push({ x, y, z: WORLD.surfaceZ });
    }
  }
  return cells;
}
