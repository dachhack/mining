// Placing a ladder (design doc 4.1; decision note 0005 item 19).

import { ACTION_COSTS, NO_STRUCTURE, STRUCTURES } from '../../data';
import type { Vec3 } from '../../data';
import type { PlaceLadderAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { countItem, inGrid, isOpen, removeItem, setStructure, structureAt } from '../state';
import type { GameState } from '../state';

/**
 * The avatar's own cell and its six face neighbours, as offsets, in the
 * fixed order the action list uses: own cell, above, the four sides, below.
 */
const OWN_CELL_AND_FACE_NEIGHBOURS: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
];

/**
 * Every `PlaceLadderAction` the player could take now.
 *
 * Contract:
 * - One action for each cell a ladder may go in (0005 item 19: the avatar's
 *   own cell or an open face neighbour, inside the grid, with no structure
 *   there yet), if the avatar carries a ladder. Nothing can be placed on the
 *   surface layer (owner question 28).
 * - `ap` is `ACTION_COSTS.placeLadder`. Uses up one ladder; emits `structurePlaced`.
 * - Does not change `state`.
 * - Lists actions as if the avatar had unlimited AP, each with its true `ap`
 *   cost; the dispatcher in index.ts removes the ones that cost more than the
 *   AP left.
 * - The order of the list is fixed: see `OWN_CELL_AND_FACE_NEIGHBOURS`.
 */
export function legalPlaceLadderActions(state: GameState): PlaceLadderAction[] {
  if (countItem(state, STRUCTURES.ladder.placedFromItem) < 1) {
    return [];
  }
  const here = state.avatar.pos;
  const actions: PlaceLadderAction[] = [];
  for (const offset of OWN_CELL_AND_FACE_NEIGHBOURS) {
    const target = { x: here.x + offset.x, y: here.y + offset.y, z: here.z + offset.z };
    if (
      inGrid(state.size, target) &&
      isOpen(state, target) &&
      structureAt(state, target) === NO_STRUCTURE
    ) {
      actions.push({ type: 'placeLadder', target, ap: ACTION_COSTS.placeLadder });
    }
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list.
 *
 * Contract:
 * - Changes `state` in place (it is the dispatcher's private copy) and
 *   appends what happened to `events`.
 * - Does not spend the AP: the dispatcher has already taken `action.ap` off.
 * - Does not apply gravity or reveal: the dispatcher calls `settle` and
 *   `updateReveal` afterwards.
 */
export function applyPlaceLadder(
  state: GameState,
  action: PlaceLadderAction,
  events: GameEvent[],
): void {
  removeItem(state, STRUCTURES.ladder.placedFromItem, 1);
  setStructure(state, action.target, STRUCTURES.ladder.code);
  events.push({
    type: 'structurePlaced',
    pos: { ...action.target },
    structure: STRUCTURES.ladder.code,
  });
}
