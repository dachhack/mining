// Work camps and their workers (owner, after the 0.20.0 build: the
// lumberjack camp, the farm camp and the hermit camp; FRONTIER_WORK_CAMPS).
//
// - A work camp is a 2 x 2 building (buildings.ts). A lumberjack camp must
//   touch a saw house.
// - Workers are hired from the camp's panel, for FRONTIER_WORK_CAMPS[kind].hire
//   coins paid once and 1 tap (shift.ts charges it), up to `most`. At a
//   lumberjack camp, each lumberjack past `withoutHorses` needs a horse
//   there first; a horse is hired the same way, for its own coins.
// - A camp's reach is `reachEach` for each worker, round any square of its
//   2 x 2 (`inReach`).
// - Every night (`nightOfWorkers`, at End shift after the crops grow), each
//   camp with workers works, in the order built:
//   - upkeep first, on the nights the crew eats (FRONTIER_SHIFT.foodEveryShifts):
//     `food` for each worker and horse (paid as the crew's food is, from
//     FRONTIER_FOODS), and `syrup` for each worker and horse. If the store
//     cannot pay all of it, nothing is paid and the camp does no work that
//     night (owner: "They skip that night");
//   - a lumberjack camp fells one plain tree in reach for each lumberjack,
//     nearest the camp first (ties row by row), for the wood a felled tree
//     gives (buildings.ts, `woodFromTree`); it leaves a stump, as felling does;
//   - a farm camp harvests every ripe crop in reach (crops.ts), with the
//     seed half the time, as a tap would;
//   - a hermit camp takes every apple, every maple's sap and every mushroom
//     in reach (owner: "everything in reach").
//
// The numbers are in src/data/frontier.ts.

import type { ItemStack } from '../../data';
import {
  FRONTIER_FOODS,
  FRONTIER_SEED_BACK,
  FRONTIER_SHIFT,
  FRONTIER_WORK_CAMPS,
} from '../../data/frontier';
import { nextFloat } from '../rng';
import type { RngState } from '../rng';
import { inCircle } from './camps';
import { woodFromTree } from './buildings';
import { cropAt, isRipe } from './crops';
import { APPLE_TREE, MAPLE_TREE, NO_FEATURE, TREE, buildingFootprint, isWorkCamp } from './state';
import type { FrontierBuilding, FrontierState } from './state';

/** A work camp's kind. */
export type WorkCampKind = 'lumberCamp' | 'farmCamp' | 'hermitCamp';

/** The work camp whose 2 x 2 covers (x, y), or `null`. */
export function workCampAt(state: FrontierState, x: number, y: number): FrontierBuilding | null {
  return (
    state.buildings.find(
      (b) =>
        isWorkCamp(b.kind) &&
        buildingFootprint(b.kind, b.x, b.y).some((s) => s.x === x && s.y === y),
    ) ?? null
  );
}

/** How far a work camp reaches: FRONTIER_WORK_CAMPS[kind].reachEach for each worker. */
export function campReach(camp: FrontierBuilding): number {
  if (!isWorkCamp(camp.kind)) return 0;
  return camp.workers * FRONTIER_WORK_CAMPS[camp.kind].reachEach;
}

/** True if square (x, y) is in `camp`'s reach: within its reach of any square of its 2 x 2. */
export function inReach(camp: FrontierBuilding, x: number, y: number): boolean {
  const reach = campReach(camp);
  if (reach <= 0) return false;
  return buildingFootprint(camp.kind, camp.x, camp.y).some((s) => inCircle(s.x, s.y, reach, x, y));
}

/** What is hired at a work camp: a worker, or (at a lumberjack camp) a horse. */
export type Hire = 'worker' | 'horse';

/**
 * Why `who` cannot be hired at the work camp on (x, y) now, or `null` if they can:
 * - 'none': no work camp there;
 * - 'full': it has its most workers, or (a horse) as many horses as it can use;
 * - 'horse': the next lumberjack needs a horse first;
 * - 'noHorses': this camp has no horses to hire;
 * - 'cost': the store does not hold the coins.
 */
