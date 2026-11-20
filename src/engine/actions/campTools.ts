// The camp-made tools that are used as actions: pump, vent, sealant and
// scanner (design doc v0.2 sections 4.1, 6.3, 6.5 and 7.2; owner question 93;
// issue #104, task T13; decision note 0034).
//
// Each names a square, like a mine: there is no reach.
//
//   placePump x,y   a pump from the stockpile goes on the square. In step (b)
//                   of every cube phase it takes water off the squares near
//                   it (cube/fluids.ts).
//   placeVent x,y   a vent from the stockpile goes on the square. In step (c)
//                   it clears the gas near it (cube/gas.ts).
//   seal x,y        one sealant puts a block of sealed rock on top of the
//                   square: the square comes up 1 level, and the water, lava
//                   and gas standing on it are destroyed. A dam, or a plug
//                   for a lava source. Not at ground level, and not where it
//                   would leave the square 2 levels above a neighbour.
//   scan x,y        one scanner charge reveals the 3 blocks under the top
//                   block of the square and of the 8 squares round it.
//
// The drill is not an action: while the stockpile holds one, hard rock costs
// less to mine (actions/mine.ts).
//
// Placing a pump or a vent and sealing make the square a worked square
// (design doc 5.2); scanning does not: the doc's list does not name it.
//
// A pump and a vent are structures, stored with the square's top block like
// a support (`structureOnSquare` in heightmap.ts). So mining the square takes
// the tool with the block, a block that slumps from the square or onto it
// destroys it, and so does lava (design doc 6.1 and 6.4). Water leaves them
// alone.

import { ACTION_COSTS, BLOCKS, CAMP_TOOLS, NO_STRUCTURE, STRUCTURES } from '../../data';
import type { BlockId, StructureId, Vec3 } from '../../data';
import type { CampToolAction, PlacePumpAction, ScanAction, SealAction } from '../actionTypes';
import { contentsOn } from '../breach';
import { campAtSquare } from '../camps';
import { markWorked } from '../crew';
import type { GameEvent } from '../events';
import { SQUARE_STEPS, depthAt, isSquare, structureOnSquare, topCellOf } from '../heightmap';
import type { Square } from '../heightmap';
import { lavaOn, setLavaOn, setWaterOn } from '../standing';
import {
  blockAt,
  cellIndex,
  clearCrack,
  countItem,
  inGrid,
  isRevealed,
  removeItem,
  setBlock,
  setGas,
  setRevealed,
  setStructure,
} from '../state';
import type { GameState } from '../state';
import { hasTree, surfaceCellAbove } from '../surface/state';
import { seeMineralTracesAt } from '../tells';

// ---------------------------------------------------------------------------
// Placing a pump or a vent
// ---------------------------------------------------------------------------

/** The two tools that are placed on a square and stay there. */
export type PlacedTool = 'pump' | 'vent';

/** Why a pump or a vent cannot be placed on a square now. */
export type ToolRefusalReason =
  /** The stockpile holds none to place. */
  | 'noItem'
  /** A tree stands on the square. */
  | 'tree'
  /** The square has no block left: it shows the bedrock floor. */
  | 'bottom'
  /** The square already holds a structure. */
  | 'occupied'
  /** Lava stands on the square. */
  | 'lava'
  /** A camp stands on the square. */
  | 'camp';

/** The answer of `pumpCheck` and `ventCheck`. */
export interface ToolCheck {
  /** True if the rules let the player place the tool there (AP is not looked at). */
  allowed: boolean;
  /** Why not; `null` when `allowed` is true. */
  refusal: ToolRefusalReason | null;
  /** What placing it costs in AP; `null` when it is not allowed. */
  ap: number | null;
}

/** What placing each tool costs in AP (design doc 4.1). */
function placeCost(tool: PlacedTool): number {
  return tool === 'pump' ? ACTION_COSTS.placePump : ACTION_COSTS.placeVent;
}

/**
 * May the player place `tool` on the square (x, y)? The same rules as for a
 * support (design doc 4.1: a square holds at most one structure; nothing is
 * placed on a tree, on lava, or on a camp square), in the same order.
 *
 * Everything read here is something the player sees: the stockpile, the
 * tree, the square's depth, the structure on it, the lava standing on it and
 * the camps. The top block is not read.
 */
