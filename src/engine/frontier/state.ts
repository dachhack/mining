// The new game's world (Lab 2 becomes the game, docs/plans/lab2-becomes-the-game.md,
// PR A1): what Lab 2 knows as a "camp world", now in the engine.
//
// "Frontier" names the new rule set while the old game is still here beside
// it (phases A and B of the plan): camps push the edge of the known world
// out into the fog. Phase C removes the old game.
//
// A1 holds the world as it is generated: the cube, the surface (plants,
// apples, animals), clay, the free first camp and what it lights. The
// actions (A2, A3) and shifts (A4) add to it.

import type { GameState } from '../state';
import type { RngState } from '../rng';

/**
 * Changes whenever the shape of `FrontierState` changes, so an old save is
 * not loaded into a new shape. Separate from the old game's STATE_VERSION
 * while the two rule sets live side by side.
 */
export const FRONTIER_STATE_VERSION = 7; // 2: `inventory` (A2); 3: `mined` (A3); 4: shifts (A4); 5: `stumps`; 6: a camp's `smelter`; 7: a camp's `lantern`

/** What grows on a square: nothing, grass, a tree or an apple tree. */
export const NO_FEATURE = 0;
export const GRASS = 1;
export const TREE = 2;
export const APPLE_TREE = 3;
export type Feature = typeof NO_FEATURE | typeof GRASS | typeof TREE | typeof APPLE_TREE;

/** A roaming animal, on square (x, y). */
export interface FrontierAnimal {
  /** A number that names the animal; new animals get the next one. */
  id: number;
  x: number;
  y: number;
}

/** A camp: its 3 x 3 footprint is centred on (x, y). */
export interface FrontierCamp {
  /** A number that names the camp; new camps get the next one. */
  id: number;
  x: number;
  y: number;
  /** 1, 2 or 3: how far it lights and what it lets the player mine (src/data/frontier.ts). */
  level: number;
  /** True once a smelter is built at this camp (docs/plans/smelting-and-crafting.md). */
  smelter: boolean;
  /** True once a copper lantern is hung at this camp: its ring is wider (FRONTIER_LANTERN). */
  lantern: boolean;
}

export interface FrontierState {
  version: number;
  seed: number;
  /**
   * The cube: the game's own generation (no coal at the surface), with no
   * timber-root and with clay. Only its blocks are used; the old game's
   * turns, fuel and crew fields in it are ignored.
   */
  cube: GameState;
  /** What grows on each square, row by row (index x + width * y). */
  features: Feature[];
  /** Apples on each apple tree (0 elsewhere). */
  apples: number[];
  animals: FrontierAnimal[];
  nextAnimalId: number;
  /** The surface's own random generator (the animals), seeded from the world's seed. */
  rng: RngState;
  camps: FrontierCamp[];
  nextCampId: number;
  /** Every square a camp has ever lit, row by row. It only ever gains squares. */
  seen: boolean[];
  /** Items held: item id -> count (a Python dict). Only items with a count above 0 are in it. */
  inventory: Map<string, number>;
  /** How many blocks have been mined in this world (Lab 2's "Dug"). */
  mined: number;
  /**
   * The shifts until something grows back on each square: the apples of an
   * apple tree picked bare, or the tree on a stump. -1 for every other square.
   */
  regrowIn: number[];
  /**
   * Where a tree was felled, the kind of tree that will grow back there
   * (TREE or APPLE_TREE) when its `regrowIn` runs out; NO_FEATURE elsewhere.
   */
  stumps: Feature[];
  /** The shift being played: 1 is the first. */
  shift: number;
  /** Taps left in this shift (src/data/frontier.ts, FRONTIER_SHIFT.taps a shift). */
  tapsLeft: number;
  /** The crew's health: 0 loses the run. */
  health: number;
  /** 'active' while the run goes on; 'lost' when the crew's health reached 0; 'closed' when the player closed the mine. */
  status: FrontierStatus;
}

/** How a run stands: going on, lost, or ended by closing the mine. */
export type FrontierStatus = 'active' | 'lost' | 'closed';
