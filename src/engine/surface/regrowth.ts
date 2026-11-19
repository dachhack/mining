// Trees growing back on stumps (issue #70 item 5; decision note 0020).
//
// When: `endShift` runs this after the cube phase (and the `settle` that
// follows it) and before upkeep, if the avatar is alive. So a tree that grows
// is there at the start of the next shift, and the end-shift preview can say
// which stumps will grow (`forecastRegrowth`).
//
// The rule, for each stump in the order the surface is stored:
// 1. If its layer-0 block is not solid (it was mined, or fell), the count goes
//    back to 0: a tree needs ground to grow in, and counts again from the
//    start once there is some.
// 2. Otherwise the count goes up by one, to at most `SURFACE.regrowShifts`.
// 3. When the count has reached `regrowShifts` and nothing stands on the
//    stump (the miner, loose items), a tree grows and the count is cleared.
//    If something does stand there, the count waits at `regrowShifts`, and the
//    tree grows at the end of the first shift the stump is clear.
//
// So a tree cut in shift N grows at the end of shift N + regrowShifts - 1:
// the shift of the cut counts as one of the ten. A surface cell never holds a
// structure (structures are only ever placed in the grid), so "a ladder or
// other structure" on a stump cannot happen; the ladder that matters stands
// in the layer-0 cell, which is then open, and rule 1 covers it.
//
// Everything read here is something the player sees: the stump, its layer-0
// block (revealed when the tree was cut), the miner, and loose items on the
// surface (always seen).

import { SURFACE } from '../../data';
import type { Vec3 } from '../../data';
import type { GameEvent } from '../events';
import { isSolid, looseItemsAt, samePosition } from '../state';
import type { GameState } from '../state';
import { hasStump, setStumpAge, setSurfaceKind, stumpAgeAt, surfaceCells } from './state';

/** The layer-0 cell under the surface cell `pos`. */
function groundUnder(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y, z: 0 };
}

/** True if the miner or loose items stand on the surface cell `pos`. */
function somethingStandsOn(state: GameState, pos: Vec3): boolean {
  return samePosition(state.avatar.pos, pos) || looseItemsAt(state, pos).length > 0;
}

/**
 * What the regrowth step would do to one stump: its new count, and whether a
 * tree grows. Both `regrowTrees` and `forecastRegrowth` use this, so the
 * preview cannot disagree with what then happens (from the same state).
 */
function stumpOutcome(state: GameState, pos: Vec3): { age: number; grows: boolean } {
  if (!isSolid(state, groundUnder(pos))) {
    return { age: 0, grows: false };
  }
  const age = Math.min(stumpAgeAt(state, pos) + 1, SURFACE.regrowShifts);
  if (age >= SURFACE.regrowShifts && !somethingStandsOn(state, pos)) {
    return { age: 0, grows: true };
  }
  return { age, grows: false };
}

/**
 * The regrowth step (see the top of this file). Changes `state` in place and
 * appends a `treeGrew` event for each tree that grows, in the order the
 * surface is stored.
 */
export function regrowTrees(state: GameState, events: GameEvent[]): void {
  for (const cell of surfaceCells(state)) {
    if (!hasStump(state, cell)) {
      continue;
    }
    const outcome = stumpOutcome(state, cell);
    setStumpAge(state, cell, outcome.age);
    if (outcome.grows) {
      setSurfaceKind(state, cell, SURFACE.kinds.tree.code);
      events.push({ type: 'treeGrew', pos: { ...cell } });
    }
  }
}

/**
 * The stumps that would grow a tree if the shift ended now, in the order the
 * surface is stored. Worked out from the state as it is; the cube phase runs
 * first, so a stump whose ground falls in that phase does not grow after all.
 * Does not change `state`.
 */
export function forecastRegrowth(state: GameState): Vec3[] {
  return surfaceCells(state).filter(
    (cell) => hasStump(state, cell) && stumpOutcome(state, cell).grows,
  );
}

/**
 * How many more shifts must end before the stump at `pos` grows a tree, if
 * nothing stands on it then and its ground stays: 1 means "at the end of
 * this shift". `null` if `pos` is not a stump, or its ground is gone (it
 * counts again from the start once there is ground). For the views.
 */
export function shiftsUntilRegrowth(state: GameState, pos: Vec3): number | null {
  if (!hasStump(state, pos) || !isSolid(state, groundUnder(pos))) {
    return null;
  }
  return Math.max(1, SURFACE.regrowShifts - stumpAgeAt(state, pos));
}
