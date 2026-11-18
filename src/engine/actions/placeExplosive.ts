// Placing an explosive (design doc 7.2; 0014 item 15).

import { ACTION_COSTS, NO_STRUCTURE, STRUCTURES, blockDefByCode } from '../../data';
import type { Vec3 } from '../../data';
import type { PlaceExplosiveAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { knownCell } from '../known';
import { FACE_OFFSETS, offsetPosition } from '../neighbours';
import { armCharge, countItem, inGrid, removeItem, setStructure } from '../state';
import type { GameState } from '../state';

/**
 * Every `PlaceExplosiveAction` the player could take now.
 *
 * - One action for each cell an explosive may go in, if the avatar carries
 *   one: its own cell or a face neighbour, which must be inside the grid (so
 *   not on the surface), open, and hold no structure (0014 item 15). These
 *   are the same cells as for a torch.
 * - Order: the avatar's cell, then the neighbours in the order of
 *   `FACE_OFFSETS`.
 * - `ap` is `ACTION_COSTS.placeExplosive`. Lists actions as if AP were
 *   unlimited; the dispatcher removes the ones that cost too much.
 * - Does not change `state`. Each cell is read through `knownCell`, so a cell
 *   the player has not seen is never offered and nothing here can depend on
 *   one (0014 item 3). The six cells the miner touches are always revealed,
 *   so in play this removes nothing.
 */
export function legalPlaceExplosiveActions(state: GameState): PlaceExplosiveAction[] {
  if (countItem(state, STRUCTURES.explosive.placedFromItem) < 1) {
    return [];
  }
  const cells: Vec3[] = [state.avatar.pos];
  for (const offset of FACE_OFFSETS) {
    cells.push(offsetPosition(state.avatar.pos, offset));
  }

  const actions: PlaceExplosiveAction[] = [];
  for (const cell of cells) {
    if (!inGrid(state.size, cell)) {
      continue;
    }
    const known = knownCell(state, cell);
    if (known === null) {
      continue;
    }
    if (!blockDefByCode(known.block).solid && known.structure === NO_STRUCTURE) {
      actions.push({
        type: 'placeExplosive',
        target: { ...cell },
        ap: ACTION_COSTS.placeExplosive,
      });
    }
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list: use up one explosive, put the explosive structure in the cell,
 * arm it, and emit `structurePlaced`.
 *
 * Armed means it goes off in step (c) of the cube phase that ends this shift
 * (cube/gas.ts, explosions.ts). There is no way to pick it up again. Does not
 * spend the AP; the dispatcher has.
 */
export function applyPlaceExplosive(
  state: GameState,
  action: PlaceExplosiveAction,
  events: GameEvent[],
): void {
  removeItem(state, STRUCTURES.explosive.placedFromItem, 1);
  setStructure(state, action.target, STRUCTURES.explosive.code);
  armCharge(state, action.target, 'explosive');
  events.push({
    type: 'structurePlaced',
    pos: { ...action.target },
    structure: STRUCTURES.explosive.code,
  });
}
