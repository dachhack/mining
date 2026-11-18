// The actions a player can take.
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

// ---------------------------------------------------------------------------
// M2 actions. The M2 skeleton (issue #50; decision note 0015) defines them
// all here, with their keys below and a stub module each under actions/, so
// that the tasks building them do not edit this shared file. A task that
// finds its action needs another field adds it here and to `actionKey`.
// ---------------------------------------------------------------------------

/** Place a support from the inventory into the cell `target` (0014 item 6). */
export interface PlaceSupportAction {
  type: 'placeSupport';
  target: Vec3;
  ap: number;
}

/** Place an explosive from the inventory into the cell `target` (0014 item 15). */
export interface PlaceExplosiveAction {
  type: 'placeExplosive';
  target: Vec3;
  ap: number;
}

/** Place a pump from the inventory into the cell `target` (0014 items 12 and 31). */
export interface PlacePumpAction {
  type: 'placePump';
  target: Vec3;
  ap: number;
}

/** Place a vent from the inventory into the cell `target` (0014 items 13 and 31). */
export interface PlaceVentAction {
  type: 'placeVent';
  target: Vec3;
  ap: number;
}

/** Place a safety lamp from the inventory into the cell `target` (0014 items 14 and 31). */
export interface PlaceSafetyLampAction {
  type: 'placeSafetyLamp';
  target: Vec3;
  ap: number;
}

/** Use one sealant to turn the open cell `target` into sealed rock (0014 item 12). */
export interface SealAction {
  type: 'seal';
  target: Vec3;
  ap: number;
}

/** Use one scanner charge to reveal the region centred on `centre` (0014 item 31). */
export interface ScanAction {
  type: 'scan';
  centre: Vec3;
  ap: number;
}

/**
 * Found a camp around the avatar's cell, using up the camp kit (0014 item
 * 26). `ap` is all the AP left in the shift.
 */
export interface FoundCampAction {
  type: 'foundCamp';
  ap: number;
}

/** Rest at a camp for the rest of the shift (0014 item 27). `ap` is all the AP left. */
export interface RestAction {
  type: 'rest';
  ap: number;
}

/** Put `count` of `item` from the inventory into the stash of the camp the avatar is in. */
export interface StashPutAction {
  type: 'stashPut';
  item: string;
  count: number;
  ap: number;
}

/** Take `count` of `item` from the stash of the camp the avatar is in. */
export interface StashTakeAction {
  type: 'stashTake';
  item: string;
  count: number;
  ap: number;
}

/** Decommission the camp the avatar is in (0014 item 28). */
export interface DecommissionCampAction {
  type: 'decommissionCamp';
  ap: number;
}

/** Give up: end the run as entombed (0014 item 23). */
export interface GiveUpAction {
  type: 'giveUp';
  ap: number;
}

/** The actions of actions/campTools.ts (M2-8). */
export type CampToolAction =
  PlacePumpAction | PlaceVentAction | PlaceSafetyLampAction | SealAction | ScanAction;

/** The actions of actions/camp.ts (M2-7). */
export type CampAction =
  FoundCampAction | RestAction | StashPutAction | StashTakeAction | DecommissionCampAction;

export type Action =
  | MoveAction
  | MineAction
  | PlaceLadderAction
  | PlaceTorchAction
  | CraftAction
  | PickUpAction
  | DropAction
  | LeaveAction
  | PlaceSupportAction
  | PlaceExplosiveAction
  | CampToolAction
  | CampAction
  | GiveUpAction;

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
    case 'placeSupport':
    case 'placeExplosive':
    case 'placePump':
    case 'placeVent':
    case 'placeSafetyLamp':
    case 'seal':
      // The same shape as placeLadder: the type, the cell, the cost.
      return `${action.type} ${vecKey(action.target)} ap ${action.ap}`;
    case 'scan':
      return `scan ${vecKey(action.centre)} ap ${action.ap}`;
    case 'stashPut':
    case 'stashTake':
      return `${action.type} ${action.count} ${action.item} ap ${action.ap}`;
    case 'foundCamp':
    case 'rest':
    case 'decommissionCamp':
    case 'giveUp':
      return `${action.type} ap ${action.ap}`;
  }
}

/** True if the two actions are the same in every field. */
export function sameAction(a: Action, b: Action): boolean {
  return actionKey(a) === actionKey(b);
}
