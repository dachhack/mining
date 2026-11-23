// Shifts in the new game (plan A4, section 2). A shift is one turn:
//
// 1. The player's turn: FRONTIER_SHIFT.taps taps. Every action that does
//    something costs 1 tap: mining, cutting grass, felling a tree, picking an
//    apple, catching an animal, and placing, upgrading or demolishing a camp
//    (owner, questions 145 and 146). An action that does nothing costs nothing.
// 2. End shift. It can be pressed with taps left; they are lost. Then, in order:
//    - each animal takes its steps, and every few shifts a new one walks in;
//    - apples come back on trees picked bare long enough ago, and felled
//      trees grow back on their stumps (question 157);
//    - upkeep is paid in wood and food (question 147): food is an apple,
//      else 2 grass, else an animal (questions 155 and 158);
//    - each item of upkeep that cannot be paid costs the crew 1 health
//      (question 148: "Hunger only"); at 0 health the run is lost.
//
// Resting, at a camp (question 156: "Only at a camp"), restores the crew's
// health and takes the rest of the shift. Closing the mine ends the run. The numbers are in src/data/frontier.ts.

import { BLOCKS } from '../../data';
import type { ItemStack } from '../../data';
import { FRONTIER_FOODS, FRONTIER_SHIFT, FRONTIER_SURFACE } from '../../data/frontier';
import { nextFloat } from '../rng';
import { blockAt } from '../state';
import { campAt, demolishFrontierCamp, placeFrontierCamp, upgradeFrontierCamp } from './camps';
import { walkable } from './generation';
import { animalAt } from './surface';
import { buildSmelter, makeRecipe, makeRefusal, smelterRefusal } from './smelting';
import { frontierTap } from './tap';
import type { FrontierTap } from './tap';
import { APPLE_TREE, NO_FEATURE } from './state';
import type { Feature, FrontierAnimal, FrontierState } from './state';

/** Something the player can do. */
export type FrontierAction =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'place'; x: number; y: number }
  | { kind: 'upgrade'; id: number }
  | { kind: 'demolish'; id: number }
  | { kind: 'endShift' }
  // Rest at the camp named `id` (question 156: "Only at a camp").
  | { kind: 'rest'; id: number }
  // Build a smelter at camp `id`; make recipe `recipe` (smelting.ts).
  | { kind: 'buildSmelter'; id: number }
  | { kind: 'make'; recipe: string }
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
  /** Felled trees that grew back. */
  treesRegrown: number;
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
  // Apples come back on trees whose wait is over, and felled trees on their stumps.
  const grown = regrow({ ...state, animals });
  // Upkeep, item by item; what cannot be paid costs 1 health each.
  const inventory = new Map(state.inventory);
  const paid: ItemStack[] = [];
  const unpaid: ItemStack[] = [];
  for (const due of upkeepDue(state.shift, state.camps.length)) {
    // What can pay it: wood pays wood; food is paid by the first of FRONTIER_FOODS held.
    const candidates = due.item === 'food' ? FRONTIER_FOODS : [due];
    const pay = candidates.find((c) => (inventory.get(c.item) ?? 0) >= c.count);
    if (pay === undefined) {
      unpaid.push(due);
      continue;
    }
    const left = (inventory.get(pay.item) ?? 0) - pay.count;
    if (left > 0) inventory.set(pay.item, left);
    else inventory.delete(pay.item);
    paid.push({ item: pay.item, count: pay.count });
  }
  const healthLost = unpaid.length;
  const health = Math.max(0, state.health - healthLost);
  const next: FrontierState = {
    ...state,
    animals,
    nextAnimalId,
    rng,
    features: grown.features,
    apples: grown.apples,
    regrowIn: grown.regrowIn,
    stumps: grown.stumps,
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
      regrown: grown.regrown,
      treesRegrown: grown.treesRegrown,
      newAnimals,
    },
  };
}

/** What grows back at the end of a shift: the surface after it, and how many apple trees and trees came back. */
interface Regrowth {
  features: Feature[];
  apples: number[];
  regrowIn: number[];
  stumps: Feature[];
  regrown: number;
  treesRegrown: number;
}

/**
 * Each square's wait counts down. When it runs out:
 * - an apple tree picked bare has its apples back;
 * - a stump grows its tree back, full of apples if it is an apple tree. It
 *   never grows where the square was mined (the stump was dug out: owner,
 *   "Trees grow back as long as you don't mine the ground directly under
 *   them"). Where a camp or an animal stands, it waits a shift more, so a
 *   stump under a camp grows back once the camp is demolished.
 * `state.animals` are the animals after this shift's steps.
 */
function regrow(state: FrontierState): Regrowth {
  const width = state.cube.size.x;
  const growOn = new Set<number>(FRONTIER_SURFACE.plantsGrowOn.map((id) => BLOCKS[id].code));
  const features = [...state.features];
  const apples = [...state.apples];
  const stumps = [...state.stumps];
  let regrown = 0;
  let treesRegrown = 0;
  const regrowIn = state.regrowIn.map((left, i) => {
    if (left < 0) return left;
    if (left > 1) return left - 1;
    const stump = stumps[i] ?? NO_FEATURE;
    if (stump === NO_FEATURE) {
      apples[i] = FRONTIER_SURFACE.applesPerTree;
      regrown += 1;
      return -1;
    }
    const x = i % width;
    const y = Math.floor(i / width);
    const unmined = growOn.has(blockAt(state.cube, { x, y, z: 0 }));
    if (unmined && (animalAt(state, x, y) !== null || campAt(state.camps, x, y) !== null)) {
      return 1; // an animal or a camp stands on it: try again next shift
    }
    stumps[i] = NO_FEATURE;
    if (unmined && features[i] === NO_FEATURE) {
      features[i] = stump;
      apples[i] = stump === APPLE_TREE ? FRONTIER_SURFACE.applesPerTree : 0;
      treesRegrown += 1;
    }
    return -1;
  });
  return { features, apples, regrowIn, stumps, regrown, treesRegrown };
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
 * Do `action`. Taps, placing, upgrading and demolishing a camp, building a
 * smelter and making a recipe cost 1 tap each when they do something; End shift, rest and closing the mine cost none.
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
    // The crew rests at a camp: refused unless camp `id` stands.
    if (!state.camps.some((c) => c.id === action.id)) {
      return refused(state, 'rest');
    }
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
  if (action.kind === 'buildSmelter') {
    const why = smelterRefusal(state, action.id);
    return why === null ? spent(buildSmelter(state, action.id)) : refused(state, why);
  }
  if (action.kind === 'make') {
    const why = makeRefusal(state, action.recipe);
    return why === null ? spent(makeRecipe(state, action.recipe)) : refused(state, why);
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
