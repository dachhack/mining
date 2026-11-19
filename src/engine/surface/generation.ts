// Growing the forest on a new cube (issue #70 item 2; decision note 0020).
//
// `generateSurface` runs once, in `createRun`, right after the cube is
// generated, and draws from the same seeded generator (`state.rng`). Every
// number is in `SURFACE.generation` (src/data/surface.ts). In order:
//
// 1. Every surface cell starts as a tree.
// 2. The start clearing: the start cell and the cells round it are meadow.
// 3. Meadows: a few round clearings, away from the start and the edges.
// 4. Dirt paths: from the start cell, a winding path to the middle of each
//    meadow and to a cell on each of `pathEdges` different edges of the cube.
//    Under a path cell, plain rock in layer 0 is worn to dirt.
// 5. Stone outcrops: each tree cell over stone becomes an outcrop with the
//    chance in the data.
// Coal in sight at the start (owner's decision on PR #72) is a separate step,
// `ensureCoalInSight`, which `createRun` calls once the miner is placed.
//
// What the player cannot see. Steps 1 to 4 read nothing of the cube, so where
// the trees, meadows and paths are says nothing about the ground. Step 5 is
// the one rule that looks at layer 0, and what it reads it shows: an outcrop
// is open ground over stone, so the stone is revealed. (So a tree is a little
// less likely to stand over stone than it would be without outcrops; issue
// #70 accepts that.)

import { BLOCKS, SURFACE, WORLD } from '../../data';
import type { Vec3 } from '../../data';
import { nextFloat, nextInt } from '../rng';
import { updateReveal } from '../reveal';
import { blockAt, cloneState, isRevealed, isSolid, setBlock } from '../state';
import type { GameState } from '../state';
import { setSurfaceKind, surfaceCells, surfaceKindAt } from './state';

/** The code stored in the cube for the block with this id. Throws on an unknown id. */
function blockCode(blockId: string): number {
  const table: Record<string, { code: number }> = BLOCKS;
  const def = Object.hasOwn(table, blockId) ? table[blockId] : undefined;
  if (def === undefined) {
    throw new Error(`Surface data names an unknown block: ${blockId}`);
  }
  return def.code;
}

/** The surface cell above column (x, y). */
function surfaceCell(x: number, y: number): Vec3 {
  return { x, y, z: WORLD.surfaceZ };
}

/** True if column (x, y) is inside the cube's footprint. */
function inFootprint(state: GameState, x: number, y: number): boolean {
  return x >= 0 && x < state.size.x && y >= 0 && y < state.size.y;
}

/** Make the surface cell (x, y) meadow, whatever it was. */
function clear(state: GameState, x: number, y: number): void {
  setSurfaceKind(state, surfaceCell(x, y), SURFACE.kinds.meadow.code);
}

/**
 * The four sideways steps, in a fixed order, so that a random pick among them
 * always means the same step. Directions, not gameplay numbers.
 */
const STEPS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

/**
 * Carve one winding dirt path from `from` to `to` (both surface cells inside
 * the footprint). Each step either turns aside, with chance
 * `pathWanderChance` while turns are left (`pathWanderSteps`), or takes one of
 * the steps that bring it nearer `to`, picked at random. Turning aside never
 * leaves the footprint. Since turns run out, the path always arrives.
 *
 * A path cell that is a tree becomes path; meadow (the clearings) stays
 * meadow. Under each path cell, layer-0 plain rock is worn to dirt.
 */
function carvePath(state: GameState, from: Vec3, to: Vec3): void {
  const gen = SURFACE.generation;
  let x = from.x;
  let y = from.y;
  let turnsLeft = gen.pathWanderSteps;
  layPath(state, x, y);
  while (x !== to.x || y !== to.y) {
    // The steps that bring the path nearer its end: one or two of them.
    const nearer = STEPS.filter(
      (step) =>
        (step.dx !== 0 && Math.sign(to.x - x) === step.dx) ||
        (step.dy !== 0 && Math.sign(to.y - y) === step.dy),
    );
    let step = nearer[nextInt(state.rng, nearer.length)];
    if (turnsLeft > 0 && nextFloat(state.rng) < gen.pathWanderChance) {
      // Turn aside: any step that does not bring it nearer and stays inside.
      const aside = STEPS.filter(
        (candidate) =>
          !nearer.includes(candidate) && inFootprint(state, x + candidate.dx, y + candidate.dy),
      );
      if (aside.length > 0) {
        step = aside[nextInt(state.rng, aside.length)];
        turnsLeft -= 1;
      }
    }
    if (step === undefined) {
      // Cannot happen: while the path has not arrived, some step is nearer.
      throw new Error('A path found no step towards its end');
    }
    x += step.dx;
    y += step.dy;
    layPath(state, x, y);
  }
}

