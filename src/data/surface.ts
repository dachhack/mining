// The surface: the forest over the cube (issue #70; decision note 0020).
//
// The surface is the layer of open air directly above layer 0, one cell for
// each column of the cube (one for each square of the map). Each surface cell
// is one of the kinds below. A tree hides the layer-0 block under it until it
// is cut, and its square cannot be mined before that; every other kind is open
// ground, where the layer-0 block is the square's top block and is seen from
// the start (design doc 3.2). There is no miner: nobody walks on the surface.
//
// Every number here is [Default]: tune it here.

import type { ItemStack } from './types';

/** One kind of surface cell. */
export interface SurfaceKindDef {
  /**
   * The number stored in `GameState.surface`. Codes are only ever added.
   * Meadow is 0 so that a blank state (every test cube built by hand) is open
   * ground everywhere, as the whole surface was before the forest.
   */
  code: number;
  name: string;
  /** True if it is open ground: the block under it is seen, and its square can be mined. */
  open: boolean;
}

/** The surface kinds, by id. */
export interface SurfaceKinds {
  meadow: SurfaceKindDef;
  tree: SurfaceKindDef;
  /** What a cut tree leaves. A tree grows back on it (`regrowShifts`). */
  stump: SurfaceKindDef;
  path: SurfaceKindDef;
  outcrop: SurfaceKindDef;
}

/** The numbers surface generation uses (src/engine/surface/generation.ts). */
export interface SurfaceGenerationData {
  /**
   * The start clearing: every surface cell within this many steps of the start
   * cell, diagonals counting as one step, is meadow. 1 is the start cell and
   * its eight neighbours (issue #70).
   */
  startClearingRadius: number;
  /** How many round meadows (clearings) there are: from `meadowsMin` to `meadowsMax`. */
  meadowsMin: number;
  meadowsMax: number;
  /** A meadow's radius in cells: from `meadowRadiusMin` to `meadowRadiusMax`. */
  meadowRadiusMin: number;
  meadowRadiusMax: number;
  /**
   * A meadow's centre is at least this many steps from the start cell
   * (counted through the grid) and at least `meadowEdgeMargin` cells in from
   * every edge.
   */
  meadowMinDistanceFromStart: number;
  meadowEdgeMargin: number;
  /** How many tries to find a centre for one meadow before giving that meadow up. */
  meadowPlacementTries: number;
  /** How many edges of the cube a path runs to from the start clearing (at least 2). */
  pathEdges: number;
  /**
   * How a path winds. At each step it turns aside (a step that does not bring
   * it nearer its end) with this chance, at most `pathWanderSteps` times; the
   * other steps bring it one cell nearer. So every path ends.
   */
  pathWanderChance: number;
  pathWanderSteps: number;
  /**
   * The block a path is worn into. A path cell's layer-0 block becomes this
   * if it is one of `pathWearsBlocks` (plain rock); ore is left as it is.
   */
  pathGround: string;
  pathWearsBlocks: string[];
  /** The block an outcrop stands over, and the chance each such cell under the forest becomes one. */
  outcropBlock: string;
  outcropChance: number;
  /**
   * Coal in sight at the start (owner, PR #72: "Coal visible near start").
   * Every new run shows at least one `coalInSightBlock` as the top block of a
   * square on open ground (design doc 3.2). If generation made none, one
   * layer-0 block under open ground is picked at random and replaced: plain
   * rock (`coalInSightReplaces`), never an outcrop's stone.
   */
  coalInSightBlock: string;
  coalInSightReplaces: string[];
}

export interface SurfaceData {
  kinds: SurfaceKinds;
  /** Cutting the tree on any square: its AP cost and what it gives (design doc 3.2 and 4.1). */
  cutTree: { ap: number; yields: ItemStack[] };
  /**
   * A stump grows a tree again at the end of the shift that makes this many
   * since it was cut, counting the shift of the cut as one, if its layer-0
   * block is still solid (issue #70 item 5; decision note 0020).
   */
  regrowShifts: number;
  generation: SurfaceGenerationData;
}

export const SURFACE: SurfaceData = {
  kinds: {
    meadow: { code: 0, name: 'Meadow', open: true },
    tree: { code: 1, name: 'Tree', open: false },
    stump: { code: 2, name: 'Stump', open: true },
    path: { code: 3, name: 'Dirt path', open: true },
    outcrop: { code: 4, name: 'Stone outcrop', open: true },
  },
  // Owner, issue #70: "trees you can cut for timber". 2 AP and 2 timber are
  // the coordinator's [Default]s.
  cutTree: { ap: 2, yields: [{ item: 'timber', count: 2 }] },
  // Owner, issue #70: "10 shifts".
  regrowShifts: 10,
  generation: {
    startClearingRadius: 1,
    // With the numbers below about 65% of the surface starts as trees
    // (issue #70: "mostly trees"); the PR for issue #70 gives the measured mean.
    meadowsMin: 4,
    meadowsMax: 6,
    meadowRadiusMin: 2,
    meadowRadiusMax: 4,
    meadowMinDistanceFromStart: 6,
    meadowEdgeMargin: 2,
    meadowPlacementTries: 20,
    pathEdges: 2,
    pathWanderChance: 0.3,
    pathWanderSteps: 6,
    pathGround: 'dirt',
    pathWearsBlocks: ['stone'],
    outcropBlock: 'stone',
    outcropChance: 0.3,
    // Owner's decision on PR #72.
    coalInSightBlock: 'coalSeam',
    coalInSightReplaces: ['dirt', 'stone'],
  },
};

