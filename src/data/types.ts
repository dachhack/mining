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
  /** The `z` of the open-air layer above the cube (0005 item 2). */
  surfaceZ: number;
  depthBands: DepthBand[];
}

/** One block type (design doc 3.2). */
export interface BlockDef {
  /** The number stored in the cube's typed array for this block. 0 to 255. */
  code: number;
  name: string;
  /** Air is the only non-solid block. */
  solid: boolean;
  /** AP to mine it. `null` means it cannot be mined (air, bedrock). */
  mineCost: number | null;
  /** AP to mine it while the stockpile holds a drill. `null` means the drill makes no difference. */
  mineCostWithDrill: number | null;
  /** Items the block gives when mined. Empty for none. */
  yields: ItemStack[];
  /**
   * The slump limit (design doc 3.5 and 6.1): a square whose top block this
   * is slumps when its fall (how much deeper the foot of its slide path is)
   * is more than this. At least 1. `null` for open space and bedrock, which
   * never slump.
   */
  slumpLimit: number | null;
}

/**
 * One kind of item in the stockpile. Fuel is a gauge, not an item (0005 item
 * 18). An item has no weight: the stockpile has no limit (design doc 4.1).
 */
export interface ItemDef {
  name: string;
}

/** Something placed in a cell that is not a block: a support, a pump, a vent, ... */
export interface StructureDef {
  /** The number stored in the cube's structure array. 0 means "nothing here". */
  code: number;
  name: string;
  /** The item that is used up when this structure is placed. */
  placedFromItem: string;
}

/**
 * What a recipe makes: either items for the stockpile, or an amount added to a gauge.
 *
 * For a Python reader: this is a "tagged union". The `kind` field says which
 * of the two shapes the object has, and TypeScript checks that code looks at
 * `kind` before touching the fields that only one shape has.
 */
export type RecipeOutput =
  { kind: 'item'; item: string; count: number } | { kind: 'gauge'; gauge: string; amount: number };

/** One recipe: a field recipe (design doc 7.1) or a camp recipe (7.2). */
export interface RecipeDef {
  id: string;
  name: string;
  inputs: ItemStack[];
  output: RecipeOutput;
}

/** What each kind of hazard takes off crew health (design doc 5.2). See crew.ts. */
export interface CrewDamageData {
  slump: number;
  water: number;
  /** Lava on a worked square. */
  lavaOn: number;
  /** Lava on a square beside a worked square. */
  lavaBeside: number;
  gas: number;
  gasExplosion: number;
  /** A charge or unstable ore going off. */
  explosion: number;
}

/** The crew (design doc 5). See crew.ts. */
export interface CrewData {
  startHealth: number;
  damage: CrewDamageData;
}

export interface ShiftData {
  /** The number of the first shift of a run. */
  firstShiftNumber: number;
  apPerShift: number;
  /** Fuel consumed at each upkeep (design doc 4). */
  fuelPerShift: number;
}

/** AP cost of each action whose cost does not depend on a block (design doc 4.1). */
export interface ActionCostData {
  move: number;
  craft: number;
  /** "Close the mine": ending the run alive (design doc 4.1). */
  closeMine: number;
  placeSupport: number;
  placeExplosive: number;
  placePump: number;
  placeVent: number;
  /** Using sealant on a square (design doc 4.1). */
  seal: number;
  scan: number;
  /** One camp recipe (0014 item 27). */
  campCraft: number;
  decommissionCamp: number;
}

/** A starting kit (0005 item 22). */
export interface LoadoutDef {
  name: string;
  fuel: number;
  items: ItemStack[];
}

/** How likely one kind of plain rock is, at the top and at the bottom of a depth band. */
export interface RockWeight {
  /** A block id. */
  block: string;
  /** Relative weight in the band's first (highest) layer. */
  weightAtTop: number;
  /** Relative weight in the band's last (deepest) layer. Layers between are interpolated. */
  weightAtBottom: number;
}

/** One kind of ore in one depth band, and how its veins are made. */
export interface VeinDef {
  /** A block id. */
  block: string;
  /** How many veins to place for each 1000 cells of the band. */
  veinsPer1000Cells: number;
  /** The fewest blocks in a vein. */
  minSize: number;
  /** The most blocks in a vein. */
  maxSize: number;
}

/**
 * The four kinds of underground space (design doc 3.6): a cavern is empty; a
 * water, lava or gas pocket is full of what it is named after.
 */
export type SpaceKind = 'cavern' | 'water' | 'lava' | 'gas';

/** One kind of underground space in one depth band, and how many and how big. */
export interface SpaceDef {
  kind: SpaceKind;
  /** How many spaces to place for each 1000 cells of the band. */
  spacesPer1000Cells: number;
  /** The fewest cells in a space. */
  minSize: number;
  /** The most cells in a space. */
  maxSize: number;
}

/** What one depth band is made of (design doc 3.1). */
export interface BandGenerationDef {
  /** The id of a depth band in `WorldData.depthBands`. */
  bandId: string;
  /** The plain rock every cell starts as, chosen cell by cell by weight. */
  rock: RockWeight[];
  /** The ores that then replace some of that rock, in connected veins. */
  veins: VeinDef[];
  /**
   * The underground spaces then opened in the band's plain rock (design doc
   * 3.3 and 3.6). May be empty.
   */
  spaces: SpaceDef[];
}

