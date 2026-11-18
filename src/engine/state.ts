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

/** Bumped whenever the shape of GameState changes, so old saves can be told apart. */
export const STATE_VERSION = 3;

/** Some loose items lying in a cell. */
export interface LooseItems {
  pos: Vec3;
  item: string;
  count: number;
}

/** Whether the run is still going, and if not, how it ended. */
export type RunStatus =
  { kind: 'active' } | { kind: 'ended'; outcome: RunOutcome; cause: RunEndCause };

export interface Avatar {
  pos: Vec3;
  health: number;
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
  /** Fluid level of each cell. Unused until M2; always 0 in M1. */
  fluid: Uint8Array;
  /** Gas level of each cell. Unused until M2; always 0 in M1. */
  gas: Uint8Array;
  /** Structure code of each cell (see src/data/structures.ts). 0 is none. */
  structures: Uint8Array;
  /**
   * 1 if the player has seen mineral traces on the cell's block, otherwise 0
   * (decision note 0011). Set by `updateMineralTraces` in tells.ts and never
   * cleared, so what was seen stays on the map like `revealed`. Read it
   * through `showsMineralTraces`, which also checks the rock is still there.
   */
  tracesSeen: Uint8Array;

  avatar: Avatar;
  /** Action points left in this shift. */
  ap: number;
  fuel: number;
  lampOil: number;
  /** The number of the current shift. */
  shift: number;

  /**
   * What the avatar carries: item id -> count. An item that is not carried
   * may be missing or may be present with a count of 0; both mean the same.
   * `Record<string, number>` is TypeScript for "a dict from str to number".
   *
   * The order of the keys is the order items were first added, and it is NOT
   * kept by a save and load. So rule code must never loop over this dict
   * directly (`Object.keys`, `for ... in`): use `inventoryEntries(state)`,
   * which always gives the same order.
   */
  inventory: Record<string, number>;
  /**
   * Items lying in cells. Always in canonical form: at most one entry for
   * each cell and item, no entry with a count of 0, and sorted by z, then y,
   * then x, then item id. Change it only through `addLooseItems` and
   * `removeLooseItems`, which keep it that way; then looping over it gives
   * the same order before and after a save and load.
   */
  looseItems: LooseItems[];

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

/** True if `pos` is open space the avatar, light and loose items can be in. */
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

// ---------------------------------------------------------------------------
// Changing the cube. Each throws if `pos` is outside the grid.
// ---------------------------------------------------------------------------

export function setBlock(state: GameState, pos: Vec3, blockCode: number): void {
  state.blocks[cellIndex(state.size, pos)] = blockCode;
}

export function setStructure(state: GameState, pos: Vec3, structureCode: number): void {
  state.structures[cellIndex(state.size, pos)] = structureCode;
}

export function setRevealed(state: GameState, pos: Vec3, revealed: boolean): void {
  state.revealed[cellIndex(state.size, pos)] = revealed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Inventory bookkeeping. These only count; the carry limit is a rule and
// lives in inventory.ts.
// ---------------------------------------------------------------------------

/** How many of `item` the avatar carries. */
export function countItem(state: GameState, item: string): number {
  return state.inventory[item] ?? 0; // `??` means "or, if missing"
}

/** Put `count` of `item` into the inventory. Does not check the carry limit. */
export function addItem(state: GameState, item: string, count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Cannot add ${count} of "${item}"`);
  }
  state.inventory[item] = countItem(state, item) + count;
}

/** Take `count` of `item` out of the inventory. Throws if there are not enough. */
export function removeItem(state: GameState, item: string, count: number): void {
  const have = countItem(state, item);
  if (!Number.isInteger(count) || count < 0 || count > have) {
    throw new Error(`Cannot remove ${count} of "${item}": the avatar carries ${have}`);
  }
  state.inventory[item] = have - count;
}

/** Order strings the same way everywhere (plain code-unit order, no locale). */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * What the avatar carries, as a list sorted by item id, without the items it
 * has none of. This is the one way rule code should walk the inventory: the
 * order is the same for any two states with the same hash, which the key
 * order of `state.inventory` is not.
 */
export function inventoryEntries(state: GameState): ItemStack[] {
  const entries: ItemStack[] = [];
  for (const item of Object.keys(state.inventory).sort(compareStrings)) {
    const count = countItem(state, item);
    if (count !== 0) {
      entries.push({ item, count });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Loose items. `state.looseItems` is kept in canonical form (see GameState);
// these are the only functions that should change it.
// ---------------------------------------------------------------------------

/** Sort order of loose items: by z, then y, then x, then item id. */
export function compareLooseItems(a: LooseItems, b: LooseItems): number {
  return (
    a.pos.z - b.pos.z || a.pos.y - b.pos.y || a.pos.x - b.pos.x || compareStrings(a.item, b.item)
  );
}

/**
 * A canonical copy of a list of loose items: entries for the same cell and
 * item are merged into one, empty entries are dropped, and the result is
 * sorted. `serialise`, `deserialise` and the test helper use it; rule code
 * should not need to.
 */
export function canonicalLooseItems(list: LooseItems[]): LooseItems[] {
  const sorted = list
    .filter((loose) => loose.count !== 0)
    .map((loose) => ({ pos: { ...loose.pos }, item: loose.item, count: loose.count }))
    .sort(compareLooseItems);
  const merged: LooseItems[] = [];
  for (const loose of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && compareLooseItems(last, loose) === 0) {
      last.count += loose.count;
    } else {
      merged.push(loose);
    }
  }
  return merged;
}

/** The loose items lying in the cell `pos`, sorted by item id. Copies, safe to keep. */
export function looseItemsAt(state: GameState, pos: Vec3): ItemStack[] {
  return state.looseItems
    .filter((loose) => samePosition(loose.pos, pos))
    .map((loose) => ({ item: loose.item, count: loose.count }));
}

/**
 * Put `count` loose `item` in the cell `pos`, adding to a pile of the same
 * item that is already there. `pos` must be in the grid or on the surface.
 */
export function addLooseItems(state: GameState, pos: Vec3, item: string, count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Cannot leave ${count} of "${item}" in a cell`);
  }
  if (!inGrid(state.size, pos) && !isSurface(state.size, pos)) {
    throw new Error(`(${pos.x}, ${pos.y}, ${pos.z}) is outside the cube and its surface`);
  }
  state.looseItems.push({ pos: { x: pos.x, y: pos.y, z: pos.z }, item, count });
  state.looseItems = canonicalLooseItems(state.looseItems);
}

