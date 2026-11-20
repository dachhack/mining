// Step (a) of the cube phase: pit walls slump (design doc v0.2 sections 4 and
// 6.1; owner question 81; issue #94).
//
// Two things happen, in this order:
// 1. every cracked block whose countdown has ended falls: it slides down its
//    square's slide path and comes to rest on the foot as rubble;
// 2. every square that is now unstable and not yet cracked cracks.
//
// Which squares are unstable is slump.ts. The countdowns tick in step (d)
// (cube/timers.ts).
//
// THE ORDER IS FIXED, so the same pit always slumps the same way. Squares are
// always visited row by row: y = 0 first, and x = 0 first within a row. In
// part 1 the list of blocks that are due is made first; then each is looked at
// in that order, at that moment: a block whose square is no longer unstable
// (an earlier slump filled the hole it would have fallen into) stays where it
// is. A block falls at most once in a cube phase.
//
// WHY A CASCADE ALWAYS ENDS (design doc 6.1). An unstable square's foot is at
// least 2 levels deeper than the square: "steep" means a neighbour is 2 or
// more down, and "tall" means the fall is more than a slump limit of at least
// 1 (`validateData` checks both numbers). The block starts in layer d (the
// square's depth) and lands on top of the foot's column, in layer d + 1 or
// lower. So every slump moves one block at least one layer DOWN, nothing here
// ever moves a block up, and no block can go below the bottom layer: the
// slumping has to stop. The foot was at depth 2 or more, so it ends at depth 1
// or more: nothing rises above ground level.

import { BLOCKS, CREW, HAZARDS, SURFACE } from '../../data';
import type { Vec3 } from '../../data';
import { collapseSpaceUnder } from '../breach';
import { destroyCampsAt, destroyStructure } from '../destroy';
import type { GameEvent } from '../events';
import { depthAt, depthIn, depthMapOf, setDepthIn, topCellOf } from '../heightmap';
import type { DepthMap, Square } from '../heightmap';
import { stabilityIn } from '../slump';
import {
  blockAt,
  clearCrack,
  crackTimerAt,
  gasAt,
  inGrid,
  isLavaSource,
  lavaAt,
  setBlock,
  setCrackTimer,
  setGas,
  setLava,
  setWater,
  waterAt,
} from '../state';
import type { GameState } from '../state';
import { hasStump, setStumpAge, setSurfaceKind, surfaceCellAbove } from '../surface/state';
import { recordDamage } from './phase';
import type { CubePhase } from './phase';

/**
 * Rubble is about to land in the open cell `cell`, the lowest open cell of
 * its square. Water, lava and gas standing on a square are stored in the open
 * cells above its top block (breach.ts), often in this very cell. Left there
 * they would end up inside the rubble: still in the state, but out of the
 * player's sight and out of reach of every rule. So whatever `cell` holds is
 * moved to the cell above it, where it stands on the rubble: the square's
 * contents rise with its top ([Default]; owner question 100).
 *
 * The cell above always exists and is open: rubble lands at least one layer
 * below ground level, and everything above a square's top block is open.
 */
function liftContents(state: GameState, cell: Vec3): void {
  const above = { x: cell.x, y: cell.y, z: cell.z - 1 };
  const water = waterAt(state, cell);
  const lava = lavaAt(state, cell);
  const gas = gasAt(state, cell);
  // `Math.min` only guards the byte a cell stores, as in breach.ts.
  if (water > 0) {
    setWater(state, above, Math.min(BYTE_MAX, waterAt(state, above) + water));
    setWater(state, cell, 0);
  }
  if (lava > 0) {
    const source = isLavaSource(state, cell) || isLavaSource(state, above);
    setLava(state, above, Math.min(BYTE_MAX, lavaAt(state, above) + lava), source);
    setLava(state, cell, 0);
  }
  if (gas > 0) {
    setGas(state, above, Math.min(BYTE_MAX, gasAt(state, above) + gas));
    setGas(state, cell, 0);
  }
}

/** The most one cell can store of water, lava or gas: one byte. Not a gameplay number. */
const BYTE_MAX = 255;

/**
 * The top block of square `from` slumps: it slides to `foot` (the foot of the
 * square's slide path, worked out by the caller at this moment) and lands
 * there as rubble. `map` is kept in step with the cube.
 *
 * - Whatever the block was (ore included) is lost: rubble lands.
 * - `from` goes down 1 level and `foot` comes up 1.
 * - A pump, vent or explosive on `from` goes with its block and is destroyed;
 *   a support, pump, vent or explosive on `foot` is buried and destroyed.
 * - A camp on either square is destroyed (design doc section 8).
 * - A stump on `from` is gone for good, as when the square is mined.
 * - The crew is hurt if either square was worked this shift (design doc 5.2).
 * - Water, lava and gas standing on `foot` are not buried: they are lifted
 *   onto the rubble (`liftContents`; owner question 100).
 * - If the fallen block was the roof of an underground space, the space
 *   collapses exactly as under a mine (`collapseSpaceUnder` in breach.ts;
 *   design doc 6.2): the square still goes down exactly 1 level, and what the
 *   space held is pushed out onto it.
 */
