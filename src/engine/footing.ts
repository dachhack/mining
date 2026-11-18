// Footing: what holds the avatar up, and how far it would fall without it
// (decision note 0005 items 5 and 7).
//
// These questions are asked both by gravity.ts, which makes the avatar fall,
// and by actions/move.ts, which must know the depth of a drop before the
// player chooses it. They are in a file of their own so that neither module
// has to import the other.

import { STRUCTURES } from '../data';
import type { Vec3 } from '../data';
import { isRevealed, isSolid, structureAt } from './state';
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

/**
 * The same question as `avatarFallDistance`, answered only from cells the
 * player has seen, for a move that must show its drop before it is chosen
 * (issue #33; decision note 0011). The cell `pos` itself must be revealed.
 *
 * Returns:
 * - the number of blocks the avatar would fall from `pos`, if that is at most
 *   `maxDistance` and every cell it took to work out is revealed;
 * - `maxDistance + 1` if the drop is longer than `maxDistance` (how much
 *   longer does not matter: such a move is never offered);
 * - `null` if a cell that had to be looked at is not revealed. The caller
 *   must then not offer the move, or the action list would tell the player
 *   what an unseen cell holds.
 *
 * The cells are read in order going down, and the walk stops at the first
 * unrevealed one, so nothing below it is read at all. A ladder is read only
 * in a cell already known to be revealed and open. Cells outside the grid
 * count as revealed (`isRevealed`): bedrock and the surface never change.
 */
export function knownFallDistance(state: GameState, pos: Vec3, maxDistance: number): number | null {
  let current = pos;
  let distance = 0;
  while (distance <= maxDistance) {
    if (hasLadder(state, current)) {
      return distance;
    }
    const below = cellBelow(current);
    if (!isRevealed(state, below)) {
      return null;
    }
    if (isSolid(state, below)) {
      return distance;
    }
    current = below;
    distance += 1;
  }
  return distance;
}
