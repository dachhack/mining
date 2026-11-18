// A camp's air line (design doc 8; 0014 item 29).
//
// "A camp provides air only while an open path (or vent chain) connects it to
// the surface" (design doc 8). 0014 item 29 makes that exact: a camp's air
// line is intact when a path of open cells joins a camp cell to the surface
// in which every stretch that is flooded or gassy is at most 8 cells long and
// has a vent at each end. So vents exist to carry air across bad stretches;
// with no bad stretch any open path will do.
//
// How this file reads that sentence:
// - A path goes from cell to cell through faces. Every cell on it is open
//   (not solid); what else the cell holds (a ladder, a torch, loose items)
//   does not matter.
// - A cell is BAD if it holds water, lava or gas; otherwise it is GOOD. The
//   surface is always good.
// - A stretch is a run of bad cells that follow one another on the path. It
//   "has a vent at each end" when the good cell the path leaves to enter the
//   stretch holds a vent, and so does the good cell the path steps into when
//   it leaves the stretch. So a stretch needs a good cell at both ends: one
//   that starts in the camp itself, or runs right up to the surface, cannot
//   be bridged, because neither a gassy camp cell nor the surface air can
//   hold the vent.
// - The path starts in any of the camp's cells. Gas in some camp cells does
//   not cut the line while another camp cell has a way out; gas in all of
//   them does.
//
// Two tasks meet in this file: the camps task (M2-7, issue #57) wrote the
// rule, and the air task (M2-4, issue #54) calls it from `updateAir` in
// air.ts (0014 item 20: "or to an active camp whose air line is intact").

import { CAMPS, STRUCTURES } from '../data';
import type { Vec3 } from '../data';
import { campCells } from './camps';
import { FACE_OFFSETS, offsetPosition } from './neighbours';
import {
  cellCount,
  cellIndex,
  gasAt,
  inGrid,
  isOpen,
  isSurface,
  lavaAt,
  structureAt,
  waterAt,
} from './state';
import type { Camp, GameState } from './state';

/** True if air cannot pass through the open cell `pos` unaided: it is flooded or gassy. */
function isBadAir(state: GameState, pos: Vec3): boolean {
  return waterAt(state, pos) > 0 || lavaAt(state, pos) > 0 || gasAt(state, pos) > 0;
}

function hasVent(state: GameState, pos: Vec3): boolean {
  return structureAt(state, pos) === STRUCTURES.vent.code;
}

/** One step of the search: a cell, and how far into a bad stretch the path is there. */
interface SearchNode {
  pos: Vec3;
  /**
   * 0 if `pos` is a good cell. Otherwise `pos` is bad, and this is how many
   * bad cells the path has crossed in a row, counting this one.
   */
  badRun: number;
}

/**
 * True if the camp's air line is intact (0014 item 29): a path of open cells
 * joins one of the camp's cells to the surface, on which every stretch that
 * is flooded or gassy is at most `CAMPS.airLineMaxBadStretch` cells long and
 * has a vent at each end. The top of this file says how each word is read.
 *
 * Reads the true cube, like the air rule itself (0014 item 21). Does not
 * change `state`.
 *
 * How it works: a breadth-first search (flood fill) from the camp's good
 * cells. The search remembers, for each cell, how long the bad stretch was
 * when it got there, because a cell reached 3 cells into a stretch can go on
 * for 5 more and the same cell reached 8 cells in cannot go on at all. So
 * what is marked as visited is the pair (cell, length of the stretch so far),
 * not the cell alone.
 */
export function campAirLineIntact(state: GameState, camp: Camp): boolean {
  const maxBadRun = CAMPS.airLineMaxBadStretch;
  const cells = cellCount(state.size);
  // visited[cell index * (maxBadRun + 1) + badRun] is 1 once that pair has
  // been reached. A `Uint8Array` is a fixed-length array of small whole
  // numbers, all 0 to begin with.
  const visited = new Uint8Array(cells * (maxBadRun + 1));
  const queue: SearchNode[] = [];

  /** Add (pos, badRun) to the queue unless the search has been there before. */
  function visit(pos: Vec3, badRun: number): void {
    const slot = cellIndex(state.size, pos) * (maxBadRun + 1) + badRun;
    if (visited[slot] === 1) {
      return;
    }
    visited[slot] = 1;
    queue.push({ pos, badRun });
  }

  // The path starts in a camp cell that is open and good.
  for (const cell of campCells(camp)) {
    if (isSurface(state.size, cell)) {
      // A camp dug into the top layer has its upper cells in the open air.
      return true;
    }
    if (inGrid(state.size, cell) && isOpen(state, cell) && !isBadAir(state, cell)) {
      visit(cell, 0);
    }
  }

  // `head` walks along the queue; nothing is ever removed from the front, so
  // the search stays fast on a big cube.
  for (let head = 0; head < queue.length; head += 1) {
    // `as SearchNode`: `head` is inside the list.
    const here = queue[head] as SearchNode;
    const hereIsGood = here.badRun === 0;

    for (const offset of FACE_OFFSETS) {
      const next = offsetPosition(here.pos, offset);

      if (isSurface(state.size, next)) {
        // The surface is good air and can hold no vent. So the path may end
        // here from a good cell, but a bad stretch may not run up to it.
        if (hereIsGood) {
          return true;
        }
        continue;
      }
      if (!inGrid(state.size, next) || !isOpen(state, next)) {
        continue;
      }

      const nextIsBad = isBadAir(state, next);
      if (hereIsGood && !nextIsBad) {
        // Good to good: plain open air.
        visit(next, 0);
      } else if (hereIsGood && nextIsBad) {
        // Entering a stretch: the cell being left must hold a vent.
        if (hasVent(state, here.pos)) {
          visit(next, 1);
        }
      } else if (!hereIsGood && nextIsBad) {
        // Going on through the stretch, while it is not too long.
        if (here.badRun < maxBadRun) {
          visit(next, here.badRun + 1);
        }
      } else {
        // Leaving a stretch: the cell being entered must hold a vent.
        if (hasVent(state, next)) {
          visit(next, 0);
        }
      }
    }
  }
  return false;
}
