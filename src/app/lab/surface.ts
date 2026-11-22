// UI lab 2 (issue #121): the surface ("zero level") and clay.
//
// - Squares at ground level can carry a surface feature: grass, a tree or an
//   apple tree. A tap harvests it; only then can the block under it be mined.
// - A few animals roam on unmined ground. A tap catches one.
// - Clay is a lab-only block: a set of cells of the cube that count as clay
//   in Lab 2. The game's blocks are unchanged (src/data/blocks.ts has no clay).
//
// Everything here is pure, like campWorld.ts: no DOM, no timers, no
// Math.random. Time is a number of lab milliseconds passed in by the screen,
// and randomness comes from a small seeded generator whose state is kept in
// the world. So the same seed and the same lab times give the same animals,
// which the tests rely on.
//
// Every number is in LAB_SURFACE (src/data/labCamps.ts).

import { BLOCKS } from '../../data';
import { LAB_SURFACE } from '../../data/labCamps';
import { blockAt } from '../../engine';
import type { GameState } from '../../engine';

/** What stands on a square at ground level. */
export const NO_FEATURE = 0;
export const GRASS = 1;
export const TREE = 2;
export const APPLE_TREE = 3;
export type Feature = typeof NO_FEATURE | typeof GRASS | typeof TREE | typeof APPLE_TREE;

export interface Animal {
  /** A number that names the animal; new animals get the next one. */
  id: number;
  x: number;
  y: number;
  /** The lab time (milliseconds) of its next step. */
  nextStepAt: number;
}

export interface Surface {
  /** The feature on each square, row by row (index x + width * y). */
  features: Feature[];
  /** Apples left on each square's apple tree (0 for other squares). */
  apples: number[];
  /** For an emptied apple tree, the lab time its apples come back; -1 for every other square. */
  regrowAt: number[];
  /** The cells of the cube that are clay, as cell indexes (see `cellIndex`). */
  clay: ReadonlySet<number>;
  animals: Animal[];
  /** The id the next animal gets. */
  nextAnimalId: number;
  /** The lab time a new animal next walks in, if there are fewer than LAB_SURFACE.animals. */
  nextSpawnAt: number;
  /** The seeded random generator's state. */
  rng: number;
  /** The lab time, in milliseconds, that this surface has been brought up to. */
  time: number;
}

// ----- A seeded random generator -----

/**
 * One step of "mulberry32", a well-known tiny generator: from a state, a
 * number from 0 (included) to 1 (not included) and the next state. The
 * state is a plain number kept in the world, so the world stays a value.
 */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/**
 * A random source for one function: `draw()` gives the next number, and
 * `state()` the generator's state afterwards, to store in the new world.
 */
function randomSource(start: number): { draw: () => number; state: () => number } {
  let state = start;
  return {
    draw: () => {
      const step = nextRandom(state);
      state = step.state;
      return step.value;
    },
    state: () => state,
  };
}

/** A whole number from `low` to `high`, both included. */
function between(draw: () => number, low: number, high: number): number {
  return low + Math.floor(draw() * (high - low + 1));
}

// ----- Cells and squares -----

/** The index of cell (x, y, z) of the cube in the clay set. */
export function cellIndex(state: GameState, x: number, y: number, z: number): number {
  return x + state.size.x * (y + state.size.y * z);
}

/** True if cell (x, y, z) is clay. */
export function isClay(
  surface: Surface,
  state: GameState,
  x: number,
  y: number,
  z: number,
): boolean {
  return surface.clay.has(cellIndex(state, x, y, z));
}

/** The animal on square (x, y), or `null`. */
export function animalAt(surface: Surface, x: number, y: number): Animal | null {
  return surface.animals.find((a) => a.x === x && a.y === y) ?? null;
}

// ----- Making a surface -----

/**
 * The surface of a new world on `seed`: trees in clumps, a few apple trees,
 * grass on most of the rest, clay in the layers just under the ground, and
 * the animals. Squares in `clear` (the first camp's 3 x 3) get no feature
 * and no animal. If `home` (the first camp's ring) is given, the first
 * animal starts on an open square of it, so every world has an animal to
 * catch near the start.
 */
