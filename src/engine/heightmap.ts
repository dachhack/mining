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
// The second half of the file is the slide path of design doc 6.1 (issue
// #94): where a loose block on a square would slide to. It reads depths and
// nothing else, so it is worked out on a `DepthMap`, a plain table of every
// square's depth:
//
//   depthMapOf   every square's depth, read from the cube once
//   slidePathIn  the squares a block would slide over, down to the foot
//   footIn       where the path ends
//   fallIn       how much deeper the foot is than the square
//
// The level rule needs no number here. "After mining, the square is at most 1
// level lower than each face neighbour" is the same as "before mining, no
// face neighbour is higher than the square", and that is what `mayMine`
// checks.

import { NO_STRUCTURE } from '../data';
import type { Vec3 } from '../data';
import type { GameState } from './state';
import { blockAt, isSolid, structureAt } from './state';

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
 * a square over an unbroken cavern is as deep as its roof. If the roof's last
 * block is removed, the square's depth jumps past the whole cavern to the
 * next solid block.
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

/**
 * The cell of the square's top block: `{ x, y, z: depthAt(state, x, y) }`, or
 * `null` for a square with no block left. A crack is stored on this cell, and
 * so is a structure placed on the square (see `structureOnSquare`).
 *
 * Throws if (x, y) is not a square.
 */
export function topCellOf(state: GameState, x: number, y: number): Vec3 | null {
  const depth = depthAt(state, x, y);
  return depth < state.size.z ? { x, y, z: depth } : null;
}

/**
 * The code of the structure placed on square (x, y) (a support, and later a
 * pump, a vent or an explosive), or `NO_STRUCTURE`.
 *
 * A structure on a square is stored in the cell of the square's top block
 * (issue #94). So it belongs to that block: mining the block takes the
 * structure with it, and a block that lands on the square buries it. A square
 * holds at most one structure (design doc 4.1).
 *
 * Throws if (x, y) is not a square.
 */
export function structureOnSquare(state: GameState, x: number, y: number): number {
  const top = topCellOf(state, x, y);
  // `structureAt` answers "none" by itself for a cell outside the grid.
  return top === null ? NO_STRUCTURE : structureAt(state, top);
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

// ---------------------------------------------------------------------------
// The slide path (design doc 6.1; issue #94)
// ---------------------------------------------------------------------------

/**
 * Every square's depth, as a plain table. `depths` has one entry per square,
 * row by row: the depth of square (x, y) is `depths[x + width * y]`.
 *
 * Why a table: the slump rule asks for the depth of the same squares again
 * and again, and `depthAt` walks down a column each time. It also lets a
 * caller ask "what if this square were one level deeper?" by changing one
 * entry of a copy, without touching the cube.
 */
export interface DepthMap {
  /** How many squares the map is wide (x) and high (y). */
  width: number;
  height: number;
  depths: number[];
}

/** Read every square's depth from the cube. Does not change `state`. */
export function depthMapOf(state: GameState): DepthMap {
  const depths: number[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      depths.push(depthAt(state, x, y));
    }
  }
  return { width: state.size.x, height: state.size.y, depths };
}

/** An independent copy of a depth map: changing the copy leaves the original alone. */
export function copyDepthMap(map: DepthMap): DepthMap {
  return { width: map.width, height: map.height, depths: [...map.depths] };
}

/** True if (x, y) is a square of the map. */
function onDepthMap(map: DepthMap, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < map.width &&
    y >= 0 &&
    y < map.height
  );
}

/** The depth of square (x, y) in the table. Throws if (x, y) is not a square. */
export function depthIn(map: DepthMap, x: number, y: number): number {
  if (!onDepthMap(map, x, y)) {
    throw new Error(`(${x}, ${y}) is not a square of the cube`);
  }
  // `as number`: the index is inside the list, as just checked.
  return map.depths[x + map.width * y] as number;
}