export type HireRefusal = 'none' | 'full' | 'horse' | 'noHorses' | 'cost';

export function hireRefusal(
  state: FrontierState,
  x: number,
  y: number,
  who: Hire,
): HireRefusal | null {
  const camp = workCampAt(state, x, y);
  if (camp === null || !isWorkCamp(camp.kind)) return 'none';
  const def = FRONTIER_WORK_CAMPS[camp.kind];
  let coins: number;
  if (who === 'worker') {
    if (camp.workers >= def.most) return 'full';
    // Past `withoutHorses`, each worker needs a horse of their own.
    if (camp.workers + 1 > def.withoutHorses + camp.horses) return 'horse';
    coins = def.hire;
  } else {
    if (def.horse === null) return 'noHorses';
    // A horse only for the next worker who needs one.
    if (camp.horses >= def.most - def.withoutHorses) return 'full';
    if (camp.workers < def.withoutHorses + camp.horses) return 'full';
    coins = def.horse.hire;
  }
  return (state.inventory.get('coin') ?? 0) >= coins ? null : 'cost';
}

/** Hire `who` at the work camp on (x, y). If `hireRefusal` says no, the very same state comes back. */
export function hire(state: FrontierState, x: number, y: number, who: Hire): FrontierState {
  const camp = workCampAt(state, x, y);
  if (camp === null || !isWorkCamp(camp.kind) || hireRefusal(state, x, y, who) !== null) {
    return state;
  }
  const def = FRONTIER_WORK_CAMPS[camp.kind];
  const coins = who === 'worker' ? def.hire : (def.horse?.hire ?? 0);
  const inventory = new Map(state.inventory);
  const left = (inventory.get('coin') ?? 0) - coins;
  if (left > 0) inventory.set('coin', left);
  else inventory.delete('coin');
  const buildings = state.buildings.map((b) =>
    b === camp
      ? who === 'worker'
        ? { ...b, workers: b.workers + 1 }
        : { ...b, horses: b.horses + 1 }
      : b,
  );
  return { ...state, buildings, inventory };
}

/** The upkeep a work camp is due on a night the crew eats: food and syrup, one stack each per worker and horse. */
export function campUpkeep(camp: FrontierBuilding): { food: number; syrup: number } {
  if (!isWorkCamp(camp.kind)) return { food: 0, syrup: 0 };
  const def = FRONTIER_WORK_CAMPS[camp.kind];
  const mouths = camp.workers + camp.horses;
  return { food: mouths * def.food, syrup: mouths * def.syrup };
}

/** What the workers did in a night. */
export interface WorkerNight {
  state: FrontierState;
  /** Wood the lumberjacks brought in, and the trees they felled. */
  wood: number;
  trees: number;
  /** Crops the farmers harvested. */
  crops: number;
  /** Apples, sap and mushrooms the gatherers took. */
  gathered: number;
  /** Camps whose upkeep could not be paid: their workers skipped the night. */
  idle: number;
}

/** `inventory` with `items` added. */
function add(inventory: Map<string, number>, items: ItemStack[]): void {
  for (const it of items) inventory.set(it.item, (inventory.get(it.item) ?? 0) + it.count);
}

/** Pay `food` food (from FRONTIER_FOODS, as the crew eats) and `syrup` syrup from `inventory`, or `false` and nothing paid. */
function payUpkeep(inventory: Map<string, number>, food: number, syrup: number): boolean {
  const trial = new Map(inventory);
  if ((trial.get('syrup') ?? 0) < syrup) return false;
  if (syrup > 0) trial.set('syrup', (trial.get('syrup') ?? 0) - syrup);
  for (let k = 0; k < food; k += 1) {
    const meal = FRONTIER_FOODS.find((f) => (trial.get(f.item) ?? 0) >= f.count);
    if (meal === undefined) return false;
    trial.set(meal.item, (trial.get(meal.item) ?? 0) - meal.count);
  }
  inventory.clear();
  for (const [item, count] of trial) if (count > 0) inventory.set(item, count);
  return true;
}

