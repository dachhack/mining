// The cube seen from above, as a heightmap (design doc v0.2 section 3.1 and
// 4.2; decision note 0025; issue #84).
//
// A "square" is one column (x, y) of the cube. These functions answer three
// questions about a square by reading the 3D cube that is already stored:
//
//   depthAt     how many levels down is the square?
//   topBlockAt  which block does the player see there?
//   mayMine     does the level rule let the player mine it?
//
// They are pure: they read the state and change nothing. The mine action
// (actions/mine.ts) is built on them since task T2 (issue #86).
//
// The level rule needs no number here. "After mining, the square is at most 1
// level lower than each face neighbour" is the same as "before mining, no
// face neighbour is higher than the square", and that is what `mayMine`
// checks.

import type { GameState } from './state';
import { blockAt, isSolid } from './state';

/** A square: one column of the cube, named by its x and y. */
export interface Square {
  x: number;
  y: number;
}

/** The four sideways directions, in the fixed order north, east, south, west. */
export type SquareDirection = 'north' | 'east' | 'south' | 'west';

/** One step sideways from a square: a direction and the change in x and y it means. */
export interface SquareStep {
  direction: SquareDirection;
  dx: number;
  dy: number;
}

/**
 * The four squares that share a side with a square, as steps from it, in the
 * same order as the sideways entries of `FACE_OFFSETS` (north is y - 1, as on
 * the maps). No diagonals. The order is fixed, so lists built from it come out
 * the same way every time. `readonly` means importing code cannot change it.
 */
export const SQUARE_STEPS: readonly SquareStep[] = [
  { direction: 'north', dx: 0, dy: -1 },
  { direction: 'east', dx: 1, dy: 0 },
  { direction: 'south', dx: 0, dy: 1 },
  { direction: 'west', dx: -1, dy: 0 },
];

/** True if (x, y) is one of the cube's squares. */
export function isSquare(state: GameState, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < state.size.x &&
    y >= 0 &&
    y < state.size.y
  );
}

/** Throws unless (x, y) is one of the cube's squares, so a bad coordinate cannot pass silently. */
function requireSquare(state: GameState, x: number, y: number): void {
  if (!isSquare(state, x, y)) {
    throw new Error(`(${x}, ${y}) is not a square of the cube`);
  }
}

/**
 * How deep the square (x, y) is: the layer `z` of its first solid block,
 * counting down from the top. 0 is untouched ground. A square with no solid
 * block left is at depth `state.size.z` (32 in the real cube): the bottom.
 *
 * For a column that has only ever been dug from the top, this is the number
 * of blocks removed from it, as the design doc defines depth.
 *
 * Open cells further down (a cavern or a pocket from generation, under solid
 * rock) do not count: only the open cells above the first solid block do. So
 * a square over an unbroken cavern is as deep as its roof. When a mine takes
 * the roof's last block, the cavern collapses to rubble in the same action
 * (breach.ts), so the square is then exactly 1 deeper.
 *
 * Throws if (x, y) is not a square.
 */
export function depthAt(state: GameState, x: number, y: number): number {
  requireSquare(state, x, y);
  for (let z = 0; z < state.size.z; z += 1) {
    if (isSolid(state, { x, y, z })) {
      return z;
    }
  }
  return state.size.z;
}

/**
 * The block code of the square's top block: the block in layer
 * `depthAt(state, x, y)`, which is the first solid block from the top. For a
 * square with no solid block left this is bedrock, the floor under the cube.
 *
 * The surface (a tree, a stump, a meadow) is not a block and is not looked
 * at here: under a tree this still answers the layer-0 block.
 *
 * Throws if (x, y) is not a square.
 */
export function topBlockAt(state: GameState, x: number, y: number): number {
  const depth = depthAt(state, x, y);
  // One layer below the bottom, `blockAt` answers bedrock by itself.
  return blockAt(state, { x, y, z: depth });
}

/** Why `mayMine` refused. */
export type MineRefusal =
  /** The square has no block left: it shows the bedrock floor. */
  | 'bottom'
  /** The level rule: at least one face neighbour is higher than the square. */
  | 'neighbourHigher';

/** A face neighbour that is higher (shallower) than the square asked about. */
export interface HigherNeighbour {
  direction: SquareDirection;
  x: number;
  y: number;
  /** The neighbour's depth, which is less than the square's. */
  depth: number;
}

/** The answer of `mayMine`. */
export interface MayMineResult {
  /** True if the square's top block may be mined. */
  allowed: boolean;
  /** Why not; `null` when `allowed` is true. */
  refusal: MineRefusal | null;
  /**
   * The neighbours that are too high, in the order north, east, south, west.
   * Empty unless `refusal` is 'neighbourHigher'.
   */
  higherNeighbours: HigherNeighbour[];
}

/**
 * The level rule (design doc 4.2, [Decided]; owner: "After mining, at most 1
 * step"): may the player mine the top block of square (x, y)?
 *
 * A square may be mined only when none of its four face neighbours is higher
 * than it. Then, after the mine, it is at most 1 level lower than each of
 * them. Diagonal squares do not count. The cube's side walls are not
 * neighbours ([Default], question 84), so an edge square is limited by its 3
 * neighbours and a corner square by its 2.
 *
 * A square with no block left ('bottom') is refused too.
 *
 * This checks the shape of the ground only. It does not look at trees, lava,
 * camps, action points or whether the run is over; the mine action
 * (`mineCheck` in actions/mine.ts) adds the checks that exist so far.
 *
 * Throws if (x, y) is not a square.
 */
export function mayMine(state: GameState, x: number, y: number): MayMineResult {
  const depth = depthAt(state, x, y);
  if (depth >= state.size.z) {
    return { allowed: false, refusal: 'bottom', higherNeighbours: [] };
  }

  const higherNeighbours: HigherNeighbour[] = [];
  for (const step of SQUARE_STEPS) {
    const nx = x + step.dx;
    const ny = y + step.dy;
    if (!isSquare(state, nx, ny)) {
      continue; // beyond the side of the cube: the wall is not a neighbour
    }
    const neighbourDepth = depthAt(state, nx, ny);
    // "Higher" means shallower: a smaller depth.
    if (neighbourDepth < depth) {
      higherNeighbours.push({ direction: step.direction, x: nx, y: ny, depth: neighbourDepth });
    }
  }

  if (higherNeighbours.length > 0) {
    return { allowed: false, refusal: 'neighbourHigher', higherNeighbours };
  }
  return { allowed: true, refusal: null, higherNeighbours: [] };
}