function slumpBlock(
  state: GameState,
  map: DepthMap,
  from: Square,
  foot: Square,
  events: GameEvent[],
  phase: CubePhase,
): void {
  const fromCell = { x: from.x, y: from.y, z: depthIn(map, from.x, from.y) };
  const footDepth = depthIn(map, foot.x, foot.y);
  // The open cell on top of the foot's column: where the rubble comes to rest.
  const toCell = { x: foot.x, y: foot.y, z: footDepth - 1 };
  if (toCell.z <= fromCell.z) {
    // Cannot happen while `stabilityIn` and the data hold (see the top of
    // this file). Stop here rather than move a block sideways or up.
    throw new Error(
      `A block at depth ${fromCell.z} cannot slump onto a square at depth ${footDepth}`,
    );
  }
  const block = blockAt(state, fromCell);

  // The square the block leaves.
  destroyStructure(state, fromCell, 'rockfall', events);
  destroyCampsAt(state, fromCell, 'rockfall', events);
  setBlock(state, fromCell, BLOCKS.air.code); // also clears the block's crack
  const surfaceCell = surfaceCellAbove(fromCell);
  if (hasStump(state, surfaceCell)) {
    setSurfaceKind(state, surfaceCell, SURFACE.kinds.meadow.code);
    setStumpAge(state, surfaceCell, 0);
  }

  // The square it lands on. What stood on the foot's old top block is buried,
  // and so is a crack that block had: it is not a top block any more.
  const buriedCell = { x: foot.x, y: foot.y, z: footDepth };
  if (inGrid(state.size, buriedCell)) {
    destroyStructure(state, buriedCell, 'rockfall', events);
    clearCrack(state, buriedCell);
  }
  destroyCampsAt(state, toCell, 'rockfall', events);
  liftContents(state, toCell);
  setBlock(state, toCell, BLOCKS.rubble.code);
  events.push({ type: 'blockFell', from: fromCell, to: toCell, block, rubble: true });

  // The roof of an underground space: it collapses, as under a mine.
  collapseSpaceUnder(state, fromCell, events);

  setDepthIn(map, from.x, from.y, depthAt(state, from.x, from.y));
  setDepthIn(map, foot.x, foot.y, footDepth - 1);

  // The crew: a block slumps from a worked square, or comes to rest on one.
  recordDamage(state, phase, 'slump', CREW.damage.slump, from.x, from.y);
  recordDamage(state, phase, 'slump', CREW.damage.slump, foot.x, foot.y);
}

/**
 * Step (a). Changes `state` in place and appends to `events`; uses no
 * randomness. The squares that crack here are noted in `phase.newCracks`, so
 * that step (d) does not tick them in the phase they appear in.
 *
 * The forecast runs this step on a copy of the cube (forecast.ts), so it must
 * read nothing but `state`.
 */
export function stepSlumps(state: GameState, events: GameEvent[], phase: CubePhase): void {
  const map = depthMapOf(state);

  // 1. The blocks whose countdown has ended: a stored timer of 0 (shown as 1).
  const due: Square[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const top = topCellOf(state, x, y);
      if (top !== null && crackTimerAt(state, top) === 0) {
        due.push({ x, y });
      }
    }
  }
  for (const square of due) {
    // Looked at now, not when the list was made: an earlier slump may have
    // made this square stable (its countdown has stopped) or moved its foot.
    const check = stabilityIn(state, map, square.x, square.y);
    if (check.unstable) {
      slumpBlock(state, map, square, check.foot, events, phase);
    }
  }

  // 2. Newly unstable squares crack. A square that already has a crack keeps
  //    it, with the countdown where it stopped.
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const top = topCellOf(state, x, y);
      if (top === null || crackTimerAt(state, top) !== null) {
        continue;
      }
      if (!stabilityIn(state, map, x, y).unstable) {
        continue;
      }
      // The stored timer is the number shown minus 1 (see `crackTimerAt`).
      const timer = HAZARDS.slump.crackCountdown - 1;
      setCrackTimer(state, top, timer);
      events.push({ type: 'blockCracked', pos: top, block: blockAt(state, top), timer });
      phase.newCracks.push({ x, y });
    }
  }
}
