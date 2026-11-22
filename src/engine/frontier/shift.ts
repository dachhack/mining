// Shifts in the new game (plan A4, section 2). A shift is one turn:
//
// 1. The player's turn: FRONTIER_SHIFT.taps taps. Every action that does
//    something costs 1 tap: mining, cutting grass, felling a tree, picking an
//    apple, catching an animal, and placing, upgrading or demolishing a camp
//    (owner, questions 145 and 146). An action that does nothing costs nothing.
// 2. End shift. It can be pressed with taps left; they are lost. Then, in order:
//    - each animal takes its steps, and every few shifts a new one walks in;
//    - apples come back on trees picked bare long enough ago;
//    - upkeep is paid in wood and food (question 147);
//    - each item of upkeep that cannot be paid costs the crew 1 health
//      (question 148: "Hunger only"); at 0 health the run is lost.
//
// Resting restores the crew's health and takes the rest of the shift.
// Closing the mine ends the run. The numbers are in src/data/frontier.ts.

import type { ItemStack } from '../../data';
import { FRONTIER_SHIFT, FRONTIER_SURFACE } from '../../data/frontier';
import { nextFloat } from '../rng';
import { demolishFrontierCamp, placeFrontierCamp, upgradeFrontierCamp } from './camps';
import { walkable } from './generation';
import { frontierTap } from './tap';
import type { FrontierTap } from './tap';
import type { FrontierAnimal, FrontierState } from './state';

/** Something the player can do. */
export type FrontierAction =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'place'; x: number; y: number }
  | { kind: 'upgrade'; id: number }
  | { kind: 'demolish'; id: number }
  | { kind: 'endShift' }
  | { kind: 'rest' }
  | { kind: 'close' };

/** What End shift did: the upkeep paid and unpaid, and the health it cost. */
export interface ShiftReport {
  /** The shift that ended. */
  shift: number;
  /** Upkeep paid, item by item. */
  paid: ItemStack[];
  /** Upkeep that could not be paid: each one cost 1 health. */
  unpaid: ItemStack[];
  /** Health lost to hunger. */
  healthLost: number;
  /** Apple trees whose apples came back. */
  regrown: number;
  /** Animals that walked in. */
  newAnimals: number;
}

/**
 * What an action did. `done` is false when it did nothing: then `state` is
 * the very same state, and `refusal` says why ('over' when the run has
 * ended, 'noTaps' when the shift has no taps left, or the tap's own kind or
 * the camp rule's refusal).
 */
export interface FrontierOutcome {
  state: FrontierState;
  done: boolean;
  refusal: string | null;
  /** For a tap: the engine's whole answer. */
  tap: FrontierTap | null;
  /** For End shift and rest: what the end of the shift did. */
  report: ShiftReport | null;
}

/** The upkeep due at the end of shift `shift` with `camps` camps, item by item (one entry per item). */
export function upkeepDue(shift: number, camps: number): ItemStack[] {
  const due: ItemStack[] = [];
  for (let i = 0; i < FRONTIER_SHIFT.woodEveryShift; i += 1) {
    due.push({ item: 'wood', count: 1 });
  }
  if (shift % FRONTIER_SHIFT.foodEveryShifts === 0) {
    due.push({ item: 'food', count: 1 });
  }
  if (shift % FRONTIER_SHIFT.campWoodEveryShifts === 0) {
    for (let i = 1; i < camps; i += 1) {
      due.push({ item: 'wood', count: 1 });
    }
  }
  return due;
}

/** Food, in the order it is eaten: apples first, being the commoner, then animals. */
const FOODS = ['apple', 'animal'];

/** The animals after each takes its steps, and the generator after the draws. */
function stepAnimals(state: FrontierState): { animals: FrontierAnimal[]; rng: { s: number } } {
  const rng = { s: state.rng.s };
  const animals = state.animals.map((a) => ({ ...a }));
  for (let step = 0; step < FRONTIER_SHIFT.animalStepsPerShift; step += 1) {
    for (const animal of animals) {
      const others = animals.filter((a) => a.id !== animal.id);
      const choices = [
        { x: animal.x, y: animal.y - 1 },
        { x: animal.x + 1, y: animal.y },
        { x: animal.x, y: animal.y + 1 },
        { x: animal.x - 1, y: animal.y },
      ].filter((s) => walkable(state.cube, state.features, others, s.x, s.y));
      const choice = choices[Math.floor(nextFloat(rng) * choices.length)];
      if (choice !== undefined) {
        animal.x = choice.x;
        animal.y = choice.y;
      }
    }
  }
  return { animals, rng };
}

/**
 * End the shift: the world moves on (see the top of this file), the next
 * shift starts with a full set of taps, and the run is lost if the crew's
 * health reaches 0. Refused once the run has ended.
 */
