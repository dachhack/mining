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
export const FRONTIER_STATE_VERSION = 22; // 2: `inventory` (A2); 3: `mined` (A3); 4: shifts (A4); 5: `stumps`; 6: a camp's `smelter`; 7: a camp's `lantern`; 8: `grassIn`, `planted`, `treesFelled` (farming); 9: a camp's pen; 10: `contract`, `contractsDone`; 11: a camp's `deep`; 12: `marketOpen`; 13: `contracts` (several held) for `contract`; 14: `hazards` (flooded squares, pumps); 15: `hazards.fires`; 16: `hazards.dragons`, `nextDragonId`; 17: a camp's `defense`; 18: a dragon's heading (`dx`, `dy`); 19: a dragon's `restMines`; 20: `sawHouses`; 21: `buildings` for `sawHouses`, and maple trees; 22: `mushrooms`, `mushroomIn`

/** What grows on a square: nothing, grass, a tree, an apple tree or a maple tree. */
export const NO_FEATURE = 0;
export const GRASS = 1;
export const TREE = 2;
export const APPLE_TREE = 3;
/** A maple tree (owner, after the 0.17.0 build): grown from a maple sapling; tapped for sap. */
export const MAPLE_TREE = 4;
export type Feature =
  typeof NO_FEATURE | typeof GRASS | typeof TREE | typeof APPLE_TREE | typeof MAPLE_TREE;

/**
 * True if `feature` is a tree of any kind: felled for wood. (`feature is
 * ...` tells TypeScript that, when this is true, `feature` is one of the
 * three tree kinds.)
 */
export function isTree(
  feature: number | undefined,
): feature is typeof TREE | typeof APPLE_TREE | typeof MAPLE_TREE {
  return feature === TREE || feature === APPLE_TREE || feature === MAPLE_TREE;
}

/**
 * What a tree of kind `feature` holds and gives 1 a tap before it is felled:
 * apples on an apple tree, sap in a maple; `null` for any other kind.
 */
export function cropOf(feature: number | undefined): 'apple' | 'sap' | null {
  if (feature === APPLE_TREE) return 'apple';
  if (feature === MAPLE_TREE) return 'sap';
  return null;
}

/** The kinds of one-square building (buildings.ts). */
export type BuildingKind = 'sawHouse' | 'sugarShack';

/** A one-square building on square (x, y) (buildings.ts). */
export interface FrontierBuilding {
  kind: BuildingKind;
  x: number;
  y: number;
}

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
  /** 1 to 4: how far it lights and what it lets the player mine (src/data/frontier.ts). */
  level: number;
  /** True once a smelter is built at this camp (docs/plans/smelting-and-crafting.md). */
  smelter: boolean;
  /** True once a copper lantern is hung at this camp: its ring is wider (FRONTIER_LANTERN). */
  lantern: boolean;
  /** True once an animal pen is built at this camp (FRONTIER_PEN). */
  pen: boolean;
  /** Animals in the pen. */
  penned: number;
  /** True for a deep camp (FRONTIER_DEEP_CAMP): placed at any depth, its own ring, never upgraded. */
  deep: boolean;
  /** 0 to 3: how many levels of defenses it has built (FRONTIER_DEFENSE; raids.ts). */
  defense: number;
  /**
   * Shifts until the pen's next animal is born, while it may breed (at least
   * 2 animals and room for one more); 0 while it may not, or waits for hay.
   */
  breedIn: number;
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
  /**
   * What each tree that bears holds (`cropOf`): apples on an apple tree, sap
   * in a maple tree; 0 elsewhere. (Named before maples came.)
   */
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
   * (TREE, APPLE_TREE or MAPLE_TREE) when its `regrowIn` runs out; NO_FEATURE elsewhere.
   */
  stumps: Feature[];
  /**
   * The shifts until cut grass grows back on each square (progression plan
   * section 6.1); -1 where none is waiting.
   */
  grassIn: number[];
  /** True where the stump is a planted sapling, not a felled tree (plan section 6.2). */
  planted: boolean[];
  /** How many trees have been felled in the run (a count only: saplings come from the market). */
  treesFelled: number;
  /**
   * The contracts held (contracts.ts), oldest first: each one's id and the
   * shift it was taken on. At most the best camp's level of them.
   */
  contracts: FrontierHeldContract[];
  /** How many contracts of each tier have been delivered: [tier 1, tier 2, tier 3]. */
  contractsDone: number[];
  /**
   * True while the market is open: from the night that starts a market day
   * until the player closes it (action closeMarket), before the day's taps.
   * Only then can the player trade or take a contract (market.ts).
   */
  marketOpen: boolean;
  /** What the hazards have done to the world (docs/plans/hazards.md). */
  hazards: FrontierHazards;
  /** The one-square buildings (saw houses, sugar shacks; buildings.ts), in the order built. */
  buildings: FrontierBuilding[];
  /** True where a mushroom stands, row by row (mushrooms.ts). */
  mushrooms: boolean[];
  /** Nights until a mushroom comes up on each square, row by row; -1 where none is coming (mushrooms.ts). */
  mushroomIn: number[];
  /** The shift being played: 1 is the first. */
  shift: number;
  /** Taps left in this shift (src/data/frontier.ts, FRONTIER_SHIFT.taps a shift). */
  tapsLeft: number;
  /** The crew's health: 0 loses the run. */
  health: number;
  /**
   * 'active' while the run goes on; 'lost' when the crew's health reached 0;
   * 'closed' when the player closed the mine; 'finished' when the last
   * shift of the run (FRONTIER_RUN.shifts) ended.
   */
  status: FrontierStatus;
}

/** A contract held: which one (FRONTIER_CONTRACTS), and the shift it was taken on. */
export interface FrontierHeldContract {
  id: string;
  takenOn: number;
}

/** How a run stands: going on, lost, ended by closing the mine, or played to its last shift. */
export type FrontierStatus = 'active' | 'lost' | 'closed' | 'finished';

/**
 * The hazards' marks on the world (docs/plans/hazards.md). Rain (section 1)
 * changes only the cube, so it has none here.
 */
export interface FrontierHazards {
  /** True where a square is flooded (water.ts; section 2), row by row. */
  flooded: boolean[];
  /** Pumps set on flooded squares, in the order they were set (water.ts). */
  pumps: FrontierPump[];
  /** True where a square is burning (fire.ts; section 3), row by row. */
  fires: boolean[];
  /** The dragons on the map (dragons.ts; section 4). */
  dragons: FrontierDragon[];
  /** The id the next dragon will get. */
  nextDragonId: number;
}

/** A dragon, on square (x, y), flying along (dx, dy). */
export interface FrontierDragon {
  /** A number that names the dragon; new dragons get the next one. */
  id: number;
  x: number;
  y: number;
  /** Its heading: -1, 0 or 1 each way, not both 0. It flies along it in the day (dragons.ts). */
  dx: number;
  dy: number;
  /** Mining taps left before it flies on in the day (FRONTIER_DRAGON.restMines). */
  restMines: number;
}

/** A pump set on a flooded square. */
export interface FrontierPump {
  x: number;
  y: number;
}

/** No hazard marks, for a world of `squares` squares. */
export function noHazards(squares: number): FrontierHazards {
  return {
    flooded: new Array<boolean>(squares).fill(false),
    pumps: [],
    fires: new Array<boolean>(squares).fill(false),
    dragons: [],
    nextDragonId: 1,
  };
}