/** Make the surface cell (x, y) a path unless it is meadow, and wear the rock under it. */
function layPath(state: GameState, x: number, y: number): void {
  const gen = SURFACE.generation;
  const cell = surfaceCell(x, y);
  if (surfaceKindAt(state, cell) === SURFACE.kinds.meadow.code) {
    return;
  }
  setSurfaceKind(state, cell, SURFACE.kinds.path.code);
  const ground = { x, y, z: 0 };
  const below = { x, y, z: 1 };
  const wears = gen.pathWearsBlocks.map(blockCode).includes(blockAt(state, ground));
  // Dirt cannot span a gap (design doc 3.2), so rock is worn to dirt only
  // where the block under it is solid. Every cell of a cube generated today
  // is solid; the check keeps a fresh cube at rest (0014 item 19) if layer 1
  // ever has voids.
  if (wears && isSolid(state, below)) {
    setBlock(state, ground, blockCode(gen.pathGround));
  }
}

/**
 * Place the round meadows (step 3). Returns their centres, in the order they
 * were placed, for the paths to run to.
 */
function placeMeadows(state: GameState, start: Vec3): Vec3[] {
  const gen = SURFACE.generation;
  const centres: Vec3[] = [];
  const count = gen.meadowsMin + nextInt(state.rng, gen.meadowsMax - gen.meadowsMin + 1);
  const margin = gen.meadowEdgeMargin;
  for (let meadow = 0; meadow < count; meadow += 1) {
    const radius =
      gen.meadowRadiusMin + nextInt(state.rng, gen.meadowRadiusMax - gen.meadowRadiusMin + 1);
    for (let attempt = 0; attempt < gen.meadowPlacementTries; attempt += 1) {
      // A centre at least `margin` cells in from every edge (and inside the
      // footprint even if the cube is smaller than twice the margin).
      const spanX = Math.max(1, state.size.x - 2 * margin);
      const spanY = Math.max(1, state.size.y - 2 * margin);
      const cx = Math.min(state.size.x - 1, margin + nextInt(state.rng, spanX));
      const cy = Math.min(state.size.y - 1, margin + nextInt(state.rng, spanY));
      const distance = Math.abs(cx - start.x) + Math.abs(cy - start.y);
      if (distance < gen.meadowMinDistanceFromStart) {
        continue;
      }
      // Round: the cells whose squared distance from the centre is at most
      // r * r + r, which rounds off the corners of a square without making a
      // diamond.
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (
            dx * dx + dy * dy <= radius * radius + radius &&
            inFootprint(state, cx + dx, cy + dy)
          ) {
            clear(state, cx + dx, cy + dy);
          }
        }
      }
      centres.push(surfaceCell(cx, cy));
      break;
    }
  }
  return centres;
}

/**
 * One cell on each of `pathEdges` different edges of the cube, the edges
 * picked at random and in random order (step 4).
 */
function pickEdgeCells(state: GameState): Vec3[] {
  const gen = SURFACE.generation;
  // 0 north (y = 0), 1 east (x = max), 2 south (y = max), 3 west (x = 0).
  const edges = [0, 1, 2, 3];
  // Shuffle (Fisher-Yates, like Python's `random.shuffle`).
  for (let i = edges.length - 1; i > 0; i -= 1) {
    const j = nextInt(state.rng, i + 1);
    const swap = edges[i] as number;
    edges[i] = edges[j] as number;
    edges[j] = swap;
  }
  const lastX = state.size.x - 1;
  const lastY = state.size.y - 1;
  return edges.slice(0, gen.pathEdges).map((edge) => {
    if (edge === 0) return surfaceCell(nextInt(state.rng, state.size.x), 0);
    if (edge === 1) return surfaceCell(lastX, nextInt(state.rng, state.size.y));
    if (edge === 2) return surfaceCell(nextInt(state.rng, state.size.x), lastY);
    return surfaceCell(0, nextInt(state.rng, state.size.y));
  });
}

