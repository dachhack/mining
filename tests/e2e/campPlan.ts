// UI lab 2 (issues #118 and #121): plans for the e2e tests, worked out with
// the same code the build runs (campWorld.ts). The engine and the lab's
// surface are deterministic, so a plan made here plays out the same on the
// page, as long as the lab clock stands still (the tests pause it).
import type { ItemStack } from '../../src/data';
import { campTap, canAfford, newCampWorld, upgradeCostFrom } from '../../src/app/lab/campWorld';
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
function useful(world: CampWorld, noDig: Square[]): Square[] {
  const found: Square[] = [];
  const size = world.lab.state.size;
  for (let y = 0; y < size.y; y += 1) {
    for (let x = 0; x < size.x; x += 1) {
      const kind = campTap(world, x, y).kind;
      const kept = noDig.some((s) => s.x === x && s.y === y);
      if (kind === 'harvested' || (kind === 'mined' && !kept)) {
        found.push({ x, y });
      }
    }
  }
  return found;
}

/**
 * Useful taps, one after another, until `cost` is affordable. Squares
 * nearest `near` go first, so every tap stays near the middle of the screen.
 * `null` if nothing useful is left first.
 */
export function tapsUntil(
  start: CampWorld,
  cost: ItemStack[],
  near: Square,
  noDig: Square[] = [],
): { taps: Square[]; world: CampWorld } | null {
  let world = start;
  const taps: Square[] = [];
  while (!canAfford(world.lab.counts, cost)) {
    const options = useful(world, noDig);
    options.sort(
      (a, b) =>
        Math.abs(a.x - near.x) +
        Math.abs(a.y - near.y) -
        (Math.abs(b.x - near.x) + Math.abs(b.y - near.y)),
    );
    const next = options[0];
    if (next === undefined) {
      return null;
    }
    world = campTap(world, next.x, next.y).world;
    taps.push(next);
  }
  return { taps, world };
}

/** A played world that can pay for level 2 (wood, clay, stone and an animal) from the first camp's ring. */
export interface Level2Plan {
  seed: number;
  /** The taps, as steps to replay before the page opens (no waits: the clock stays at 0). */
  steps: CampStep[];
  world: CampWorld;
  camp: Square & { id: number };
}

/**
 * Play `seed` with the first camp only: tap the squares nearest it until
 * the counts pay for level 2. The first animal starts inside the ring and
 * the clock does not run, so it is caught where it stands. `null` if the
 * ring cannot pay for it.
 */
export function planLevel2(seed: number): Level2Plan | null {
  const start = newCampWorld(seed);
  const camp = start.camps[0];
  if (camp === undefined) {
    return null;
  }
  const plan = tapsUntil(start, upgradeCostFrom(1) ?? [], camp);
  if (plan === null) {
    return null;
  }
  return {
    seed,
    steps: plan.taps.map((s) => ({ kind: 'tap', x: s.x, y: s.y })),
    world: plan.world,
    camp: { id: camp.id, x: camp.x, y: camp.y },
  };
}
