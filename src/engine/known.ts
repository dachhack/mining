// What the player sees (0014 item 3), and the cube the forecast is run on
// (0014 item 4).
//
// "The player sees the current contents (water, gas, lava, cracks, timers,
// structures, loose items) of every revealed cell, lit or not. The contents
// of unrevealed cells are never shown, and no legal action or its cost
// depends on them."
//
// The functions in state.ts (`waterAt`, `gasAt`, `structureAt`, ...) read the
// TRUE cube, which is right for the cube phase: water flows where it flows,
// seen or not. Code that decides what the player is shown, offered or
// forecast must not use them on a cell it has not checked is revealed. It
// uses the two functions here instead:
//
// - `knownCell(state, pos)`: everything the player sees of one cell, or
//   `null` for a cell it has not seen;
// - `knownCube(state)`: a copy of the state in which every unrevealed cell is
//   plain rock with nothing in it. Whatever is computed from that copy cannot
//   depend on an unrevealed cell, by construction.

import { BLOCKS, HAZARDS, NO_STRUCTURE, WORLD } from '../data';
import type { BlockId, ItemStack, Vec3 } from '../data';
import { depthAt } from './heightmap';
import {
  armedAt,
  blockAt,
  cellCount,
  cellIndex,
  cloneState,
  crackTimerAt,
  gasAt,
  inGrid,
  isLavaSource,
  isRevealed,
  lavaAt,
  looseItemsAt,
  structureAt,
  waterAt,
} from './state';
import type { ArmedKind, GameState } from './state';
import { hasTree, surfaceKindAt } from './surface/state';
import { showsMineralTraces } from './tells';

/** What the player sees of one revealed cell. */
export interface KnownCell {
  /** The block code. 0 is open space. */
  block: number;
  /** Units of water: 0 or 1. */
  water: number;
  /** Units of lava: 0 or 1. */
  lava: number;
  /** True if the lava here is a source (0014 item 16). */
  lavaSource: boolean;
  /** Units of gas. */
  gas: number;
  /**
   * The block's stored crack timer, or `null` if it is not cracked. The
   * number to show is this plus 1 (0014 item 7).
   */
  crackTimer: number | null;
  /** The structure code, or `NO_STRUCTURE`. */
  structure: number;
  /** What is armed here (unstable ore, or a placed explosive), or `null`. */
  armed: ArmedKind | null;
  /** Loose items lying here, sorted by item id. */
  looseItems: ItemStack[];
}

/**
 * Everything the player sees of the cell `pos`, or `null` if the cell is not
 * revealed (0014 item 3). There is no light (design doc v0.2).
 *
 * Cells outside the grid count as revealed, as in `isRevealed`: the surface
 * is open air and everything else is bedrock, with nothing in them.
 */
export function knownCell(state: GameState, pos: Vec3): KnownCell | null {
  if (!isRevealed(state, pos)) {
    return null;
  }
  return {
    block: blockAt(state, pos),
    water: waterAt(state, pos),
    lava: lavaAt(state, pos),
    lavaSource: isLavaSource(state, pos),
    gas: gasAt(state, pos),
    crackTimer: crackTimerAt(state, pos),
    structure: structureAt(state, pos),
    armed: armedAt(state, pos),
    looseItems: looseItemsAt(state, pos),
  };
}

/** What the player sees of one square of the map (design doc v0.2 section 3.4). */
export interface KnownSquare {
  x: number;
  y: number;
  /** How many levels down the square is. Always seen. */
  depth: number;
  /** True if a tree stands on the square. Always seen. */
  tree: boolean;
  /**
   * The kind code of the square's surface cell (`SURFACE.kinds`: meadow,
   * tree, stump, path, outcrop). Always seen. It matters only while the
   * square is at ground level (depth 0).
   */
  surfaceKind: number;
  /**
   * What the player knows of the top block (the block in layer `depth`):
   * `null` if it is under a tree and has never been seen, or if the square
   * has no block left. Under a tree that grew back this is the block the
   * player saw before.
   */
  top: KnownCell | null;
  /** True if the map shows mineral traces on the top block. */
  traces: boolean;
}

/**
 * Everything the player sees of the square (x, y). THE function the views
 * read a square through (the play tool, the phone map), so that none of them
 * can show a block below a top by mistake.
 *
 * Reads the square's depth, its surface cell, and its top block if that is
 * revealed. Nothing below the top block is read. Throws if (x, y) is not a
 * square. Does not change `state`.
 */
export function knownSquare(state: GameState, x: number, y: number): KnownSquare {
  const depth = depthAt(state, x, y);
  const surfaceCell = { x, y, z: WORLD.surfaceZ };
  const hasBlock = depth < state.size.z;
  const topPos = { x, y, z: depth };
  return {
    x,
    y,
    depth,
    tree: hasTree(state, surfaceCell),
    surfaceKind: surfaceKindAt(state, surfaceCell),
    top: hasBlock ? knownCell(state, topPos) : null,
    traces: hasBlock && showsMineralTraces(state, topPos),
  };
}

/**
 * A copy of `state` holding only what the player has seen: every unrevealed
 * cell is plain rock (`HAZARDS.forecast.unseenBlock`) with nothing in it: no
 * water, lava, gas, crack, structure, loose items or armed charge (0014 item
 * 4). Revealed cells, the gauges and the camps are as they are.
 *
 * The forecast runs steps (b) and (c) of the cube phase on this copy. Two
 * states that differ only in unrevealed cells give the same copy, apart from
 * the `revealed`-independent fields that no rule may read anyway (the seed
 * and the RNG are copied as they are, and nothing in the cube phase uses
 * them).
 */
export function knownCube(state: GameState): GameState {
  const copy = cloneState(state);
  // `as BlockId`: `validateData` checks that the id names a solid block.
  const rock = BLOCKS[HAZARDS.forecast.unseenBlock as BlockId].code;
  const cells = cellCount(copy.size);
  for (let index = 0; index < cells; index += 1) {
    if (copy.revealed[index] === 1) {
      continue;
    }
    copy.blocks[index] = rock;
    copy.water[index] = 0;
    copy.lava[index] = 0;
    copy.lavaSource[index] = 0;
    copy.gas[index] = 0;
    copy.cracks[index] = 0;
    copy.structures[index] = NO_STRUCTURE;
    // Whether traces were seen is the player's own knowledge, but they are
    // only ever seen on a revealed block, so this is already 0.
    copy.tracesSeen[index] = 0;
  }
  // Loose items lie in the grid or on the surface; the surface is always seen.
  copy.looseItems = copy.looseItems.filter(
    (loose) =>
      !inGrid(copy.size, loose.pos) || copy.revealed[cellIndex(copy.size, loose.pos)] === 1,
  );
  copy.armed = copy.armed.filter((charge) => copy.revealed[cellIndex(copy.size, charge.pos)] === 1);
  return copy;
}
