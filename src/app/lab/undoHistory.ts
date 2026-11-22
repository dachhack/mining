// UI lab 2: Undo (owner, after the PR #126 playtest: "Undo button"; and
// question 141: "Leave animals alone", "Leave apples alone too", "animal and
// apple harvest cannot be undone").
//
// Undo takes back the player's own changes, one action at a time, back to
// the start of the world. No DOM code here, so the unit tests run it in
// plain Node.
//
// - Undoable actions: digging a block, cutting grass, felling a tree (an
//   empty apple tree too), placing a camp, upgrading one, demolishing one.
// - Not undoable, and never in the history: catching an animal and picking
//   an apple. Undo steps past them; they stay done.
// - Never touched by undo: the animals, the apples on the trees, the
//   regrowth timers' running, and the lab clock. Time never goes back.
//
// For each action the history keeps only what that action changed: the
// cells of the cube, the depths, the counts, the camps, the squares it lit
// for the first time, and the plants it removed (decision note 0049). Undo
// puts those back. Undo goes newest first, so every later undoable action
// has been undone already; the harvests in between only ever add apples and
// animals to the counts, which undo leaves alone. So the player's state
// comes back exactly, harvests apart.

import { NO_FEATURE, TREE, APPLE_TREE } from './surface';
import type { Feature } from './surface';
import type { Camp, CampStep, CampWorld } from './campWorld';
import type { GameState } from '../../engine';

/** What one undoable action changed, so it can be put back. */
export interface PlayerChange {
  step: CampStep;
  /** Cells of the cube's arrays the action changed: which array, which cell, and its old value. */
  cells: { key: string; index: number; before: number }[];
  /** The cube's other fields (not arrays) the action changed, with their old values. */
  fields: { key: string; before: unknown }[];
  /** Squares whose depth changed, and their old depth. */
  depths: { index: number; before: number }[];
  /** What the action added to each count (negative for what it paid). */
  counts: { item: string; delta: number }[];
  /** How many blocks the action mined (0 or 1). */
  mined: number;
  /** The camps, and the next camp's id, before the action. */
  camps: Camp[];
  nextCampId: number;
  /** Squares the action lit for the first time (they go back to fog). */
  newlySeen: number[];
  /** Plants the action removed, as they were: grass, a tree, an apple tree with its apples and timer. */
  plants: { index: number; feature: Feature; apples: number; regrowAt: number }[];
}

export interface UndoHistory {
  /** The undoable actions, oldest first. */
  changes: PlayerChange[];
}

/** No actions yet. */
export function emptyHistory(): UndoHistory {
  return { changes: [] };
}

/** How many actions can be undone. */
export function undoCount(history: UndoHistory): number {
  return history.changes.length;
}

/**
 * The cube's fields, by name. A GameState is an object with named fields; this
 * lets the code below walk all of them, like `vars(state)` in Python.
 */
function fieldsOf(state: GameState): Record<string, unknown> {
  return state as unknown as Record<string, unknown>;
}

/** What `step` changed, going from `before` to `after` (both at the same lab time). */
export function changeOf(before: CampWorld, after: CampWorld, step: CampStep): PlayerChange {
  // The cube: every array cell that differs, and any other field that differs.
  const cells: PlayerChange['cells'] = [];
  const fields: PlayerChange['fields'] = [];
  const old = fieldsOf(before.lab.state);
  const now = fieldsOf(after.lab.state);
  for (const key of Object.keys(old)) {
    const a = old[key];
    const b = now[key];
    if (a === b) {
      continue; // the same object: unchanged
    }
    if (a instanceof Uint8Array && b instanceof Uint8Array) {
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
          cells.push({ key, index: i, before: a[i] ?? 0 });
        }
      }
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      fields.push({ key, before: a });
    }
  }
  const depths: PlayerChange['depths'] = [];
  before.lab.depths.depths.forEach((d, i) => {
    if (after.lab.depths.depths[i] !== d) depths.push({ index: i, before: d });
  });
  const items = new Set([...before.lab.counts.keys(), ...after.lab.counts.keys()]);
  const counts: PlayerChange['counts'] = [];
  for (const item of items) {
    const delta = (after.lab.counts.get(item) ?? 0) - (before.lab.counts.get(item) ?? 0);
    if (delta !== 0) counts.push({ item, delta });
  }
  const newlySeen: number[] = [];
  after.seen.forEach((seen, i) => {
    if (seen && before.seen[i] !== true) newlySeen.push(i);
  });
  const plants: PlayerChange['plants'] = [];
  before.surface.features.forEach((feature, i) => {
    if (feature !== NO_FEATURE && after.surface.features[i] !== feature) {
      plants.push({
        index: i,
        feature,
        apples: before.surface.apples[i] ?? 0,
        regrowAt: before.surface.regrowAt[i] ?? -1,
      });
    }
  });
  return {
    step,
    cells,
    fields,
    depths,
    counts,
    mined: after.lab.mined - before.lab.mined,
    camps: before.camps,
    nextCampId: before.nextCampId,
    newlySeen,
    plants,
  };
}

