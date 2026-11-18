// Tells: what a block shows the player about something hidden near it.
//
// Design doc 6 gives every hazard a tell on the blocks around it ("damp stone
// within 1 of a water pocket"). Those arrive with the hazards in M2 and belong
// in this file. The first tell is for ore (decision note 0010):
//
//   MINERAL TRACES. Plain rock that lies within `TELLS.mineralTraces.distance`
//   steps of an ore block carries mineral traces. The player sees them on a
//   block only while that block is revealed AND in light. They say that ore is
//   near; not which ore, and not which way.
//
// Nothing here is stored. Whether a block carries traces is worked out from
// the blocks around it each time it is asked, so the state, its hash and the
// save format are unchanged, and the answer can never go stale when a block
// is mined.
//
// What the player may know: `showsMineralTraces` and `visibleMineralTraces`.
// They answer only for revealed blocks. `carriesMineralTraces` reads the cube
// itself, hidden cells included; it is for generation checks and debugging
// tools, and is deliberately left out of the public surface in index.ts.

import { AVATAR, BLOCKS, TELLS } from '../data';
import type { Vec3 } from '../data';
import { FACE_OFFSETS, offsetPosition } from './neighbours';
import { avatarLightRadius, litCellsFrom, torchPositions } from './reveal';
import { blockAt, cellIndex, cellPosition, inGrid, isRevealed } from './state';
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
 * The open cells the avatar's lamp and the placed torches light now (a cell
 * both light is listed twice). The same sources and radii as `updateReveal` in reveal.ts
 * (0005 item 13), built from the functions that file exports. The surface is
 * always lit as well; `inLight` handles it, so it is not listed here.
 */
function lampAndTorchLight(state: GameState): Vec3[] {
  const lit: Vec3[] = litCellsFrom(state, state.avatar.pos, avatarLightRadius(state));
  for (const torch of torchPositions(state)) {
    lit.push(...litCellsFrom(state, torch, AVATAR.torchLightRadius));
  }
  return lit;
}

/**
 * Is the block at `pos` in light? Light travels through open cells only
 * (0005 item 13), so a solid block is never itself a lit cell. It is in light
 * when one of its faces touches a lit open cell: exactly the blocks light
 * reveals (0005 item 14). Every block of the top layer touches the surface,
 * which is always lit.
 *
 * `lit` is the result of `lampAndTorchLight(state)`.
 */
function inLight(pos: Vec3, lit: Vec3[]): boolean {
  if (pos.z === 0) {
    return true;
  }
  for (const litCell of lit) {
    // Two cells share a face when they are exactly one step apart.
    const steps =
      Math.abs(litCell.x - pos.x) + Math.abs(litCell.y - pos.y) + Math.abs(litCell.z - pos.z);
    if (steps === 1) {
      return true;
    }
  }
  return false;
}

/**
 * Does the player see mineral traces on the block at `pos`? True only when
 * the block is revealed, in light, and carries traces.
 *
 * - An unrevealed cell always gives false, whatever it holds.
 * - A revealed block that is not in light gives false: traces need light, so
 *   a miner whose lamp is out sees them only on blocks touching its own cell,
 *   and a block seen earlier stops showing them when the light moves on.
 * - Ore itself gives false: where the ore is revealed it is simply visible.
 * - The answer says ore is within reach of the tell, which may be an ore
 *   block the player has not seen. That is the hint, and all of it: not which
 *   ore, how many, or in which direction.
 *
 * Does not change `state`. To ask about many blocks, use
 * `visibleMineralTraces`, which works the light out once.
 */
export function showsMineralTraces(state: GameState, pos: Vec3): boolean {
  if (!inGrid(state.size, pos) || !isRevealed(state, pos)) {
    return false;
  }
  return inLight(pos, lampAndTorchLight(state)) && carriesMineralTraces(state, pos);
}

/**
 * Is there any ore in the layers near enough to the top layer to give one of
 * its blocks traces? Only a shortcut for `visibleMineralTraces`: when the
 * answer is no (the usual case, since ore lies deeper), the whole top layer
 * can be skipped without looking at each of its blocks in turn.
 */
function oreNearTopLayer(state: GameState): boolean {
  const deepestLayer = Math.min(TELLS.mineralTraces.distance, state.size.z - 1);
  // The cube stores the top layer first, so the layers 0 to `deepestLayer`
  // are the cells from index 0 to the last cell of that layer.
  const lastCell = { x: state.size.x - 1, y: state.size.y - 1, z: deepestLayer };
  const lastIndex = cellIndex(state.size, lastCell);
  for (let index = 0; index <= lastIndex; index += 1) {
    // `as number`: an index inside the array always holds a number.
    if (TRACE_SOURCE_CODES.has(state.blocks[index] as number)) {
      return true;
    }
  }
  return false;
}

/**
 * Every block the player sees mineral traces on now: all the positions for
 * which `showsMineralTraces` is true, in the order the cube stores cells (top
 * layer first, then row by row). Does not change `state`.
 *
 * A renderer or view calls this after each step, because what it returns
 * changes with the light as well as with what is revealed and mined.
 */
export function visibleMineralTraces(state: GameState): Vec3[] {
  // Only blocks in light can show traces, so only those are looked at: the
  // top layer, and the cells touching a cell the lamp or a torch lights.
  // `candidates` holds their cell indexes (see `cellIndex`); a Set, because
  // one block can touch several lit cells.
  const candidates = new Set<number>();
  if (oreNearTopLayer(state)) {
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        candidates.add(cellIndex(state.size, { x, y, z: 0 }));
      }
    }
  }
  for (const pos of lampAndTorchLight(state)) {
    for (const offset of FACE_OFFSETS) {
      const beside = offsetPosition(pos, offset);
      if (inGrid(state.size, beside)) {
        candidates.add(cellIndex(state.size, beside));
      }
    }
  }

  const traced: number[] = [];
  for (const index of candidates) {
    const pos = cellPosition(state.size, index);
    if (isRevealed(state, pos) && carriesMineralTraces(state, pos)) {
      traced.push(index);
    }
  }
  // Plain numeric sort; without the function, JavaScript sorts numbers as text.
  traced.sort((first, second) => first - second);
  return traced.map((index) => cellPosition(state.size, index));
}
