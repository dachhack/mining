// Explosions of placed charges and of unstable ore (design doc v0.2 section
// 6.6; owner questions 58, 64 and 65; issue #103, task T11; decision note
// 0034). Gas explosions are in cube/gas.ts, which also decides when the
// charges here go off (step (c) of the cube phase).
//
// THE BLAST. A charge or an armed ore block blasts its own square and every
// square within `HAZARDS.explosion.blastReach` steps: with 1, the square and
// the four beside it.
//
//       . X .        X: the five squares of the blast of a charge on the
//       X X X           middle square
//       . X .
//
// In every blast square, whichever of the two went off:
// - a camp on the square, or on a square beside it, is destroyed;
// - the crew is hurt if the square was worked this shift (`CREW.damage.explosion`);
// - a tree is destroyed: no timber, no stump;
// - the structure on the square (support, pump, vent, another explosive) is
//   destroyed. A destroyed explosive does not go off: charges do not chain.
//
// What happens to BLOCKS differs:
// - a PLACED EXPLOSIVE also destroys the top block of every blast square, with
//   no yield. Under a tree the block stays. A relic or keystone is destroyed
//   only with the probability `HAZARDS.explosion.chanceBlockDestroyed`, drawn
//   from the seeded RNG in the state; otherwise it is left in place.
// - UNSTABLE ORE destroys only itself (decision note 0014 item 17: "no other
//   block is removed").
//
// THE LEVEL RULE does not bind a blast (design doc 4.2: it limits the
// player's mining only). Each block is removed on its own and
// `collapseSpaceUnder` is called right after it, so a square never drops more
// than 1 level even over a cavern (review of PR #97). A steep step left
// behind cracks in step (a) of the next cube phase and slumps (6.1).
//
// The squares of every blast are handed back to the caller, because an
// explosion ignites gas on those squares and beside them (cube/gas.ts).

import { BLOCKS, CREW, HAZARDS, NO_STRUCTURE, STRUCTURES, SURFACE } from '../data';
import type { Vec3 } from '../data';
import { collapseSpaceUnder } from './breach';
import { recordDamage } from './cube/phase';
import type { CubePhase } from './cube/phase';
import { destroyCampsAt, destroyStructure } from './destroy';
import type { GameEvent } from './events';
import { SQUARE_STEPS, depthAt, isSquare, topCellOf } from './heightmap';
import type { Square } from './heightmap';
import { nextFloat } from './rng';
import {
  armedAt,
  blockAt,
  blockDefAt,
  disarmCharge,
  inGrid,
  isRevealed,
  setBlock,
  setStructure,
  structureAt,
} from './state';
import type { GameState } from './state';
import { hasStump, hasTree, setStumpAge, setSurfaceKind, surfaceCellAbove } from './surface/state';

// ---------------------------------------------------------------------------
// Questions a view may ask. They read only what the player sees.
// ---------------------------------------------------------------------------

/**
 * The squares in the blast of a charge on square (x, y): the square itself
 * first, then the others within `HAZARDS.explosion.blastReach` steps, nearest
 * first and row by row (y, then x) among equals. Squares off the map are left
 * out: the cube's wall is not a square. Throws if (x, y) is not a square.
 *
 * This is the order in which a blast deals with its squares.
 */
export function blastSquares(state: GameState, x: number, y: number): Square[] {
  if (!isSquare(state, x, y)) {
    throw new Error(`(${x}, ${y}) is not a square of the cube`);
  }
  const reach = HAZARDS.explosion.blastReach;
  const squares: Square[] = [];
  // One pass for each distance, so the nearest come first.
  for (let steps = 0; steps <= reach; steps += 1) {
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) !== steps) {
          continue;
        }
        if (isSquare(state, x + dx, y + dy)) {
          squares.push({ x: x + dx, y: y + dy });
        }
      }
    }
  }
  return squares;
}

