// Which choices a tap on the map stands for (issue #66).
//
// A tap on cell (x, y) of the layer on screen picks, from the legal actions,
// those that act on that cell:
// - a move into it, a mine of it, a pick-up from it;
// - on the miner's own cell, on the miner's layer: also the ladder climbs
//   (up and down the same column) and mining the block underfoot;
// - with the miner on the surface and the top layer on screen (the screen
//   then draws the miner on the block it stands on): also the walks and
//   pick-ups on the surface above that cell.
// Everything else (crafting, placing, dropping, leaving, ending the shift)
// is only in the full list under the map.
//
// It reads nothing but the actions and the miner's position, so it can say
// nothing about cells the player has not seen.

import { WORLD } from '../../data';
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
  // The miner on the surface, with the top layer on screen.
  const surfaceView = here.z === WORLD.surfaceZ && viewZ === WORLD.surfaceZ + 1;

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
    if (surfaceView && cell.z === WORLD.surfaceZ) {
      // Walking on the surface, or picking up there.
      return action.type === 'move' || action.type === 'pickUp';
    }
    return false;
  });
}
