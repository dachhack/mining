// Cube generation. STUB: filled in by M1 task 2.

import { BLOCKS } from '../../data';
import type { CubeSize } from '../../data';
import { cellCount } from '../state';
import type { RngState } from '../rng';

/**
 * Generate the blocks of a new cube.
 *
 * Contract:
 * - Returns a new array of `size.x * size.y * size.z` block codes, laid out as
 *   `cellIndex` in state.ts describes.
 * - All randomness comes from `rng`, which it advances. The same `size` and
 *   the same starting `rng` always give the same cube.
 * - It must work for any size, including the small cubes tests use.
 * - M1 generates dirt, stone, hard rock, coal, timber-root, iron ore, copper
 *   ore and crystal in the depth bands of design doc 3.1, with ore in
 *   connected veins (0005 items 3 and 4). It generates no open space.
 * - Its numbers (vein sizes, frequencies) go in `src/data`.
 *
 * Stub behaviour: every cell is stone, and `rng` is not used.
 */
// The underscore marks a parameter the stub does not use yet.
export function generateCube(size: CubeSize, _rng: RngState): Uint8Array {
  const blocks = new Uint8Array(cellCount(size));
  blocks.fill(BLOCKS.stone.code);
  return blocks;
}
