// UI lab 1 (issue #116): mining with no turns, no AP and no hazards.
//
// The lab is a UI experiment beside the real game. It uses the real cube and
// the real level rule (`mayMine` in heightmap.ts), but a tap only takes the
// square's top block away and hands back its yield. Nothing else happens: no
// action points, no fuel, no crew, no cube phase, no forecast.
//
// This file does not change the game's rules. The real mine action is still
// `applyMine` in actions/mine.ts; nothing in the game calls `labMine`.

import { BLOCKS } from '../data';
import type { ItemStack } from '../data';
import type { GameEvent } from './events';
import { collapseSpaceUnder } from './breach';
import { depthAt, isSquare, mayMine } from './heightmap';
import type { HigherNeighbour, MineRefusal } from './heightmap';
import { blockAt, blockDefAt, cloneState, setBlock } from './state';
import type { GameState } from './state';

/** What one lab tap did. */
export interface LabMineResult {
  /** The cube after the tap. The same object as the input when nothing was mined. */
  state: GameState;
  /** True if a block was taken away. */
  mined: boolean;
  /** The code of the block that was mined; `null` when nothing was mined. */
  block: number | null;
  /** What the mined block gave (from `BLOCKS` in src/data). Empty when nothing was mined. */
  yields: ItemStack[];
  /** Why the tap was refused; `null` when it mined. 'outside' is a tap off the cube. */
  refusal: MineRefusal | 'outside' | null;
  /** For a 'neighbourHigher' refusal, the neighbours that are too high. */
  higherNeighbours: HigherNeighbour[];
}

/**
 * Mine the top block of square (x, y) the lab's way: if the level rule allows
 * it, the block is removed and its yield is returned; otherwise nothing
 * changes.
 *
 * Pure: `state` is never changed. A mine works on a copy, which is returned.
 *
 * As in the real game, if the block was the roof of a cavern or pocket, the
 * space collapses to rubble (`collapseSpaceUnder`), so the square goes down
 * exactly 1 level and the level rule keeps holding. Whatever the pocket held
 * is left on the square, where the lab ignores it.
 */
export function labMine(state: GameState, x: number, y: number): LabMineResult {
  if (!isSquare(state, x, y)) {
    return refused(state, 'outside', []);
  }
  const check = mayMine(state, x, y);
  if (!check.allowed) {
    // `?? 'bottom'`: `refusal` is only null when `allowed` is true.
    return refused(state, check.refusal ?? 'bottom', check.higherNeighbours);
  }

  const next = cloneState(state);
  const target = { x, y, z: depthAt(next, x, y) };
  const block = blockAt(next, target);
  // Copy each stack so the caller cannot change the data table by accident.
  const yields = blockDefAt(next, target).yields.map((stack) => ({ ...stack }));
  setBlock(next, target, BLOCKS.air.code);
  // The events list is required by `collapseSpaceUnder`; the lab does not use it.
  const events: GameEvent[] = [];
  collapseSpaceUnder(next, target, events);

  return { state: next, mined: true, block, yields, refusal: null, higherNeighbours: [] };
}

function refused(
  state: GameState,
  refusal: MineRefusal | 'outside',
  higherNeighbours: HigherNeighbour[],
): LabMineResult {
  return { state, mined: false, block: null, yields: [], refusal, higherNeighbours };
}
