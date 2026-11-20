// Tells: what a block shows the player about something hidden near it.
//
// Design doc 6 gives every hazard a tell on the blocks around it ("damp stone
// within 1 of a water pocket"). Those arrive with the hazards in M2 and belong
// in this file. The first tell is for ore (decision note 0012):
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
import { blockAt, cellCount, cellIndex, cellPosition, inGrid, isRevealed } from './state';
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
 * - Only top blocks are looked at: they are the only blocks that become
 *   known today. When scanning is built (task T13) its revealed blocks need
 *   the same check.
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
