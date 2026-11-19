// Which choices a tap on the map stands for (issue #66).
//
// A tap on cell (x, y) of the layer on screen picks, from the legal actions,
// those that act on that cell:
// - a move into it, a mine of it, a pick-up from it;
// - on the miner's own cell, on the miner's layer: also the ladder climbs
//   (up and down the same column) and mining the block underfoot.
// A move belongs to the layer it ends on, and a mine to the layer of its
// block. So on the surface a neighbour tap is a walk, and the block under a
// neighbour is mined from the layer-0 view, as one layer down is mined
// underground (coordinator's decision on PR #67).
// Everything else (crafting, placing, dropping, leaving, ending the shift)
// is only in the full list under the map.
//
// It reads nothing but the actions and the miner's position, so it can say
// nothing about cells the player has not seen.

import { legalActions } from '../../engine';
import type { Action, GameState } from '../../engine';

/** The cell an action acts on, or `null` for one that acts on no cell of the map. */
function actionCell(action: Action): { x: number; y: number; z: number } | null {
  switch (action.type) {
    case 'move':
      return action.to;
    case 'mine':
      return action.target;
    case 'pickUp':
      return action.from;
    default:
      return null;
  }
}

/** The legal actions a tap on cell (x, y) of layer `viewZ` stands for, in list order. */
export function actionsForCell(state: GameState, viewZ: number, x: number, y: number): Action[] {
  const here = state.avatar.pos;
  const onMinersLayer = viewZ === here.z;
  const isMinersCell = here.x === x && here.y === y;

  return legalActions(state).filter((action) => {
    const cell = actionCell(action);
    if (cell === null || cell.x !== x || cell.y !== y) {
      return false;
    }
    if (cell.z === viewZ) {
      return true;
    }
    if (onMinersLayer && isMinersCell) {
      // Climbing the ladder up or down, or mining the block underfoot.
      return action.type === 'move' || (action.type === 'mine' && cell.z === here.z + 1);
    }
    return false;
  });
}
