// Which cells count as "next to" a cell, as lists of offsets in a fixed order.
//
// These are in a file of their own, not in reveal.ts or actions/mine.ts,
// because the reveal rule and three action modules all need them, and a test
// that swaps one of those modules for a fake must not lose them.

import type { Vec3 } from '../data';

/** The cell at `pos` moved by `offset`. */
export function offsetPosition(pos: Vec3, offset: Vec3): Vec3 {
  return { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
}

/**
 * The six cells that share a face with a cell, as offsets from it. The order
 * is fixed, so that lists built from it come out the same way every time.
 * `readonly` means the list cannot be changed by code that imports it.
 */
export const FACE_OFFSETS: readonly Vec3[] = [
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: -1 }, // above (z grows downwards)
  { x: 0, y: 0, z: 1 }, // below
];

/**
 * The cells the pick can reach, as offsets from the avatar (0005 item 10):
 * the 4 orthogonal neighbours, the 4 diagonals on the avatar's level, the
 * cell below, and the 8 cells around the one below. 17 in all. The cell
 * overhead is not among them (0005 item 11).
 *
 * The order is fixed, and is the order `legalMineActions` lists them in.
 */
export const MINE_REACH_OFFSETS: readonly Vec3[] = [
  // The avatar's level: orthogonal neighbours, then diagonals.
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 1, z: 0 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: -1, z: 0 },
  // One level down: straight below, then the 8 cells around it.
  { x: 0, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
  { x: 1, y: 0, z: 1 },
  { x: 0, y: 1, z: 1 },
  { x: -1, y: 0, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: -1, y: 1, z: 1 },
  { x: -1, y: -1, z: 1 },
];