/**
 * The unstable ore blocks that mining square (x, y) now would arm (design doc
 * 6.6): for each of the four squares beside it, the block on the layer of
 * the mined block, if it is unstable ore that
 * - the player knows (a top block that no tree hides, or a scanned block),
 * - is not braced: no support stands on its square, and
 * - is not armed already.
 *
 * In the order north, east, south, west. Empty for a square with no block
 * left. Whether the mine is allowed is not looked at: ask `mineCheck`.
 *
 * Reads the depths, the supports, and blocks only where they are revealed,
 * so a view may call it to warn the player before a tap. Throws if (x, y) is
 * not a square. Changes nothing.
 *
 * Under the level rule the ore found here is always its square's top block:
 * the mine is allowed only when no neighbour is higher than the mined square,
 * and a solid block on the mined layer means the neighbour is no deeper.
 */
export function oreArmedByMine(state: GameState, x: number, y: number): Vec3[] {
  const z = depthAt(state, x, y);
  const found: Vec3[] = [];
  if (z >= state.size.z) {
    return found;
  }
  for (const step of SQUARE_STEPS) {
    const cell = { x: x + step.dx, y: y + step.dy, z };
    if (!inGrid(state.size, cell) || !isRevealed(state, cell)) {
      continue; // off the map, or ore the player has not seen (question 58)
    }
    if (blockAt(state, cell) !== BLOCKS.unstableOre.code) {
      continue;
    }
    if (structureAt(state, cell) === STRUCTURES.support.code) {
      continue; // braced
    }
    if (armedAt(state, cell) !== null) {
      continue; // armed already
    }
    found.push(cell);
  }
  return found;
}

// ---------------------------------------------------------------------------
// The blast itself. Called from step (c) of the cube phase (cube/gas.ts).
// ---------------------------------------------------------------------------

/**
 * The cell directly above the top block of square (x, y): how the events of
 * this file and of cube/gas.ts name a square, as the flow events do. For a
 * square at ground level it is the surface cell (z = -1).
 */
export function cellAboveTop(state: GameState, x: number, y: number): Vec3 {
  return { x, y, z: depthAt(state, x, y) - 1 };
}

/** A stump on a square whose ground is gone never grows a tree again (as in actions/mine.ts). */
function forgetStump(state: GameState, cell: Vec3): void {
  const surfaceCell = surfaceCellAbove(cell);
  if (hasStump(state, surfaceCell)) {
    setSurfaceKind(state, surfaceCell, SURFACE.kinds.meadow.code);
    setStumpAge(state, surfaceCell, 0);
  }
}

/**
 * Destroy the block in the cell `top`, a square's top block, with no yield:
 * `blockDestroyed`. If it was the roof of an underground space, the space
 * collapses at once, as under a mine (`collapseSpaceUnder`), so the square
 * goes down exactly 1 level.
 */
function destroyTopBlock(state: GameState, top: Vec3, events: GameEvent[]): void {
  const block = blockAt(state, top);
  setBlock(state, top, BLOCKS.air.code); // also clears a crack, and disarms armed ore
  events.push({ type: 'blockDestroyed', pos: { ...top }, block });
  forgetStump(state, top);
  collapseSpaceUnder(state, top, events);
}

/**
 * True if the block with this code is one a blast destroys only by chance
 * (`HAZARDS.explosion.chanceBlocks`: relics and keystones).
 */
function isChanceBlock(blockCode: number): boolean {
  for (const [blockId, def] of Object.entries(BLOCKS)) {
    if (def.code === blockCode) {
      return HAZARDS.explosion.chanceBlocks.includes(blockId);
    }
  }
  return false;
}

/**
 * What a blast does to one of its squares, apart from blocks: camps, the
 * crew, a tree, the structure on the square. Returns true if a tree stood on
 * the square (it is gone now).
 */
