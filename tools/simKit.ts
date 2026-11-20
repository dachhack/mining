// A sim-only starting kit: extra items in the stockpile at the start of a run.
//
// WHY. The standard loadout carries timber and one camp kit. Pumps, vents,
// sealant, scanner charges, drills and explosives are made at a camp from
// iron, copper and crystal, which lie 8 or more levels down, and the depth
// survey (docs/surveys/depth-survey.md) shows that scripted runs do not get
// there. So without a kit the `random` policy would never take half of the
// action types, and the acceptance runs would not exercise their rules.
//
// This is a tool for testing the rules. It is not a loadout: the game offers
// it to no player, and the depth survey never uses it.
//
// It is the one place where a tool reaches past the engine's public surface
// (`cloneState` and `addItem` from src/engine/state.ts), because the public
// surface rightly has no way to hand out items.

import { ITEMS } from '../src/data';
import type { GameState } from '../src/engine';
import { addItem, cloneState } from '../src/engine/state';

/**
 * The kit `npm run sim -- --kit` gives: enough of every camp-made tool for a
 * random player to use each of them several times in a run.
 */
export const TOOL_KIT: Record<string, number> = {
  support: 6,
  explosive: 4,
  pump: 2,
  vent: 2,
  sealant: 4,
  scannerCharge: 3,
  drill: 1,
  campKit: 1,
};

/**
 * A copy of `state` with the items added to its stockpile. `state` itself is
 * not changed. Throws on an item id the data does not list.
 */
export function withExtraItems(state: GameState, items: Record<string, number>): GameState {
  const next = cloneState(state);
  for (const [item, count] of Object.entries(items)) {
    if (!(item in ITEMS)) {
      throw new Error(`Unknown item "${item}" in a starting kit`);
    }
    addItem(next, item, count);
  }
  return next;
}
