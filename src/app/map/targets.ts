// Which choices a tap on the map stands for (issue #66).
//
// A tap on cell (x, y) of the layer on screen picks, from the legal actions,
// those that act on that cell:
// - a move into it, a mine of it, a pick-up from it, cutting the tree in it
//   (issue #70: on the surface, a tap on a tree beside the miner);
// - on the miner's own cell, on the miner's layer: also the ladder climbs
//   (up and down the same column) and mining the block underfoot.
// A move belongs to the layer it ends on, and a mine to the layer of its
// block. So on the surface a neighbour tap is a walk (coordinator's decision
// on PR #67). The pick reaches only the faces of the miner's cell (issue
// #75), so a tap on a neighbouring block mines it, and on the layer below
// only the cell under the miner has a choice: digging down. One tap digs
// (coordinator's decision on PR #74, `tapActsAtOnce`): the note that the
// cell below is unseen shows in the result line, not in the chooser. A known
// longer or fatal fall still opens the chooser.
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
    case 'cutTree':
      return action.target;
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
