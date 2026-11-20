// Growing the forest on a new cube (issue #70 item 2; decision note 0020;
// design doc v0.2 section 3.2; issue #95).
//
// `generateSurface` runs once, in `createRun`, after the cube and its
// underground spaces are generated, and draws from the same seeded generator
// (`state.rng`). Every number is in `SURFACE.generation`
// (src/data/surface.ts). In order:
//
// 1. Every surface cell starts as a tree.
// 2. Meadows: a few round clearings, away from the edges.
// 3. Dirt paths: winding paths from the middle of the first meadow (the
//    "hub") to the middle of each other meadow and to a cell on each of
//    `pathEdges` different edges of the cube.
// 4. Stone outcrops: each tree cell over stone becomes an outcrop with the
//    chance in the data.
// Coal in sight at the start is a separate step, `ensureCoalInSight`.
//
// There is no miner and nobody walks (design doc v0.2), so there is no start
// cell: no start clearing, and paths are scenery. A path is open ground over
// whatever block is there; it does not wear stone to dirt any more.
//
// What the player cannot see. Steps 1 to 3 read nothing of the cube, so where
// the trees, meadows and paths are says nothing about the ground. Step 4 is
// the one rule that looks at layer 0, and what it reads it shows: an outcrop
// is open ground over stone, so the stone is revealed. (So a tree is a little
// less likely to stand over stone than it would be without outcrops; issue
// #70 accepts that.) Nothing below layer 0 is ever read here.

import { BLOCKS, SURFACE, WORLD } from '../../data';
import type { Vec3 } from '../../data';
import { nextFloat, nextInt } from '../rng';
import { blockAt, setBlock } from '../state';
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
 * meadow. The ground under a path is left as it is.
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

/** Make the surface cell (x, y) a path, unless it is meadow already. */
function layPath(state: GameState, x: number, y: number): void {
  const cell = surfaceCell(x, y);
  if (surfaceKindAt(state, cell) !== SURFACE.kinds.meadow.code) {
    setSurfaceKind(state, cell, SURFACE.kinds.path.code);
  }
}

/**
 * Place the round meadows (step 2). Returns their centres, in the order they
 * were placed, for the paths to run between.
 */
function placeMeadows(state: GameState): Vec3[] {
  const gen = SURFACE.generation;
  const centres: Vec3[] = [];
  const count = gen.meadowsMin + nextInt(state.rng, gen.meadowsMax - gen.meadowsMin + 1);
  const margin = gen.meadowEdgeMargin;
  for (let meadow = 0; meadow < count; meadow += 1) {
    const radius =
      gen.meadowRadiusMin + nextInt(state.rng, gen.meadowRadiusMax - gen.meadowRadiusMin + 1);
    // A centre at least `margin` cells in from every edge (and inside the
    // footprint even if the cube is smaller than twice the margin).
    const spanX = Math.max(1, state.size.x - 2 * margin);
    const spanY = Math.max(1, state.size.y - 2 * margin);
    const cx = Math.min(state.size.x - 1, margin + nextInt(state.rng, spanX));
    const cy = Math.min(state.size.y - 1, margin + nextInt(state.rng, spanY));
    // Round: the cells whose squared distance from the centre is at most
    // r * r + r, which rounds off the corners of a square without making a
    // diamond.
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy <= radius * radius + radius && inFootprint(state, cx + dx, cy + dy)) {
          clear(state, cx + dx, cy + dy);
        }
      }
    }
    centres.push(surfaceCell(cx, cy));
  }
  return centres;
}

/**
 * One cell on each of `pathEdges` different edges of the cube, the edges
 * picked at random and in random order (step 3).
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
 * Grow the forest on `state`'s surface (issue #70 item 2). Changes
 * `state.surface`, `state.stumpAge` and `state.rng` in place; no block of
 * the cube is changed. The same state (seed, cube and generator) always
 * grows the same forest.
 */
export function generateSurface(state: GameState): void {
  const gen = SURFACE.generation;

  // 1. Forest everywhere.
  state.surface.fill(SURFACE.kinds.tree.code);
  state.stumpAge.fill(0);

  // 2. Meadows, then 3. paths. The hub the paths start from is the middle of
  // the first meadow; with no meadow at all it is the first edge cell. The
  // data asks for at least 2 edges, so there is always at least one path, and
  // so always some open ground.
  const meadowCentres = placeMeadows(state);
  const edgeCells = pickEdgeCells(state);
  const ends = [...meadowCentres, ...edgeCells];
  const hub = ends[0];
  if (hub === undefined) {
    throw new Error('Surface generation has nowhere to lay a path');
  }
  for (const end of ends.slice(1)) {
    carvePath(state, hub, end);
  }

  // 4. Stone outcrops, in the order the surface is stored. The number is
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
 * Coal in sight at the start (owner, question 67, re-expressed without a
 * start cell in design doc v0.2 section 3.2): at least one square on open
 * ground has coal as its top block. `createRun` calls this after
 * `generateSurface`, before the first reveal.
 *
 * If some open-ground square already has coal in layer 0, nothing changes
 * and no random number is drawn. Otherwise one open-ground square is picked
 * at random and its layer-0 block becomes coal. It replaces plain rock
 * (`coalInSightReplaces`), never an outcrop's stone (stone is the outcrop's
 * rule); if no plain rock qualifies, any open-ground block that is not an
 * outcrop's is replaced (this has not happened on any seed tested).
 *
 * Only layer-0 blocks the player sees at the start are read: nothing under a
 * tree and nothing below layer 0 (issue #88 item 1). So whether coal was
 * added, and where, says nothing about what is hidden.
 */
export function ensureCoalInSight(state: GameState): void {
  const gen = SURFACE.generation;
  const coal = blockCode(gen.coalInSightBlock);

  // The layer-0 blocks the player sees at the start: every square with no
  // tree on it, row by row.
  const seen: Vec3[] = [];
  for (const cell of surfaceCells(state)) {
    if (surfaceKindAt(state, cell) !== SURFACE.kinds.tree.code) {
      seen.push({ x: cell.x, y: cell.y, z: 0 });
    }
  }
  if (seen.some((ground) => blockAt(state, ground) === coal)) {
    return;
  }

  const replaceable = gen.coalInSightReplaces.map(blockCode);
  const places = seen.filter(
    (ground) =>
      surfaceKindAt(state, surfaceCell(ground.x, ground.y)) !== SURFACE.kinds.outcrop.code,
  );
  const plainRock = places.filter((ground) => replaceable.includes(blockAt(state, ground)));
  const choices = plainRock.length > 0 ? plainRock : places;
  const chosen = choices[nextInt(state.rng, choices.length)];
  if (chosen === undefined) {
    // Cannot happen on a generated surface: there is always a path or a meadow.
    throw new Error('No open ground to put coal in');
  }
  setBlock(state, chosen, coal);
}
