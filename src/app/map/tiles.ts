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
import {
  campAtSquare,
  isRunActive,
  isSquare,
  isWorked,
  knownSquare,
  mineDiscountAt,
  previewCubePhase,
  slumpCheck,
} from '../../engine';
import type { GameState } from '../../engine';
import { belowMarksOf } from '../below';
import type { BelowMarks } from '../below';
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
export type StructureMark = 'support' | 'pump' | 'vent' | 'other';

/**
 * Something on a square that goes off when this shift ends (design doc 6.6):
 * a placed explosive, or unstable ore that a mine beside it has armed.
 */
export type ChargeMark = 'explosive' | 'armedOre';

/** Which of a square's four neighbours are higher than it (they cast a shadow on it). */
export interface HigherSides {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
}

/** The sides of a square: used for the edge of the area where mining is cheaper. */
export type Sides = HigherSides;

/**
 * The hazard tells a top block shows (design doc 3.7), as the map draws
 * them. All false under a tree and on the bedrock floor.
 */
export interface TileTells {
  /** Damp stone: water under or beside. */
  damp: boolean;
  /** Pitted rock: gas under or beside. */
  pitted: boolean;
  /** Warm glow: lava within 2. */
  warm: boolean;
  /** Hairline glow: the block is unstable ore. */
  hairline: boolean;
}

/** No tell at all. */
export const NO_TELLS: TileTells = { damp: false, pitted: false, warm: false, hairline: false };

const NO_SIDES: Sides = { north: false, east: false, south: false, west: false };

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
  /** The hazard tells the top block shows (design doc 3.7). */
  tells: TileTells;
  /**
   * True if the crew worked on the square this shift (design doc 5.2): a
   * hazard that reaches it when the shift ends hurts the crew. The worked
   * squares are the player's own actions, so this tells nothing hidden.
   */
  worked: boolean;
  /**
   * True if the engine's forecast says a hazard will hurt the crew on this
   * worked square when the shift ends (`ShiftForecast.crew`; issue #112).
   */
  crewHurt: boolean;
  /**
   * True if every kind of damage forecast on this square is marked "may":
   * it happens only if nothing hidden comes out first. False when at least
   * one is certain ("exact" or "at least"), and when `crewHurt` is false.
   */
  crewHurtMayOnly: boolean;
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
  /** Units of gas standing on the square (design doc 6.5); 0 for none. */
  gas: number;
  /**
   * True if the square has no gas now and gas will spread onto it when this
   * shift ends. A square that already has gas is never marked: settled gas
   * goes on shifting units between equal neighbours, and that is not news.
   */
  gasComing: boolean;
  /**
   * True if a vent will clear this square of gas when this shift ends
   * (design doc 6.5; issue #107): the gas that stands on it now, or gas that
   * would have spread onto it.
   */
  vented: boolean;
  /** A placed explosive or armed unstable ore on the square, or `null`. */
  charge: ChargeMark | null;
  /**
   * True if the square will be in an explosion when this shift ends: in the
   * blast of a charge or of armed ore, or one of the squares whose gas burns.
   */
  blast: boolean;
  /**
   * What is on the surface of a square at ground level: a tree (it hides the
   * block), or a stump, a path, a meadow or an outcrop (drawn faintly over
   * the block). `null` once the square has been dug.
   */
  surface: SurfaceMark | null;
  higher: HigherSides;
  /** True if a camp stands on the square (design doc 8). Camps are always seen. */
  camp: boolean;
  /**
   * True if mining this square is cheaper because a camp is near (design doc
   * 8). False on a camp square itself, on a tree and on the bedrock floor:
   * those cannot be mined.
   */
  cheaper: boolean;
  /**
   * The sides of the square that are on the edge of the area where mining
   * is cheaper (the squares near a camp, the camp's own included): the map
   * draws one line round that area instead of a mark on each square. All
   * false inside the area and outside it.
   */
  cheaperEdge: Sides;
  /**
   * What is known to lie under the square's top (design doc 7.2; owner
   * question 93): the marks for ore, a pocket and a cavern, and `any` if at
   * least one cell under the top is known. A scan is what shows them.
   */
  below: BelowMarks;
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
  if (code === STRUCTURES.pump.code) return 'pump';
  if (code === STRUCTURES.vent.code) return 'vent';
  // A placed explosive has its own mark (`Tile.charge`), not the plain one.
  if (code === STRUCTURES.explosive.code) return null;
  // Any other structure (vents) gets a plain mark for now.
  return code === 0 ? null : 'other';
}

