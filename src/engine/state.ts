// The game state: one plain object that holds everything about a run.
//
// "Plain" means no classes and no methods, only numbers, strings, nested
// objects, arrays and typed arrays. That is what makes it easy to copy,
// to save (see serialise.ts) and to hash (see hash.ts).
//
// The functions below are the only place that knows how the cube is laid out
// in memory. Rule modules should use them rather than index the arrays
// themselves.

import { BLOCKS, NO_STRUCTURE, WORLD, blockDefByCode } from '../data';
import type { BlockDef, CubeSize, ItemStack, Vec3 } from '../data';
import type { GameEvent, RunEndCause, RunOutcome } from './events';
import { createRng } from './rng';
import type { RngState } from './rng';

/**
 * Bumped whenever the shape of GameState changes, so old saves can be told
 * apart. 11: pit walls slump (issue #94): a structure on a square is stored
 * in the cell of the square's top block, and a crack belongs to a top block
 * and counts down by the slump rule; a version-10 save could hold either
 * somewhere else.
 * 10: carrying is gone (issue #92): `inventory` is now `stockpile`,
 * and `looseItems` and each camp's `stash` are removed. A version-9 save has
 * the old fields, so it is not read.
 * 9: the avatar is gone (issue #90, crew health): `crew` replaces
 * `avatar`, air is removed, and `worked` is new, so a version-8 save is not
 * read. 8: `lampOil` is gone with light (issue #89); a version-7 save holds
 * it, and may hold torches or safety lamps.
 * 7: the avatar has no position (issue #86, mine by square).
 */
export const STATE_VERSION = 11;

/** Whether the run is still going, and if not, how it ended. */
export type RunStatus =
  { kind: 'active' } | { kind: 'ended'; outcome: RunOutcome; cause: RunEndCause };

/**
 * The crew (design doc v0.2 section 5; issue #90). It is abstract: it has no
 * position, does not walk and cannot be trapped. Where it worked this shift
 * is `GameState.worked`.
 */
export interface Crew {
  /** Crew health. Starts at `CREW.startHealth`; the run is lost at 0. */
  health: number;
  /**
   * True from the moment the crew chooses to rest at a camp until step (e)
   * of the cube phase that ends that shift, which applies the rest and clears
   * the flag (0014 items 2 and 27).
   */
  resting: boolean;
}

/** The two things that go off in step (c) of a cube phase (0014 items 15 and 17). */
export type ArmedKind = 'unstableOre' | 'explosive';

/** An armed unstable-ore block, or a placed explosive, waiting to go off. */
export interface ArmedCharge {
  pos: Vec3;
  kind: ArmedKind;
}

/** An active camp (design doc 8; 0014 items 26 to 30). */
export interface Camp {
  /**
   * The cell the avatar stood in when it founded the camp: the middle of the
   * lower of the camp's two layers. `campCells` in camps.ts lists all 18.
   */
  pos: Vec3;
  /** The number of the shift the camp was founded in; upkeep counts from it. */
  foundedShift: number;
}

export interface GameState {
  version: number;
  seed: number;
  contractId: string;
  loadoutId: string;
  /** The random number generator's state. See rng.ts. */
  rng: RngState;

  /**
   * The cube's dimensions. They are in the state, not read from `src/data`, so
   * that tests can build small cubes (say 5 x 5 x 5).
   */
  size: CubeSize;

