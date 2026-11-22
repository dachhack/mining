// Saving and loading a run of the new game (plan B1; question 152: "saved
// every shift and carried on when the app opens again").
//
// A save is plain JSON. The cube goes through the engine's own `serialise`
// (its typed arrays become plain lists); the inventory, a Map, becomes
// [item, count] pairs. A save names the state version it was written with,
// and a build only loads its own version: an older save is not read into a
// newer shape (the player starts a new run instead).

import { deserialise, serialise } from '../serialise';
import type { SerialisedState } from '../serialise';
import { FRONTIER_STATE_VERSION } from './state';
import type { FrontierState } from './state';

/** What a save holds: the state, with the cube serialised and the inventory as pairs. */
interface SavedFrontier extends Omit<FrontierState, 'cube' | 'inventory'> {
  cube: SerialisedState;
  inventory: [string, number][];
}

/** A run as text, to keep in the browser's storage. */
export function saveFrontier(state: FrontierState): string {
  const saved: SavedFrontier = {
    ...state,
    cube: serialise(state.cube),
    inventory: [...state.inventory.entries()],
  };
  return JSON.stringify(saved);
}

/**
 * The run saved in `text`, or `null` if there is none, it cannot be read, or
 * it was saved by a build with another state version.
 */
export function loadFrontier(text: string | null): FrontierState | null {
  if (text === null) {
    return null;
  }
  try {
    // `as`: the version is checked first; a save of this version has this shape.
    const saved = JSON.parse(text) as SavedFrontier;
    if (saved.version !== FRONTIER_STATE_VERSION) {
      return null;
    }
    return { ...saved, cube: deserialise(saved.cube), inventory: new Map(saved.inventory) };
  } catch {
    return null; // not JSON, or a cube this build cannot read
  }
}
