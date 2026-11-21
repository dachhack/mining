// UI lab 2 (issue #118): plans for the e2e tests, worked out with the same
// code the build runs (campWorld.ts). The engine is deterministic, so a plan
// made here plays out the same on the page.
import { BLOCKS } from '../../src/data';
import type { ItemStack } from '../../src/data';
import { topBlockAt } from '../../src/engine';
import {
  applyCampStep,
  upgradeCostFrom,
  campTap,
  canAfford,
  footprintOf,
  newCampWorld,
  newlyCovered,
  placeRefusal,
  upgradeRefusal,
} from '../../src/app/lab/campWorld';
import type { CampStep, CampWorld } from '../../src/app/lab/campWorld';

/** A square. */
export interface Square {
  x: number;
  y: number;
}

/** Every lit square that can be mined right now, row by row. */
function mineable(world: CampWorld): Square[] {
  const found: Square[] = [];
  const size = world.lab.state.size;
  for (let y = 0; y < size.y; y += 1) {
    for (let x = 0; x < size.x; x += 1) {
      if (campTap(world, x, y).kind === 'mined') {
        found.push({ x, y });
      }
    }
  }
  return found;
}

/**
 * Taps that mine, one after another, until `cost` is affordable. Squares
 * nearest `near` go first, so every tap stays near the middle of the screen.
 * Squares in `avoid` are never tapped (to keep a patch level for a camp).
 * `null` if everything mineable is mined first.
 */
export function tapsUntil(
  start: CampWorld,
  cost: ItemStack[],
  near: Square,
  avoid: Square[] = [],
): { taps: Square[]; world: CampWorld } | null {
  let world = start;
  const taps: Square[] = [];
  while (!canAfford(world.lab.counts, cost)) {
    const options = mineable(world).filter((s) => !avoid.some((a) => a.x === s.x && a.y === s.y));
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

/** Mine everything that can be mined, recording each tap as a step. */
function exhaust(start: CampWorld, steps: CampStep[], avoid: Square[] = []): CampWorld {
  let world = start;
  for (;;) {
    const options = mineable(world).filter((s) => !avoid.some((a) => a.x === s.x && a.y === s.y));
    if (options.length === 0) {
      return world;
    }
    for (const square of options) {
      const tap = campTap(world, square.x, square.y);
      if (tap.kind === 'mined') {
        world = tap.world;
        steps.push({ kind: 'tap', x: square.x, y: square.y });
      }
    }
  }
}

/** A played world in which a level-2 camp covers an ore block it cannot mine, and level 3 is affordable. */
export interface UpgradePlan {
  seed: number;
  steps: CampStep[];
  world: CampWorld;
  /** The camp to upgrade from 2 to 3: the first camp. */
  campId: number;
  camp: Square;
  /** The ore block that needs level 3, and can be mined once the camp is level 3. */
  ore: Square;
}

/**
 * Play `seed` the simple way, as a player who keeps the next camp's ground
 * level would:
 * 1. Leapfrog level-1 camps: each round chooses the next camp's 3 x 3 patch
 *    first (where it lights the most new squares), keeps it undug, mines
 *    everything else, then places the camp there. Stop once the counts pay
 *    for both upgrades, level 2 and level 3.
 * 2. Upgrade the first camp to level 2 and mine everything again.
 * 3. Find an ore block near the first camp (on screen when the page opens)
 *    that level 2 cannot mine but level 3 can.
 * `null` if any step fails.
 */
export function planUpgrade(seed: number, maxCamps = 25): UpgradePlan | null {
  const steps: CampStep[] = [];
  let world = newCampWorld(seed);
  const first = world.camps[0];
  if (first === undefined) {
    return null;
  }
  const size = world.lab.state.size;
  // Enough for four level-2 upgrades and one level-3 upgrade.
  const level2Cost = upgradeCostFrom(1) ?? [];
  const bothUpgrades = together(
    together(together(level2Cost, level2Cost), together(level2Cost, level2Cost)),
    upgradeCostFrom(2) ?? [],
  );
  const pays = (w: CampWorld): boolean => canAfford(w.lab.counts, bothUpgrades);
  for (let round = 0; round < maxCamps && !pays(world); round += 1) {
    let best: { x: number; y: number; fresh: number } | null = null;
    for (let y = 0; y < size.y; y += 1) {
      for (let x = 0; x < size.x; x += 1) {
        const refusal = placeRefusal(world, x, y);
        if (refusal === null || refusal === 'cost') {
          const fresh = newlyCovered(world, x, y).length;
          if (best === null || fresh > best.fresh) {
            best = { x, y, fresh };
          }
        }
      }
    }
    world = exhaust(world, steps, best === null ? [] : footprintOf(best.x, best.y));
    if (pays(world)) {
      break;
    }
    if (best === null || best.fresh === 0 || placeRefusal(world, best.x, best.y) !== null) {
      return null;
    }
    const step: CampStep = { kind: 'place', x: best.x, y: best.y };
    world = applyCampStep(world, step);
    steps.push(step);
  }
  if (!pays(world)) {
    return null;
  }
  // Upgrade camps to level 2, the first camp first, as long as one level-3
  // upgrade can still be paid for afterwards: overlapping level-2 rings dig deeper.
  const level2 = upgradeCostFrom(1) ?? [];
  const level3 = upgradeCostFrom(2) ?? [];
  for (const camp of world.camps) {
    if (camp.level === 1 && canAfford(world.lab.counts, together(level2, level3))) {
      const step: CampStep = { kind: 'upgrade', id: camp.id };
      world = applyCampStep(world, step);
      steps.push(step);
    }
  }
  world = exhaust(world, steps);
  // An ore block near the first camp that a level-2 camp over it cannot mine,
  // and can once that camp is level 3.
  for (const camp of world.camps) {
    if (camp.level !== 2 || !near(camp, first, 6, 9) || upgradeRefusal(world, camp.id) !== null) {
      continue;
    }
    const upgraded = applyCampStep(world, { kind: 'upgrade', id: camp.id });
    for (let y = 0; y < size.y; y += 1) {
      for (let x = 0; x < size.x; x += 1) {
        const top = topBlockAt(world.lab.state, x, y);
        if (
          (top === BLOCKS.ironOre.code || top === BLOCKS.copperOre.code) &&
          near({ x, y }, first, 6, 9) &&
          campTap(world, x, y).kind === 'tooHard' &&
          campTap(upgraded, x, y).kind === 'mined'
        ) {
          return {
            seed,
            steps,
            world,
            campId: camp.id,
            camp: { x: camp.x, y: camp.y },
            ore: { x, y },
          };
        }
      }
    }
  }
  return null;
}

/** `a` and `b` added together, item by item. */
function together(a: ItemStack[], b: ItemStack[]): ItemStack[] {
  const sum = new Map<string, number>();
  for (const s of [...a, ...b]) sum.set(s.item, (sum.get(s.item) ?? 0) + s.count);
  return [...sum].map(([item, count]) => ({ item, count }));
}

/** True if (x, y) is within `across` squares across and `down` squares down of `centre`. */
function near(square: Square, centre: Square, across: number, down: number): boolean {
  return Math.abs(square.x - centre.x) <= across && Math.abs(square.y - centre.y) <= down;
}