export function generateSurface(
  state: GameState,
  seed: number,
  clear: { x: number; y: number }[] = [],
  home: { x: number; y: number }[] = [],
): Surface {
  const width = state.size.x;
  const height = state.size.y;
  const random = randomSource((seed ^ 0x51ab5eed) >>> 0);
  const draw = random.draw;
  const features: Feature[] = new Array<Feature>(width * height).fill(NO_FEATURE);
  const apples = new Array<number>(width * height).fill(0);
  // Plants grow only on some top blocks (dirt): never on stone, coal or other rock.
  const growOn = new Set<number>(LAB_SURFACE.plantsGrowOn.map((id) => BLOCKS[id].code));
  const fertile = (x: number, y: number): boolean => growOn.has(blockAt(state, { x, y, z: 0 }));

  // Trees, in clumps.
  for (let i = 0; i < LAB_SURFACE.treeClumps; i += 1) {
    const cx = between(draw, 0, width - 1);
    const cy = between(draw, 0, height - 1);
    const r = LAB_SURFACE.treeClumpRadius;
    for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y += 1) {
      for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x += 1) {
        const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r;
        // The chance is drawn on every square, fertile or not, so the
        // clumps fall where they did before this rule.
        if (inside && draw() < LAB_SURFACE.treeChance && fertile(x, y)) {
          features[x + width * y] = TREE;
        }
      }
    }
  }
  // Apple trees, one by one, on squares with nothing yet.
  for (let i = 0; i < LAB_SURFACE.appleTrees; i += 1) {
    const x = between(draw, 0, width - 1);
    const y = between(draw, 0, height - 1);
    if (features[x + width * y] === NO_FEATURE && fertile(x, y)) {
      features[x + width * y] = APPLE_TREE;
      apples[x + width * y] = LAB_SURFACE.applesPerTree;
    }
  }
  // Grass on most of what is left.
  for (let i = 0; i < features.length; i += 1) {
    if (
      features[i] === NO_FEATURE &&
      draw() < LAB_SURFACE.grassChance &&
      fertile(i % width, Math.floor(i / width))
    ) {
      features[i] = GRASS;
    }
  }
  for (const s of clear) {
    features[s.x + width * s.y] = NO_FEATURE;
    apples[s.x + width * s.y] = 0;
  }

  // Clay: blobs that turn dirt and stone into clay in the layers just under the surface.
  const clay = new Set<number>();
  const softBlocks = new Set<number>([BLOCKS.dirt.code, BLOCKS.stone.code]);
  for (let i = 0; i < LAB_SURFACE.clayBlobs; i += 1) {
    const cx = between(draw, 0, width - 1);
    const cy = between(draw, 0, height - 1);
    const cz = between(draw, LAB_SURFACE.clayFirstLayer, LAB_SURFACE.clayLastLayer);
    const r = LAB_SURFACE.clayBlobRadius;
    for (
      let z = Math.max(LAB_SURFACE.clayFirstLayer, cz - 1);
      z <= Math.min(LAB_SURFACE.clayLastLayer, cz + 1);
      z += 1
    ) {
      for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y += 1) {
        for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x += 1) {
          const inside = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 * 4 <= r * r + r;
          if (inside && softBlocks.has(blockAt(state, { x, y, z }))) {
            clay.add(cellIndex(state, x, y, z));
          }
        }
      }
    }
  }

  const surface: Surface = {
    features,
    apples,
    regrowAt: new Array<number>(width * height).fill(-1),
    clay,
    animals: [],
    nextAnimalId: 1,
    nextSpawnAt: LAB_SURFACE.animalRespawnMs,
    rng: random.state(),
    time: 0,
  };

  // The animals, on open ground (no tree) outside `clear`; the first one in `home`, if given.
  const animals: Animal[] = [];
  let rng = surface.rng;
  let nextAnimalId = 1;
  const homeOpen = home.filter(
    (s) => !clear.some((c) => c.x === s.x && c.y === s.y) && walkable(surface, [], state, s.x, s.y),
  );
  for (let tries = 0; animals.length < LAB_SURFACE.animals && tries < 1000; tries += 1) {
    const a = nextRandom(rng);
    const b = nextRandom(a.state);
    const c = nextRandom(b.state);
    rng = c.state;
    const inHome =
      animals.length === 0 ? homeOpen[Math.floor(a.value * homeOpen.length)] : undefined;
    const x = inHome?.x ?? Math.floor(a.value * width);
    const y = inHome?.y ?? Math.floor(b.value * height);
    const blocked = clear.some((s) => s.x === x && s.y === y);
    if (!blocked && walkable(surface, animals, state, x, y)) {
      animals.push({ id: nextAnimalId, x, y, nextStepAt: stepDelay(c.value) });
      nextAnimalId += 1;
    }
  }
  return { ...surface, animals, nextAnimalId, rng };
}

