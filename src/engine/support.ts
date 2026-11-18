// Cave-in questions that have a yes-or-no answer (design doc 6.1; decision
// note 0014 items 5, 6, 7 and 10):
//
// - is this block supported?
// - does this support have a hold?
// - is this open cell part of a straight shaft that is too long?
// - is this cracked block's countdown running?
//
// Every function here is pure: it reads the cube and changes nothing. Nothing
// is stored, so an answer can never be stale: it is worked out from the cube
// as it is whenever it is asked for (item 7).
//
// These read the TRUE cube (`isSolid`, `structureAt`, ...), because rock
// falls where it falls, seen or not. Two kinds of caller may use them:
// - the cube phase (cube/caveIns.ts, cube/timers.ts);
// - code that shows the player the crack state of a block it has already
//   checked is revealed. Whether a revealed cracked block's countdown is
//   running is a tell read from the true cube (items 4, 7 and 21): it is the
//   one named thing shown that may depend on cells the player has not seen.
// Nothing that decides which actions are offered, or what they cost, may
// call them.

import { BLOCKS, HAZARDS, STRUCTURES } from '../data';
import type { Vec3 } from '../data';
import {
  blockDefAt,
  cellIndex,
  crackTimerAt,
  inGrid,
  isSolid,
  lavaAt,
  structureAt,
  waterAt,
} from './state';
import type { GameState } from './state';

/**
 * The four sideways steps, in the order of the cell index (0005 item 1: the
 * index is x + size.x * (y + size.y * z)): the neighbour at y - 1 has the
 * lowest index, then x - 1, then x + 1, then y + 1. "Lowest index first" in
 * item 10 is therefore "first in this list".
 */
export const SIDE_OFFSETS_BY_INDEX: readonly Vec3[] = [
  { x: 0, y: -1, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
];

function offsetBy(pos: Vec3, offset: Vec3): Vec3 {
  return { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
}

/** The cell directly above `pos`. Depth grows with z, so "up" is z - 1. */
function above(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y, z: pos.z - 1 };
}

/** The cell directly below `pos`. */
function below(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y, z: pos.z + 1 };
}

/**
 * True if `pos` holds a block that the cave-in rules apply to: a solid block
 * inside the grid. The bedrock beyond the grid never cracks or falls.
 */
export function isCaveInBlock(state: GameState, pos: Vec3): boolean {
  return inGrid(state.size, pos) && isSolid(state, pos);
}

// ---------------------------------------------------------------------------
// Supports (item 6)
// ---------------------------------------------------------------------------

/** True if the cell `pos` holds a placed support. */
export function hasSupport(state: GameState, pos: Vec3): boolean {
  return structureAt(state, pos) === STRUCTURES.support.code;
}

/** How many of the four side neighbours of `pos` are solid; bedrock counts. */
function solidSideCount(state: GameState, pos: Vec3): number {
  let count = 0;
  for (const offset of SIDE_OFFSETS_BY_INDEX) {
    if (isSolid(state, offsetBy(pos, offset))) {
      count += 1;
    }
  }
  return count;
}

/**
 * True if a support in the cell `pos` has a hold (item 6): the cell below it
 * is solid, or at least `supportHoldSolidSides` of its four side neighbours
 * are. The bedrock beyond the grid counts as solid. A support with no hold
 * holds nothing up and is destroyed at the start of step (a).
 *
 * The answer is about the cell: it does not look whether a support is there.
 */
export function supportHasHold(state: GameState, pos: Vec3): boolean {
  if (isSolid(state, below(pos))) {
    return true;
  }
  return solidSideCount(state, pos) >= HAZARDS.caveIn.supportHoldSolidSides;
}

/** True if the cell `pos` holds a support and that support has a hold. */
function hasHoldingSupport(state: GameState, pos: Vec3): boolean {
  return hasSupport(state, pos) && supportHasHold(state, pos);
}

/**
 * True if a placed support holds the block at `pos` (item 5 (c), item 6). A
 * support holds the block directly above it and the four blocks beside that
 * one (a plus shape). Seen from the block: the support is in the cell below
 * the block, or in the cell below one of the block's four side neighbours.
 */
