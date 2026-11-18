// Placing a torch (design doc 4.1; 0005 items 13 and 19).

import { ACTION_COSTS, NO_STRUCTURE, STRUCTURES } from '../../data';
import type { Vec3 } from '../../data';
import type { PlaceTorchAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { FACE_OFFSETS, offsetPosition } from '../neighbours';
import { countItem, inGrid, isOpen, removeItem, setStructure, structureAt } from '../state';
import type { GameState } from '../state';

/**
 * Every `PlaceTorchAction` the player could take now.
 *
 * - One action for each cell a torch may go in, if the avatar carries a
 *   torch. Those are the same cells as for a ladder (0005 item 19): the
 *   avatar's own cell or a face neighbour, which must be open, inside the
 *   grid (so not on the surface; owner question 28), and hold no structure
 *   yet. A cell holds one structure, so a torch cannot share a cell with a
 *   ladder.
 * - Order: the avatar's cell, then the neighbours in the order of
 *   `FACE_OFFSETS`.
 * - `ap` is `ACTION_COSTS.placeTorch`.
 * - Does not change `state`. Lists actions as if the avatar had unlimited AP;
 *   the dispatcher in index.ts removes the ones that cost too much.
 */
export function legalPlaceTorchActions(state: GameState): PlaceTorchAction[] {
  if (countItem(state, STRUCTURES.torch.placedFromItem) < 1) {
    return [];
  }
  const cells: Vec3[] = [state.avatar.pos];
  for (const offset of FACE_OFFSETS) {
    cells.push(offsetPosition(state.avatar.pos, offset));
  }

  const actions: PlaceTorchAction[] = [];
  for (const cell of cells) {
    if (
      inGrid(state.size, cell) &&
      isOpen(state, cell) &&
      structureAt(state, cell) === NO_STRUCTURE
    ) {
      actions.push({ type: 'placeTorch', target: { ...cell }, ap: ACTION_COSTS.placeTorch });
    }
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list: use up one torch, put the torch structure in the cell, and emit
 * `structurePlaced`.
 *
 * The torch gives light from then on (0005 item 13). Nothing is stored for
 * that: `updateReveal`, which the dispatcher calls next, finds the torches in
 * the cube each time. Does not spend the AP; the dispatcher has.
 */
export function applyPlaceTorch(
  state: GameState,
  action: PlaceTorchAction,
  events: GameEvent[],
): void {
  removeItem(state, STRUCTURES.torch.placedFromItem, 1);
  setStructure(state, action.target, STRUCTURES.torch.code);
  events.push({
    type: 'structurePlaced',
    pos: { ...action.target },
    structure: STRUCTURES.torch.code,
  });
}