/** The night's work of every work camp on `state`, with `rng` for the seeds (which it advances): see the top of this file. */
export function nightOfWorkers(state: FrontierState, rng: RngState): WorkerNight {
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  const camps = state.buildings.filter((b) => isWorkCamp(b.kind) && b.workers > 0);
  if (camps.length === 0) return { state, wood: 0, trees: 0, crops: 0, gathered: 0, idle: 0 };
  const inventory = new Map(state.inventory);
  const features = [...state.features];
  const apples = [...state.apples];
  const regrowIn = [...state.regrowIn];
  const stumps = [...state.stumps];
  const mushrooms = [...state.mushrooms];
  const crops = [...state.crops];
  const cropIn = [...state.cropIn];
  let treesFelled = state.treesFelled;
  const eats = state.shift % FRONTIER_SHIFT.foodEveryShifts === 0;
  let wood = 0;
  let trees = 0;
  let cropCount = 0;
  let gathered = 0;
  let idle = 0;
  for (const camp of camps) {
    const due = campUpkeep(camp);
    if (eats && !payUpkeep(inventory, due.food, due.syrup)) {
      idle += 1;
      continue;
    }
    // The squares in reach, nearest the camp first, then row by row.
    const reach: { x: number; y: number; d: number }[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!inReach(camp, x, y)) continue;
        const d = Math.min(
          ...buildingFootprint(camp.kind, camp.x, camp.y).map(
            (s) => (s.x - x) ** 2 + (s.y - y) ** 2,
          ),
        );
        reach.push({ x, y, d });
      }
    }
    reach.sort((a, b) => a.d - b.d);
    if (camp.kind === 'lumberCamp') {
      let left = camp.workers;
      for (const sq of reach) {
        if (left === 0) break;
        const i = sq.x + width * sq.y;
        if (features[i] !== TREE) continue;
        const got = woodFromTree({ ...state, inventory }, sq.x, sq.y);
        features[i] = NO_FEATURE;
        stumps[i] = TREE;
        regrowIn[i] = FRONTIER_SHIFT.treeRegrowShifts;
        treesFelled += 1;
        add(inventory, [{ item: 'wood', count: got }]);
        wood += got;
        trees += 1;
        left -= 1;
      }
    } else if (camp.kind === 'farmCamp') {
      for (const sq of reach) {
        const i = sq.x + width * sq.y;
        const view = { ...state, crops, cropIn };
        const crop = cropAt(view, i);
        if (crop === null || !isRipe(view, i)) continue;
        add(inventory, [{ item: crop.crop, count: crop.yield }]);
        if (nextFloat(rng) < FRONTIER_SEED_BACK) add(inventory, [{ item: crop.seed, count: 1 }]);
        crops[i] = 0;
        cropIn[i] = -1;
        cropCount += 1;
      }
    } else {
      for (const sq of reach) {
        const i = sq.x + width * sq.y;
        if (mushrooms[i] === true) {
          mushrooms[i] = false;
          add(inventory, [{ item: 'mushroom', count: 1 }]);
          gathered += 1;
        }
        const f = features[i];
        const held = apples[i] ?? 0;
        if ((f === APPLE_TREE || f === MAPLE_TREE) && held > 0) {
          add(inventory, [{ item: f === APPLE_TREE ? 'apple' : 'sap', count: held }]);
          apples[i] = 0;
          // Picked bare, it fills again as after the last tap (surface.ts).
          regrowIn[i] = FRONTIER_SHIFT.appleRegrowShifts;
          gathered += held;
        }
      }
    }
  }
  return {
    state: {
      ...state,
      inventory,
      features,
      apples,
      regrowIn,
      stumps,
      mushrooms,
      crops,
      cropIn,
      treesFelled,
    },
    wood,
    trees,
    crops: cropCount,
    gathered,
    idle,
  };
}