/** The kind of surface cell with this code, or `undefined` if there is none. */
export function surfaceKindByCode(code: number): SurfaceKindDef | undefined {
  return Object.values(SURFACE.kinds).find((kind) => kind.code === code);
}

/**
 * Check the surface table. Returns a list of problems in plain English, empty
 * if there are none. `blockIds` and `itemIds` are the ids the other tables
 * define, passed in so that this file needs no import of them.
 */
export function validateSurfaceData(
  data: SurfaceData,
  blockIds: string[],
  itemIds: string[],
): string[] {
  const problems: string[] = [];
  function wholeAtLeast(value: number, minimum: number, where: string): void {
    if (!Number.isInteger(value) || value < minimum) {
      problems.push(`${where} must be a whole number of at least ${minimum}, but is ${value}`);
    }
  }
  function chance(value: number, where: string): void {
    if (!(value >= 0 && value <= 1)) {
      problems.push(`${where} must be from 0 to 1, but is ${value}`);
    }
  }
  function knownBlock(id: string, where: string): void {
    if (!blockIds.includes(id)) {
      problems.push(`${where} names an unknown block "${id}"`);
    }
  }

  const codes = Object.values(data.kinds).map((kind) => kind.code);
  for (const code of codes) {
    if (!Number.isInteger(code) || code < 0 || code > 255) {
      problems.push(`surface kind code ${code} must be a whole number 0 to 255`);
    }
  }
  if (new Set(codes).size !== codes.length) {
    problems.push('surface kind codes must all differ');
  }
  if (data.kinds.meadow.code !== 0) {
    problems.push('the meadow must have code 0, the surface of a blank state');
  }
  if (data.kinds.tree.open) {
    problems.push('a tree must not be open ground');
  }
  for (const id of ['meadow', 'stump', 'path', 'outcrop'] as const) {
    if (!data.kinds[id].open) {
      problems.push(`surface kind "${id}" must be open ground`);
    }
  }

  wholeAtLeast(data.cutTree.ap, 1, 'cutTree.ap');
  for (const stack of data.cutTree.yields) {
    if (!itemIds.includes(stack.item)) {
      problems.push(`cutTree.yields names an unknown item "${stack.item}"`);
    }
    wholeAtLeast(stack.count, 1, `cutTree.yields count of "${stack.item}"`);
  }
  // The stump's count is kept in one byte.
  wholeAtLeast(data.regrowShifts, 1, 'regrowShifts');
  if (data.regrowShifts > 255) {
    problems.push(`regrowShifts must be at most 255, but is ${data.regrowShifts}`);
  }

  const gen = data.generation;
  wholeAtLeast(gen.startClearingRadius, 1, 'generation.startClearingRadius');
  wholeAtLeast(gen.meadowsMin, 0, 'generation.meadowsMin');
  wholeAtLeast(gen.meadowsMax, gen.meadowsMin, 'generation.meadowsMax');
  wholeAtLeast(gen.meadowRadiusMin, 1, 'generation.meadowRadiusMin');
  wholeAtLeast(gen.meadowRadiusMax, gen.meadowRadiusMin, 'generation.meadowRadiusMax');
  wholeAtLeast(gen.meadowMinDistanceFromStart, 0, 'generation.meadowMinDistanceFromStart');
  wholeAtLeast(gen.meadowEdgeMargin, 0, 'generation.meadowEdgeMargin');
  wholeAtLeast(gen.meadowPlacementTries, 1, 'generation.meadowPlacementTries');
  wholeAtLeast(gen.pathEdges, 2, 'generation.pathEdges');
  if (gen.pathEdges > 4) {
    problems.push(`generation.pathEdges must be at most 4, but is ${gen.pathEdges}`);
  }
  chance(gen.pathWanderChance, 'generation.pathWanderChance');
  wholeAtLeast(gen.pathWanderSteps, 0, 'generation.pathWanderSteps');
  knownBlock(gen.pathGround, 'generation.pathGround');
  for (const id of gen.pathWearsBlocks) {
    knownBlock(id, 'generation.pathWearsBlocks');
  }
  knownBlock(gen.outcropBlock, 'generation.outcropBlock');
  chance(gen.outcropChance, 'generation.outcropChance');
  knownBlock(gen.coalInSightBlock, 'generation.coalInSightBlock');
  for (const id of gen.coalInSightReplaces) {
    knownBlock(id, 'generation.coalInSightReplaces');
  }
  return problems;
}
