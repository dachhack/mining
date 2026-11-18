// Footing: what holds the avatar up, and how far it would fall without it
// (decision note 0005 items 5 and 7).
//
// These questions are asked both by gravity.ts, which makes the avatar fall,
// and by actions/move.ts, which must know the depth of a drop before the
// player chooses it. They are in a file of their own so that neither module
// has to import the other.

import { STRUCTURES } from '../data';
import type { Vec3 } from '../data';
import { isSolid, structureAt } from './state';
import type { GameState } from './state';

/** The cell directly below `pos`. Depth grows with z, so "down" is z + 1. */
export function cellBelow(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y, z: pos.z + 1 };
}

/** True if the cell `pos` holds a ladder. */
export function hasLadder(state: GameState, pos: Vec3): boolean {
  return structureAt(state, pos) === STRUCTURES.ladder.code;
}

/**
 * True if an avatar in the cell `pos` would be held up (0005 item 5): by a
 * solid block below it, or by a ladder in the cell itself. The surface has no
 * footing of its own: there the avatar stands on the `z = 0` blocks.
 */
export function hasFooting(state: GameState, pos: Vec3): boolean {
  return isSolid(state, cellBelow(pos)) || hasLadder(state, pos);
}

/**
 * How many blocks an avatar in the cell `pos` would fall before it has
 * footing; 0 if it has footing where it is. A ladder on the way down catches
 * the avatar, because a ladder in its own cell is footing.
 *
 * The loop always ends: everything below the bottom of the cube is bedrock.
 */
export function avatarFallDistance(state: GameState, pos: Vec3): number {
  let current = pos;
  let distance = 0;
  while (!hasFooting(state, current)) {
    current = cellBelow(current);
    distance += 1;
  }
  return distance;
}
