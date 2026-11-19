// Light and reveal (design doc 3 and 5.1; 0005 items 13, 14 and 15; decision
// notes 0011, 0021 and 0022).
//
// Only exposed faces are known (owner, issue #75). Two things reveal a cell:
// - light: the cell is lit, or shares a face with a lit cell. The avatar's
//   lamp, or daylight while it stands on the surface (0021), and torches
//   give light;
// - touch: the six cells that share a face with the avatar's own.
// The lamp no longer shows the cells the pick can reach beyond those, the
// cell overhead, or what lies over an edge (0005 item 10 and question 40,
// replaced by 0022).
//
// Which cells are lit is worked out afresh each time and never stored. Only
// the result, `state.revealed`, is kept, and a revealed cell stays revealed.

import { AVATAR, STRUCTURES } from '../data';
import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import { FACE_OFFSETS, offsetPosition } from './neighbours';
import {
  blockAt,
  cellCount,
  cellIndex,
  cellPosition,
  inGrid,
  isOpen,
  isRevealed,
  isSurface,
  setRevealed,
} from './state';
import type { GameState } from './state';
import { hasTree } from './surface/state';

/** True while the miner's lamp burns: there is lamp oil left (0011). */
export function isLampLit(state: GameState): boolean {
  return state.lampOil > 0;
}

/**
 * True while the avatar sees by light: its lamp burns, or it stands on the
 * surface, where daylight does the lamp's work whatever the oil (owner, after
 * PR #72: the top layer is known only where the miner has been near).
 */
export function hasAvatarLight(state: GameState): boolean {
  return isLampLit(state) || isSurface(state.size, state.avatar.pos);
}

/**
 * How far the avatar's light reaches now: the lamp's radius, or daylight's
 * (the same) on the surface; less once the lamp oil is gone underground
 * (0005 item 15).
 */
export function avatarLightRadius(state: GameState): number {
  return hasAvatarLight(state) ? AVATAR.lightRadiusWithOil : AVATAR.lightRadiusWithoutOil;
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
        // is not open, so the fill cannot wander off. A tree on the surface
        // stops light like rock (issue #70): the lamp does not show the
        // ground under it.
        if (!seen.has(key) && isOpen(state, neighbour) && !hasTree(state, neighbour)) {
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
 * Work out which cells are lit and reveal the blocks the light shows. The
 * dispatcher in index.ts calls this when a run is created, after every action
 * and at the end of every shift, which covers everything that can change the
 * answer: a move, a fall, a mined block, a placed torch, the lamp oil running
 * out.
 *
 * - Changes `state.revealed` in place and appends a `blockRevealed` event for
 *   each cell that was not revealed before, in the order the cube stores
 *   cells (top layer first), so the same state always gives the same events.
 * - The top layer is not revealed by daylight as a whole (owner, after PR
 *   #72): only what the miner's light comes near. On the surface, daylight
 *   does the lamp's work, lamp oil or not (`hasAvatarLight`).
 * - Trees (issue #70): light does not pass through a tree, so the ground
 *   under one is not seen from the surface. From underground, light reveals
 *   it as any other cell.
 * - Lit cells: open cells reachable from the avatar within
 *   its light radius, plus open cells reachable from each torch within the
 *   torch radius (0005 item 13).
 * - A cell is revealed when it is lit or one of its faces touches a lit open
 *   cell (0005 item 14). That goes for open cells as well as solid blocks: the
 *   player sees that the tunnel goes on one cell past the edge of the light.
 * - The six cells that share a face with the avatar's own are always revealed
 *   (with the lamp out underground the miner knows them by touch, 0011).
 *   Nothing else is revealed by reach, overhead or over an edge (0022).
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

  // The avatar's light (its lamp, or daylight on the surface) and each torch.
  // Daylight does NOT reveal the whole top layer: a top-layer block is known
  // only once the miner's light has come near it (owner, after PR
  // #72). On the surface the light spreads over the open surface cells, not
  // into trees, and reveals the blocks under them.
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

  // Only exposed faces are known (owner, issue #75; decision note 0022). The
  // lamp no longer shows the cells the pick can reach, the cell overhead, or
  // what lies over an edge: only what light shows (above) and, always, the
  // six cells that touch the avatar's own. With light, those six already
  // touch a lit cell (the avatar's own); with the lamp out underground the
  // miner knows them by touch (0011). From the surface the only cell of the
  // grid this touches is the one underfoot, never under a tree.
  for (const offset of FACE_OFFSETS) {
    reveal(offsetPosition(state.avatar.pos, offset));
  }

  // Plain numeric sort; without the function, JavaScript sorts numbers as text.
  newlyRevealed.sort((a, b) => a - b);
  for (const index of newlyRevealed) {
    const pos = cellPosition(state.size, index);
    events.push({ type: 'blockRevealed', pos, block: blockAt(state, pos) });
  }
}