  // The cube. Each of these is a `Uint8Array`: a fixed-length array of whole
  // numbers 0 to 255, like Python's `bytearray`. Each has one entry per cell,
  // `size.x * size.y * size.z` in all, and `cellIndex` says which entry
  // belongs to which cell.
  /** Block code of each cell (see `BLOCKS` in src/data/blocks.ts). 0 is open space. */
  blocks: Uint8Array;
  /** 1 if the player has seen what the cell holds, otherwise 0. */
  revealed: Uint8Array;
  /**
   * Units of water in each cell. 1 in each cell of a generated pocket; the
   * open cell above a square's top block holds what stands on the square,
   * which can be more (breach.ts). Read it with `waterAt`.
   */
  water: Uint8Array;
  /** Units of lava in each cell, stored like water. Read it with `lavaAt`. */
  lava: Uint8Array;
  /** 1 if the cell is a lava source, which never runs dry (0014 item 16), otherwise 0. */
  lavaSource: Uint8Array;
  /** Units of gas in each cell (0014 item 13). Read it with `gasAt`. */
  gas: Uint8Array;
  /**
   * Cracks (design doc 6.1). 0 means the block is not cracked; any other
   * value is the countdown the player is shown on the block (1 = it falls in
   * the coming cube phase), which is the stored crack timer plus 1. Only a
   * square's top block is ever cracked. Use `crackTimerAt`, `setCrackTimer`
   * and `clearCrack`, which hide the "plus 1". Whether a countdown is running
   * is never stored: it runs while the square is unstable (slump.ts).
   */
  cracks: Uint8Array;
  /**
   * Structure code of each cell (see src/data/structures.ts). 0 is none. A
   * structure on a square is stored in the cell of the square's top block:
   * read it with `structureOnSquare` (heightmap.ts).
   */
  structures: Uint8Array;
  /**
   * 1 if the player has seen mineral traces on the cell's block, otherwise 0
   * (decision note 0012). Set by `updateMineralTraces` in tells.ts and never
   * cleared, so what was seen stays on the map like `revealed`. Read it
   * through `showsMineralTraces`, which also checks the rock is still there.
   */
  tracesSeen: Uint8Array;

  // The surface (issue #70; decision note 0020). Each of these has one entry
  // per surface cell, that is per column of the cube: `size.x * size.y` in
  // all. Read and change them only through src/engine/surface/state.ts.
  /** The kind of each surface cell (`SURFACE.kinds` in src/data/surface.ts). 0 is meadow. */
  surface: Uint8Array;
  /**
   * For a stump: how many shifts its count of `SURFACE.regrowShifts` has
   * reached. 0 everywhere else.
   */
  stumpAge: Uint8Array;
  /**
   * The worked squares (design doc 5.2): 1 if the crew mined, cut or built on
   * the square in the shift that is going on, otherwise 0. One entry per
   * square, like `surface`. A hazard hurts the crew only on these squares.
   * Emptied at the end of every cube phase. Read and change it only through
   * src/engine/crew.ts.
   */
  worked: Uint8Array;

  crew: Crew;
  /** Action points left in this shift. */
  ap: number;
  fuel: number;
  /** The number of the current shift. */
  shift: number;

  /**
   * The stockpile (design doc 4.1): everything the crew has mined, cut or
   * crafted and not yet used, item id -> count. It has no limit: there is no
   * carry capacity and no item weight (issue #92). An item the stockpile has
   * none of may be missing or may be present with a count of 0; both mean the
   * same. `Record<string, number>` is TypeScript for "a dict from str to
   * number".
   *
   * The order of the keys is the order items were first added, and it is NOT
   * kept by a save and load. So rule code must never loop over this dict
   * directly (`Object.keys`, `for ... in`): use `stockpileEntries(state)`,
   * which always gives the same order.
   */
  stockpile: Record<string, number>;

  /**
   * Armed unstable ore and placed explosives: everything that goes off in
   * step (c) of the coming cube phase. Always in canonical form: at most
   * one entry for a cell, sorted by z, then y, then x. Change it only through
   * `armCharge` and `disarmCharge`. A placed explosive is also a structure in
   * its cell; `destroyStructure` (destroy.ts) keeps the two in step.
   */
  armed: ArmedCharge[];
  /**
   * The active camps, sorted by z, then y, then x of `pos`, then by the shift
   * they were founded. A destroyed or decommissioned camp is removed. Change
   * the list only through `addCamp` and `removeCamp`.
   */
  camps: Camp[];

