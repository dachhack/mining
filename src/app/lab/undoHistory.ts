// UI lab 2: Undo (owner, after the PR #126 playtest: "Undo button").
//
// What the player did, so it can be undone one action at a time, back to
// the start of the world. No DOM code here, so the unit tests run it in
// plain Node.
//
// An action is a tap that took or mined something, placing a camp, an
// upgrade, or a demolish: a `CampStep`. Taps that change nothing (fog, a
// refused or too-hard block) are not actions.
//
// Undo puts back the whole world as it was just before the action:
// blocks, items, camps, fog, and the surface too, animals and the lab
// clock included (decision note 0049). The screen sets its clock back to
// match, so time runs on from there.
//
// Keeping a copy of the world before every action would cost too much
// memory on a phone: each dig copies the 32 x 32 x 32 cube (about 300 KB).
// So the history keeps the steps, and a whole copy of the world only every
// `CHECKPOINT_EVERY` actions. To undo, it starts from the nearest copy and
// plays the steps after it again. The lab's rules are deterministic, so
// this gives exactly the same world (a unit test checks it).

import { advanceWorld, applyCampStep } from './campWorld';
import type { CampStep, CampWorld } from './campWorld';

/**
 * A whole copy of the world is kept before every this many actions. Undo
 * plays at most this many steps again, which takes a few milliseconds.
 */
export const CHECKPOINT_EVERY = 20;

/** One action: what it was, and the lab time just before it (milliseconds). */
export interface UndoEntry {
  step: CampStep;
  at: number;
}

export interface UndoHistory {
  /** The actions, oldest first. */
  entries: UndoEntry[];
  /**
   * Whole copies of the world: `checkpoints.get(k)` is the world just
   * before `entries[k]`, kept for every k that is a multiple of
   * `CHECKPOINT_EVERY` (0 included). A Map is like a Python dict.
   */
  checkpoints: Map<number, CampWorld>;
}

/** No actions yet. */
export function emptyHistory(): UndoHistory {
  return { entries: [], checkpoints: new Map() };
}

/** How many actions can be undone. */
export function undoCount(history: UndoHistory): number {
  return history.entries.length;
}

/**
 * `history` with one more action: `step`, taken on `before` (the world just
 * before it, brought up to the lab clock). `history` itself is not changed.
 */
export function recordAction(history: UndoHistory, before: CampWorld, step: CampStep): UndoHistory {
  const k = history.entries.length;
  const checkpoints = new Map(history.checkpoints);
  if (k % CHECKPOINT_EVERY === 0) {
    checkpoints.set(k, before);
  }
  return {
    entries: [...history.entries, { step, at: before.surface.time }],
    checkpoints,
  };
}

/**
 * Undo the newest action: the world just before it, and the history
 * without it. `null` if there is nothing to undo.
 */
export function undoLast(history: UndoHistory): { world: CampWorld; history: UndoHistory } | null {
  const k = history.entries.length - 1;
  const last = history.entries[k];
  if (last === undefined) {
    return null;
  }
  // The nearest whole copy at or before action k.
  const from = Math.floor(k / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
  let world = history.checkpoints.get(from);
  if (world === undefined) {
    throw new Error(`no copy of the world before action ${from}`);
  }
  // Play actions from..k-1 again, each at its own lab time...
  for (let i = from; i < k; i += 1) {
    const entry = history.entries[i];
    if (entry === undefined) {
      break;
    }
    world = applyCampStep(advanceWorld(world, entry.at), entry.step);
  }
  // ...and bring the world up to the moment just before action k.
  world = advanceWorld(world, last.at);
  const checkpoints = new Map(history.checkpoints);
  checkpoints.delete(k);
  return { world, history: { entries: history.entries.slice(0, k), checkpoints } };
}