export function isHeldBySupport(state: GameState, pos: Vec3): boolean {
  const under = below(pos);
  if (hasHoldingSupport(state, under)) {
    return true;
  }
  for (const offset of SIDE_OFFSETS_BY_INDEX) {
    if (hasHoldingSupport(state, offsetBy(under, offset))) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Supported or not (item 5)
// ---------------------------------------------------------------------------

/**
 * Item 5 (a): the block at `pos` rests on something. The cell below it is
 * solid, is bedrock (which `isSolid` answers for everything below the cube),
 * or holds water or lava. Gas holds nothing up.
 *
 * This is local on purpose: a block resting on a cracked block rests on it
 * until that one falls, so collapses cascade slowly.
 */
export function restsOnSomething(state: GameState, pos: Vec3): boolean {
  const under = below(pos);
  return isSolid(state, under) || waterAt(state, under) > 0 || lavaAt(state, under) > 0;
}

/**
 * Item 5 (b): there is a path of at most the block's span in steps on its own
 * layer, every cell on it solid, from the block at `pos` to a block that
 * rests on something (rule (a)). Span does not chain: only rule (a) counts at
 * the far end, never another block's span.
 *
 * The path stays inside the grid: the bedrock beyond the grid is not a block
 * of the layer and lends no span. (Item 5 does not say; this is the smallest
 * reading, raised in the PR for issue #53.)
 *
 * A breadth-first search over at most a few cells: `frontier` holds the solid
 * cells reached in exactly `steps` steps.
 */
function isHeldBySpan(state: GameState, pos: Vec3): boolean {
  const span = blockDefAt(state, pos).span;
  if (span === null || span <= 0) {
    return false;
  }
  const seen = new Set<number>([cellIndex(state.size, pos)]);
  let frontier: Vec3[] = [pos];
  for (let steps = 1; steps <= span; steps += 1) {
    const next: Vec3[] = [];
    for (const from of frontier) {
      for (const offset of SIDE_OFFSETS_BY_INDEX) {
        const to = offsetBy(from, offset);
        if (!isCaveInBlock(state, to)) {
          continue;
        }
        const index = cellIndex(state.size, to);
        if (seen.has(index)) {
          continue;
        }
        seen.add(index);
        if (restsOnSomething(state, to)) {
          return true;
        }
        next.push(to);
      }
    }
    frontier = next;
  }
  return false;
}

/**
 * True if the block at `pos` is supported (item 5): it rests on something
 * (a), or its span reaches a block that does (b), or a support with a hold
 * holds it (c). `pos` must hold a solid block inside the grid.
 */
export function isSupported(state: GameState, pos: Vec3): boolean {
  return restsOnSomething(state, pos) || isHeldBySupport(state, pos) || isHeldBySpan(state, pos);
}

// ---------------------------------------------------------------------------
// Straight shafts (item 10)
// ---------------------------------------------------------------------------

/**
 * True if `pos` is a tight cell: an open cell inside the grid with at least
 * `tightCellSolidSides` of its four side neighbours solid, the bedrock beyond
 * the grid counting as solid. What the cell holds (water, gas, a ladder) does
 * not matter.
 */
export function isTightCell(state: GameState, pos: Vec3): boolean {
  if (!inGrid(state.size, pos) || isSolid(state, pos)) {
    return false;
  }
  return solidSideCount(state, pos) >= HAZARDS.caveIn.tightCellSolidSides;
}

/**
 * True if a support lines the cell `pos`: one stands in the cell itself or
 * in its column at most `supportLiningReach` cells above or below it.
 * Ladders do not line a shaft.
 */
export function isLinedCell(state: GameState, pos: Vec3): boolean {
  const reach = HAZARDS.caveIn.supportLiningReach;
  for (let dz = -reach; dz <= reach; dz += 1) {
    if (hasSupport(state, { x: pos.x, y: pos.y, z: pos.z + dz })) {
      return true;
    }
  }
  return false;
}

/** True if `pos` can be part of an unlined run: tight and not lined. */
function isUnlinedTightCell(state: GameState, pos: Vec3): boolean {
  return isTightCell(state, pos) && !isLinedCell(state, pos);
}

/** An unlined run: a maximal vertical run of tight cells none of which is lined. */
export interface UnlinedRun {
  /** The run's top cell (the smallest z). */
  top: Vec3;
  /** How many cells the run has, counting down from `top`. */
  length: number;
  /**
   * The run's limit: the smallest `shaftLimit` among the solid blocks inside
   * the grid that are side neighbours of its cells. Bedrock is ignored; if
   * every wall is bedrock the run has no limit (`null`) and is never too long.
   */
  limit: number | null;
}

/** The solid blocks inside the grid beside the cell `pos`, lowest index first. */
function wallBlocksBeside(state: GameState, pos: Vec3): Vec3[] {
  const walls: Vec3[] = [];
  for (const offset of SIDE_OFFSETS_BY_INDEX) {
    const beside = offsetBy(pos, offset);
    if (isCaveInBlock(state, beside)) {
      walls.push(beside);
    }
  }
  return walls;
}

/**
 * The unlined run that the cell `pos` belongs to, or `null` if `pos` is not
 * an unlined tight cell.
 */
export function unlinedRunAt(state: GameState, pos: Vec3): UnlinedRun | null {
  if (!isUnlinedTightCell(state, pos)) {
    return null;
  }
  let top = pos;
  while (isUnlinedTightCell(state, above(top))) {
    top = above(top);
  }
  let length = 0;
  let limit: number | null = null;
  let cell = top;
  while (isUnlinedTightCell(state, cell)) {
    length += 1;
    for (const wall of wallBlocksBeside(state, cell)) {
      const wallLimit = blockDefAt(state, wall).shaftLimit;
      if (wallLimit !== null && (limit === null || wallLimit < limit)) {
        limit = wallLimit;
      }
    }
    cell = below(cell);
  }
  return { top, length, limit };
}

/** True if the run is longer than its limit. */
export function isRunOverLimit(run: UnlinedRun): boolean {
  return run.limit !== null && run.length > run.limit;
}

/** The cells of a run, top first. */
export function runCells(run: UnlinedRun): Vec3[] {
  const cells: Vec3[] = [];
  for (let i = 0; i < run.length; i += 1) {
    cells.push({ x: run.top.x, y: run.top.y, z: run.top.z + i });
  }
  return cells;
}

/**
 * True if a wall block of the run is cracked. Every wall block of a run that
 * is over its limit is "beside a cell of an unlined run that is over its
 * limit", so if it is cracked its countdown is running (item 7). For such a
 * run this is therefore item 10's "has a wall block with a running countdown".
 */
export function runHasCrackedWall(state: GameState, run: UnlinedRun): boolean {
  for (const cell of runCells(run)) {
    for (const wall of wallBlocksBeside(state, cell)) {
      if (crackTimerAt(state, wall) !== null) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The wall block that cracks when the run is too long (item 10): the side
 * neighbour of the run's top cell with the weakest material (the smallest
 * `shaftLimit`), lowest index first. `null` if the top cell has no wall
 * inside the grid.
 */
export function shaftBlockToCrack(state: GameState, run: UnlinedRun): Vec3 | null {
  let chosen: Vec3 | null = null;
  let chosenLimit = Infinity;
  // The walls come lowest index first, and `<` keeps the first of equals.
  for (const wall of wallBlocksBeside(state, run.top)) {
    const wallLimit = blockDefAt(state, wall).shaftLimit;
    if (wallLimit !== null && wallLimit < chosenLimit) {
      chosen = wall;
      chosenLimit = wallLimit;
    }
  }
  return chosen;
}

/**
 * The cell of an unlined run over its limit that is beside the block at
 * `pos`, or `null` if there is none. If there are two, the one with the
 * lowest index. This is the cell a shaft-wall block moves into when it falls
 * (item 10).
 */
export function overLimitRunCellBeside(state: GameState, pos: Vec3): Vec3 | null {
  for (const offset of SIDE_OFFSETS_BY_INDEX) {
    const beside = offsetBy(pos, offset);
    const run = unlinedRunAt(state, beside);
    if (run !== null && isRunOverLimit(run)) {
      return beside;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Running or stopped (item 7)
// ---------------------------------------------------------------------------

/**
 * True if the countdown of a crack on the block at `pos` is running (item 7):
 * the block is unsupported by item 5, or it is beside a cell of an unlined
 * run that is over its limit (item 10). Otherwise the countdown is stopped:
 * the crack stays, the timer keeps its value, and the block does not fall.
 *
 * The answer does not look whether the block is cracked: it is "would a
 * crack here be running". `pos` must hold a solid block inside the grid.
 */
export function isCountdownRunning(state: GameState, pos: Vec3): boolean {
  return !isSupported(state, pos) || overLimitRunCellBeside(state, pos) !== null;
}

/**
 * The number the player is shown on a cracked block: the stored timer plus 1
 * (item 7). A stored 0 shows as 1 and means the block falls in the coming
 * cube phase, if its countdown is running. `null` if the block is not cracked.
 */
export function shownCountdown(state: GameState, pos: Vec3): number | null {
  const timer = crackTimerAt(state, pos);
  return timer === null ? null : timer + 1;
}

/** The block code a fallen block becomes where it comes to rest (item 8). */
export const RUBBLE_CODE = BLOCKS.rubble.code;
