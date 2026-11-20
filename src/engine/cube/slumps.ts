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
import { destroyCampsAt, destroyStructure } from '../destroy';
import type { GameEvent } from '../events';
import { depthAt, depthIn, depthMapOf, setDepthIn, topCellOf } from '../heightmap';
import type { DepthMap, Square } from '../heightmap';
import { stabilityIn } from '../slump';
import {
  blockAt,
  clearCrack,
  crackTimerAt,
  inGrid,
  isOpen,
  setBlock,
  setCrackTimer,
} from '../state';
import type { GameState } from '../state';
import { hasStump, setStumpAge, setSurfaceKind, surfaceCellAbove } from '../surface/state';
import { recordDamage } from './phase';
import type { CubePhase } from './phase';

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
 * - If the cell under the fallen block is open (the roof of an underground
 *   space), the temporary rule of decision note 0026 applies, as for a mine:
 *   the open cells directly below fill with rubble, so the square still goes
 *   down exactly 1 level. Task T9 replaces that rule for mining; what a slump
 *   does there is owner question 96.
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
  setBlock(state, toCell, BLOCKS.rubble.code);
  events.push({ type: 'blockFell', from: fromCell, to: toCell, block, rubble: true });

  // The roof of an open space (see above).
  const below = { x: from.x, y: from.y, z: fromCell.z + 1 };
  if (inGrid(state.size, below) && isOpen(state, below)) {
    for (let z = below.z; z < state.size.z && isOpen(state, { x: from.x, y: from.y, z }); z += 1) {
      setBlock(state, { x: from.x, y: from.y, z }, BLOCKS.rubble.code);
    }
    events.push({ type: 'roofCollapsed', pos: below });
  }

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
