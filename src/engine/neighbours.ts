// Which cells count as "next to" a cell, as lists of offsets in a fixed order.
//
// The sideways neighbours of a square are `SQUARE_STEPS` in heightmap.ts. The
// six face neighbours of a cell, below, are for the hazards of the cube phase,
// which still work in 3D under the surface.

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
