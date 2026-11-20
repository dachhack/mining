// The tap map's model (issues #66 and #86): what the player knows of each
// square of the map, as plain data. The canvas code (mapView.ts) draws only
// from this, never from the game state.
//
// The one rule: a square is read only through the engine's `knownSquare`,
// which gives its depth, what stands on it, and its top block if the player
// has seen it. Nothing below a top block, and nothing under a tree that was
// never cut, can reach a tile.

import { BLOCKS, STRUCTURES, SURFACE } from '../../data';
import type { BlockId } from '../../data';
import { isRunActive, isSquare, knownSquare, previewCubePhase, slumpCheck } from '../../engine';
import type { GameState } from '../../engine';
import { PREVIEW_MAP } from './palette';
import type { SurfaceMark } from './palette';

/**
 * What a tile shows:
 * - 'block': the square's top block;
 * - 'hidden': a tree stands on the square and hides its ground;
 * - 'floor': the square has no block left (the bedrock floor of the cube).
 */
export type TileKind = 'block' | 'hidden' | 'floor';

/** A mark drawn on top of a tile. */
export type StructureMark = 'support' | 'other';

/** Which of a square's four neighbours are higher than it (they cast a shadow on it). */
export interface HigherSides {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
}

/** One square of the map, as far as the player knows it. */
export interface Tile {
  x: number;
  y: number;
  /** How many levels down the square is. */
  depth: number;
  kind: TileKind;
  /** The block id ("stone", "coalSeam") for a 'block' tile; `null` otherwise. */
  block: BlockId | null;
  /** True for a top block the player has noticed mineral traces on. */
  traced: boolean;
  structure: StructureMark | null;
  /**
   * The countdown of a crack on the top block (design doc 6.1): 1 means it
   * falls when this shift ends. `null` for no crack.
   */
  crack: number | null;
  /**
   * True if that countdown is running: the square is unstable. False for no
   * crack, and for a crack whose countdown has stopped because the square is
   * stable or held now (it is drawn pale; it goes on if that changes).
   */
  crackRunning: boolean;
  /** Units of water standing on the square (design doc 6.3); 0 for none. */
  water: number;
  /** Units of lava standing on the square (design doc 6.4); 0 for none. */
  lava: number;
  /** True if that lava is a source, which keeps pouring (design doc 6.2). */
  lavaSource: boolean;
  /** True if water will flow onto the square when this shift ends. */
  waterComing: boolean;
  /** True if lava will flow onto the square when this shift ends. */
  lavaComing: boolean;
  /**
   * What is on the surface of a square at ground level: a tree (it hides the
   * block), or a stump, a path, a meadow or an outcrop (drawn faintly over
   * the block). `null` once the square has been dug.
   */
  surface: SurfaceMark | null;
  higher: HigherSides;
}

/** A square window of the map: the squares x0..x0+size-1 and y0..y0+size-1. */
export interface TileWindow {
  x0: number;
  y0: number;
  size: number;
}

/** Block code -> block id, for the tiles (the cube stores codes). */
const BLOCK_ID_BY_CODE = new Map<number, BlockId>();
for (const [id, def] of Object.entries(BLOCKS)) {
  // `as BlockId`: `Object.entries` gives keys as plain strings.
  BLOCK_ID_BY_CODE.set(def.code, id as BlockId);
}

/** The surface kind with this code, as the tiles name it. */
function surfaceMark(code: number): SurfaceMark {
  const kinds = SURFACE.kinds;
  if (code === kinds.tree.code) return 'tree';
  if (code === kinds.stump.code) return 'stump';
  if (code === kinds.path.code) return 'path';
  if (code === kinds.outcrop.code) return 'outcrop';
  return 'meadow';
}

function structureMark(code: number): StructureMark | null {
  if (code === STRUCTURES.support.code) return 'support';
  // Any other structure (pumps, vents, ...) gets a plain mark for now.
  return code === 0 ? null : 'other';
}

/**
 * How bright a square `depth` levels down is drawn: 1 at ground level, less
 * with every level, never below `PREVIEW_MAP.depthMinBrightness`. Deeper is
 * darker, so the terraces of a pit read at a glance (design doc 11).
 */
export function depthBrightness(depth: number): number {
  const brightness = PREVIEW_MAP.depthBrightnessPerLevel ** Math.max(0, depth);
  return Math.max(PREVIEW_MAP.depthMinBrightness, brightness);
}

