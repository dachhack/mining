// Light and reveal (design doc 3 and 5.1; 0005 items 10, 13, 14 and 15;
// decision note 0010, "light matters").
//
// Three things reveal a cell:
// - light: the cell is lit, or shares a face with a lit cell;
// - reach: with the lamp lit, the cell is one the avatar's pick can reach, or
//   the one overhead; with the lamp out, only the six cells that share a face
//   with the avatar's own (it works by touch);
// - looking over an edge, with the lamp lit only: the cell is one a drop is
//   judged by (question 40).
//
// Which cells are lit is worked out afresh each time and never stored. Only
// the result, `state.revealed`, is kept, and a revealed cell stays revealed.

import { AVATAR, STRUCTURES } from '../data';
import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import { cellBelow, hasLadder } from './footing';
import { FACE_OFFSETS, MINE_REACH_OFFSETS, offsetPosition } from './neighbours';
import {
  blockAt,
  cellCount,
  cellIndex,
  cellPosition,
  inGrid,
  isOpen,
  isRevealed,
  isSolid,
  setRevealed,
} from './state';
import type { GameState } from './state';

/** True while the miner's lamp burns: there is lamp oil left (0010). */
export function isLampLit(state: GameState): boolean {
  return state.lampOil > 0;
}

/** How far the avatar's lamp reaches now: less once the lamp oil is gone (0005 item 15). */
export function avatarLightRadius(state: GameState): number {
  return isLampLit(state) ? AVATAR.lightRadiusWithOil : AVATAR.lightRadiusWithoutOil;
}

/** The cells holding a placed torch, in the order the cube stores them. */
export function torchPositions(state: GameState): Vec3[] {
  const torches: Vec3[] = [];
  const cells = cellCount(state.size);
  for (let index = 0; index < cells; index += 1) {
    if (state.structures[index] === STRUCTURES.torch.code) {
      torches.push(cellPosition(state.size, index));
    }
  }
  return torches;
}

/**
 * The open cells light reaches from `source` in at most `radius` steps, each
 * step going through a face into another open cell (0005 item 13). So light
 * goes round corners but never through rock. `source` itself is step 0.
 *
 * This is a breadth-first flood fill: `frontier` holds the cells reached in
 * exactly `step` steps, and each pass of the outer loop works out the next
 * ring from it.
 */