  status: RunStatus;
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

/** How many cells a cube of this size has. */
export function cellCount(size: CubeSize): number {
  return size.x * size.y * size.z;
}

/** True if `pos` is one of the stored cells of the cube. */
export function inGrid(size: CubeSize, pos: Vec3): boolean {
  return (
    pos.x >= 0 && pos.x < size.x && pos.y >= 0 && pos.y < size.y && pos.z >= 0 && pos.z < size.z
  );
}

/**
 * True if `pos` is on the surface: the layer of open air directly above the
 * top of the cube, within the cube's footprint (0005 item 2).
 */
export function isSurface(size: CubeSize, pos: Vec3): boolean {
  return pos.z === WORLD.surfaceZ && pos.x >= 0 && pos.x < size.x && pos.y >= 0 && pos.y < size.y;
}

/**
 * Where cell `pos` lives in the cube's arrays. Cells are stored layer by
 * layer from the top, each layer row by row. Throws if `pos` is outside the
 * grid, so a bad coordinate cannot silently read another cell.
 */
export function cellIndex(size: CubeSize, pos: Vec3): number {
  if (!inGrid(size, pos)) {
    throw new Error(`(${pos.x}, ${pos.y}, ${pos.z}) is outside the cube`);
  }
  return pos.x + size.x * (pos.y + size.y * pos.z);
}

/** The reverse of `cellIndex`: the cell stored at `index`. */
export function cellPosition(size: CubeSize, index: number): Vec3 {
  if (!Number.isInteger(index) || index < 0 || index >= cellCount(size)) {
    throw new Error(`Cell index ${index} is outside the cube`);
  }
  const x = index % size.x;
  const y = Math.floor(index / size.x) % size.y;
  const z = Math.floor(index / (size.x * size.y));
  return { x, y, z };
}

export function samePosition(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

// ---------------------------------------------------------------------------
// Reading the cube
// ---------------------------------------------------------------------------

/**
 * The block code at `pos`, for any position at all:
 *
 * - inside the grid: the stored block;
 * - on the surface layer (`z = -1`, within the footprint): open air;
 * - anywhere else (beyond a side, below the bottom, above or beside the
 *   surface layer): bedrock, which is solid and cannot be mined (0005 item 1).
 *
 * So rule code never needs its own edge-of-the-world checks.
 */
export function blockAt(state: GameState, pos: Vec3): number {
  if (inGrid(state.size, pos)) {
    // The `as number` tells TypeScript the entry exists; `inGrid` just checked.
    return state.blocks[cellIndex(state.size, pos)] as number;
  }
  if (isSurface(state.size, pos)) {
    return BLOCKS.air.code;
  }
  return BLOCKS.bedrock.code;
}

/** The definition (name, mine cost, yield, ...) of the block at `pos`. */
export function blockDefAt(state: GameState, pos: Vec3): BlockDef {
  return blockDefByCode(blockAt(state, pos));
}

/** True if the block at `pos` is solid. Bedrock is; open space is not. */
export function isSolid(state: GameState, pos: Vec3): boolean {
  return blockDefAt(state, pos).solid;
}

/** True if `pos` is open space: not a solid block. */
export function isOpen(state: GameState, pos: Vec3): boolean {
  return !isSolid(state, pos);
}

/**
 * The structure code at `pos`, or `NO_STRUCTURE`. Structures exist only
 * inside the grid: the surface layer and the bedrock never hold one.
 */
export function structureAt(state: GameState, pos: Vec3): number {
  if (!inGrid(state.size, pos)) {
    return NO_STRUCTURE;
  }
  return state.structures[cellIndex(state.size, pos)] as number;
}

/**
 * True if the player knows what is at `pos`. Everything outside the grid
 * (the surface air, the bedrock wall) counts as known.
 */
export function isRevealed(state: GameState, pos: Vec3): boolean {
  if (!inGrid(state.size, pos)) {
    return true;
  }
  return state.revealed[cellIndex(state.size, pos)] === 1;
}

// What a cell holds besides its block. Like `structureAt`, each answers for
// any position: outside the grid (the surface air, the bedrock) there is never
// any water, lava, gas or crack. These read the TRUE cube. Code that decides
// what the player is shown or offered must go through known.ts instead.

/** Units of water in the cell `pos`. */
export function waterAt(state: GameState, pos: Vec3): number {
  if (!inGrid(state.size, pos)) {
    return 0;
  }
  return state.water[cellIndex(state.size, pos)] as number;
}

/** Units of lava in the cell `pos`. */
export function lavaAt(state: GameState, pos: Vec3): number {
  if (!inGrid(state.size, pos)) {
    return 0;
  }
  return state.lava[cellIndex(state.size, pos)] as number;
}

/** True if the cell `pos` is a lava source (0014 item 16). */
export function isLavaSource(state: GameState, pos: Vec3): boolean {
  if (!inGrid(state.size, pos)) {
    return false;
  }
  return state.lavaSource[cellIndex(state.size, pos)] === 1;
}

/** Units of gas in the cell `pos`. */
export function gasAt(state: GameState, pos: Vec3): number {
  if (!inGrid(state.size, pos)) {
    return 0;
  }
  return state.gas[cellIndex(state.size, pos)] as number;
}

/**
 * The stored crack timer of the block at `pos`, or `null` if it is not
 * cracked (0014 item 7). A stored 0 means "falls in the coming cube phase, if
 * its countdown is running"; the number shown to the player is this plus 1.
 */
export function crackTimerAt(state: GameState, pos: Vec3): number | null {
  if (!inGrid(state.size, pos)) {
    return null;
  }
  const stored = state.cracks[cellIndex(state.size, pos)] as number;
  return stored === 0 ? null : stored - 1;
}

// ---------------------------------------------------------------------------
// Changing the cube. Each throws if `pos` is outside the grid.
// ---------------------------------------------------------------------------

/**
 * Put another block (or open space) in the cell `pos`.
 *
 * A crack belongs to the block that has it, and so does the arming of an
 * unstable-ore block. So whatever replaces a block, the cell's crack is
 * cleared and armed unstable ore there is forgotten: a mined block leaves no
 * crack behind for the rubble that may land in its place, and armed ore that
 * is mined out does not go off (0014 item 17). Setting the block a cell
 * already has changes nothing.
 */
export function setBlock(state: GameState, pos: Vec3, blockCode: number): void {
  const index = cellIndex(state.size, pos);
  if (state.blocks[index] === blockCode) {
    return;
  }
  state.blocks[index] = blockCode;
  state.cracks[index] = 0;
  if (armedAt(state, pos) === 'unstableOre') {
    disarmCharge(state, pos);
  }
}

export function setStructure(state: GameState, pos: Vec3, structureCode: number): void {
  state.structures[cellIndex(state.size, pos)] = structureCode;
}

export function setRevealed(state: GameState, pos: Vec3, revealed: boolean): void {
  state.revealed[cellIndex(state.size, pos)] = revealed ? 1 : 0;
}

/** A cell array holds one byte per cell: whole numbers 0 to 255. */
function requireByte(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${what} must be a whole number 0 to 255, but is ${value}`);
  }
}

export function setWater(state: GameState, pos: Vec3, units: number): void {
  requireByte(units, 'Water units');
  state.water[cellIndex(state.size, pos)] = units;
}

/**
 * Set the lava in the cell `pos`. `source` says whether the cell is a lava
 * source; a cell with no lava is never one, so `setLava(state, pos, 0)` also
 * clears the flag.
 */
export function setLava(state: GameState, pos: Vec3, units: number, source = false): void {
  requireByte(units, 'Lava units');
  const index = cellIndex(state.size, pos);
  state.lava[index] = units;
  state.lavaSource[index] = units > 0 && source ? 1 : 0;
}

export function setGas(state: GameState, pos: Vec3, units: number): void {
  requireByte(units, 'Gas units');
  state.gas[cellIndex(state.size, pos)] = units;
}

/** Crack the block at `pos`, or change its stored timer (0014 item 7). */
export function setCrackTimer(state: GameState, pos: Vec3, timer: number): void {
  // 0 to 254: the cell stores the timer plus 1, and 0 there means "no crack".
  if (!Number.isInteger(timer) || timer < 0 || timer > 254) {
    throw new Error(`A crack timer must be a whole number 0 to 254, but is ${timer}`);
  }
  state.cracks[cellIndex(state.size, pos)] = timer + 1;
}

/** Remove the crack from the cell `pos`, for example when its block falls or is mined. */
export function clearCrack(state: GameState, pos: Vec3): void {
  state.cracks[cellIndex(state.size, pos)] = 0;
}

// ---------------------------------------------------------------------------
// Stockpile bookkeeping. The stockpile has no limit (design doc 4.1), so
// these only count.
// ---------------------------------------------------------------------------

/** How many of `item` are in the stockpile. */
export function countItem(state: GameState, item: string): number {
  return state.stockpile[item] ?? 0; // `??` means "or, if missing"
}

/** Put `count` of `item` into the stockpile. */
export function addItem(state: GameState, item: string, count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Cannot add ${count} of "${item}"`);
  }
  state.stockpile[item] = countItem(state, item) + count;
}