/** True if the square (x, y) exists and is higher (shallower) than `depth`. */
function isHigher(state: GameState, x: number, y: number, depth: number): boolean {
  // A square's depth is always seen, so this tells nothing hidden.
  return isSquare(state, x, y) && knownSquare(state, x, y).depth < depth;
}

/**
 * The squares water and lava will flow onto when this shift ends, as sets of
 * "x,y" keys (design doc 11: the map shows where they flow next).
 */
export interface ComingFlows {
  water: Set<string>;
  lava: Set<string>;
}

/**
 * Where water and lava will flow in the coming cube phase, from the engine's
 * own forecast (`previewCubePhase`), which reads only what the player sees.
 * Both sets are empty once the run has ended: there is no shift to forecast.
 */
export function comingFlows(state: GameState): ComingFlows {
  const coming: ComingFlows = { water: new Set(), lava: new Set() };
  if (!isRunActive(state)) {
    return coming;
  }
  for (const event of previewCubePhase(state).flows) {
    if (event.type === 'fluidMoved') {
      coming[event.fluid].add(`${event.to.x},${event.to.y}`);
    }
  }
  return coming;
}

/**
 * The tile of the square (x, y). Throws if it is not a square of the map.
 * `flows` is `comingFlows(state)`; a caller that builds many tiles works it
 * out once and passes it in.
 */
export function buildTile(
  state: GameState,
  x: number,
  y: number,
  flows: ComingFlows = comingFlows(state),
): Tile {
  const square = knownSquare(state, x, y);
  // What stands on the square is in the open, so it is seen (design doc 3.4).
  const standing = {
    water: square.contents.water,
    lava: square.contents.lava,
    lavaSource: square.contents.lavaSource,
    waterComing: flows.water.has(`${x},${y}`),
    lavaComing: flows.lava.has(`${x},${y}`),
  };
  const higher: HigherSides = {
    north: isHigher(state, x, y - 1, square.depth),
    east: isHigher(state, x + 1, y, square.depth),
    south: isHigher(state, x, y + 1, square.depth),
    west: isHigher(state, x - 1, y, square.depth),
  };
  if (square.tree) {
    // A tree is drawn solid. Whatever the player may know of the block under
    // it (after a tree grew back) is left out: the map shows the tree.
    return {
      x,
      y,
      depth: square.depth,
      kind: 'hidden',
      block: null,
      traced: false,
      structure: null,
      crack: null,
      crackRunning: false,
      surface: 'tree',
      higher,
      ...standing,
    };
  }
  const atGroundLevel = square.depth === 0;
  const surface = atGroundLevel ? surfaceMark(square.surfaceKind) : null;
  if (square.top === null) {
    // No tree and no known top block: the square has no block left.
    return {
      x,
      y,
      depth: square.depth,
      kind: 'floor',
      block: null,
      traced: false,
      structure: null,
      crack: null,
      crackRunning: false,
      surface: null,
      higher,
      ...standing,
    };
  }
  return {
    x,
    y,
    depth: square.depth,
    kind: 'block',
    block: BLOCK_ID_BY_CODE.get(square.top.block) ?? null,
    traced: square.traces,
    structure: structureMark(square.top.structure),
    crack: square.top.crackTimer === null ? null : square.top.crackTimer + 1,
    // `slumpCheck` reads only what the player sees (depths, trees, supports,
    // seen top blocks), so this tells nothing hidden.
    crackRunning: square.top.crackTimer !== null && slumpCheck(state, x, y).unstable,
    surface,
    higher,
    ...standing,
  };
}

/**
 * The tiles of `window`, row by row (y first, then x). Squares outside the
 * map are left out (a window may reach past its edge while the player drags).
 */
export function buildTiles(state: GameState, window: TileWindow): Tile[][] {
  const rows: Tile[][] = [];
  const flows = comingFlows(state);
  for (let y = window.y0; y < window.y0 + window.size; y += 1) {
    const row: Tile[] = [];
    for (let x = window.x0; x < window.x0 + window.size; x += 1) {
      if (isSquare(state, x, y)) {
        row.push(buildTile(state, x, y, flows));
      }
    }
    rows.push(row);
  }
  return rows;
}