function toolCheck(state: GameState, tool: PlacedTool, x: number, y: number): ToolCheck {
  function refused(refusal: ToolRefusalReason): ToolCheck {
    return { allowed: false, refusal, ap: null };
  }
  // First, so that a bad square throws whatever else is true.
  const top = topCellOf(state, x, y);
  // `as StructureId`: both tool names are structure ids.
  const structure = STRUCTURES[tool as StructureId];
  if (countItem(state, structure.placedFromItem) < 1) {
    return refused('noItem');
  }
  if (hasTree(state, surfaceCellAbove({ x, y, z: 0 }))) {
    return refused('tree');
  }
  if (top === null) {
    return refused('bottom');
  }
  if (structureOnSquare(state, x, y) !== NO_STRUCTURE) {
    return refused('occupied');
  }
  if (lavaOn(state, x, y) > 0) {
    return refused('lava');
  }
  if (campAtSquare(state, x, y) !== null) {
    return refused('camp');
  }
  return { allowed: true, refusal: null, ap: placeCost(tool) };
}

/**
 * May the player place a pump on the square (x, y), and if not, why not?
 * Does not look at the AP left. Throws if (x, y) is not a square. Does not
 * change `state`.
 */
export function pumpCheck(state: GameState, x: number, y: number): ToolCheck {
  return toolCheck(state, 'pump', x, y);
}

/** Put `tool` on the square: one less in the stockpile, the structure, the event, a worked square. */
function applyPlaceTool(
  state: GameState,
  tool: PlacedTool,
  x: number,
  y: number,
  events: GameEvent[],
): void {
  const top = topCellOf(state, x, y);
  if (top === null) {
    throw new Error(`Square (${x}, ${y}) has no block to stand a ${tool} on`);
  }
  const structure = STRUCTURES[tool as StructureId];
  removeItem(state, structure.placedFromItem, 1);
  setStructure(state, top, structure.code);
  events.push({ type: 'structurePlaced', pos: top, structure: structure.code });
  markWorked(state, x, y);
}

// ---------------------------------------------------------------------------
// Sealant
// ---------------------------------------------------------------------------

/** Why a square cannot be sealed now. */
export type SealRefusalReason =
  /** The stockpile holds no sealant. */
  | 'noSealant'
  /**
   * The square is at ground level: nothing stands above it (design doc 3.1
   * and 4.1). Every square with a tree is at ground level.
   */
  | 'groundLevel'
  /** A camp stands on the square. */
  | 'camp'
  /** The square holds a structure, which the block would bury. */
  | 'occupied'
  /**
   * A face neighbour is already deeper than the square, so the sealed rock
   * would stand 2 levels above it. Only a hazard may make a step of 2
   * (design doc 4.2 and 6.1); the player's own actions never do.
   */
  | 'neighbourDeeper';

/** The answer of `sealCheck`. */
export interface SealCheck {
  allowed: boolean;
  /** Why not; `null` when `allowed` is true. */
  refusal: SealRefusalReason | null;
  /**
   * The face neighbours that are deeper than the square, in the order north,
   * east, south, west. Empty unless `refusal` is 'neighbourDeeper'.
   */
  deeperNeighbours: Square[];
  /** What sealing costs in AP; `null` when it is not allowed. */
  ap: number | null;
}

/**
 * May the player use sealant on the square (x, y), and if not, why not?
 *
 * Lava does NOT stop it: plugging a lava source is what sealant is for
 * (design doc 6.2 and 7.2). Water and gas do not stop it either. A square
 * with no block left may be sealed: the sealed rock stands on the bedrock
 * floor.
 *
 * The sealed rock raises the square by 1. That must not leave it 2 levels
 * above a neighbour, so a square with a deeper face neighbour is refused:
 * like mining under the level rule, sealing only ever leaves steps of 1.
 *
 * When more than one thing stops it, the reason given is the first of: no
 * sealant, ground level, a camp, a structure, a deeper neighbour.
 *
 * Everything read here is something the player sees: the stockpile, the
 * depths of the square and its neighbours, the structure on it and the camps. Does not look at the AP
 * left. Throws if (x, y) is not a square. Does not change `state`.
 */
export function sealCheck(state: GameState, x: number, y: number): SealCheck {
  function refused(refusal: SealRefusalReason, deeperNeighbours: Square[] = []): SealCheck {
    return { allowed: false, refusal, deeperNeighbours, ap: null };
  }
  const depth = depthAt(state, x, y); // first: throws for a bad square
  if (countItem(state, CAMP_TOOLS.sealantItem) < 1) {
    return refused('noSealant');
  }
  if (depth === 0) {
    return refused('groundLevel');
  }
  if (campAtSquare(state, x, y) !== null) {
    return refused('camp');
  }
  if (structureOnSquare(state, x, y) !== NO_STRUCTURE) {
    return refused('occupied');
  }
  const deeperNeighbours: Square[] = [];
  for (const step of SQUARE_STEPS) {
    const nx = x + step.dx;
    const ny = y + step.dy;
    // The cube's wall is not a neighbour (owner question 84).
    if (isSquare(state, nx, ny) && depthAt(state, nx, ny) > depth) {
      deeperNeighbours.push({ x: nx, y: ny });
    }
  }
  if (deeperNeighbours.length > 0) {
    return refused('neighbourDeeper', deeperNeighbours);
  }
  return { allowed: true, refusal: null, deeperNeighbours: [], ap: ACTION_COSTS.seal };
}