/** How long an animal waits before its next step, from a random number 0..1. */
function stepDelay(value: number): number {
  const span = LAB_SURFACE.animalStepMaxMs - LAB_SURFACE.animalStepMinMs;
  return LAB_SURFACE.animalStepMinMs + Math.floor(value * span);
}

/**
 * True if an animal may stand on square (x, y): on the map, at ground level
 * (never in a pit), with no tree or apple tree, and no other animal.
 */
function walkable(
  surface: Surface,
  animals: Animal[],
  state: GameState,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= state.size.x || y >= state.size.y) {
    return false;
  }
  const feature = surface.features[x + state.size.x * y];
  if (feature === TREE || feature === APPLE_TREE) {
    return false;
  }
  if (blockAt(state, { x, y, z: 0 }) === BLOCKS.air.code) {
    return false; // the top layer is gone: a pit, however shallow
  }
  return !animals.some((a) => a.x === x && a.y === y);
}

// ----- Time -----

/**
 * The surface at lab time `now`: every animal step, new animal and apple
 * regrowth due by then has happened, in time order. Time never goes back:
 * for `now` at or before `surface.time`, the same surface comes back.
 *
 * Steps are taken at their own scheduled times, not at the times the screen
 * calls this, so the result depends only on `now` and the taps in between.
 */
export function advanceSurface(surface: Surface, state: GameState, now: number): Surface {
  if (now <= surface.time) {
    return surface;
  }
  const width = state.size.x;
  let animals = surface.animals.map((a) => ({ ...a }));
  let rng = surface.rng;
  let nextAnimalId = surface.nextAnimalId;
  let nextSpawnAt = surface.nextSpawnAt;
  const draw = (): number => {
    const step = nextRandom(rng);
    rng = step.state;
    return step.value;
  };

  for (;;) {
    // The earliest thing due: an animal's step, or a new animal (ties: lowest id, then the spawn).
    let mover: Animal | null = null;
    for (const a of animals) {
      if (a.nextStepAt <= now && (mover === null || a.nextStepAt < mover.nextStepAt)) {
        mover = a;
      }
    }
    const spawnDue = nextSpawnAt <= now && (mover === null || nextSpawnAt < mover.nextStepAt);
    if (spawnDue) {
      if (animals.length < LAB_SURFACE.animals) {
        const edge: { x: number; y: number }[] = [];
        for (let y = 0; y < state.size.y; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const onEdge = x === 0 || y === 0 || x === width - 1 || y === state.size.y - 1;
            if (onEdge && walkable(surface, animals, state, x, y)) {
              edge.push({ x, y });
            }
          }
        }
        const at = edge[Math.floor(draw() * edge.length)];
        if (at !== undefined) {
          animals = [
            ...animals,
            { id: nextAnimalId, x: at.x, y: at.y, nextStepAt: nextSpawnAt + stepDelay(draw()) },
          ];
          nextAnimalId += 1;
        }
      }
      nextSpawnAt += LAB_SURFACE.animalRespawnMs;
      continue;
    }
    if (mover === null) {
      break;
    }
    const steps = [
      { x: mover.x, y: mover.y - 1 },
      { x: mover.x + 1, y: mover.y },
      { x: mover.x, y: mover.y + 1 },
      { x: mover.x - 1, y: mover.y },
    ].filter((s) => walkable(surface, animals, state, s.x, s.y));
    const choice = steps[Math.floor(draw() * steps.length)];
    if (choice !== undefined) {
      mover.x = choice.x;
      mover.y = choice.y;
    }
    mover.nextStepAt += stepDelay(draw());
  }

  // Apples come back on trees whose time has come.
  const apples = [...surface.apples];
  const regrowAt = surface.regrowAt.map((at, i) => {
    if (at >= 0 && at <= now) {
      apples[i] = LAB_SURFACE.applesPerTree;
      return -1;
    }
    return at;
  });
  return { ...surface, animals, apples, regrowAt, rng, nextAnimalId, nextSpawnAt, time: now };
}

