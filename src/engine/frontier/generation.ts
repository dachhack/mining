// The new game's world, generated from a seed (plan A1). This is Lab 2's
// generation (src/app/lab/campWorld.ts and surface.ts), moved into the
// engine: the same seed gives the same world as Lab 2 does (a unit test
// checks 50 seeds). The numbers are in src/data/frontier.ts.

import { BLOCKS, CONTRACT_IDS, DEFAULT_LOADOUT_ID } from '../../data';
import {
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_SHIFT,
  FRONTIER_SURFACE,
  FRONTIER_START_REACH,
} from '../../data/frontier';
import { createRun } from '../index';
import { createRng, nextFloat } from '../rng';
import type { RngState } from '../rng';
import { blockAt } from '../state';
import type { GameState } from '../state';
import { CAMP_HALF_SIZE, campRadius, footprintOf, inCircle, inFootprint, seenWith } from './camps';
import { APPLE_TREE, FRONTIER_STATE_VERSION, GRASS, NO_FEATURE, TREE } from './state';
import type { Feature, FrontierAnimal, FrontierCamp, FrontierState } from './state';

/**
 * The surface's generator is seeded from the world's seed mixed with this
 * fixed number, so it is not the same sequence as the cube's. (Lab 2 used
 * the same number, so the same seed gives the same surface.)
 */
const SURFACE_SEED_MIX = 0x51ab5eed;

/** The index of square (x, y) in the per-square lists (row by row). */
function squareIndex(cube: GameState, x: number, y: number): number {
  return x + cube.size.x * y;
}

/** A whole number from `low` to `high`, both included. Advances `rng`. */
function between(rng: RngState, low: number, high: number): number {
  return low + Math.floor(nextFloat(rng) * (high - low + 1));
}

/**
 * The game's cube for `seed`, made Lab 2's: no timber-root anywhere (it
 * becomes `FRONTIER_SURFACE.timberRootBecomes`, dirt; owner: "Let's get rid
 * of the roots square"). No coal at the surface is already the game's own
 * rule. `createRun` makes a fresh cube, so changing it changes nothing else.
 */
function frontierCube(seed: number): GameState {
  const contractId = CONTRACT_IDS[0];
  if (contractId === undefined) {
    throw new Error('the data lists no contract');
  }
  const cube = createRun(seed, contractId, DEFAULT_LOADOUT_ID);
  const root = BLOCKS.timberRoot.code;
  const becomes = BLOCKS[FRONTIER_SURFACE.timberRootBecomes].code;
  for (let i = 0; i < cube.blocks.length; i += 1) {
    if (cube.blocks[i] === root) {
      cube.blocks[i] = becomes;
    }
  }
  return cube;
}

/** What the surface generator gives: the plants, apples, clay cells, animals and the generator after them. */
interface SurfaceDraw {
  features: Feature[];
  apples: number[];
  /** Cube cells (index x + X * (y + Y * z)) that are clay. */
  clay: number[];
  animals: FrontierAnimal[];
  rng: RngState;
}

/** True if an animal could stand on square (x, y): on the map, at ground level, no tree, no other animal. */
export function walkable(
  cube: GameState,
  features: Feature[],
  animals: FrontierAnimal[],
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= cube.size.x || y >= cube.size.y) {
    return false;
  }
  const feature = features[squareIndex(cube, x, y)];
  if (feature === TREE || feature === APPLE_TREE) {
    return false;
  }
  if (blockAt(cube, { x, y, z: 0 }) === BLOCKS.air.code) {
    return false; // the top layer is gone: a pit, however shallow
  }
  return !animals.some((a) => a.x === x && a.y === y);
}

/**
 * The surface of `cube` on `seed`, in Lab 2's order: trees in clumps, apple
 * trees, grass, all only on dirt; squares in `clear` (the first camp's 3 x 3)
 * cleared; clay blobs in the layers just under the ground; then the animals,
 * the first one on an open square of `home` (the first camp's ring) if given.
 */
