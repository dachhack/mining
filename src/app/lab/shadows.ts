// UI lab 1 (issue #116): which edges of a square get a shadow.
//
// Where a square is lower than a face neighbour, the lab draws a light
// shadow on the lower square, along the edge that faces the higher
// neighbour. The level rule keeps every difference to 1 level, so a shadow
// is either there or not; it has no strength.
//
// Pure: no DOM, so the unit tests can check it on a hand-made depth map.

import { SQUARE_STEPS, depthIn } from '../../engine';
import type { DepthMap, SquareDirection } from '../../engine';

/**
 * The edges of square (x, y) that face a higher (shallower) neighbour, in
 * the order north, east, south, west. The cube's side walls cast no shadow.
 */
export function shadowEdges(map: DepthMap, x: number, y: number): SquareDirection[] {
  const depth = depthIn(map, x, y);
  const edges: SquareDirection[] = [];
  for (const step of SQUARE_STEPS) {
    const nx = x + step.dx;
    const ny = y + step.dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) {
      continue;
    }
    if (depthIn(map, nx, ny) < depth) {
      edges.push(step.direction);
    }
  }
  return edges;
}
