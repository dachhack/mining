// Shapes of the data tables in this folder.
//
// For a Python reader: an `interface` is like a TypedDict or a dataclass with
// no methods. It only describes the shape of a plain object and disappears at
// run time.
//
// Ids (block ids, item ids, recipe ids, ...) are plain strings here on purpose.
// That lets a test build a deliberately broken table (a recipe naming an item
// that does not exist) and check that `validateData` reports it.

/** A number of one kind of item, e.g. "2 timber". */
export interface ItemStack {
  item: string;
  count: number;
}

/** A position in the cube. `z = 0` is the top layer; "down" is increasing `z`. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The cube's dimensions, in cells along each axis. */
export interface CubeSize {
  x: number;
  y: number;
  z: number;
}

/** One depth band (design doc 3.1). `firstLayer` and `lastLayer` are inclusive. */
export interface DepthBand {
  id: string;
  firstLayer: number;
  lastLayer: number;
}

export interface WorldData {
  size: CubeSize;
  /** The `z` of the open-air layer the avatar starts on (0005 item 2). */
  surfaceZ: number;
  startPosition: Vec3;
  depthBands: DepthBand[];
}

/** One block type (design doc 3.2). */
export interface BlockDef {
  /** The number stored in the cube's typed array for this block. 0 to 255. */
  code: number;
  name: string;
  /** Solid blocks hold the avatar up and stop light. Air is the only non-solid block. */
  solid: boolean;
  /** AP to mine it. `null` means it cannot be mined (air, bedrock). */
  mineCost: number | null;
  /** AP to mine it when the avatar has a drill. `null` means the drill makes no difference. */
  mineCostWithDrill: number | null;
  /** Items the block gives when mined. Empty for none. */
  yields: ItemStack[];
}

/** One kind of carried item. Fuel and lamp oil are gauges, not items (0005 item 18). */
export interface ItemDef {
  name: string;
  weight: number;
}

/** Something placed in a cell that is not a block: a ladder, a torch, a support. */
export interface StructureDef {
  /** The number stored in the cube's structure array. 0 means "nothing here". */
  code: number;
  name: string;
  /** The item that is used up when this structure is placed. */
  placedFromItem: string;
}

/**
 * What a recipe makes: either carried items, or an amount added to a gauge.
 *
 * For a Python reader: this is a "tagged union". The `kind` field says which
 * of the two shapes the object has, and TypeScript checks that code looks at
 * `kind` before touching the fields that only one shape has.
 */
export type RecipeOutput =
  { kind: 'item'; item: string; count: number } | { kind: 'gauge'; gauge: string; amount: number };

/** One field recipe (design doc 7.1). */
export interface RecipeDef {
  id: string;
  name: string;
  inputs: ItemStack[];
  output: RecipeOutput;
}

export interface AvatarData {
  startHealth: number;
  carryCapacity: number;
  /** Light radius while there is lamp oil (design doc 5.1). */
  lightRadiusWithOil: number;
  /** Light radius once lamp oil has run out. */
  lightRadiusWithoutOil: number;
  /** Light radius of a placed torch (0005 item 13). */
  torchLightRadius: number;
  /** A fall of up to this many blocks does no damage (design doc 5.2). */
  freeFallBlocks: number;
  /** Damage for each block fallen beyond `freeFallBlocks`. */
  fallDamagePerBlock: number;
  /** A fall of this many blocks or more is fatal. */
  fatalFallBlocks: number;
  /** The longest drop the player may choose to walk off (0005 item 7). */
  maxChosenDropBlocks: number;
}

export interface ShiftData {
  /** The number of the first shift of a run. */
  firstShiftNumber: number;
  apPerShift: number;
  /** Fuel consumed at each upkeep (design doc 4). */
  fuelPerShift: number;
  /** Each time the banked-AP counter reaches this, it drops by this much... */
  bankedApPerRefund: number;
  /** ...and this much fuel is refunded (0005 item 20). */
  fuelPerRefund: number;
  /** The lamp burns oil once every this many shifts (0005 item 15). */
  lampOilBurnEveryShifts: number;
  lampOilPerBurn: number;
}

/** AP cost of each action whose cost does not depend on a block (design doc 4.1). */
export interface ActionCostData {
  move: number;
  placeLadder: number;
  placeTorch: number;
  craft: number;
  pickUp: number;
  drop: number;
  leave: number;
}

/** A starting kit (0005 item 22). */
export interface LoadoutDef {
  name: string;
  fuel: number;
  lampOil: number;
  items: ItemStack[];
}

/** Everything in `src/data`, gathered so that it can be validated in one go. */
export interface GameData {
  world: WorldData;
  blocks: Record<string, BlockDef>;
  items: Record<string, ItemDef>;
  structures: Record<string, StructureDef>;
  /** The names of the gauges a recipe may fill. */
  gauges: string[];
  recipes: RecipeDef[];
  avatar: AvatarData;
  shift: ShiftData;
  actionCosts: ActionCostData;
  loadouts: Record<string, LoadoutDef>;
  defaultLoadoutId: string;
  /** Contract ids `createRun` accepts. Only the placeholder `none` until M4. */
  contractIds: string[];
}