// ----- Taps on the surface -----

/** What a tap on the surface of a square did; `null` from `harvest` means there was nothing to take. */
export interface Harvest {
  surface: Surface;
  /** What it gave. */
  gain: { item: string; count: number };
  /** What happened: 'grass', 'felled' (a tree or an empty apple tree), 'apple' or 'caught'. */
  kind: 'grass' | 'felled' | 'apple' | 'caught';
}

/**
 * Tap square (x, y) of the surface: catch the animal there; or else cut the
 * grass, pick an apple, or fell the tree. `null` if there is nothing on the
 * square to take (its block may then be mined). Square (x, y) must be at
 * ground level for a feature to be there; the caller checks it is lit.
 */
export function harvest(surface: Surface, state: GameState, x: number, y: number): Harvest | null {
  const animal = animalAt(surface, x, y);
  if (animal !== null) {
    return {
      surface: { ...surface, animals: surface.animals.filter((a) => a.id !== animal.id) },
      gain: { item: 'animal', count: 1 },
      kind: 'caught',
    };
  }
  const i = x + state.size.x * y;
  const feature = surface.features[i];
  if (feature === GRASS) {
    return {
      surface: { ...surface, features: replaced(surface.features, i, NO_FEATURE) },
      gain: { item: 'grass', count: LAB_SURFACE.grassPerTuft },
      kind: 'grass',
    };
  }
  if (feature === APPLE_TREE && (surface.apples[i] ?? 0) > 0) {
    const left = (surface.apples[i] ?? 0) - 1;
    return {
      surface: {
        ...surface,
        apples: replaced(surface.apples, i, left),
        // Once the last apple is picked, the tree regrows them after a while.
        regrowAt:
          left === 0
            ? replaced(surface.regrowAt, i, surface.time + LAB_SURFACE.appleRegrowMs)
            : surface.regrowAt,
      },
      gain: { item: 'apple', count: 1 },
      kind: 'apple',
    };
  }
  if (feature === TREE || feature === APPLE_TREE) {
    return {
      surface: {
        ...surface,
        features: replaced(surface.features, i, NO_FEATURE),
        regrowAt: replaced(surface.regrowAt, i, -1),
      },
      gain: { item: 'wood', count: LAB_SURFACE.woodPerTree },
      kind: 'felled',
    };
  }
  return null;
}

/** `list` with item `i` set to `value`, as a new list. */
function replaced<T>(list: T[], i: number, value: T): T[] {
  const copy = [...list];
  copy[i] = value;
  return copy;
}

/** The surface with the features on `squares` removed (a camp is built over them). */
export function clearFeatures(
  surface: Surface,
  width: number,
  squares: { x: number; y: number }[],
): Surface {
  const features = [...surface.features];
  const apples = [...surface.apples];
  const regrowAt = [...surface.regrowAt];
  for (const s of squares) {
    const i = s.x + width * s.y;
    features[i] = NO_FEATURE;
    apples[i] = 0;
    regrowAt[i] = -1;
  }
  return { ...surface, features, apples, regrowAt };
}
