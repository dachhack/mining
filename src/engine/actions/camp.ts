// Camp actions: found, rest, stash, decommission (design doc 8; 0014 items
// 26 to 28). Camp recipes are crafted with the ordinary `craft` action
// (actions/craft.ts).
//
// These follow the same contract as the other action modules: the `legal...`
// function does not change `state`; the `apply...` function changes `state`
// in place (it is the dispatcher's private copy), appends to `events`, and
// leaves AP, gravity and reveal to the dispatcher in index.ts.
//
// Hidden information (0014 item 3): what is offered here depends on the
// avatar, its inventory, the list of camps and their stashes, all of which
// the player knows, and, for founding, on 27 cells that must all be revealed
// (`foundingProblem` in camps.ts).

import { ACTION_COSTS, CAMPS } from '../../data';
import type {
  CampAction,
  DecommissionCampAction,
  FoundCampAction,
  RestAction,
  StashPutAction,
  StashTakeAction,
} from '../actionTypes';
import { campOfAvatar, foundingProblem, kitLimitRoomFor } from '../camps';
import type { GameEvent } from '../events';
import { canCarry } from '../inventory';
import {
  addCamp,
  addItem,
  addLooseItems,
  inventoryEntries,
  removeCamp,
  removeItem,
  stashEntries,
} from '../state';
import type { Camp, GameState } from '../state';

/**
 * The most of `item`, up to `available`, that the avatar can take: within the
 * carry weight, and within the limit of one camp kit. 0 if not even one.
 */
function countThatCanBeTaken(state: GameState, item: string, available: number): number {
  let count = Math.min(available, kitLimitRoomFor(state, item));
  while (count > 0 && !canCarry(state, item, count)) {
    count -= 1;
  }
  return count;
}

/**
 * Founding (0014 item 26): one action when `foundingProblem` finds nothing
 * wrong. It costs all the AP left in the shift, so its `ap` is `state.ap`.
 */
function legalFoundCampActions(state: GameState): FoundCampAction[] {
  if (foundingProblem(state) !== null) {
    return [];
  }
  return [{ type: 'foundCamp', ap: state.ap }];
}

/**
 * Rest (0014 item 27): offered in any cell of an active camp while at least
 * `CAMPS.restMinAp` AP is left. It costs all the AP left, so its `ap` is
 * `state.ap`. It is offered at full health too: the choice is the player's.
 */
function legalRestActions(state: GameState, camp: Camp | null): RestAction[] {
  if (camp === null || state.ap < CAMPS.restMinAp) {
    return [];
  }
  return [{ type: 'rest', ap: state.ap }];
}

/**
 * Putting into the stash (0014 item 27): 0 AP, no limit on what a stash
 * holds. For each carried item, in `inventoryEntries` order: one action that
 * stashes a single unit and, if more than one is carried, one that stashes
 * them all (the same two choices as dropping, so the list stays short).
 */
function legalStashPutActions(state: GameState, camp: Camp | null): StashPutAction[] {
  if (camp === null) {
    return [];
  }
  const actions: StashPutAction[] = [];
  for (const entry of inventoryEntries(state)) {
    actions.push({ type: 'stashPut', item: entry.item, count: 1, ap: ACTION_COSTS.stash });
    if (entry.count > 1) {
      actions.push({
        type: 'stashPut',
        item: entry.item,
        count: entry.count,
        ap: ACTION_COSTS.stash,
      });
    }
  }
  return actions;
}

/**
 * Taking from the stash (0014 item 27): 0 AP. What is taken must fit the
 * carry weight, and a second camp kit is never taken (design doc 8). For
 * each stashed item, in `stashEntries` order: one action that takes a single
 * unit and, if more than one can be taken, one that takes as many as can be.
 * An item of which not even one can be taken gets no action.
 */
function legalStashTakeActions(state: GameState, camp: Camp | null): StashTakeAction[] {
  if (camp === null) {
    return [];
  }
  const actions: StashTakeAction[] = [];
  for (const entry of stashEntries(camp)) {
    const most = countThatCanBeTaken(state, entry.item, entry.count);
    if (most >= 1) {
      actions.push({ type: 'stashTake', item: entry.item, count: 1, ap: ACTION_COSTS.stash });
    }
    if (most > 1) {
      actions.push({ type: 'stashTake', item: entry.item, count: most, ap: ACTION_COSTS.stash });
    }
  }
  return actions;
}