/** Every number cube generation uses (design doc 3.1 and 3.3). */
export interface GenerationData {
  /** One entry for each depth band. */
  bands: BandGenerationDef[];
  /**
   * How many starting cells to try for one vein before giving up on it. A
   * start fails when the vein cannot reach its smallest size there.
   */
  veinPlacementTries: number;
  /** The same for one underground space. */
  spacePlacementTries: number;
}

/** The mineral-traces tell: rock near ore shows it (decision note 0012). */
export interface MineralTracesDef {
  /**
   * A rock block carries traces when an ore block lies within this many steps
   * through the grid (Manhattan distance). At least 1.
   */
  distance: number;
  /** Block ids: the ores that give traces to the rock around them. */
  sourceBlocks: string[];
  /** Block ids: the plain rock that traces show on. */
  shownOnBlocks: string[];
}

/** How near each hazard must be for a block to show its tell (0014 item 18). */
export interface HazardTellsDef {
  /** Damp stone: within this many steps of water. */
  dampStoneDistance: number;
  /** Pitted rock: within this many steps of gas. */
  pittedRockDistance: number;
  /** Warm glow: within this many steps of lava. */
  warmGlowDistance: number;
}

/** What blocks show about things hidden near them (design doc 6). */
export interface TellsData {
  mineralTraces: MineralTracesDef;
  hazards: HazardTellsDef;
}

/** Wall-slump numbers that are not per material (design doc 6.1). See hazards.ts. */
export interface SlumpData {
  /** The number a fresh crack shows: how many cube phases until the block falls. */
  crackCountdown: number;
  /** A square this many levels (or more) above a face neighbour is "steep". */
  steepStep: number;
}

export interface WaterData {
  unitsPerCell: number;
  /** Extra AP to mine a square that water stands on (design doc 4.2). */
  floodedMineExtraAp: number;
  /**
   * Water and lava move from a square to a neighbour only when the
   * neighbour's level is at least this many levels lower (design doc 6.3).
   */
  flowMinDrop: number;
  pumpUnitsPerShift: number;
  pumpReach: number;
}

export interface GasData {
  pocketUnitsPerCell: number;
  ventReach: number;
}

/** Explosions of a placed charge or of unstable ore (design doc 6.6). See hazards.ts. */
export interface ExplosionData {
  /** The blast covers every square within this many steps of the charge. */
  blastReach: number;
  /** Block ids: blocks a blast destroys only by chance (relics and keystones). */
  chanceBlocks: string[];
  /** The probability, 0 to 1, that a blast destroys one of `chanceBlocks`. */
  chanceBlockDestroyed: number;
}

export interface LavaData {
  unitsPerCell: number;
  flowEveryShifts: number;
  sourcePocketCellsOver: number;
  /** Units a lava source gives on every lava step (design doc 6.2). */
  sourceUnitsPerStep: number;
  /** Units of lava that always stay on a source square. */
  sourceKeepsUnits: number;
}

export interface ForecastData {
  /** A block id: what an unrevealed cell is taken to be by the forecast (0014 item 4). */
  unseenBlock: string;
}

/** Every hazard number (design doc 6; decision note 0014). See hazards.ts for what each means. */
export interface HazardData {
  slump: SlumpData;
  water: WaterData;
  gas: GasData;
  explosion: ExplosionData;
  lava: LavaData;
  forecast: ForecastData;
}

/** Camp numbers (design doc v0.2 section 8). See camps.ts for what each means. */
export interface CampData {
  /** An item id. */
  kitItem: string;
  halfWidth: number;
  foundMinAp: number;
  restMinAp: number;
  upkeepFuel: number;
  upkeepEveryShifts: number;
  mineDiscountAp: number;
  mineMinAp: number;
  mineDiscountSteps: number;
  mineDiscountMaxDeeper: number;
}

/** Numbers of the camp-made tools (design doc 7.2). See camps.ts for what each means. */
export interface CampToolData {
  /** Item ids. */
  drillItem: string;
  sealantItem: string;
  /** A block id: the block sealant places. */
  sealedBlock: string;
  scanChargeItem: string;
  scanChargesPerScan: number;
  scanHalfWidth: number;
  scanDepth: number;
}

/** Everything in `src/data`, gathered so that it can be validated in one go. */
export interface GameData {
  world: WorldData;
  generation: GenerationData;
  blocks: Record<string, BlockDef>;
  items: Record<string, ItemDef>;
  structures: Record<string, StructureDef>;
  /** The names of the gauges a recipe may fill. */
  gauges: string[];
  /** Field recipes (design doc 7.1). */
  recipes: RecipeDef[];
  /** Camp recipes (design doc 7.2). */
  campRecipes: RecipeDef[];
  hazards: HazardData;
  camps: CampData;
  campTools: CampToolData;
  crew: CrewData;
  tells: TellsData;
  shift: ShiftData;
  actionCosts: ActionCostData;
  loadouts: Record<string, LoadoutDef>;
  defaultLoadoutId: string;
  /** Contract ids `createRun` accepts. Only the placeholder `none` until M4. */
  contractIds: string[];
}
