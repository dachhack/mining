// What "at rest" means for a freshly generated cube (decision note 0014 item
// 19): no block is unsupported (item 5), no unlined run of tight cells is over
// its limit (item 10), and no water or lava can move (items 12 and 16).
//
// Generation uses these checks while it carves (features.ts) and once more as
// a safety net (settle.ts). They read the cube only: a fresh cube has no
// placed supports, so the "a placed support holds it" part of item 5 and the
// "lined" part of item 10 never apply here and are left out.
//
// The cave-ins task (M2-3, issue #53) builds the same rules for play, with
// supports. When it has merged, these can call its functions instead.

import { BLOCKS, HAZARDS } from '../../data';
import type { Vec3 } from '../../data';
import { blockDefAt, cellIndex, inGrid, isSolid, lavaAt, waterAt } from '../state';
import type { GameState } from '../state';

/** The four side neighbours of a cell (same layer), as offsets, in a fixed order. */
export const SIDE_OFFSETS: readonly Vec3[] = [
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
];

/** The largest span any block has (hard rock's 3). Worked out from the block table. */
export const MAX_SPAN: number = Math.max(...Object.values(BLOCKS).map((def) => def.span ?? 0));

// ---------------------------------------------------------------------------
// Item 5: supported blocks
// ---------------------------------------------------------------------------

/**
 * Item 5(a): the cell below `pos` is solid, is bedrock, or holds water or
 * lava. (Below the bottom layer `isSolid` answers true: that is the bedrock.)
 */
export function restsOnSomething(state: GameState, pos: Vec3): boolean {
  const below = { x: pos.x, y: pos.y, z: pos.z + 1 };
  return isSolid(state, below) || waterAt(state, below) > 0 || lavaAt(state, below) > 0;
}

/**
 * True if the solid block at `pos` (a cell inside the grid) is supported by
 * item 5(a) or 5(b):
 * (a) it rests on something; or
 * (b) a path of at most its span in steps, on its own layer and through solid
 *     cells of the grid only, joins it to a block that rests on something.
 *
 * Span does not chain: only a block held by (a) can end the path. The bedrock
 * beyond the grid's sides is not counted as such a block, which is the
 * stricter reading and so the safe one for generation.
 */
export function isBlockSupported(state: GameState, pos: Vec3): boolean {
  if (restsOnSomething(state, pos)) {
    return true;
  }
  const span = blockDefAt(state, pos).span ?? 0;
  if (span === 0) {
    return false;
  }
  // Breadth-first search on the block's own layer, at most `span` steps out.
  // `seen` holds the cell indexes already reached.
  const seen = new Set<number>([cellIndex(state.size, pos)]);
  let ring: Vec3[] = [pos];
  for (let steps = 1; steps <= span; steps += 1) {
    const nextRing: Vec3[] = [];
    for (const from of ring) {
      for (const offset of SIDE_OFFSETS) {
        const next = { x: from.x + offset.x, y: from.y + offset.y, z: from.z };
        if (!inGrid(state.size, next) || !isSolid(state, next)) {
          continue;
        }
        const index = cellIndex(state.size, next);
        if (seen.has(index)) {
          continue;
        }
        seen.add(index);
        if (restsOnSomething(state, next)) {
          return true;
        }
        nextRing.push(next);
      }
    }
    ring = nextRing;
  }
  return false;
}

