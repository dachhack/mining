// Tells: what a block shows the player about something hidden near it.
//
// Design doc 3.7 gives every hazard a tell on the blocks around it ("damp
// stone within 1 of a water pocket"). They are at the bottom of this file
// (`hazardTellsAt`). The first tell is for ore (decision note 0012):
//
//   MINERAL TRACES. Plain rock that lies within `TELLS.mineralTraces.distance`
//   steps of an ore block carries mineral traces. The player sees them on a
//   block as soon as the block is a known top block: there is no light any
//   more (design doc v0.2 section 3.7; decision note 0026). Once seen they
//   stay on the map, like everything else the player has seen. They say that
//   ore is near; not which ore, and not which way.
//
// This file is the one place that decides. Whether a block CARRIES traces is
// worked out from the blocks around it and never stored. Which blocks the
// player has SEEN traces on is stored, in `state.tracesSeen`:
// `updateMineralTraces` sets it, and the dispatcher in index.ts calls that
// after every `updateReveal`.
//
// What the player may know: `showsMineralTraces` and `visibleMineralTraces`.
// `carriesMineralTraces` reads the cube itself, hidden cells included; it is
// for generation checks and debugging tools, and is deliberately left out of
// the public surface in index.ts.

import { BLOCKS, TELLS } from '../data';
import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import { depthAt } from './heightmap';
import {
  blockAt,
  cellCount,
  cellIndex,
  cellPosition,
  gasAt,
  inGrid,
  isRevealed,
  lavaAt,
  waterAt,
} from './state';
import type { GameState } from './state';

/** The block codes (the numbers stored in the cube) of the blocks with these ids. */
function codesOf(blockIds: string[]): Set<number> {
  // `Record<string, ...>` lets the table be indexed by a plain string;
  // `validateData` has checked that every id in the tells data is a block.
  const table: Record<string, { code: number } | undefined> = BLOCKS;
  const codes = new Set<number>();
  for (const blockId of blockIds) {
    const def = table[blockId];
    if (def !== undefined) {
      codes.add(def.code);
    }
  }
  return codes;
}

const TRACE_SOURCE_CODES = codesOf(TELLS.mineralTraces.sourceBlocks);
const TRACE_SHOWN_ON_CODES = codesOf(TELLS.mineralTraces.shownOnBlocks);

/**
 * Does the block at `pos` carry mineral traces? True when it is plain rock
 * (`TELLS.mineralTraces.shownOnBlocks`) and an ore block
 * (`TELLS.mineralTraces.sourceBlocks`) lies within
 * `TELLS.mineralTraces.distance` steps of it. A step goes through a face, so
 * the distance from (x, y, z) to (x + dx, y + dy, z + dz) is
 * |dx| + |dy| + |dz| (Manhattan distance). Rock between the two does not
 * matter.
 *
 * NOT FOR THE PLAYER: this reads the cube whether or not `pos` is revealed.
 * Anything shown to the player must use `showsMineralTraces` instead.
 */
