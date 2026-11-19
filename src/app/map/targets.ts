// What a tap on the map does (issues #66, #78 and #80).
//
// `actionsForCell` lists, from the legal actions, those that act on the cell
// tapped:
// - a move into it, a mine of it, a pick-up from it, cutting the tree in it;
// - on the miner's own cell, on the miner's layer: also the moves up and down
//   the same column and mining the block underfoot.
// A move belongs to the layer it ends on, and a mine to the layer of its
// block. Layer 0 is the top view (issue #78): it stands for the surface as
// well, so on it a tap also reaches the walks, cuts and pick-ups on the
// surface over the cell. The miner on the surface counts as on layer 0.
//
// `tapAction` then picks the ONE action a tap does, by a fixed priority
// (coordinator's reading of issue #78): mining or cutting first, then
// moving, then taking items. The miner has no gravity (owner, issue #80), so
// a tap on a solid neighbour mines it and a tap on an open one moves there.
// A tap on the miner's own cell goes down: it digs the block underfoot, or
// moves down into the cell below when that is open; it never moves up (the
// "Go up" button does). There is no menu: anything else is in the full list
// under the map. Crafting, placing, dropping, leaving and ending the shift
// are only there.
//
// `tapIsRisky` says which taps need a second tap on the same cell: since
// issue #80 only a yield too heavy to carry.
//
// It reads nothing but the actions and the miner's position, so it can say
// nothing about cells the player has not seen.

import { WORLD } from '../../data';
import { legalActions } from '../../engine';
import type { Action, GameState } from '../../engine';
import { tapActsAtOnce } from '../text/describe';

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

/** The layer the map shows the miner on: the surface is drawn on layer 0, the top view. */
export function mapLayerOf(z: number): number {
  return z === WORLD.surfaceZ ? WORLD.surfaceZ + 1 : z;
}

/** The legal actions that act on cell (x, y) of map layer `viewZ`, in list order. */
export function actionsForCell(state: GameState, viewZ: number, x: number, y: number): Action[] {
  const here = state.avatar.pos;
  const onMinersLayer = viewZ === mapLayerOf(here.z);
  const isMinersCell = here.x === x && here.y === y;

  return legalActions(state).filter((action) => {
    const cell = actionCell(action);
    if (cell === null || cell.x !== x || cell.y !== y) {
      return false;
    }
    if (mapLayerOf(cell.z) === viewZ) {
      return true;
    }
    if (onMinersLayer && isMinersCell) {
      // The moves up and down the miner's column, or mining the block underfoot.
      return action.type === 'move' || (action.type === 'mine' && cell.z === here.z + 1);
    }
    return false;
  });
}

/** How a tap ranks an action: lower goes first (issue #78). */
function tapRank(action: Action): number {
  switch (action.type) {
    case 'mine':
    case 'cutTree':
      return 0;
    case 'move':
      return 1;
    case 'pickUp':
      return 2;
    default:
      return 3;
  }
}

/** True if `action` moves the miner up its own column (issue #80: not a tap on its own cell). */
function movesUpOwnColumn(state: GameState, action: Action): boolean {
  const here = state.avatar.pos;
  return (
    action.type === 'move' &&
    action.to.x === here.x &&
    action.to.y === here.y &&
    action.to.z < here.z
  );
}

/**
 * The one action a tap on cell (x, y) of map layer `viewZ` does, or `null`
 * if it does nothing. Among equals, the first in the action list wins.
 *
 * On the miner's own cell, on the miner's layer, a tap never moves the miner
 * up (issue #80): it digs down, or moves down into an open cell below. On
 * the top view that cell also stands for the surface over the miner, so
 * without this a tap on yourself in an open-bottomed hole would climb out.
 */
export function tapAction(state: GameState, viewZ: number, x: number, y: number): Action | null {
  const here = state.avatar.pos;
  const onOwnCell = viewZ === mapLayerOf(here.z) && here.x === x && here.y === y;
  let best: Action | null = null;
  for (const action of actionsForCell(state, viewZ, x, y)) {
    if (onOwnCell && movesUpOwnColumn(state, action)) {
      continue;
    }
    if (best === null || tapRank(action) < tapRank(best)) {
      best = action;
    }
  }
  return best;
}

/**
 * True if a tap on `action` needs a second tap first (issue #78). The miner
 * never falls (issue #80), so no move is risky; the one risk left is a yield
 * too heavy to carry, as `tapActsAtOnce` says. The full list still shows
 * every warning.
 */
export function tapIsRisky(state: GameState, action: Action): boolean {
  return !tapActsAtOnce(state, action);
}