/** Decommissioning (0014 item 28): offered in any cell of an active camp. */
function legalDecommissionActions(camp: Camp | null): DecommissionCampAction[] {
  if (camp === null) {
    return [];
  }
  return [{ type: 'decommissionCamp', ap: ACTION_COSTS.decommissionCamp }];
}

/**
 * Every `foundCamp`, `rest`, `stashPut`, `stashTake` and `decommissionCamp`
 * action the player could take now, in that order.
 *
 * - Founding and resting cost all the AP left in the shift (at least
 *   `CAMPS.foundMinAp` / `CAMPS.restMinAp`), so their `ap` is `state.ap`; the
 *   others take theirs from `ACTION_COSTS`, and the dispatcher removes the
 *   ones that cost more than the AP left.
 * - Rest, the stash and decommissioning are offered when the avatar is in
 *   any of the 18 cells of an active camp, and act on that camp.
 * - Does not change `state`, and depends on revealed cells only (0014 item 3).
 */
export function legalCampActions(state: GameState): CampAction[] {
  const camp = campOfAvatar(state);
  return [
    ...legalFoundCampActions(state),
    ...legalRestActions(state, camp),
    ...legalStashPutActions(state, camp),
    ...legalStashTakeActions(state, camp),
    ...legalDecommissionActions(camp),
  ];
}

/** The camp an action in a camp acts on. The dispatcher has checked there is one. */
function requireCamp(state: GameState): Camp {
  const camp = campOfAvatar(state);
  if (camp === null) {
    throw new Error('The avatar is not in a camp');
  }
  return camp;
}

/**
 * Carry out `action`, which the dispatcher has already checked is legal. Does
 * not spend the AP; the dispatcher has.
 *
 * - `foundCamp`: the kit is used up and a camp with an empty stash is added
 *   around the avatar's cell, founded in the current shift (`campFounded`).
 * - `rest`: sets `state.avatar.resting`. The rest itself is applied in step
 *   (e) of the cube phase that ends this shift (`applyRest` in camps.ts), and
 *   only if the avatar is alive then (0014 item 2).
 * - `stashPut` / `stashTake`: items move between the inventory and the stash
 *   of the camp the avatar is in (`itemStashed` / `itemUnstashed`).
 * - `decommissionCamp`: the camp is removed, so its functions and its upkeep
 *   stop; its stash is left as loose items in the camp's founding cell
 *   (`campDecommissioned`). The kit is not given back.
 */
export function applyCampAction(state: GameState, action: CampAction, events: GameEvent[]): void {
  switch (action.type) {
    case 'foundCamp': {
      removeItem(state, CAMPS.kitItem, 1);
      const camp = addCamp(state, state.avatar.pos);
      events.push({ type: 'campFounded', pos: { ...camp.pos } });
      break;
    }
    case 'rest':
      state.avatar.resting = true;
      break;
    case 'stashPut': {
      const camp = requireCamp(state);
      removeItem(state, action.item, action.count);
      // `?? 0`: an item the stash has never held reads as `undefined`.
      camp.stash[action.item] = (camp.stash[action.item] ?? 0) + action.count;
      events.push({
        type: 'itemStashed',
        camp: { ...camp.pos },
        item: action.item,
        count: action.count,
      });
      break;
    }
    case 'stashTake': {
      const camp = requireCamp(state);
      const have = camp.stash[action.item] ?? 0;
      if (action.count > have) {
        throw new Error(`Cannot take ${action.count} of "${action.item}": the stash holds ${have}`);
      }
      camp.stash[action.item] = have - action.count;
      addItem(state, action.item, action.count);
      events.push({
        type: 'itemUnstashed',
        camp: { ...camp.pos },
        item: action.item,
        count: action.count,
      });
      break;
    }
    case 'decommissionCamp': {
      const camp = requireCamp(state);
      for (const entry of stashEntries(camp)) {
        addLooseItems(state, camp.pos, entry.item, entry.count);
      }
      removeCamp(state, camp);
      events.push({ type: 'campDecommissioned', pos: { ...camp.pos } });
      break;
    }
  }
}