export function endFrontierShift(state: FrontierState): FrontierOutcome {
  if (state.status !== 'active') {
    return refused(state, 'over');
  }
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  // The animals step, and a new one may walk in at the edge.
  const stepped = stepAnimals(state);
  let animals = stepped.animals;
  const rng = stepped.rng;
  let nextAnimalId = state.nextAnimalId;
  let newAnimals = 0;
  if (
    state.shift % FRONTIER_SHIFT.animalEveryShifts === 0 &&
    animals.length < FRONTIER_SURFACE.animals
  ) {
    const edge: { x: number; y: number }[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        if (onEdge && walkable(state.cube, state.features, animals, x, y)) edge.push({ x, y });
      }
    }
    const at = edge[Math.floor(nextFloat(rng) * edge.length)];
    if (at !== undefined) {
      animals = [...animals, { id: nextAnimalId, x: at.x, y: at.y }];
      nextAnimalId += 1;
      newAnimals = 1;
    }
  }
  // Apples come back on trees whose wait is over.
  const apples = [...state.apples];
  let regrown = 0;
  const regrowIn = state.regrowIn.map((left, i) => {
    if (left < 0) return left;
    if (left <= 1) {
      apples[i] = FRONTIER_SURFACE.applesPerTree;
      regrown += 1;
      return -1;
    }
    return left - 1;
  });
  // Upkeep, item by item; what cannot be paid costs 1 health each.
  const inventory = new Map(state.inventory);
  const paid: ItemStack[] = [];
  const unpaid: ItemStack[] = [];
  for (const due of upkeepDue(state.shift, state.camps.length)) {
    const candidates = due.item === 'food' ? FOODS : [due.item];
    const item = candidates.find((c) => (inventory.get(c) ?? 0) > 0);
    if (item === undefined) {
      unpaid.push(due);
      continue;
    }
    const left = (inventory.get(item) ?? 0) - 1;
    if (left > 0) inventory.set(item, left);
    else inventory.delete(item);
    paid.push({ item, count: 1 });
  }
  const healthLost = unpaid.length;
  const health = Math.max(0, state.health - healthLost);
  const next: FrontierState = {
    ...state,
    animals,
    nextAnimalId,
    rng,
    apples,
    regrowIn,
    inventory,
    health,
    shift: state.shift + 1,
    tapsLeft: FRONTIER_SHIFT.taps,
    status: health <= 0 ? 'lost' : 'active',
  };
  return {
    state: next,
    done: true,
    refusal: null,
    tap: null,
    report: {
      shift: state.shift,
      paid: merge(paid),
      unpaid: merge(unpaid),
      healthLost,
      regrown,
      newAnimals,
    },
  };
}

/** Stacks of the same item added together, in first-seen order: [1 wood, 1 wood] -> [2 wood]. */
function merge(stacks: ItemStack[]): ItemStack[] {
  const out: ItemStack[] = [];
  for (const s of stacks) {
    const found = out.find((o) => o.item === s.item);
    if (found !== undefined) found.count += s.count;
    else out.push({ ...s });
  }
  return out;
}

/** An action that did nothing, and why. */
function refused(
  state: FrontierState,
  why: string,
  tap: FrontierTap | null = null,
): FrontierOutcome {
  return { state, done: false, refusal: why, tap, report: null };
}

/** An action that did something: it costs 1 tap. */
function spent(next: FrontierState, tap: FrontierTap | null = null): FrontierOutcome {
  return {
    state: { ...next, tapsLeft: next.tapsLeft - 1 },
    done: true,
    refusal: null,
    tap,
    report: null,
  };
}

/**
 * Do `action`. Taps, placing, upgrading and demolishing cost 1 tap each
 * when they do something; End shift, rest and closing the mine cost none.
 * Nothing can be done once the run has ended.
 */
export function frontierAct(state: FrontierState, action: FrontierAction): FrontierOutcome {
  if (state.status !== 'active') {
    return refused(state, 'over');
  }
  if (action.kind === 'endShift') {
    return endFrontierShift(state);
  }
  if (action.kind === 'rest') {
    // Rest restores the crew, then the shift ends (the rest of it is spent resting).
    return endFrontierShift({ ...state, health: FRONTIER_SHIFT.startHealth });
  }
  if (action.kind === 'close') {
    return {
      state: { ...state, status: 'closed' },
      done: true,
      refusal: null,
      tap: null,
      report: null,
    };
  }
  if (state.tapsLeft <= 0) {
    return refused(state, 'noTaps');
  }
  if (action.kind === 'tap') {
    const tap = frontierTap(state, action.x, action.y);
    if (tap.kind !== 'mined' && tap.kind !== 'harvested') {
      return refused(state, tap.kind, tap);
    }
    return spent(tap.state, tap);
  }
  const next =
    action.kind === 'place'
      ? placeFrontierCamp(state, action.x, action.y)
      : action.kind === 'upgrade'
        ? upgradeFrontierCamp(state, action.id)
        : demolishFrontierCamp(state, action.id);
  return next === state ? refused(state, action.kind) : spent(next);
}