/** The mark for what is armed on a top block (`KnownCell.armed`). */
function chargeMark(armed: 'unstableOre' | 'explosive' | null): ChargeMark | null {
  if (armed === 'explosive') return 'explosive';
  if (armed === 'unstableOre') return 'armedOre';
  return null;
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
 * What the coming cube phase will bring to which squares, as sets of "x,y"
 * keys (design doc 11: the map shows where things flow and what goes off):
 * - `water`, `lava`: the squares each will flow onto;
 * - `gas`: the squares gas will be given to (`buildTile` marks only those
 *   that have none now);
 * - `blast`: the squares of every explosion: the blast of each charge and of
 *   each armed ore block, and the squares whose gas will burn;
 * - `vented`: the squares a vent will clear of gas (issue #107).
 */
export interface ComingFlows {
  water: Set<string>;
  lava: Set<string>;
  gas: Set<string>;
  blast: Set<string>;
  vented: Set<string>;
  /** The worked squares where the crew will or may be hurt. */
  hurt: Set<string>;
  /** Those of `hurt` where at least one kind of damage is certain. */
  hurtCertain: Set<string>;
}

/**
 * Where water, lava and gas will go and what will explode in the coming cube
 * phase, from the engine's own forecast (`previewCubePhase`), which reads only what the player sees.
 * Every set is empty once the run has ended: there is no shift to forecast.
 */
export function comingFlows(state: GameState): ComingFlows {
  const coming: ComingFlows = {
    water: new Set(),
    lava: new Set(),
    gas: new Set(),
    blast: new Set(),
    vented: new Set(),
    hurt: new Set(),
    hurtCertain: new Set(),
  };
  if (!isRunActive(state)) {
    return coming;
  }
  const forecast = previewCubePhase(state);
  for (const event of forecast.flows) {
    if (event.type === 'fluidMoved') {
      coming[event.fluid].add(`${event.to.x},${event.to.y}`);
    }
  }
  // Step (c): gas that spreads, and everything that explodes. The events
  // name a square by the cell above its top block; only x and y are used.
  for (const event of forecast.gas) {
    if (event.type === 'gasMoved') {
      coming.gas.add(`${event.to.x},${event.to.y}`);
    } else if (event.type === 'gasRemoved' && event.reason === 'vented') {
      coming.vented.add(`${event.pos.x},${event.pos.y}`);
    } else if (event.type === 'exploded') {
      for (const cell of event.cells) {
        coming.blast.add(`${cell.x},${cell.y}`);
      }
    }
  }
  for (const entry of forecast.crew.damage) {
    for (const square of entry.squares) {
      coming.hurt.add(`${square.x},${square.y}`);
      if (entry.certainty !== 'may') {
        coming.hurtCertain.add(`${square.x},${square.y}`);
      }
    }
  }
  return coming;
}

/** True if the square (x, y) is in the area where a camp makes mining cheaper, or is a camp square. */
function inCheaperArea(state: GameState, x: number, y: number): boolean {
  if (!isSquare(state, x, y)) {
    return false;
  }
  return campAtSquare(state, x, y) !== null || mineDiscountAt(state, x, y) > 0;
}

/** The sides of (x, y) on the edge of the cheaper area (see `Tile.cheaperEdge`). */
function cheaperEdgeOf(state: GameState, x: number, y: number): Sides {
  // With no camp there is no area: skip the checks for all 1,024 squares.
  if (state.camps.length === 0 || !inCheaperArea(state, x, y)) {
    return NO_SIDES;
  }
  return {
    north: !inCheaperArea(state, x, y - 1),
    east: !inCheaperArea(state, x + 1, y),
    south: !inCheaperArea(state, x, y + 1),
    west: !inCheaperArea(state, x - 1, y),
  };
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
    gas: square.contents.gas,
    // Gas that spreads onto a square a vent clears is gone again in the same
    // end of shift, so that square is marked as vented, not as "gas coming".
    gasComing:
      square.contents.gas === 0 && flows.gas.has(`${x},${y}`) && !flows.vented.has(`${x},${y}`),
    vented: flows.vented.has(`${x},${y}`),
    blast: flows.blast.has(`${x},${y}`),
    worked: isWorked(state, x, y),
    crewHurt: flows.hurt.has(`${x},${y}`),
    crewHurtMayOnly: flows.hurt.has(`${x},${y}`) && !flows.hurtCertain.has(`${x},${y}`),
    cheaperEdge: cheaperEdgeOf(state, x, y),
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
      tells: NO_TELLS,
      structure: null,
      crack: null,
      crackRunning: false,
      surface: 'tree',
      higher,
      ...standing,
      charge: null,
      camp: false,
      cheaper: false,
      below: belowMarksOf(square),
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
      tells: NO_TELLS,
      structure: null,
      crack: null,
      crackRunning: false,
      surface: null,
      higher,
      ...standing,
      charge: null,
      camp: false,
      cheaper: false,
      below: belowMarksOf(square),
    };
  }
  // Camps and depths are seen by the player, so neither mark tells anything hidden.
  const camp = campAtSquare(state, x, y) !== null;
  return {
    x,
    y,
    depth: square.depth,
    kind: 'block',
    block: BLOCK_ID_BY_CODE.get(square.top.block) ?? null,
    traced: square.traces,
    tells: {
      damp: square.tells.dampStone,
      pitted: square.tells.pittedRock,
      warm: square.tells.warmGlow,
      hairline: square.tells.hairlineGlow,
    },
    structure: structureMark(square.top.structure),
    crack: square.top.crackTimer === null ? null : square.top.crackTimer + 1,
    // `slumpCheck` reads only what the player sees (depths, trees, supports,
    // seen top blocks), so this tells nothing hidden.
    crackRunning: square.top.crackTimer !== null && slumpCheck(state, x, y).unstable,
    surface,
    higher,
    ...standing,
    // Armed charges are on top blocks the player sees (design doc 3.4).
    charge: chargeMark(square.top.armed),
    camp,
    cheaper: !camp && mineDiscountAt(state, x, y) > 0,
    below: belowMarksOf(square),
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

/**
 * The square a new or resumed run's map opens on (issue #110). The middle of
 * the surface is forest on most seeds, so:
 * - if anything has been dug, the middle of the dug squares (the pit);
 * - otherwise the open-ground square with coal on top that is nearest the
 *   middle of the map (design doc 3.2: there is always at least one);
 * - otherwise the open ground nearest the middle; otherwise the middle.
 * Reads only depths, trees and seen top blocks.
 */
export function openingSquare(state: GameState): { x: number; y: number } {
  const midX = (state.size.x - 1) / 2;
  const midY = (state.size.y - 1) / 2;
  // The box round the dug squares.
  let minX = state.size.x;
  let maxX = -1;
  let minY = state.size.y;
  let maxY = -1;
  // The nearest coal on open ground, and the nearest open ground, with their distances.
  let coal: { x: number; y: number } | null = null;
  let coalDistance = Infinity;
  let open: { x: number; y: number } | null = null;
  let openDistance = Infinity;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const square = knownSquare(state, x, y);
      if (square.depth > 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      if (square.tree || square.top === null) {
        continue;
      }
      const distance = Math.abs(x - midX) + Math.abs(y - midY);
      if (distance < openDistance) {
        open = { x, y };
        openDistance = distance;
      }
      if (square.top.block === BLOCKS.coalSeam.code && distance < coalDistance) {
        coal = { x, y };
        coalDistance = distance;
      }
    }
  }
  if (maxX >= 0) {
    return { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) };
  }
  return coal ?? open ?? { x: Math.round(midX), y: Math.round(midY) };
}