/**
 * Seal the square: use up one sealant; destroy the water, lava and gas
 * standing on the square (a lava source there stops: a square with no lava
 * is never a source); put a block of sealed rock in the open cell directly
 * above the top block, which raises the square by 1. The block that was the
 * top is buried, and its crack with it. The square is a worked square.
 */
function applySeal(state: GameState, action: SealAction, events: GameEvent[]): void {
  const x = action.x;
  const y = action.y;
  const depth = depthAt(state, x, y);
  if (depth <= 0) {
    throw new Error(`Square (${x}, ${y}) is at ground level and cannot be sealed`);
  }
  removeItem(state, CAMP_TOOLS.sealantItem, 1);

  // The open cell directly above the top block: where the sealed rock goes,
  // and where events say a square's water, lava and gas are.
  const cell: Vec3 = { x, y, z: depth - 1 };
  const contents = contentsOn(state, x, y);
  if (contents.water > 0) {
    setWaterOn(state, x, y, 0);
    events.push({
      type: 'fluidRemoved',
      fluid: 'water',
      pos: { ...cell },
      units: contents.water,
      reason: 'sealed',
    });
  }
  if (contents.lava > 0) {
    setLavaOn(state, x, y, 0, false);
    events.push({
      type: 'fluidRemoved',
      fluid: 'lava',
      pos: { ...cell },
      units: contents.lava,
      reason: 'sealed',
    });
  }
  if (contents.gas > 0) {
    // Gas is stored like water: in the open cells above the top block.
    for (let z = 0; z < depth; z += 1) {
      setGas(state, { x, y, z }, 0);
    }
    events.push({ type: 'gasRemoved', pos: { ...cell }, units: contents.gas, reason: 'sealed' });
  }

  // A crack belongs to a top block, and the old top is one no longer.
  const oldTop: Vec3 = { x, y, z: depth };
  if (inGrid(state.size, oldTop)) {
    clearCrack(state, oldTop);
  }
  // `as BlockId`: `validateData` checks that the id names a block.
  setBlock(state, cell, BLOCKS[CAMP_TOOLS.sealedBlock as BlockId].code);
  events.push({ type: 'cellSealed', pos: { ...cell } });
  markWorked(state, x, y);
}

// ---------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------

/** Why a scan cannot be made now. */
export type ScanRefusalReason =
  /** The stockpile holds too few scanner charges. */
  'noCharge';

/** The answer of `scanCheck`. */
export interface ScanCheck {
  allowed: boolean;
  /** Why not; `null` when `allowed` is true. */
  refusal: ScanRefusalReason | null;
  /** What a scan costs in AP; `null` when it is not allowed. */
  ap: number | null;
}

/**
 * May the player aim a scan at the square (x, y)? Any square will do while
 * the stockpile holds a charge: a scan that would show nothing new is the
 * player's to waste. Does not look at the AP left. Throws if (x, y) is not a
 * square. Does not change `state`.
 */
export function scanCheck(state: GameState, x: number, y: number): ScanCheck {
  if (!isSquare(state, x, y)) {
    throw new Error(`(${x}, ${y}) is not a square of the cube`);
  }
  if (countItem(state, CAMP_TOOLS.scanChargeItem) < CAMP_TOOLS.scanChargesPerScan) {
    return { allowed: false, refusal: 'noCharge', ap: null };
  }
  return { allowed: true, refusal: null, ap: ACTION_COSTS.scan };
}

/**
 * The squares a scan aimed at (x, y) covers: that square and the squares
 * within `CAMP_TOOLS.scanHalfWidth` of it each way (3 x 3), row by row. The
 * part of the patch that would lie off the map is left out.
 */
export function scanSquares(state: GameState, x: number, y: number): Square[] {
  const half = CAMP_TOOLS.scanHalfWidth;
  const squares: Square[] = [];
  for (let sy = y - half; sy <= y + half; sy += 1) {
    for (let sx = x - half; sx <= x + half; sx += 1) {
      if (isSquare(state, sx, sy)) {
        squares.push({ x: sx, y: sy });
      }
    }
  }
  return squares;
}

/**
 * The cells a scan aimed at (x, y) looks into: under each square of the
 * patch, the `CAMP_TOOLS.scanDepth` (3) cells below its top block, as far as
 * the cube goes down. In the order the cube stores cells (top layer first).
 *
 * The top block is the block in layer `depth`. Under a tree that is the
 * layer-0 block, which the tree still hides after the scan (design doc 3.4:
 * "unknown until the tree is cut"): the scan shows layers 1 to 3 there.
 */
