// UI lab 1 (issue #116): the lab's own small state, and a tap on it.
//
// No DOM code here, so the unit tests can run it in plain Node. The screen
// is in labScreen.ts.
//
// The lab keeps its own world, separate from the game's saved run: the
// generated cube (`createRun`, the same as the game), a table of every
// square's depth, and the resources collected so far. A tap calls the
// engine's `labMine`, which applies the real level rule and nothing else:
// no turns, no AP, no fuel, no hazards. The lab is not saved; "New world"
// starts another.

import { CONTRACT_IDS, DEFAULT_LOADOUT_ID } from '../../data';
import { createRun, depthIn, depthMapOf, labMine } from '../../engine';
import type { DepthMap, GameState, LabMineResult } from '../../engine';

export interface LabWorld {
  seed: number;
  /** The cube. Only its blocks are read; turns, fuel and the crew are ignored. */
  state: GameState;
  /** Every square's depth, kept up to date after each mine so drawing need not walk the cube. */
  depths: DepthMap;
  /** Resources collected: item id -> count. Only items with a count above 0 are in it. */
  counts: Map<string, number>;
  /** How many blocks have been mined in this world. */
  mined: number;
}

/** A lab world made from any cube. The tests pass a small hand-made one. */
export function labWorldFromState(seed: number, state: GameState): LabWorld {
  return { seed, state, depths: depthMapOf(state), counts: new Map(), mined: 0 };
}

/** A new lab world on `seed`, generated exactly as a game run on that seed is. */
export function newLabWorld(seed: number): LabWorld {
  const contractId = CONTRACT_IDS[0];
  if (contractId === undefined) {
    throw new Error('the data lists no contract');
  }
  return labWorldFromState(seed, createRun(seed, contractId, DEFAULT_LOADOUT_ID));
}

/** What a tap did: the world after it, and the engine's answer. */
export interface LabTap {
  world: LabWorld;
  result: LabMineResult;
}

/**
 * Tap square (x, y). If the level rule allows it, the square's top block is
 * mined, the square is 1 level deeper, and the block's yield is added to the
 * counts. If not, the very same world comes back, unchanged.
 *
 * `world` itself is never changed: a mine returns a new world.
 */
export function labTap(world: LabWorld, x: number, y: number): LabTap {
  const result = labMine(world.state, x, y);
  if (!result.mined) {
    return { world, result };
  }
  const counts = new Map(world.counts);
  for (const stack of result.yields) {
    counts.set(stack.item, (counts.get(stack.item) ?? 0) + stack.count);
  }
  // Only the mined square's depth changed, and by exactly 1 (a cavern under
  // it collapses to rubble, so it never drops further).
  // `[...list]` copies a list, like `list[:]` in Python.
  const depths: DepthMap = {
    width: world.depths.width,
    height: world.depths.height,
    depths: [...world.depths.depths],
  };
  depths.depths[x + depths.width * y] = depthIn(world.depths, x, y) + 1;
  return {
    world: { seed: world.seed, state: result.state, depths, counts, mined: world.mined + 1 },
    result,
  };
}