function drawSurface(
  cube: GameState,
  seed: number,
  clear: { x: number; y: number }[] = [],
  home: { x: number; y: number }[] = [],
): SurfaceDraw {
  const width = cube.size.x;
  const height = cube.size.y;
  const rng = createRng((seed ^ SURFACE_SEED_MIX) >>> 0);
  const s = FRONTIER_SURFACE;
  const features: Feature[] = new Array<Feature>(width * height).fill(NO_FEATURE);
  const apples = new Array<number>(width * height).fill(0);
  // Plants grow only on some top blocks (dirt): never on stone, coal or other rock.
  const growOn = new Set<number>(s.plantsGrowOn.map((id) => BLOCKS[id].code));
  const fertile = (x: number, y: number): boolean => growOn.has(blockAt(cube, { x, y, z: 0 }));

  // Trees, in clumps. The chance is drawn on every square, fertile or not.
  for (let i = 0; i < s.treeClumps; i += 1) {
    const cx = between(rng, 0, width - 1);
    const cy = between(rng, 0, height - 1);
    const r = s.treeClumpRadius;
    for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y += 1) {
      for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x += 1) {
        const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r;
        if (inside && nextFloat(rng) < s.treeChance && fertile(x, y)) {
          features[x + width * y] = TREE;
        }
      }
    }
  }
  // Apple trees, one by one, on squares with nothing yet.
  for (let i = 0; i < s.appleTrees; i += 1) {
    const x = between(rng, 0, width - 1);
    const y = between(rng, 0, height - 1);
    if (features[x + width * y] === NO_FEATURE && fertile(x, y)) {
      features[x + width * y] = APPLE_TREE;
      apples[x + width * y] = s.applesPerTree;
    }
  }
  // Grass on most of what is left.
  for (let i = 0; i < features.length; i += 1) {
    if (
      features[i] === NO_FEATURE &&
      nextFloat(rng) < s.grassChance &&
      fertile(i % width, Math.floor(i / width))
    ) {
      features[i] = GRASS;
    }
  }
  for (const sq of clear) {
    features[sq.x + width * sq.y] = NO_FEATURE;
    apples[sq.x + width * sq.y] = 0;
  }

  // Clay: blobs that turn dirt and stone into clay in the layers just under the surface.
  const clay = new Set<number>();
  const soft = new Set<number>([BLOCKS.dirt.code, BLOCKS.stone.code]);
  for (let i = 0; i < s.clayBlobs; i += 1) {
    const cx = between(rng, 0, width - 1);
    const cy = between(rng, 0, height - 1);
    const cz = between(rng, s.clayFirstLayer, s.clayLastLayer);
    const r = s.clayBlobRadius;
    for (
      let z = Math.max(s.clayFirstLayer, cz - 1);
      z <= Math.min(s.clayLastLayer, cz + 1);
      z += 1
    ) {
      for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y += 1) {
        for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x += 1) {
          const inside = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 * 4 <= r * r + r;
          if (inside && soft.has(blockAt(cube, { x, y, z }))) {
            clay.add(x + width * (y + height * z));
          }
        }
      }
    }
  }

  // The animals, on open ground outside `clear`; the first one in `home`, if given.
  const animals: FrontierAnimal[] = [];
  const homeOpen = home.filter(
    (sq) =>
      !clear.some((c) => c.x === sq.x && c.y === sq.y) && walkable(cube, features, [], sq.x, sq.y),
  );
  let nextId = 1;
  for (let tries = 0; animals.length < s.animals && tries < 1000; tries += 1) {
    const a = nextFloat(rng);
    const b = nextFloat(rng);
    nextFloat(rng); // Lab 2 drew the animal's first step time here; drawn still, so the sequence matches
    const inHome = animals.length === 0 ? homeOpen[Math.floor(a * homeOpen.length)] : undefined;
    const x = inHome?.x ?? Math.floor(a * width);
    const y = inHome?.y ?? Math.floor(b * height);
    const blocked = clear.some((sq) => sq.x === x && sq.y === y);
    if (!blocked && walkable(cube, features, animals, x, y)) {
      animals.push({ id: nextId, x, y });
      nextId += 1;
    }
  }
  return { features, apples, clay: [...clay], animals, rng };
}

/**
 * What the surface inside a ring of `radius` around (x, y) gives when all of
 * it is taken, leaving out the 3 x 3 a camp would stand on: wood from trees
 * and apple trees, grass from tufts.
 */
function surfaceGains(
  cube: GameState,
  features: Feature[],
  x: number,
  y: number,
  radius: number,
): Map<string, number> {
  let trees = 0;
  let tufts = 0;
  for (let sy = Math.max(0, y - radius); sy <= Math.min(cube.size.y - 1, y + radius); sy += 1) {
    for (let sx = Math.max(0, x - radius); sx <= Math.min(cube.size.x - 1, x + radius); sx += 1) {
      if (!inCircle(x, y, radius, sx, sy) || inFootprint(x, y, sx, sy)) {
        continue;
      }
      const feature = features[squareIndex(cube, sx, sy)];
      if (feature === TREE || feature === APPLE_TREE) trees += 1;
      if (feature === GRASS) tufts += 1;
    }
  }
  return new Map([
    ['wood', trees * FRONTIER_SURFACE.woodPerTree],
    ['grass', tufts * FRONTIER_SURFACE.grassPerTuft],
  ]);
}