export function scanCells(state: GameState, x: number, y: number): Vec3[] {
  const cells: Vec3[] = [];
  for (const square of scanSquares(state, x, y)) {
    const depth = depthAt(state, square.x, square.y);
    for (let below = 1; below <= CAMP_TOOLS.scanDepth; below += 1) {
      const cell = { x: square.x, y: square.y, z: depth + below };
      if (inGrid(state.size, cell)) {
        cells.push(cell);
      }
    }
  }
  cells.sort((a, b) => cellIndex(state.size, a) - cellIndex(state.size, b));
  return cells;
}

/**
 * Scan: use up the charge and reveal the cells of `scanCells` that were not
 * known yet. Emits `scanned`, then a `blockRevealed` for each new cell, then
 * `mineralTracesSeen` for the new blocks that carry traces. This is the one
 * way to learn what lies below a top block (design doc 3.4).
 */
function applyScan(state: GameState, action: ScanAction, events: GameEvent[]): void {
  removeItem(state, CAMP_TOOLS.scanChargeItem, CAMP_TOOLS.scanChargesPerScan);
  const fresh = scanCells(state, action.x, action.y).filter((cell) => !isRevealed(state, cell));
  events.push({ type: 'scanned', x: action.x, y: action.y, cells: fresh.length });
  for (const cell of fresh) {
    setRevealed(state, cell, true);
    events.push({ type: 'blockRevealed', pos: cell, block: blockAt(state, cell) });
  }
  seeMineralTracesAt(state, fresh, events);
}

// ---------------------------------------------------------------------------
// The lists and the dispatcher's entry points
// ---------------------------------------------------------------------------

/**
 * Every `placePump`, `seal` and `scan` action the player could take now, in
 * that order, each row by row (y, then x). (`placeVent` joins with the vent.)
 *
 * - `ap` comes from `ACTION_COSTS`. Lists actions as if AP were unlimited;
 *   the dispatcher removes the ones that cost too much.
 * - Does not change `state`, and depends only on what the player sees.
 */
export function legalCampToolActions(state: GameState): CampToolAction[] {
  const pumps: PlacePumpAction[] = [];
  const seals: SealAction[] = [];
  const scans: ScanAction[] = [];
  // Without the item the answer is the same for every square: do not ask
  // 1,024 times.
  const hasPump = countItem(state, STRUCTURES.pump.placedFromItem) >= 1;
  const hasSealant = countItem(state, CAMP_TOOLS.sealantItem) >= 1;
  const hasCharge = countItem(state, CAMP_TOOLS.scanChargeItem) >= CAMP_TOOLS.scanChargesPerScan;
  if (!hasPump && !hasSealant && !hasCharge) {
    return [];
  }
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      if (hasPump) {
        const check = pumpCheck(state, x, y);
        if (check.allowed && check.ap !== null) {
          pumps.push({ type: 'placePump', x, y, ap: check.ap });
        }
      }
      if (hasSealant) {
        const check = sealCheck(state, x, y);
        if (check.allowed && check.ap !== null) {
          seals.push({ type: 'seal', x, y, ap: check.ap });
        }
      }
      if (hasCharge) {
        const check = scanCheck(state, x, y);
        if (check.allowed && check.ap !== null) {
          scans.push({ type: 'scan', x, y, ap: check.ap });
        }
      }
    }
  }
  return [...pumps, ...seals, ...scans];
}

/**
 * Is `action` one the rules allow now, at the cost it names? The same answer
 * as looking for it in `legalCampToolActions`, without building the list.
 * Does not look at the AP left.
 */
export function isLegalCampToolAction(state: GameState, action: CampToolAction): boolean {
  if (!isSquare(state, action.x, action.y)) {
    return false;
  }
  switch (action.type) {
    case 'placePump':
      return pumpCheck(state, action.x, action.y).ap === action.ap;
    case 'placeVent':
      return false; // the vent is not built yet
    case 'seal':
      return sealCheck(state, action.x, action.y).ap === action.ap;
    case 'scan':
      return scanCheck(state, action.x, action.y).ap === action.ap;
  }
}

/**
 * Carry out `action`, which the dispatcher has already checked is legal.
 * Does not spend the AP; the dispatcher has.
 */
export function applyCampToolAction(
  state: GameState,
  action: CampToolAction,
  events: GameEvent[],
): void {
  switch (action.type) {
    case 'placePump':
      applyPlaceTool(state, 'pump', action.x, action.y, events);
      break;
    case 'placeVent':
      applyPlaceTool(state, 'vent', action.x, action.y, events);
      break;
    case 'seal':
      applySeal(state, action, events);
      break;
    case 'scan':
      applyScan(state, action, events);
      break;
  }
}