/**
 * Grow the forest on `state`'s surface and wear the path cells' rock to dirt
 * (issue #70 item 2). Changes `state.surface`, `state.stumpAge`, some layer-0
 * blocks and `state.rng` in place. The same state (seed, cube and generator)
 * always grows the same forest.
 */
export function generateSurface(state: GameState): void {
  const gen = SURFACE.generation;
  const start = WORLD.startPosition;

  // 1. Forest everywhere.
  state.surface.fill(SURFACE.kinds.tree.code);
  state.stumpAge.fill(0);

  // 2. The start clearing.
  const r = gen.startClearingRadius;
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (inFootprint(state, start.x + dx, start.y + dy)) {
        clear(state, start.x + dx, start.y + dy);
      }
    }
  }

  // 3. Meadows, then 4. paths to each meadow and to the edges.
  const meadowCentres = placeMeadows(state, start);
  const edgeCells = pickEdgeCells(state);
  for (const end of [...meadowCentres, ...edgeCells]) {
    carvePath(state, start, end);
  }

  // 5. Stone outcrops, in the order the surface is stored. The number is
  // drawn for every tree cell before the ground is looked at, so how far the
  // generator advances never depends on the ground under the trees (review
  // of PR #72).
  const outcropUnder = blockCode(gen.outcropBlock);
  for (const cell of surfaceCells(state)) {
    if (surfaceKindAt(state, cell) !== SURFACE.kinds.tree.code) {
      continue;
    }
    const roll = nextFloat(state.rng);
    const overStone = blockAt(state, { x: cell.x, y: cell.y, z: 0 }) === outcropUnder;
    if (overStone && roll < gen.outcropChance) {
      setSurfaceKind(state, cell, SURFACE.kinds.outcrop.code);
    }
  }
}

/**
 * Coal in sight at the start (owner's decision on PR #72, "Coal visible near
 * start"). `createRun` calls this once the miner is on its start cell with its
 * lamp, just before the first reveal: it makes sure that reveal shows some
 * coal.
 *
 * The layer-0 blocks the first reveal will show are worked out on a copy of
 * the state: since the owner's change after PR #72 that is only the ground
 * round the start, lit by daylight, never ground under a tree. If one of them
 * is coal, nothing changes and no random number is drawn. Otherwise one of
 * them (not the start cell, which the miner stands on, and not an outcrop,
 * whose stone is its rule) is picked at random, and becomes coal. It replaces
 * plain rock (`coalInSightReplaces`), and only where the block under it is
 * solid, so the cube stays at rest (0014 item 19); if no cell qualifies, any
 * such block is replaced (this has not happened on any seed tested).
 *
 * Only ground the player will see at the start is read (and layer 1's
 * solidity, as the path rule does), so whether coal was added says nothing
 * about the ground under the trees.
 */
export function ensureCoalInSight(state: GameState): void {
  const gen = SURFACE.generation;
  const coal = blockCode(gen.coalInSightBlock);
  const start = state.avatar.pos;

  // What the first reveal will show: run it on a copy.
  const preview = cloneState(state);
  updateReveal(preview, []);
  const seen: Vec3[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const ground = { x, y, z: 0 };
      if (isRevealed(preview, ground)) {
        seen.push(ground);
      }
    }
  }
  if (seen.some((ground) => blockAt(state, ground) === coal)) {
    return;
  }

  const replaceable = gen.coalInSightReplaces.map(blockCode);
  const places = seen.filter(
    (ground) =>
      !(ground.x === start.x && ground.y === start.y) &&
      surfaceKindAt(state, surfaceCell(ground.x, ground.y)) !== SURFACE.kinds.outcrop.code &&
      isSolid(state, { x: ground.x, y: ground.y, z: 1 }),
  );
  const plainRock = places.filter((ground) => replaceable.includes(blockAt(state, ground)));
  const choices = plainRock.length > 0 ? plainRock : places;
  const chosen = choices[nextInt(state.rng, choices.length)];
  if (chosen === undefined) {
    // Cannot happen: the start cell's eight neighbours are open meadow, and
    // daylight shows the ground under them.
    throw new Error('No ground in sight of the start to put coal in');
  }
  setBlock(state, chosen, coal);
}
