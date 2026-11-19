// The tap map's model of one layer (issue #66): what the player knows of
// each cell, as plain data. The canvas code (mapView.ts) draws only from
// this, never from the game state.
//
// The one rule: a cell's contents are read only through the engine's
// `knownCell`, which answers `null` for a cell the player has not seen. So
// nothing about an unseen cell (its block, its contents) can reach a tile.
// The other inputs are the avatar's own state (where it is, its lamp oil),
// which the player always knows, and `visibleMineralTraces`, which names
// revealed blocks only (decision note 0012).
//
// "Lit" is worked out here from known cells only, the way the engine's light
// works (light spreads through open cells, round corners, never through
// rock; reveal.ts), so it can never be told by an unseen cell either.

import { AVATAR, BLOCKS, STRUCTURES, SURFACE, WORLD, blockDefByCode } from '../../data';
import type { BlockId, Vec3 } from '../../data';
import {
  cellPosition,
  hasTree,
  knownCell,
  surfaceKindAt,
  visibleMineralTraces,
} from '../../engine';
import type { GameState } from '../../engine';
import type { SurfaceMark } from './palette';

/** What a tile shows. */
export type TileKind = 'unknown' | 'open' | 'block';

/** A mark drawn on top of a tile. */
export type StructureMark = 'ladder' | 'torch' | 'support' | 'other';

/** One cell of the map, as far as the player knows it. */
export interface Tile {
  x: number;
  y: number;
  kind: TileKind;
  /** The block id ("stone", "coalSeam") for a 'block' tile; `null` otherwise. */
  block: BlockId | null;
  /** True if the cell is in light now (always false for an unseen cell). */
  lit: boolean;
  /** True for a seen block the player has noticed mineral traces on. */
  traced: boolean;
  structure: StructureMark | null;
  /** True if loose items lie in the cell. */
  items: boolean;
  /** True if the miner is here. */
  miner: boolean;
  /**
   * For a surface cell: the block of the top layer under it (the ground the
   * miner walks on), drawn pale under the open air; `null` elsewhere, and
   * under a tree (issue #70). Read through `knownCell`, so only seen ground.
   */
  ground: BlockId | null;
  /** True if the miner is in this column on another layer (drawn as a faint ring). */
  minerColumn: boolean;
  /**
   * For a surface cell: what grows or lies there (issue #70); `null`
   * elsewhere. The surface is always seen.
   */
  surface: SurfaceMark | null;
}

/** The kind of the surface cell `pos`, as the tiles name it. */
function surfaceMark(state: GameState, pos: Vec3): SurfaceMark {
  const code = surfaceKindAt(state, pos);
  const kinds = SURFACE.kinds;
  if (code === kinds.tree.code) return 'tree';
  if (code === kinds.stump.code) return 'stump';
  if (code === kinds.path.code) return 'path';
  if (code === kinds.outcrop.code) return 'outcrop';
  return 'meadow';
}

/** A square window of a layer: the cells x0..x0+size-1 and y0..y0+size-1. */
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

function key(pos: Vec3): string {
  return `${pos.x},${pos.y},${pos.z}`;
}

/** The six cells that share a face with `pos`. */
function faceNeighbours(pos: Vec3): Vec3[] {
  return [
    { x: pos.x + 1, y: pos.y, z: pos.z },
    { x: pos.x - 1, y: pos.y, z: pos.z },
    { x: pos.x, y: pos.y + 1, z: pos.z },
    { x: pos.x, y: pos.y - 1, z: pos.z },
    { x: pos.x, y: pos.y, z: pos.z + 1 },
    { x: pos.x, y: pos.y, z: pos.z - 1 },
  ];
}

/** True if the player knows `pos` is open (seen, and not solid). */
function knownOpen(state: GameState, pos: Vec3): boolean {
  const cell = knownCell(state, pos);
  return cell !== null && !blockDefByCode(cell.block).solid;
}

/**
 * The open cells in light, as "x,y,z" keys: from the lamp (while it has oil)
 * and from every torch the player can see, spreading through known open
 * cells only. Daylight is handled in `buildLayer` (the surface and the top
 * layer are always in light).
 */
