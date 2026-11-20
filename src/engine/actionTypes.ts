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
 * Mine the top block of the square (x, y) (design doc 4.2; issue #86). There
 * is no miner and no reach: any square may be named. The block removed is the
 * one in layer `depthAt(state, x, y)`.
 */
export interface MineAction {
  type: 'mine';
  x: number;
  y: number;
  ap: number;
}

/** Craft the field recipe with id `recipe` once. */
export interface CraftAction {
  type: 'craft';
  recipe: string;
  ap: number;
}

/**
 * Leave, ending the run as salvage (0005 item 23). With no miner there is no
 * surface to stand on, so it is offered at any time (decision note 0026);
 * task T6 turns it into "close the mine".
 */
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

/**
 * Cut the tree on the square (x, y) for timber (issue #70; decision note
 * 0020). Any square with a tree may be named (issue #86).
 */
export interface CutTreeAction {
  type: 'cutTree';
  x: number;
  y: number;
  ap: number;
}

/** Give up: end the run as entombed (0014 item 23). */
export interface GiveUpAction {
  type: 'giveUp';
  ap: number;
}

/** The actions of actions/campTools.ts (M2-8). */
export type CampToolAction = PlacePumpAction | PlaceVentAction | SealAction | ScanAction;

/** The actions of actions/camp.ts (M2-7). */
export type CampAction =
  FoundCampAction | RestAction | StashPutAction | StashTakeAction | DecommissionCampAction;

export type Action =
  | MineAction
  | CraftAction
  | LeaveAction
  | PlaceSupportAction
  | PlaceExplosiveAction
  | CampToolAction
  | CampAction
  | GiveUpAction
  | CutTreeAction;

function vecKey(v: Vec3): string {
  return `${v.x},${v.y},${v.z}`;
}

/**
 * A string that is the same for two actions exactly when every field is the
 * same. Used to compare actions, and usable as a dictionary key or a log line.
 */
export function actionKey(action: Action): string {
  switch (action.type) {
    case 'mine':
    case 'cutTree':
      // The type, the square, the cost.
      return `${action.type} ${action.x},${action.y} ap ${action.ap}`;
    case 'craft':
      return `craft ${action.recipe} ap ${action.ap}`;
    case 'leave':
      return `leave ap ${action.ap}`;
    case 'placeSupport':
    case 'placeExplosive':
    case 'placePump':
    case 'placeVent':
    case 'seal':
      // The type, the cell, the cost.
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
