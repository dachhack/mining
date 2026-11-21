// UI lab 2 (issue #118): plans for the e2e tests, worked out with the same
// code the build runs (campWorld.ts). The engine is deterministic, so a plan
// made here plays out the same on the page.
import { BLOCKS } from '../../src/data';
import type { ItemStack } from '../../src/data';
import { topBlockAt } from '../../src/engine';
import {
  applyCampStep,
  campAt,
  campRadius,
  campTap,
  canAfford,
  coverLevelAt,
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
 * `null` if everything mineable is mined first.
 */
export function tapsUntil(
  start: CampWorld,
  cost: ItemStack[],
  near: Square,
): { taps: Square[]; world: CampWorld } | null {
  let world = start;
  const taps: Square[] = [];
  while (!canAfford(world.lab.counts, cost)) {
    const options = mineable(world);
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
function exhaust(start: CampWorld, steps: CampStep[]): CampWorld {
  let world = start;
  for (;;) {
    const options = mineable(world);
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
  /** The camp to upgrade from 2 to 3. */
  campId: number;
  camp: Square;
  /** The ore block that needs level 3, and can be mined once the camp is level 3. */
  ore: Square;
}

/** True if (x, y) is within `across` squares across and `down` squares down of `centre`. */
function near(square: Square, centre: Square, across: number, down: number): boolean {
  return Math.abs(square.x - centre.x) <= across && Math.abs(square.y - centre.y) <= down;
}

/**
 * Play `seed` the simple way (mine everything, upgrade every camp to level 2
 * when it can, place the next camp where it lights the most new squares)
 * until a level-2 camp and an ore block it cannot mine yet are both near
 * the first camp (so both are on screen when the page opens), and the
 * upgrade to level 3 is affordable. `null` if that never happens.
 */
export function planUpgrade(seed: number, maxCamps = 12): UpgradePlan | null {
  const steps: CampStep[] = [];
  let world = newCampWorld(seed);
  const first = world.camps[0];
  if (first === undefined) {
    return null;
  }
  const size = world.lab.state.size;
  for (let round = 0; round < maxCamps; round += 1) {
    world = exhaust(world, steps);
    for (const camp of world.camps) {
      if (camp.level === 1 && upgradeRefusal(world, camp.id) === null) {
        const step: CampStep = { kind: 'upgrade', id: camp.id };
        world = applyCampStep(world, step);
        steps.push(step);
        world = exhaust(world, steps);
      }
    }
    // Is there an ore block next to the first camp's screen that a level-2 camp covers?
    for (const camp of world.camps) {
      if (camp.level !== 2 || !near(camp, first, 6, 9) || upgradeRefusal(world, camp.id) !== null) {
        continue;
      }
      for (let y = 0; y < size.y; y += 1) {
        for (let x = 0; x < size.x; x += 1) {
          const ore = { x, y };
          if (
            topBlockAt(world.lab.state, x, y) !== BLOCKS.ironOre.code &&
            topBlockAt(world.lab.state, x, y) !== BLOCKS.copperOre.code
          ) {
            continue;
          }
          const dx = x - camp.x;
          const dy = y - camp.y;
          const r = campRadius(2);
          if (
            !near(ore, first, 6, 9) ||
            campAt(world, x, y) !== null ||
            dx * dx + dy * dy > r * r + r ||
            coverLevelAt(world, x, y) !== 2 ||
            campTap(world, x, y).kind !== 'tooHard'
          ) {
            continue;
          }
          const upgraded = applyCampStep(world, { kind: 'upgrade', id: camp.id });
          if (campTap(upgraded, x, y).kind === 'mined') {
            return { seed, steps, world, campId: camp.id, camp: { x: camp.x, y: camp.y }, ore };
          }
        }
      }
    }
    // Place the next camp where it lights the most new squares.
    let best: { x: number; y: number; fresh: number } | null = null;
    for (let y = 0; y < size.y; y += 1) {
      for (let x = 0; x < size.x; x += 1) {
        if (placeRefusal(world, x, y) === null) {
          const fresh = newlyCovered(world, x, y).length;
          if (best === null || fresh > best.fresh) {
            best = { x, y, fresh };
          }
        }
      }
    }
    if (best === null || best.fresh === 0) {
      return null;
    }
    const step: CampStep = { kind: 'place', x: best.x, y: best.y };
    world = applyCampStep(world, step);
    steps.push(step);
  }
  return null;
}
