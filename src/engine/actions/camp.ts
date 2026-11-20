// Camp actions: found, rest, decommission (design doc v0.2 sections 4.1 and
// 8; issue #100; decision note 0031). Camp recipes are crafted with the
// ordinary `craft` action (actions/craft.ts).
//
// Each action names a camp by its centre square (x, y). The crew is abstract,
// so a camp can be founded, rested at or decommissioned from anywhere.

import { ACTION_COSTS, CAMPS, SURFACE } from '../../data';
import type { CampAction } from '../actionTypes';
import { campCentredAt, campSquares, foundCampSites } from '../camps';
import { markWorked } from '../crew';
import type { GameEvent } from '../events';
import { depthAt } from '../heightmap';
import { addCamp, removeCamp, removeItem } from '../state';
import type { Camp, GameState } from '../state';
import { hasStump, setStumpAge, setSurfaceKind, surfaceCellAbove } from '../surface/state';

/**
 * Every `foundCamp`, `rest` and `decommissionCamp` action the player could
 * take now, in that order.
 *
 * - `foundCamp`: one for each centre square `foundCampCheck` allows, row by
 *   row (y, then x): `foundCampSites` in camps.ts. It costs the rest of the shift, so its `ap` is all the
 *   AP left, and it is offered only with at least `CAMPS.foundMinAp` left.
 * - `rest`: one for each active camp, in the order of `state.camps`. It also
 *   costs all the AP left, and needs at least `CAMPS.restMinAp`. It is not
 *   offered once the crew is resting.
 * - `decommissionCamp`: one for each active camp, for `ACTION_COSTS`' AP.
 *
 * Does not change `state`. Reads only what the player sees.
 */
export function legalCampActions(state: GameState): CampAction[] {
  const actions: CampAction[] = [];

  if (state.ap >= CAMPS.foundMinAp) {
    for (const site of foundCampSites(state)) {
      actions.push({ type: 'foundCamp', x: site.x, y: site.y, ap: state.ap });
    }
  }

  if (state.ap >= CAMPS.restMinAp && state.crew.restingAt === null) {
    for (const camp of state.camps) {
      actions.push({ type: 'rest', x: camp.pos.x, y: camp.pos.y, ap: state.ap });
    }
  }

  for (const camp of state.camps) {
    actions.push({
      type: 'decommissionCamp',
      x: camp.pos.x,
      y: camp.pos.y,
      ap: ACTION_COSTS.decommissionCamp,
    });
  }
  return actions;
}

/** The camp an action names, or an error: the dispatcher only passes legal actions. */
function requireCamp(state: GameState, x: number, y: number): Camp {
  const camp = campCentredAt(state, x, y);
  if (camp === null) {
    throw new Error(`There is no camp centred on (${x}, ${y})`);
  }
  return camp;
}

/**
 * Carry out `action`, which the dispatcher has already checked is legal.
 * Does not spend the AP; the dispatcher has. Changes `state` in place and
 * appends to `events`.
 *
 * - `foundCamp`: takes one camp kit from the stockpile and adds the camp
 *   (`campFounded`). A stump on a camp square is cleared for good, as mining
 *   it would: no tree grows on a camp (decision note 0031, reading 2).
 *   Founding does not make the squares worked squares (design doc 5.2 does
 *   not list it).
 * - `rest`: notes which camp the crew rests at (`restStarted`) and marks the
 *   camp's 9 squares as worked squares (design doc 5.2: "a camp square while
 *   the crew rests there"). It is done here, in the player phase, so the
 *   squares are worked through the whole cube phase; the rest itself is
 *   applied in step (e) (`applyRest` in camps.ts).
 * - `decommissionCamp`: the camp is gone (`campDecommissioned`), and with it
 *   its upkeep, its discount and its hold on the 9 squares. The kit is not
 *   given back (decision note 0031, reading 5).
 */
export function applyCampAction(state: GameState, action: CampAction, events: GameEvent[]): void {
  switch (action.type) {
    case 'foundCamp': {
      removeItem(state, CAMPS.kitItem, 1);
      const depth = depthAt(state, action.x, action.y);
      const camp = addCamp(state, { x: action.x, y: action.y, z: depth });
      for (const square of campSquares(camp)) {
        const surfaceCell = surfaceCellAbove({ x: square.x, y: square.y, z: 0 });
        if (hasStump(state, surfaceCell)) {
          setSurfaceKind(state, surfaceCell, SURFACE.kinds.meadow.code);
          setStumpAge(state, surfaceCell, 0);
        }
      }
      events.push({ type: 'campFounded', pos: { ...camp.pos } });
      break;
    }
    case 'rest': {
      const camp = requireCamp(state, action.x, action.y);
      state.crew.restingAt = { x: camp.pos.x, y: camp.pos.y };
      for (const square of campSquares(camp)) {
        markWorked(state, square.x, square.y);
      }
      events.push({ type: 'restStarted', pos: { ...camp.pos } });
      break;
    }
    case 'decommissionCamp': {
      const camp = requireCamp(state, action.x, action.y);
      removeCamp(state, camp);
      events.push({ type: 'campDecommissioned', pos: { ...camp.pos } });
      break;
    }
  }
}