export function carriesMineralTraces(state: GameState, pos: Vec3): boolean {
  if (!inGrid(state.size, pos) || !TRACE_SHOWN_ON_CODES.has(blockAt(state, pos))) {
    return false;
  }
  const distance = TELLS.mineralTraces.distance;
  for (let dz = -distance; dz <= distance; dz += 1) {
    // What is left of the distance after going `dz` layers up or down, and
    // then after going `dy` rows north or south.
    const leftForY = distance - Math.abs(dz);
    for (let dy = -leftForY; dy <= leftForY; dy += 1) {
      const leftForX = leftForY - Math.abs(dy);
      for (let dx = -leftForX; dx <= leftForX; dx += 1) {
        const near = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
        // Outside the grid there is only bedrock and the open surface.
        if (inGrid(state.size, near) && TRACE_SOURCE_CODES.has(blockAt(state, near))) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Note the mineral traces the player sees now. The dispatcher in index.ts
 * calls this straight after `updateReveal`: when a run is created, after
 * every action and at the end of every shift.
 *
 * - A block's traces are seen when it is a square's top block, is revealed,
 *   and carries traces (see `carriesMineralTraces`). Its flag in
 *   `state.tracesSeen` is then set, and is never cleared. So a top block
 *   under a tree shows nothing until the tree is cut.
 * - Only top blocks are looked at here. The other way a block becomes known
 *   is a scan, which calls `seeMineralTracesAt` for the blocks it reveals.
 * - Appends a `mineralTracesSeen` event for each block whose flag was not set
 *   before, in the order the cube stores cells (top layer first), so the same
 *   state always gives the same events.
 * - Nothing else in `state` is changed, and no block is revealed.
 */
export function updateMineralTraces(state: GameState, events: GameEvent[]): void {
  const newlySeen: number[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const pos = { x, y, z: depthAt(state, x, y) };
      if (!inGrid(state.size, pos) || !isRevealed(state, pos)) {
        continue; // no block left, or hidden under a tree
      }
      const index = cellIndex(state.size, pos);
      if (state.tracesSeen[index] === 1) {
        continue;
      }
      if (carriesMineralTraces(state, pos)) {
        state.tracesSeen[index] = 1;
        newlySeen.push(index);
      }
    }
  }
  // Plain numeric sort; without the function, JavaScript sorts numbers as text.
  newlySeen.sort((first, second) => first - second);
  for (const index of newlySeen) {
    events.push({ type: 'mineralTracesSeen', pos: cellPosition(state.size, index) });
  }
}

/**
 * Note the mineral traces on the blocks a scan has just revealed (design doc
 * 3.7: tells show "on blocks a scan revealed" too). `cells` are the newly
 * revealed cells, in the order their events should come. For each that
 * carries traces and was not flagged before, sets its flag in
 * `state.tracesSeen` and appends a `mineralTracesSeen` event.
 */
export function seeMineralTracesAt(state: GameState, cells: Vec3[], events: GameEvent[]): void {
  for (const pos of cells) {
    if (!inGrid(state.size, pos) || !isRevealed(state, pos)) {
      continue;
    }
    const index = cellIndex(state.size, pos);
    if (state.tracesSeen[index] === 1 || !carriesMineralTraces(state, pos)) {
      continue;
    }
    state.tracesSeen[index] = 1;
    events.push({ type: 'mineralTracesSeen', pos: { ...pos } });
  }
}

/**
 * Does the map show mineral traces on the block at `pos`? True when the
 * player has seen traces on it (see `updateMineralTraces`) and the rock is
 * still there.
 *
 * - An unrevealed cell always gives false, whatever it holds.
 * - A block whose traces were seen keeps showing them when the ore that
 *   caused them is mined later: the map shows what the player saw. Only
 *   mining the block itself removes them.
 * - Ore itself gives false: where the ore is revealed it is simply visible.
 * - The answer says ore was within reach of the tell when the block was seen,
 *   which may be an ore block the player has not seen. That is the hint, and
 *   all of it: not which ore, how many, or in which direction.
 *
 * Does not change `state`.
 */
export function showsMineralTraces(state: GameState, pos: Vec3): boolean {
  if (!inGrid(state.size, pos) || !isRevealed(state, pos)) {
    return false;
  }
  return (
    state.tracesSeen[cellIndex(state.size, pos)] === 1 &&
    TRACE_SHOWN_ON_CODES.has(blockAt(state, pos))
  );
}

/**
 * Every block the map shows mineral traces on: all the positions for which
 * `showsMineralTraces` is true, in the order the cube stores cells (top layer
 * first, then row by row). Does not change `state`.
 */
export function visibleMineralTraces(state: GameState): Vec3[] {
  const traced: Vec3[] = [];
  const cells = cellCount(state.size);
  for (let index = 0; index < cells; index += 1) {
    if (state.tracesSeen[index] === 1) {
      const pos = cellPosition(state.size, index);
      if (showsMineralTraces(state, pos)) {
        traced.push(pos);
      }
    }
  }
  return traced;
}

// ---------------------------------------------------------------------------
// Hazard tells (design doc v0.2 section 3.7; 0014 item 18; issue #95)
// ---------------------------------------------------------------------------
//
//   DAMP STONE    a block within `dampStoneDistance` (1) of a water pocket
//   PITTED ROCK   a block within `pittedRockDistance` (1) of a gas pocket
//   WARM GLOW     a block within `warmGlowDistance` (2) of a lava pocket
//   HAIRLINE GLOW unstable ore itself
//
// Distances are counted in steps through the grid, down as well as sideways,
// like mineral traces. So a pocket one block under a top block shows its tell
// on that block, before the mine that would break into it.
//
// Unlike mineral traces, these are worked out from where the hazard is now
// and never stored (0014 item 18): when a pocket has collapsed, its tell is
// gone.
//
// A "pocket" here is water, lava or gas in a cell UNDERGROUND: below the top
// block of its own square. Water, lava or gas standing on a square in the
// open is seen as it is (`KnownSquare.contents`) and gives no tell.

/** The hazard tells one block shows. */
export interface HazardTells {
  /** Damp stone: water under or beside. */
  dampStone: boolean;
  /** Pitted rock: gas under or beside. */
  pittedRock: boolean;
  /** Warm glow: lava near. */
  warmGlow: boolean;
  /** Hairline glow: the block is unstable ore. */
  hairlineGlow: boolean;
}

/** No tell at all. Copy it (`{ ...NO_HAZARD_TELLS }`) rather than change it. */
export const NO_HAZARD_TELLS: Readonly<HazardTells> = {
  dampStone: false,
  pittedRock: false,
  warmGlow: false,
  hairlineGlow: false,
};

/** Which of a cell's contents a tell looks for. */
type PocketKind = 'water' | 'gas' | 'lava';

/**
 * True if a cell within `distance` steps of `pos` (Manhattan distance, the
 * cell `pos` itself not counted) is underground and holds `kind`.
 */
function pocketWithin(state: GameState, pos: Vec3, distance: number, kind: PocketKind): boolean {
  for (let dz = -distance; dz <= distance; dz += 1) {
    const leftForY = distance - Math.abs(dz);
    for (let dy = -leftForY; dy <= leftForY; dy += 1) {
      const leftForX = leftForY - Math.abs(dy);
      for (let dx = -leftForX; dx <= leftForX; dx += 1) {
        const near = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
        if (!inGrid(state.size, near)) {
          continue;
        }
        let units = 0;
        if (kind === 'water') units = waterAt(state, near);
        if (kind === 'gas') units = gasAt(state, near);
        if (kind === 'lava') units = lavaAt(state, near);
        // Underground: below the top block of its own square.
        if (units > 0 && near.z > depthAt(state, near.x, near.y)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * The hazard tells the block at `pos` carries (see the table above).
 *
 * This reads hidden cells near `pos`: that is the tell. A view must show it
 * only for a block the player knows; `knownSquare` (known.ts) does that for
 * top blocks, and is what the views use. Open space carries no tell.
 * Does not change `state`.
 */
export function hazardTellsAt(state: GameState, pos: Vec3): HazardTells {
  if (!inGrid(state.size, pos) || blockAt(state, pos) === BLOCKS.air.code) {
    return { ...NO_HAZARD_TELLS };
  }
  const distances = TELLS.hazards;
  return {
    dampStone: pocketWithin(state, pos, distances.dampStoneDistance, 'water'),
    pittedRock: pocketWithin(state, pos, distances.pittedRockDistance, 'gas'),
    warmGlow: pocketWithin(state, pos, distances.warmGlowDistance, 'lava'),
    hairlineGlow: blockAt(state, pos) === BLOCKS.unstableOre.code,
  };
}