/**
 * Where the free first camp goes: among the 3 x 3 patches centred within
 * `FRONTIER_START_REACH` squares of the middle, first those whose ring holds
 * enough wood and grass for a new camp, then the one with the most dirt on
 * top, then the nearest the middle. Ties go to the patch met first, row by
 * row, so the choice is the same every time.
 */
export function startSquare(cube: GameState, features: Feature[]): { x: number; y: number } {
  const midX = (cube.size.x - 1) / 2;
  const midY = (cube.size.y - 1) / 2;
  const h = CAMP_HALF_SIZE;
  const radius = campRadius(1);
  let best = { x: Math.floor(midX), y: Math.floor(midY) };
  let bestPays = -1;
  let bestDirt = -1;
  let bestDistance = Infinity;
  for (let y = h; y < cube.size.y - h; y += 1) {
    for (let x = h; x < cube.size.x - h; x += 1) {
      const distance = (x - midX) ** 2 + (y - midY) ** 2;
      if (distance > FRONTIER_START_REACH ** 2) {
        continue;
      }
      const gains = surfaceGains(cube, features, x, y, radius);
      const pays = FRONTIER_NEW_CAMP_COST.every(
        (stack) => (gains.get(stack.item) ?? 0) >= stack.count,
      )
        ? 1
        : 0;
      const dirt = footprintOf(x, y).filter(
        (sq) => blockAt(cube, { x: sq.x, y: sq.y, z: 0 }) === BLOCKS.dirt.code,
      ).length;
      const better =
        pays > bestPays ||
        (pays === bestPays && (dirt > bestDirt || (dirt === bestDirt && distance < bestDistance)));
      if (better) {
        best = { x, y };
        bestPays = pays;
        bestDirt = dirt;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * A new world on `seed`: the game's cube made the new game's (no
 * timber-root, clay in the layers under the ground), its surface (grass,
 * trees, apple trees, animals), and one free level-1 camp near the middle on
 * a patch whose ring pays for the next camp. The same seed always gives the
 * same world, and it is the world Lab 2 opens on that seed.
 */
export function createFrontier(seed: number): FrontierState {
  const cube = frontierCube(seed);
  // First a plain surface, to choose where the first camp goes...
  const start = startSquare(cube, drawSurface(cube, seed).features);
  // ...then again, keeping the camp's 3 x 3 clear and starting the first
  // animal inside its ring.
  const ring: { x: number; y: number }[] = [];
  const r = campRadius(1);
  for (let y = start.y - r; y <= start.y + r; y += 1) {
    for (let x = start.x - r; x <= start.x + r; x += 1) {
      if (inCircle(start.x, start.y, r, x, y)) ring.push({ x, y });
    }
  }
  const surface = drawSurface(cube, seed, footprintOf(start.x, start.y), ring);
  // Clay becomes real blocks of the cube.
  for (const cell of surface.clay) {
    cube.blocks[cell] = BLOCKS.clay.code;
  }
  const camps: FrontierCamp[] = [
    {
      id: 1,
      x: start.x,
      y: start.y,
      level: 1,
      smelter: false,
      lantern: false,
      pen: false,
      penned: 0,
      breedIn: 0,
      deep: false,
    },
  ];
  return {
    version: FRONTIER_STATE_VERSION,
    seed,
    cube,
    features: surface.features,
    apples: surface.apples,
    animals: surface.animals,
    nextAnimalId: surface.animals.length + 1,
    rng: surface.rng,
    camps,
    nextCampId: 2,
    seen: seenWith(
      new Array<boolean>(cube.size.x * cube.size.y).fill(false),
      camps,
      cube.size.x,
      cube.size.y,
    ),
    inventory: new Map(),
    mined: 0,
    regrowIn: new Array<number>(cube.size.x * cube.size.y).fill(-1),
    stumps: new Array<Feature>(cube.size.x * cube.size.y).fill(NO_FEATURE),
    grassIn: new Array<number>(cube.size.x * cube.size.y).fill(-1),
    planted: new Array<boolean>(cube.size.x * cube.size.y).fill(false),
    treesFelled: 0,
    contract: null,
    contractsDone: [0, 0, 0],
    shift: 1,
    tapsLeft: FRONTIER_SHIFT.taps,
    health: FRONTIER_SHIFT.startHealth,
    status: 'active',
  };
}
