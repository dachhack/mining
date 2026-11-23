// UI lab 2 (issues #118 and #121): plans for the e2e tests, worked out with
// the same code the build runs (campWorld.ts). The engine is deterministic,
// and the world moves on only at End shift (plan A4), so a plan made here
// plays out the same on the page.
import type { ItemStack } from '../../src/data';
import {
  campTap,
  canAfford,
  endShift,
  newCampWorld,
  upgradeCostFrom,
} from '../../src/app/lab/campWorld';
import type { CampStep, CampWorld } from '../../src/app/lab/campWorld';

/** A square. */
export interface Square {
  x: number;
  y: number;
}

/**
 * Every lit square where a tap does something useful right now, row by row:
 * it mines a block, or it takes something from the surface (cuts grass,
 * picks an apple, fells a tree, catches an animal). Squares in `noDig` are
 * only harvested, never mined, so a patch kept for a camp stays level.
 */
function useful(world: CampWorld, noDig: Square[]): (Square & { gives: string[] })[] {
  const found: (Square & { gives: string[] })[] = [];
  const size = world.lab.state.size;
  for (let y = 0; y < size.y; y += 1) {
    for (let x = 0; x < size.x; x += 1) {
      const tap = campTap(world, x, y);
      const kept = noDig.some((s) => s.x === x && s.y === y);
      if (tap.kind === 'harvested' || (tap.kind === 'mined' && !kept)) {
        const gives =
          tap.kind === 'harvested'
            ? [tap.harvest?.gain.item ?? '']
            : (tap.tap?.result.yields ?? []).map((stack) => stack.item);
        found.push({ x, y, gives });
      }
    }
  }
  return found;
}

/**
 * Useful taps, one after another, until `cost` is affordable. Taps that
 * give an item the cost still lacks go first, then the squares nearest
 * `near`, so every tap stays near the middle of the screen.
 * When the shift runs out of taps, the shift is ended (plan A4) and the
 * plan carries on; upkeep is paid then, so the plan gathers enough for it
 * too. With `leaveTaps`, the plan ends with at least that many taps left in
 * the shift, for the action that spends what was gathered. `taps` are the
 * squares tapped; `steps` are every step in order, End shifts included.
 * `null` if nothing useful is left first.
 */
export function tapsUntil(
  start: CampWorld,
  cost: ItemStack[],
  near: Square,
  noDig: Square[] = [],
  leaveTaps = 0,
): { taps: Square[]; steps: CampStep[]; world: CampWorld } | null {
  let world = start;
  const taps: Square[] = [];
  const steps: CampStep[] = [];
  // Done when the cost is covered with `leaveTaps` taps still left in the
  // shift (for a camp to be placed or upgraded next).
  while (!(canAfford(world.lab.counts, cost) && world.turn.tapsLeft >= leaveTaps)) {
    if (world.turn.status !== 'active') {
      return null;
    }
    if (world.turn.tapsLeft === 0 || canAfford(world.lab.counts, cost)) {
      // Out of taps (or paid for, but short of the taps to spend it): end the
      // shift. Upkeep may take some of what was gathered; the loop gathers it back.
      world = endShift(world).world;
      steps.push({ kind: 'endShift' });
      continue;
    }
    // A tap that gives something the cost still lacks goes first; then the
    // nearest useful tap (digging down to what lies under the ground).
    const lacking = new Set(
      cost
        .filter((stack) => (world.lab.counts.get(stack.item) ?? 0) < stack.count)
        .map((stack) => stack.item),
    );
    const score = (o: Square & { gives: string[] }): number =>
      (o.gives.some((item) => lacking.has(item)) ? 0 : 1000) +
      Math.abs(o.x - near.x) +
      Math.abs(o.y - near.y);
    const options = useful(world, noDig);
    options.sort((a, b) => score(a) - score(b));
    const next = options[0];
    if (next === undefined) {
      return null;
    }
    world = campTap(world, next.x, next.y).world;
    taps.push(next);
    steps.push({ kind: 'tap', x: next.x, y: next.y });
  }
  return { taps, steps, world };
}

/**
 * `count` useful taps in a row, each on the useful square nearest `near`
 * (no End shift): `steps` are the taps, `world` is the world after them.
 * `null` if nothing useful is left first.
 */
export function usefulTaps(
  start: CampWorld,
  count: number,
  near: Square,
): { steps: CampStep[]; world: CampWorld } | null {
  let world = start;
  const steps: CampStep[] = [];
  const distance = (o: Square): number => Math.abs(o.x - near.x) + Math.abs(o.y - near.y);
  while (steps.length < count) {
    const next = useful(world, []).sort((a, b) => distance(a) - distance(b))[0];
    if (next === undefined) return null;
    world = campTap(world, next.x, next.y).world;
    steps.push({ kind: 'tap', x: next.x, y: next.y });
  }
  return { steps, world };
}

/** A played world that can pay for level 2 (upgradeCostFrom(1)) from the first camp's ring. */
export interface Level2Plan {
  seed: number;
  /** The taps and End shifts, as steps to replay before the page opens. */
  steps: CampStep[];
  world: CampWorld;
  camp: Square & { id: number };
}

/**
 * Play `seed` with the first camp only: tap the squares nearest it until
 * the counts pay for level 2, ending each shift when its taps run out. The
 * first animal starts inside the ring and is caught before the first shift
 * ends. `null` if the ring cannot pay for it.
 */
export function planLevel2(seed: number): Level2Plan | null {
  const start = newCampWorld(seed);
  const camp = start.camps[0];
  if (camp === undefined) {
    return null;
  }
  // Upkeep eats an apple, else an animal, every other shift (plan A4): two
  // apples more than the upgrade needs keep the animal for it.
  const cost = [...(upgradeCostFrom(1) ?? []), { item: 'apple', count: 2 }];
  const plan = tapsUntil(start, cost, camp, [], 1);
  if (plan === null) {
    return null;
  }
  return {
    seed,
    steps: plan.steps,
    world: plan.world,
    camp: { id: camp.id, x: camp.x, y: camp.y },
  };
}