export function litCellsFrom(state: GameState, source: Vec3, radius: number): Vec3[] {
  if (!isOpen(state, source)) {
    return [];
  }
  const lit: Vec3[] = [source];
  // The cells already reached, as "x,y,z" strings, so none is visited twice.
  const seen = new Set<string>([positionKey(source)]);
  let frontier: Vec3[] = [source];
  for (let step = 1; step <= radius; step += 1) {
    const next: Vec3[] = [];
    for (const pos of frontier) {
      for (const offset of FACE_OFFSETS) {
        const neighbour = offsetPosition(pos, offset);
        const key = positionKey(neighbour);
        // Outside the cube everything but the surface layer is bedrock, which
        // is not open, so the fill cannot wander off.
        if (!seen.has(key) && isOpen(state, neighbour)) {
          seen.add(key);
          lit.push(neighbour);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  return lit;
}

function positionKey(pos: Vec3): string {
  return `${pos.x},${pos.y},${pos.z}`;
}

/**
 * The cells the avatar sees by looking over an edge (owner question 40, an
 * extension of "reach reveals", 0005 item 10). These are the cells a drop is
 * judged by in actions/move.ts, so that the move list never depends on a
 * cell the player has not seen, whatever the light (issue #15).
 *
 * Looking needs light: with the lamp out the avatar sees nothing over an
 * edge, and `updateReveal` does not call this (0010). The moves then check
 * for themselves that every cell they are judged by is revealed.
 *
 * The avatar looks down two kinds of column:
 * - the one under each open sideways neighbour (a walk off an edge);
 * - the one under its own cell, when that cell holds a ladder (a climb down
 *   off the bottom of the ladder).
 *
 * In each column the cells are taken in turn going down, starting one level
 * below the avatar's, until the first solid block (which is included) or
 * until one cell past the longest drop a move may choose
 * (`AVATAR.maxChosenDropBlocks`), whichever comes first. One cell past is
 * enough: if that cell is open too, the drop is too long to be offered,
 * however much further it goes.
 *
 * Does not change `state`. The order is fixed: sideways neighbours in
 * `FACE_OFFSETS` order, then the avatar's own column; each column top down.
 * Cells outside the grid may be among them; `updateReveal` skips those.
 */
export function edgeLookCells(state: GameState): Vec3[] {
  const here = state.avatar.pos;

  // The cell at the top of each column. All are on the avatar's level.
  const columnTops: Vec3[] = [];
  for (const offset of FACE_OFFSETS) {
    // The four face offsets with z = 0 are the sideways ones.
    if (offset.z === 0) {
      const beside = offsetPosition(here, offset);
      if (isOpen(state, beside)) {
        columnTops.push(beside);
      }
    }
  }
  if (hasLadder(state, here)) {
    columnTops.push(here);
  }

  const cells: Vec3[] = [];
  for (const top of columnTops) {
    let current = top;
    for (let depth = 1; depth <= AVATAR.maxChosenDropBlocks + 1; depth += 1) {
      current = cellBelow(current);
      cells.push(current);
      if (isSolid(state, current)) {
        break;
      }
    }
  }
  return cells;
}

/**
 * Work out which cells are lit and reveal the blocks the light shows. The
 * dispatcher in index.ts calls this when a run is created, after every action
 * and at the end of every shift, which covers everything that can change the
 * answer: a move, a fall, a mined block, a placed torch, the lamp oil running
 * out.
 *
 * - Changes `state.revealed` in place and appends a `blockRevealed` event for
 *   each cell that was not revealed before, in the order the cube stores
 *   cells (top layer first), so the same state always gives the same events.
 * - Lit cells: the surface, plus open cells reachable from the avatar within
 *   its light radius, plus open cells reachable from each torch within the
 *   torch radius (0005 item 13).
 * - A cell is revealed when it is lit or one of its faces touches a lit open
 *   cell (0005 item 14). That goes for open cells as well as solid blocks: the
 *   player sees that the tunnel goes on one cell past the edge of the light.
 * - With the lamp lit, the cells within the avatar's reach and the one
 *   overhead are revealed (0005 item 10), and so are the cells the avatar
 *   sees by looking over an edge (question 40; see `edgeLookCells`).
 * - With the lamp out, the miner works by touch (0010): only the six cells
 *   that share a face with its own are revealed by reach, and looking over
 *   an edge reveals nothing. Light from a torch or from the sky still
 *   reveals what it reaches, as above.
 * - Only cells inside the grid have a revealed flag; the rest are skipped.
 * - Once revealed, a cell stays revealed.
 */
export function updateReveal(state: GameState, events: GameEvent[]): void {
  // Indexes (see `cellIndex`) of the cells revealed by this call.
  const newlyRevealed: number[] = [];

  // A local function: it can use `state` and `newlyRevealed` from above.
  function reveal(pos: Vec3): void {
    if (inGrid(state.size, pos) && !isRevealed(state, pos)) {
      setRevealed(state, pos, true);
      newlyRevealed.push(cellIndex(state.size, pos));
    }
  }

  // The surface is always lit, and every cell of the top layer touches it.
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      reveal({ x, y, z: 0 });
    }
  }

  // The avatar's lamp and each torch.
  const lit: Vec3[] = litCellsFrom(state, state.avatar.pos, avatarLightRadius(state));
  for (const torch of torchPositions(state)) {
    lit.push(...litCellsFrom(state, torch, AVATAR.torchLightRadius));
  }
  for (const pos of lit) {
    reveal(pos);
    for (const offset of FACE_OFFSETS) {
      reveal(offsetPosition(pos, offset));
    }
  }

  if (isLampLit(state)) {
    // Reach: what the pick can touch, and the cell overhead.
    for (const offset of MINE_REACH_OFFSETS) {
      reveal(offsetPosition(state.avatar.pos, offset));
    }
    reveal(offsetPosition(state.avatar.pos, { x: 0, y: 0, z: -1 }));

    // Looking over an edge: the cells a drop is judged by.
    for (const pos of edgeLookCells(state)) {
      reveal(pos);
    }
  } else {
    // By touch: the six cells that share a face with the avatar's own. This
    // is written out, not left to the light radius, so that it holds whatever
    // `AVATAR.lightRadiusWithoutOil` is.
    for (const offset of FACE_OFFSETS) {
      reveal(offsetPosition(state.avatar.pos, offset));
    }
  }

  // Plain numeric sort; without the function, JavaScript sorts numbers as text.
  newlyRevealed.sort((a, b) => a - b);
  for (const index of newlyRevealed) {
    const pos = cellPosition(state.size, index);
    events.push({ type: 'blockRevealed', pos, block: blockAt(state, pos) });
  }
}