/** `history` with one more action, which turned `before` into `after`. `history` itself is not changed. */
export function recordAction(
  history: UndoHistory,
  before: CampWorld,
  after: CampWorld,
  step: CampStep,
): UndoHistory {
  return { changes: [...history.changes, changeOf(before, after, step)] };
}

/**
 * Put `change` back on `world`: the world with the player's change taken
 * back, or why it cannot be (a short hint for the player).
 */
export function undoChange(world: CampWorld, change: PlayerChange): CampWorld | string {
  const width = world.lab.state.size.x;
  // A tree cannot come back where an animal now stands.
  for (const plant of change.plants) {
    const tree = plant.feature === TREE || plant.feature === APPLE_TREE;
    const x = plant.index % width;
    const y = Math.floor(plant.index / width);
    if (tree && world.surface.animals.some((a) => a.x === x && a.y === y)) {
      return 'An animal is standing where the tree was. Undo again once it moves.';
    }
  }
  // Counts: take back what the action gave, give back what it paid.
  const counts = new Map(world.lab.counts);
  for (const { item, delta } of change.counts) {
    const left = (counts.get(item) ?? 0) - delta;
    if (left < 0) {
      return 'That was spent since, so it cannot be undone.';
    }
    if (left === 0) counts.delete(item);
    else counts.set(item, left);
  }
  // The cube: copy each changed array, then put the old cells back.
  const state = { ...fieldsOf(world.lab.state) };
  for (const { key, index, before } of change.cells) {
    const current = state[key];
    if (current instanceof Uint8Array) {
      // Copy an array once, the first time one of its cells is put back.
      const copy = current === fieldsOf(world.lab.state)[key] ? current.slice() : current;
      copy[index] = before;
      state[key] = copy;
    }
  }
  for (const { key, before } of change.fields) {
    state[key] = before;
  }
  const depths = [...world.lab.depths.depths];
  for (const { index, before } of change.depths) depths[index] = before;
  const seen = [...world.seen];
  for (const i of change.newlySeen) seen[i] = false;
  // The plants: back as they were. A regrowth timer that has come due since
  // fires at the next tick: the clock was never turned back.
  const features = [...world.surface.features];
  const apples = [...world.surface.apples];
  const regrowAt = [...world.surface.regrowAt];
  for (const plant of change.plants) {
    features[plant.index] = plant.feature;
    apples[plant.index] = plant.apples;
    regrowAt[plant.index] = plant.regrowAt;
  }
  return {
    lab: {
      ...world.lab,
      state: state as unknown as GameState,
      depths: { ...world.lab.depths, depths },
      counts,
      mined: world.lab.mined - change.mined,
    },
    camps: change.camps,
    seen,
    nextCampId: change.nextCampId,
    // Only the plants: the animals, the apples' regrowing and the clock are left alone.
    surface: { ...world.surface, features, apples, regrowAt },
  };
}

/**
 * Undo the newest undoable action on `world`. `null` if there is nothing
 * to undo; a hint if it cannot be undone now (the history stays as it is).
 */
export function undoLast(
  history: UndoHistory,
  world: CampWorld,
): { world: CampWorld; history: UndoHistory; undone: PlayerChange } | { refused: string } | null {
  const last = history.changes[history.changes.length - 1];
  if (last === undefined) {
    return null;
  }
  const result = undoChange(world, last);
  if (typeof result === 'string') {
    return { refused: result };
  }
  return { world: result, history: { changes: history.changes.slice(0, -1) }, undone: last };
}
