// What a tap on the map does (issues #66 and #78).
//
// `actionsForCell` lists, from the legal actions, those that act on the cell
// tapped:
// - a move into it, a mine of it, a pick-up from it, cutting the tree in it;
// - on the miner's own cell, on the miner's layer: also the ladder climbs
//   (up and down the same column) and mining the block underfoot.
// A move belongs to the layer it ends on, and a mine to the layer of its
// block. Layer 0 is the top view (issue #78): it stands for the surface as
// well, so on it a tap also reaches the walks, cuts and pick-ups on the
// surface over the cell. The miner on the surface counts as on layer 0.
//
// `tapAction` then picks the ONE action a tap does, by a fixed priority
// (coordinator's reading of issue #78): mining or cutting first, then
// moving, then taking items. There is no menu: anything else is in the full
// list under the map. Crafting, placing, dropping, leaving and ending the
// shift are only there.
//
// `tapIsRisky` says which taps need a second tap on the same cell.
//
// It reads nothing but the actions and the miner's position, so it can say
// nothing about cells the player has not seen.

import { WORLD } from '../../data';
import { fallDamage, isFatalFall, legalActions } from '../../engine';
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
      // Climbing the ladder up or down, or mining the block underfoot.
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

/**
 * The one action a tap on cell (x, y) of map layer `viewZ` does, or `null`
 * if it does nothing. Among equals, the first in the action list wins.
 */
export function tapAction(state: GameState, viewZ: number, x: number, y: number): Action | null {
  let best: Action | null = null;
  for (const action of actionsForCell(state, viewZ, x, y)) {
    if (best === null || tapRank(action) < tapRank(best)) {
      best = action;
    }
  }
  return best;
}

/**
 * True if a tap on `action` needs a second tap first (issue #78): a fall or
 * drop that hurts or kills, or a yield too heavy to carry. A walk off a
 * ledge is a chosen drop (design doc 5.2): free up to
 * `AVATAR.freeFallBlocks`, and the engine offers it only when the miner has
 * seen where it lands (`maxChosenDropBlocks` at most). So it is one tap
 * unless the engine's own `fallDamage` says it costs health (review of PR
 * #79). Everything else is as `tapActsAtOnce` says. The full list still
 * shows every warning.
 */
export function tapIsRisky(state: GameState, action: Action): boolean {
  if (action.type === 'move') {
    return (
      action.drop > 0 && (fallDamage('chosenDrop', action.drop) > 0 || isFatalFall(action.drop))
    );
  }
  return !tapActsAtOnce(state, action);
}