/**
 * Take `count` loose `item` out of the cell `pos`. Throws if the cell does
 * not hold that many. A pile that reaches 0 is removed from the list.
 */
export function removeLooseItems(state: GameState, pos: Vec3, item: string, count: number): void {
  const pile = state.looseItems.find(
    (loose) => loose.item === item && samePosition(loose.pos, pos),
  );
  const have = pile === undefined ? 0 : pile.count;
  if (pile === undefined || !Number.isInteger(count) || count < 0 || count > have) {
    throw new Error(
      `Cannot take ${count} of "${item}" from (${pos.x}, ${pos.y}, ${pos.z}): it holds ${have}`,
    );
  }
  pile.count -= count;
  state.looseItems = canonicalLooseItems(state.looseItems);
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
 * nothing carried, every gauge at 0, the avatar at (0, 0) on the surface.
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
    fluid: new Uint8Array(cells),
    gas: new Uint8Array(cells),
    structures: new Uint8Array(cells),
    tracesSeen: new Uint8Array(cells),
    avatar: { pos: { x: 0, y: 0, z: WORLD.surfaceZ }, health: 0 },
    ap: 0,
    fuel: 0,
    lampOil: 0,
    shift: 0,
    inventory: {},
    looseItems: [],
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
    fluid: state.fluid.slice(),
    gas: state.gas.slice(),
    structures: state.structures.slice(),
    tracesSeen: state.tracesSeen.slice(),
    avatar: { pos: { ...state.avatar.pos }, health: state.avatar.health },
    ap: state.ap,
    fuel: state.fuel,
    lampOil: state.lampOil,
    shift: state.shift,
    inventory: { ...state.inventory },
    looseItems: state.looseItems.map((loose) => ({
      pos: { ...loose.pos },
      item: loose.item,
      count: loose.count,
    })),
    status: { ...state.status },
  };
}