/** Every unsupported block of the cube, bottom layer first, then in index order. */
export function findUnsupportedBlocks(state: GameState): Vec3[] {
  const found: Vec3[] = [];
  for (let z = state.size.z - 1; z >= 0; z -= 1) {
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const pos = { x, y, z };
        if (isSolid(state, pos) && !isBlockSupported(state, pos)) {
          found.push(pos);
        }
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Item 10: tight vertical runs
// ---------------------------------------------------------------------------

/**
 * Item 10: an open cell inside the grid is tight when at least three of its
 * four side neighbours are solid, the bedrock beyond the grid counting as
 * solid. A cell that holds water, lava or gas is open here like any other,
 * which is the stricter reading.
 */
export function isTightCell(state: GameState, pos: Vec3): boolean {
  if (!inGrid(state.size, pos) || isSolid(state, pos)) {
    return false;
  }
  let solidSides = 0;
  for (const offset of SIDE_OFFSETS) {
    if (isSolid(state, { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z })) {
      solidSides += 1;
    }
  }
  return solidSides >= HAZARDS.caveIn.tightCellSolidSides;
}

/** A maximal vertical run of tight cells in one column. */
export interface TightRun {
  x: number;
  y: number;
  /** The layer of the run's top cell. */
  topZ: number;
  /** How many cells it has. */
  length: number;
  /**
   * The most cells it may have: the shaft limit of the weakest block among
   * the side neighbours of its cells, bedrock ignored. `Infinity` if every
   * side neighbour is bedrock or open.
   */
  limit: number;
}

/** The run of tight cells that the cell `pos` belongs to, or `null` if `pos` is not tight. */
export function tightRunThrough(state: GameState, pos: Vec3): TightRun | null {
  if (!isTightCell(state, pos)) {
    return null;
  }
  let topZ = pos.z;
  while (isTightCell(state, { x: pos.x, y: pos.y, z: topZ - 1 })) {
    topZ -= 1;
  }
  let bottomZ = pos.z;
  while (isTightCell(state, { x: pos.x, y: pos.y, z: bottomZ + 1 })) {
    bottomZ += 1;
  }
  let limit = Infinity;
  for (let z = topZ; z <= bottomZ; z += 1) {
    for (const offset of SIDE_OFFSETS) {
      // Outside the grid `blockDefAt` gives bedrock, whose limit is `null`.
      const shaftLimit = blockDefAt(state, { x: pos.x + offset.x, y: pos.y + offset.y, z })
        .shaftLimit;
      if (shaftLimit !== null && shaftLimit < limit) {
        limit = shaftLimit;
      }
    }
  }
  return { x: pos.x, y: pos.y, topZ, length: bottomZ - topZ + 1, limit };
}

/** Every run of tight cells that is longer than its limit, in index order of its top cell. */
export function findOverLimitRuns(state: GameState): TightRun[] {
  const found: TightRun[] = [];
  for (let z = 0; z < state.size.z; z += 1) {
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const run = tightRunThrough(state, { x, y, z });
        // Each run is reported once, from its top cell.
        if (run !== null && run.topZ === z && run.length > run.limit) {
          found.push(run);
        }
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Items 12 and 16: fluid that could move
// ---------------------------------------------------------------------------

/** 'water', 'lava', or `null` for a cell that holds neither. */
function fluidKindAt(state: GameState, pos: Vec3): 'water' | 'lava' | null {
  if (waterAt(state, pos) > 0) {
    return 'water';
  }
  if (lavaAt(state, pos) > 0) {
    return 'lava';
  }
  return null;
}

/**
 * The cells of water or lava that could move by the flow rules of item 12
 * (Fall and Level), in index order. Empty when every fluid is still.
 *
 * A unit can move when an open cell with no water and no lava in it, inside
 * the grid, touches a unit of the same connected body and lies lower than the
 * body's highest unit. (The cell below a unit is always lower than that, so
 * this covers Fall as well as Level.) Each cell listed is a unit that touches
 * such a cell.
 */
export function findFluidThatCanMove(state: GameState): Vec3[] {
  const size = state.size;
  const found: Vec3[] = [];
  const seen = new Uint8Array(size.x * size.y * size.z);
  const faceOffsets: Vec3[] = [
    ...SIDE_OFFSETS,
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: 1 },
  ];
  for (let z = 0; z < size.z; z += 1) {
    for (let y = 0; y < size.y; y += 1) {
      for (let x = 0; x < size.x; x += 1) {
        const start = { x, y, z };
        const kind = fluidKindAt(state, start);
        if (kind === null || seen[cellIndex(size, start)] === 1) {
          continue;
        }
        // Flood fill the body. Layers are visited top first, so `z` is the
        // layer of the body's highest unit.
        const body: Vec3[] = [];
        const toVisit: Vec3[] = [start];
        seen[cellIndex(size, start)] = 1;
        while (toVisit.length > 0) {
          const pos = toVisit.pop() as Vec3;
          body.push(pos);
          for (const offset of faceOffsets) {
            const next = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
            if (!inGrid(size, next) || seen[cellIndex(size, next)] === 1) {
              continue;
            }
            if (fluidKindAt(state, next) === kind) {
              seen[cellIndex(size, next)] = 1;
              toVisit.push(next);
            }
          }
        }
        for (const pos of body) {
          for (const offset of faceOffsets) {
            const next = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
            if (
              inGrid(size, next) &&
              next.z > z &&
              !isSolid(state, next) &&
              fluidKindAt(state, next) === null
            ) {
              found.push(pos);
              break;
            }
          }
        }
      }
    }
  }
  found.sort((a, b) => cellIndex(size, a) - cellIndex(size, b));
  return found;
}

/** True if the cube is at rest as 0014 item 19 defines it. A whole-cube check. */
export function isCubeAtRest(state: GameState): boolean {
  return (
    findUnsupportedBlocks(state).length === 0 &&
    findOverLimitRuns(state).length === 0 &&
    findFluidThatCanMove(state).length === 0
  );
}