function blastSquare(
  state: GameState,
  square: Square,
  events: GameEvent[],
  phase: CubePhase,
): boolean {
  const x = square.x;
  const y = square.y;

  // Camps: an explosion that includes a camp square or is beside one destroys
  // the camp (design doc 8). A camp covers its squares whatever the layer.
  destroyCampsAt(state, { x, y, z: 0 }, 'explosion', events);
  for (const step of SQUARE_STEPS) {
    if (isSquare(state, x + step.dx, y + step.dy)) {
      destroyCampsAt(state, { x: x + step.dx, y: y + step.dy, z: 0 }, 'explosion', events);
    }
  }

  // The crew: the blast includes a worked square (design doc 5.2).
  recordDamage(state, phase, 'explosion', CREW.damage.explosion, x, y);

  // A tree: destroyed, with no timber and no stump. Open meadow is left.
  const surfaceCell = surfaceCellAbove({ x, y, z: 0 });
  const tree = hasTree(state, surfaceCell);
  if (tree) {
    setSurfaceKind(state, surfaceCell, SURFACE.kinds.meadow.code);
    setStumpAge(state, surfaceCell, 0);
    events.push({ type: 'treeDestroyed', pos: surfaceCell });
  }

  // The structure on the square. It is stored with the top block.
  const top = topCellOf(state, x, y);
  if (top !== null) {
    destroyStructure(state, top, 'explosion', events);
  }
  return tree;
}

/**
 * The placed explosive in the cell `pos` goes off (design doc 6.6). `pos` is
 * the top block of its square, where the explosive is stored. Returns the
 * squares of the blast, for ignition.
 *
 * Emits `exploded` (kind 'explosive'), then for each blast square, the
 * charge's own first: what was destroyed there and the `blockDestroyed` of
 * its top block. In the forecast (`phase.forecast`) a relic or keystone is
 * not rolled for: `blockMayBeDestroyed` is emitted and the block stays.
 */
export function explodeCharge(
  state: GameState,
  pos: Vec3,
  events: GameEvent[],
  phase: CubePhase,
): Square[] {
  const squares = blastSquares(state, pos.x, pos.y);
  events.push({
    type: 'exploded',
    kind: 'explosive',
    pos: { ...pos },
    cells: squares.map((square) => cellAboveTop(state, square.x, square.y)),
  });
  // The charge itself is used up: it is not "destroyed by an explosion".
  setStructure(state, pos, NO_STRUCTURE);
  disarmCharge(state, pos);

  for (const square of squares) {
    const hadTree = blastSquare(state, square, events, phase);
    if (hadTree) {
      continue; // the block under a tree stays (design doc 6.6)
    }
    const top = topCellOf(state, square.x, square.y);
    if (top === null || blockDefAt(state, top).mineCost === null) {
      continue; // no block left, or bedrock: nothing a blast can remove
    }
    const block = blockAt(state, top);
    if (isChanceBlock(block)) {
      if (phase.forecast) {
        events.push({ type: 'blockMayBeDestroyed', pos: top, block });
        continue;
      }
      // The one place the cube phase rolls dice (decision note 0017 item 3).
      const roll = nextFloat(state.rng);
      if (roll >= HAZARDS.explosion.chanceBlockDestroyed) {
        events.push({ type: 'blockSurvivedBlast', pos: top, block });
        continue;
      }
    }
    destroyTopBlock(state, top, events);
  }
  return squares;
}

/**
 * The armed unstable ore in the cell `pos` goes off (design doc 6.6): the ore
 * block is destroyed with no yield, and its blast covers its square and the
 * squares round it. No other block is removed. Returns the squares of the
 * blast, for ignition.
 *
 * The caller has checked that the ore is still the top block of its square.
 */
export function explodeOre(
  state: GameState,
  pos: Vec3,
  events: GameEvent[],
  phase: CubePhase,
): Square[] {
  const squares = blastSquares(state, pos.x, pos.y);
  events.push({
    type: 'exploded',
    kind: 'unstableOre',
    pos: { ...pos },
    cells: squares.map((square) => cellAboveTop(state, square.x, square.y)),
  });
  disarmCharge(state, pos);

  for (const square of squares) {
    // On the ore's own square this takes the support that was placed too late
    // (a support does not disarm ore that is already armed), and a tree that
    // grew back over ore the player had seen.
    blastSquare(state, square, events, phase);
  }
  destroyTopBlock(state, pos, events);
  return squares;
}
