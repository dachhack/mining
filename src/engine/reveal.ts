// What the player knows of the cube (design doc v0.2 section 3.4; decision
// notes 0025 and 0026; issue #86).
//
// The player looks down on the cube and sees the whole surface:
// - every square's top block is known, from the start and after every change;
// - under a tree the layer-0 block is unknown until the tree is cut;
// - anything below a top block is unknown until it becomes the top.
//
// `state.revealed` holds the result, one flag per cell, and a revealed cell
// stays revealed: a tree that grows back hides the block under it on the map,
// but the block stays known. There is no light: lamp oil, torches and the
// safety lamp are removed (issue #89).

import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import { depthAt } from './heightmap';
import { blockAt, cellIndex, cellPosition, inGrid, isRevealed, setRevealed } from './state';
import type { GameState } from './state';
import { hasTree, surfaceCellAbove } from './surface/state';

/**
 * Reveal every square's top block. The dispatcher in index.ts calls this when
 * a run is created, after every action and at the end of every shift, which
 * covers everything that can change a top: a mine, a cut tree, and (once they
 * are built) the hazards of the cube phase.
 *
 * - For each square with no tree on it: its top block, and the open cells
 *   above it (the player sees that they are open). A square with no block
 *   left is open all the way down.
 * - A square with a tree on it is skipped: the tree hides its ground. What
 *   was revealed there before a tree grew back stays revealed.
 * - Changes `state.revealed` in place and appends a `blockRevealed` event for
 *   each cell that was not revealed before, in the order the cube stores
 *   cells (top layer first), so the same state always gives the same events.
 * - Nothing below a top block is read or revealed.
 */
export function updateReveal(state: GameState, events: GameEvent[]): void {
  // Indexes (see `cellIndex`) of the cells revealed by this call.
  const newlyRevealed: number[] = [];

  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      if (hasTree(state, surfaceCellAbove({ x, y, z: 0 }))) {
        continue;
      }
      const depth = depthAt(state, x, y);
      // From the top block up to layer 0. In almost every call the top block
      // is already revealed and so is everything above it, so stop there.
      for (let z = depth; z >= 0; z -= 1) {
        const pos: Vec3 = { x, y, z };
        if (!inGrid(state.size, pos)) {
          continue; // a square with no block left: `depth` is below the grid
        }
        if (isRevealed(state, pos)) {
          break;
        }
        setRevealed(state, pos, true);
        newlyRevealed.push(cellIndex(state.size, pos));
      }
    }
  }

  // Plain numeric sort; without the function, JavaScript sorts numbers as text.
  newlyRevealed.sort((a, b) => a - b);
  for (const index of newlyRevealed) {
    const pos = cellPosition(state.size, index);
    events.push({ type: 'blockRevealed', pos, block: blockAt(state, pos) });
  }
}