/** Change the depth of square (x, y) in the table. Throws if (x, y) is not a square. */
export function setDepthIn(map: DepthMap, x: number, y: number, depth: number): void {
  if (!onDepthMap(map, x, y)) {
    throw new Error(`(${x}, ${y}) is not a square of the cube`);
  }
  map.depths[x + map.width * y] = depth;
}

/**
 * The deepest of the face neighbours of square (x, y), or `null` if the
 * square has no neighbour at all (a 1 x 1 map). Among neighbours of the same
 * depth the first in the order north, east, south, west wins. The cube's side
 * walls are not neighbours.
 */
export function lowestNeighbourIn(map: DepthMap, x: number, y: number): Square | null {
  let lowest: Square | null = null;
  let lowestDepth = 0;
  for (const step of SQUARE_STEPS) {
    const nx = x + step.dx;
    const ny = y + step.dy;
    if (!onDepthMap(map, nx, ny)) {
      continue;
    }
    const depth = depthIn(map, nx, ny);
    // Strictly deeper only: on a tie the earlier direction keeps its place.
    if (lowest === null || depth > lowestDepth) {
      lowest = { x: nx, y: ny };
      lowestDepth = depth;
    }
  }
  return lowest;
}

/**
 * The slide path from square (x, y) (design doc 6.1): the squares a loose
 * block would slide over, in order, not counting (x, y) itself.
 *
 * From the square it is on, the path steps to that square's lowest face
 * neighbour (ties broken north, east, south, west) if that neighbour is
 * deeper, and repeats. It ends at the first square with no deeper neighbour,
 * the foot, which is the last entry of the list. An empty list means the
 * square has no deeper neighbour: it is its own foot.
 *
 * Every step goes at least 1 level down and depths have a bottom, so the
 * loop always ends.
 */
export function slidePathIn(map: DepthMap, x: number, y: number): Square[] {
  const path: Square[] = [];
  let here: Square = { x, y };
  let hereDepth = depthIn(map, x, y);
  for (;;) {
    const next = lowestNeighbourIn(map, here.x, here.y);
    if (next === null) {
      return path;
    }
    const nextDepth = depthIn(map, next.x, next.y);
    if (nextDepth <= hereDepth) {
      return path; // no deeper neighbour: `here` is the foot
    }
    path.push(next);
    here = next;
    hereDepth = nextDepth;
  }
}

/**
 * The foot of the slide path from square (x, y): where it ends. The square
 * itself if it has no deeper neighbour. The same walk as `slidePathIn`,
 * without keeping the list.
 */
export function footIn(map: DepthMap, x: number, y: number): Square {
  let here: Square = { x, y };
  let hereDepth = depthIn(map, x, y);
  for (;;) {
    const next = lowestNeighbourIn(map, here.x, here.y);
    if (next === null) {
      return here;
    }
    const nextDepth = depthIn(map, next.x, next.y);
    if (nextDepth <= hereDepth) {
      return here;
    }
    here = next;
    hereDepth = nextDepth;
  }
}

/** The fall of square (x, y): how many levels deeper its foot is. 0 if it has no deeper neighbour. */
export function fallIn(map: DepthMap, x: number, y: number): number {
  const foot = footIn(map, x, y);
  return depthIn(map, foot.x, foot.y) - depthIn(map, x, y);
}

/** `slidePathIn` for the cube as it is now. Throws if (x, y) is not a square. */
export function slidePath(state: GameState, x: number, y: number): Square[] {
  requireSquare(state, x, y);
  return slidePathIn(depthMapOf(state), x, y);
}

/** `footIn` for the cube as it is now. Throws if (x, y) is not a square. */
export function footOf(state: GameState, x: number, y: number): Square {
  requireSquare(state, x, y);
  return footIn(depthMapOf(state), x, y);
}

/** `fallIn` for the cube as it is now. Throws if (x, y) is not a square. */
export function fallOf(state: GameState, x: number, y: number): number {
  requireSquare(state, x, y);
  return fallIn(depthMapOf(state), x, y);
}