export function knownLitCells(state: GameState): Set<string> {
  const lit = new Set<string>();
  function flood(source: Vec3, radius: number): void {
    if (!knownOpen(state, source)) {
      return;
    }
    const seen = new Set<string>([key(source)]);
    lit.add(key(source));
    let frontier = [source];
    for (let step = 1; step <= radius; step += 1) {
      const next: Vec3[] = [];
      for (const pos of frontier) {
        for (const near of faceNeighbours(pos)) {
          if (!seen.has(key(near)) && knownOpen(state, near)) {
            seen.add(key(near));
            lit.add(key(near));
            next.push(near);
          }
        }
      }
      frontier = next;
    }
  }
  if (state.lampOil > 0) {
    flood(state.avatar.pos, AVATAR.lightRadiusWithOil);
  }
  // Torches: only those in cells the player has seen. To find them quickly,
  // the places holding a torch code are listed first; each is then checked
  // through `knownCell`, so an unseen torch is never used (only skipped).
  state.structures.forEach((code, index) => {
    if (code !== STRUCTURES.torch.code) {
      return;
    }
    const pos = cellPosition(state.size, index);
    const cell = knownCell(state, pos);
    if (cell !== null && cell.structure === STRUCTURES.torch.code) {
      flood(pos, AVATAR.torchLightRadius);
    }
  });
  return lit;
}

function structureMark(code: number): StructureMark | null {
  if (code === STRUCTURES.ladder.code) return 'ladder';
  if (code === STRUCTURES.torch.code) return 'torch';
  if (code === STRUCTURES.support.code) return 'support';
  // Any other structure (M2: vents, pumps, ...) gets a plain mark for now.
  return code === 0 ? null : 'other';
}

/** The solid block of the top layer under the surface cell (x, y), as far as the player knows. */
function groundUnder(state: GameState, x: number, y: number): BlockId | null {
  const cell = knownCell(state, { x, y, z: WORLD.surfaceZ + 1 });
  if (cell === null || !blockDefByCode(cell.block).solid) {
    return null;
  }
  return BLOCK_ID_BY_CODE.get(cell.block) ?? null;
}

/**
 * What `buildLayer` works out once for the whole cube: the lit open cells and
 * the blocks with traces. Worth keeping while the state does not change (the
 * map draws many times during a drag).
 */
export interface LayerContext {
  lit: Set<string>;
  traced: Set<string>;
}

export function layerContext(state: GameState): LayerContext {
  return {
    lit: knownLitCells(state),
    traced: new Set<string>(visibleMineralTraces(state).map(key)),
  };
}

/**
 * The tiles of layer `z` in `window`, row by row (y first, then x): what the
 * player knows of each cell. Cells outside the cube are left out (the camera
 * keeps the window inside it).
 *
 * The surface is a layer of its own (where the miner walks at the start);
 * its cells show what grows there (issue #70) and, where no tree stands, the
 * ground under them.
 * `context` may be passed in when it was already worked out for this state.
 */
export function buildLayer(
  state: GameState,
  z: number,
  window: TileWindow,
  context: LayerContext = layerContext(state),
): Tile[][] {
  const here = state.avatar.pos;
  const { lit, traced } = context;
  // Daylight: the surface, and every cell of the top layer, which touches it.
  const daylight = z <= WORLD.surfaceZ + 1;

  const rows: Tile[][] = [];
  for (let y = window.y0; y < window.y0 + window.size; y += 1) {
    const row: Tile[] = [];
    for (let x = window.x0; x < window.x0 + window.size; x += 1) {
      const pos = { x, y, z };
      const miner = here.x === x && here.y === y && here.z === z;
      const minerColumn = !miner && here.x === x && here.y === y;
      const cell = knownCell(state, pos);
      if (cell === null) {
        row.push({
          x,
          y,
          kind: 'unknown',
          block: null,
          lit: false,
          traced: false,
          structure: null,
          items: false,
          miner,
          minerColumn,
          ground: null,
          surface: null,
        });
        continue;
      }
      const def = blockDefByCode(cell.block);
      let isLit: boolean;
      if (daylight) {
        isLit = true;
      } else if (!def.solid) {
        isLit = lit.has(key(pos));
      } else {
        // A block is in light when one of its faces touches a lit open cell.
        isLit = faceNeighbours(pos).some((near) => lit.has(key(near)));
      }
      row.push({
        x,
        y,
        kind: def.solid ? 'block' : 'open',
        block: def.solid ? (BLOCK_ID_BY_CODE.get(cell.block) ?? null) : null,
        lit: isLit,
        traced: def.solid && traced.has(key(pos)),
        structure: structureMark(cell.structure),
        items: cell.looseItems.length > 0,
        miner,
        minerColumn,
        // A tree hides the ground (the engine has not revealed it, so
        // `groundUnder` would find nothing anyway; a regrown tree stands over
        // ground the player remembers, which the layer-0 view shows).
        ground: z === WORLD.surfaceZ && !hasTree(state, pos) ? groundUnder(state, x, y) : null,
        surface: z === WORLD.surfaceZ ? surfaceMark(state, pos) : null,
      });
    }
    rows.push(row);
  }
  return rows;
}