/** Take `count` of `item` out of the stockpile. Throws if there are not enough. */
export function removeItem(state: GameState, item: string, count: number): void {
  const have = countItem(state, item);
  if (!Number.isInteger(count) || count < 0 || count > have) {
    throw new Error(`Cannot remove ${count} of "${item}": the stockpile holds ${have}`);
  }
  state.stockpile[item] = have - count;
}

/** Order strings the same way everywhere (plain code-unit order, no locale). */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * What the stockpile holds, as a list sorted by item id, without the items
 * it has none of. This is the one way rule code should walk the stockpile:
 * the order is the same for any two states with the same hash, which the key
 * order of `state.stockpile` is not.
 */
export function stockpileEntries(state: GameState): ItemStack[] {
  const entries: ItemStack[] = [];
  for (const item of Object.keys(state.stockpile).sort(compareStrings)) {
    const count = countItem(state, item);
    if (count !== 0) {
      entries.push({ item, count });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Armed charges and camps. Both lists are kept in canonical form (see
// GameState); these are the only functions that should change them.
// ---------------------------------------------------------------------------

/** Sort order of positions: by z, then y, then x. */
export function comparePositions(a: Vec3, b: Vec3): number {
  return a.z - b.z || a.y - b.y || a.x - b.x;
}

/** A canonical copy of a list of armed charges: sorted, one entry for a cell. */
export function canonicalArmed(list: ArmedCharge[]): ArmedCharge[] {
  const sorted = list
    .map((charge) => ({ pos: { ...charge.pos }, kind: charge.kind }))
    .sort((a, b) => comparePositions(a.pos, b.pos));
  for (let i = 1; i < sorted.length; i += 1) {
    // `as ArmedCharge`: the indexes are inside the list.
    const before = (sorted[i - 1] as ArmedCharge).pos;
    const here = (sorted[i] as ArmedCharge).pos;
    if (samePosition(before, here)) {
      throw new Error(`Two armed charges in the cell (${here.x}, ${here.y}, ${here.z})`);
    }
  }
  return sorted;
}

/** The kind of charge armed in the cell `pos`, or `null` if there is none. */
export function armedAt(state: GameState, pos: Vec3): ArmedKind | null {
  const charge = state.armed.find((entry) => samePosition(entry.pos, pos));
  return charge === undefined ? null : charge.kind;
}

/**
 * Record that the unstable ore or the explosive in the cell `pos` goes off in
 * step (c) of the coming cube phase. Does nothing if the cell is already
 * armed. `pos` must be inside the grid.
 */
export function armCharge(state: GameState, pos: Vec3, kind: ArmedKind): void {
  if (!inGrid(state.size, pos)) {
    throw new Error(`(${pos.x}, ${pos.y}, ${pos.z}) is outside the cube`);
  }
  if (armedAt(state, pos) !== null) {
    return;
  }
  state.armed.push({ pos: { x: pos.x, y: pos.y, z: pos.z }, kind });
  state.armed = canonicalArmed(state.armed);
}

/** Forget the armed charge in the cell `pos`, if there is one. */
export function disarmCharge(state: GameState, pos: Vec3): void {
  state.armed = state.armed.filter((entry) => !samePosition(entry.pos, pos));
}

/** Sort order of camps: by position, then by the shift they were founded in. */
export function compareCamps(a: Camp, b: Camp): number {
  return comparePositions(a.pos, b.pos) || a.foundedShift - b.foundedShift;
}

/** An independent copy of a camp. */
export function cloneCamp(camp: Camp): Camp {
  return { pos: { ...camp.pos }, foundedShift: camp.foundedShift };
}

/** A canonical copy of a list of camps: sorted. */
export function canonicalCamps(list: Camp[]): Camp[] {
  return list.map(cloneCamp).sort(compareCamps);
}

/**
 * Add an active camp founded at `pos` in the current shift, and return it.
 * `pos` must be inside the grid.
 */
export function addCamp(state: GameState, pos: Vec3): Camp {
  if (!inGrid(state.size, pos)) {
    throw new Error(`(${pos.x}, ${pos.y}, ${pos.z}) is outside the cube`);
  }
  const camp: Camp = {
    pos: { x: pos.x, y: pos.y, z: pos.z },
    foundedShift: state.shift,
  };
  state.camps.push(camp);
  state.camps.sort(compareCamps);
  return camp;
}

/**
 * Take `camp` (one of the objects in `state.camps`) off the list: it is no
 * longer active.
 */
export function removeCamp(state: GameState, camp: Camp): void {
  state.camps = state.camps.filter((entry) => entry !== camp);
}

// ---------------------------------------------------------------------------
// Run status
// ---------------------------------------------------------------------------

export function isRunActive(state: GameState): boolean {
  return state.status.kind === 'active';
}

/**
 * End the run and record a `runEnded` event. Does nothing if the run has
 * already ended, so the first cause is the one that is kept.
 */
export function endRun(
  state: GameState,
  outcome: RunOutcome,
  cause: RunEndCause,
  events: GameEvent[],
): void {
  if (!isRunActive(state)) {
    return;
  }
  state.status = { kind: 'ended', outcome, cause };
  events.push({ type: 'runEnded', outcome, cause });
}

// ---------------------------------------------------------------------------
// Making and copying states
// ---------------------------------------------------------------------------

/**
 * A blank state for a cube of the given size: every cell open and unrevealed,
 * the surface open meadow everywhere, an empty stockpile, every gauge at 0
 * (crew health too), no worked squares, no camps.
 * `createRun` and the test helper both start from this and fill it in.
 */
export function blankState(size: CubeSize, seed: number): GameState {
  const cells = cellCount(size);
  return {
    version: STATE_VERSION,
    seed,
    contractId: '',
    loadoutId: '',
    rng: createRng(seed),
    size: { x: size.x, y: size.y, z: size.z },
    blocks: new Uint8Array(cells),
    revealed: new Uint8Array(cells),
    water: new Uint8Array(cells),
    lava: new Uint8Array(cells),
    lavaSource: new Uint8Array(cells),
    gas: new Uint8Array(cells),
    cracks: new Uint8Array(cells),
    structures: new Uint8Array(cells),
    tracesSeen: new Uint8Array(cells),
    // Every surface cell meadow (code 0): open ground, as the whole surface
    // was before the forest. `createRun` grows the forest.
    surface: new Uint8Array(size.x * size.y),
    stumpAge: new Uint8Array(size.x * size.y),
    worked: new Uint8Array(size.x * size.y),
    crew: { health: 0, resting: false },
    ap: 0,
    fuel: 0,
    shift: 0,
    stockpile: {},
    armed: [],
    camps: [],
    status: { kind: 'active' },
  };
}

/**
 * A complete, independent copy of `state`: changing the copy never changes
 * the original. `applyAction` and `endShift` work on such a copy.
 *
 * `{ ...object }` copies an object's fields one level deep (like
 * `dict(object)` in Python), so each nested object is copied explicitly.
 */
export function cloneState(state: GameState): GameState {
  return {
    version: state.version,
    seed: state.seed,
    contractId: state.contractId,
    loadoutId: state.loadoutId,
    rng: { ...state.rng },
    size: { ...state.size },
    blocks: state.blocks.slice(),
    revealed: state.revealed.slice(),
    water: state.water.slice(),
    lava: state.lava.slice(),
    lavaSource: state.lavaSource.slice(),
    gas: state.gas.slice(),
    cracks: state.cracks.slice(),
    structures: state.structures.slice(),
    tracesSeen: state.tracesSeen.slice(),
    surface: state.surface.slice(),
    stumpAge: state.stumpAge.slice(),
    worked: state.worked.slice(),
    crew: {
      health: state.crew.health,
      resting: state.crew.resting,
    },
    ap: state.ap,
    fuel: state.fuel,
    shift: state.shift,
    stockpile: { ...state.stockpile },
    armed: state.armed.map((charge) => ({ pos: { ...charge.pos }, kind: charge.kind })),
    camps: state.camps.map(cloneCamp),
    status: { ...state.status },
  };
}
