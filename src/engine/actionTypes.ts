// The actions a player can take in M1.
//
// An action is a plain object. Its `type` field says which kind it is, and
// TypeScript then knows which other fields it has (a "tagged union"; in Python
// terms, a set of dataclasses with a shared `type` literal).
//
// Every action carries `ap`, the action points it costs, so that an action
// list can be shown to the player as it is. The modules that list legal
// actions fill it in from `src/data`.
//
// Actions must come from `legalActions(state)`: `applyAction` accepts an
// action only if it equals one in that list, field for field.

import type { Vec3 } from '../data';

/**
 * Walk, step up, climb, or step off a ledge into the cell `to`.
 * `drop` is how many blocks the avatar then falls (0 for none; 0005 item 7),
 * so the list can show the depth of a drop before the player takes it.
 */
export interface MoveAction {
  type: 'move';
  to: Vec3;
  drop: number;
  ap: number;
}

/** Mine the block at `target`. */
export interface MineAction {
  type: 'mine';
  target: Vec3;
  ap: number;
}

/** Place a ladder from the inventory into the cell `target`. */
export interface PlaceLadderAction {
  type: 'placeLadder';
  target: Vec3;
  ap: number;
}

/** Place a torch from the inventory into the cell `target`. */
export interface PlaceTorchAction {
  type: 'placeTorch';
  target: Vec3;
  ap: number;
}

/** Craft the field recipe with id `recipe` once. */
export interface CraftAction {
  type: 'craft';
  recipe: string;
  ap: number;
}

/** Pick up `count` loose `item` from the cell `from`. */
export interface PickUpAction {
  type: 'pickUp';
  from: Vec3;
  item: string;
  count: number;
  ap: number;
}

/** Drop `count` of `item` from the inventory into the avatar's cell. */
export interface DropAction {
  type: 'drop';
  item: string;
  count: number;
  ap: number;
}

/** Leave from the surface, ending the run (0005 item 23). */
export interface LeaveAction {
  type: 'leave';
  ap: number;
}

export type Action =
  | MoveAction
  | MineAction
  | PlaceLadderAction
  | PlaceTorchAction
  | CraftAction
  | PickUpAction
  | DropAction
  | LeaveAction;

function vecKey(v: Vec3): string {
  return `${v.x},${v.y},${v.z}`;
}

/**
 * A string that is the same for two actions exactly when every field is the
 * same. Used to compare actions, and usable as a dictionary key or a log line.
 */
export function actionKey(action: Action): string {
  switch (action.type) {
    case 'move':
      return `move to ${vecKey(action.to)} drop ${action.drop} ap ${action.ap}`;
    case 'mine':
      return `mine ${vecKey(action.target)} ap ${action.ap}`;
    case 'placeLadder':
      return `placeLadder ${vecKey(action.target)} ap ${action.ap}`;
    case 'placeTorch':
      return `placeTorch ${vecKey(action.target)} ap ${action.ap}`;
    case 'craft':
      return `craft ${action.recipe} ap ${action.ap}`;
    case 'pickUp':
      return `pickUp ${action.count} ${action.item} from ${vecKey(action.from)} ap ${action.ap}`;
    case 'drop':
      return `drop ${action.count} ${action.item} ap ${action.ap}`;
    case 'leave':
      return `leave ap ${action.ap}`;
  }
}

/** True if the two actions are the same in every field. */
export function sameAction(a: Action, b: Action): boolean {
  return actionKey(a) === actionKey(b);
}
