// Explosions, and the two things that set one off on a timer: armed unstable
// ore and the placed explosive (design doc 6.3, 6.5 and 7.2; 0014 items 14,
// 15 and 17).
//
// Words used here, as 0014 item 15 uses them:
// - the EXPLODING CELLS of an explosion are the cells that go off: the one
//   cell of a charge, or all the connected gassy cells of ignited gas;
// - its BLAST is those cells and the six face neighbours of each ("radius
//   1"). The blast is where an avatar is hurt and where structures and camps
//   are destroyed.
//
// Everything here reads and changes only the `state` it is given, uses no
// randomness, and never moves or hurts the avatar directly: damage goes into
// the cube phase's notes (`recordDamage`) for step (e) to apply.

import { BLOCKS, HAZARDS, STRUCTURES } from '../data';
import type { Vec3 } from '../data';
import { recordDamage } from './cube/phase';
import type { CubePhase } from './cube/phase';
import { destroyCampsAt, destroyStructure } from './destroy';
import type { GameEvent } from './events';
import { FACE_OFFSETS, offsetPosition } from './neighbours';
import {
  armCharge,
  blockAt,
  comparePositions,
  inGrid,
  isRevealed,
  isSolid,
  samePosition,
  setBlock,
  structureAt,
} from './state';
import type { ArmedCharge, GameState } from './state';

/**
 * The blast of an explosion: its exploding cells and the six face neighbours
 * of each, every cell once, in cell order (z, then y, then x). Cells outside
 * the grid are included; nothing there can be destroyed, but the avatar can
 * stand on the surface.
 */
export function blastCells(cells: readonly Vec3[]): Vec3[] {
  // A dict keyed by "x,y,z" drops the cells that two exploding cells share.
  const byKey = new Map<string, Vec3>();
  for (const cell of cells) {
    byKey.set(`${cell.x},${cell.y},${cell.z}`, { ...cell });
    for (const offset of FACE_OFFSETS) {
      const beside = offsetPosition(cell, offset);
      byKey.set(`${beside.x},${beside.y},${beside.z}`, beside);
    }
  }
  return [...byKey.values()].sort(comparePositions);
}

/**
 * One explosion: all of `cells` go off together (0014 item 15).
 *
 * - Emits one `exploded` event listing the cells.
 * - Destroys, at this moment, every structure in the blast (ladders, torches,
 *   supports, everything: item 15 names no exception) and every camp that has
 *   a cell in the blast (item 30).
 * - Records `HAZARDS.explosion.damage` ONCE if the avatar is anywhere in the
 *   blast, however many of the cells it is in or beside.
 *
 * It removes no block and no gas: the caller does that, because it differs
 * between ignited gas, unstable ore and the explosive. Loose items are left
 * alone, because item 15 does not list them (unlike items 8, 12 and 16).
 * Blocks left unsupported are not looked at here: step (a) of the next cube
 * phase finds them.
 */
export function explode(
  state: GameState,
  cells: readonly Vec3[],
  events: GameEvent[],
  phase: CubePhase,
): void {
  events.push({ type: 'exploded', cells: cells.map((cell) => ({ ...cell })) });

  const blast = blastCells(cells);
  let avatarInBlast = false;
  for (const cell of blast) {
    if (inGrid(state.size, cell)) {
      destroyStructure(state, cell, 'explosion', events);
      destroyCampsAt(state, cell, 'explosion', events);
    }
    if (samePosition(cell, state.avatar.pos)) {
      avatarInBlast = true;
    }
  }
  if (avatarInBlast) {
    recordDamage(phase, HAZARDS.explosion.damage, 'explosion');
  }
}

/**
 * Armed unstable ore goes off (0014 item 17): the ore block is destroyed with
 * no yield and its cell explodes. No other block is removed.
 */
function detonateUnstableOre(
  state: GameState,
  pos: Vec3,
  events: GameEvent[],
  phase: CubePhase,
): void {
  // The block is still there unless an explosive beside it, earlier in this
  // same step, has already removed it.
  if (blockAt(state, pos) === BLOCKS.unstableOre.code) {
    setBlock(state, pos, BLOCKS.air.code);
    events.push({ type: 'blockDestroyed', pos: { ...pos }, block: BLOCKS.unstableOre.code });
  }
  explode(state, [pos], events, phase);
}

/**
 * A placed explosive goes off (0014 item 15): its own cell explodes, and the
 * solid blocks beside it (its six face neighbours) are removed with no yield.
 * Bedrock, which is everything outside the grid, stays.
 */
function detonateExplosive(
  state: GameState,
  pos: Vec3,
  events: GameEvent[],
  phase: CubePhase,
): void {
  // The explosion destroys the explosive's own structure with everything
  // else in the blast.
  explode(state, [pos], events, phase);
  for (const offset of FACE_OFFSETS) {
    const beside = offsetPosition(pos, offset);
    if (!inGrid(state.size, beside) || !isSolid(state, beside)) {
      continue;
    }
    const block = blockAt(state, beside);
    if (block === BLOCKS.bedrock.code) {
      continue;
    }
    // `setBlock` also clears the block's crack.
    setBlock(state, beside, BLOCKS.air.code);
    events.push({ type: 'blockDestroyed', pos: beside, block });
  }
}

/**
 * Every armed charge goes off, and `state.armed` is emptied (0014 item 1(c)).
 * Returns the cells that exploded, in the order they went off, so that the
 * ignition that follows can light gas in or beside them.
 *
 * The charges are taken in cell order, and EVERY one goes off, even one that
 * an earlier explosion of this same step has reached (an explosive whose
 * structure the blast beside it destroyed; ore whose block the explosive
 * beside it removed). They are all due at the same moment, and the forecast
 * promises each of them as a countdown that cannot turn out differently
 * (0014 item 4). Each charge is one explosion of its own.
 */
export function detonateCharges(state: GameState, events: GameEvent[], phase: CubePhase): Vec3[] {
  // Take the list and empty it first: what happens below (a block removed, a
  // structure destroyed) may also try to disarm cells, and must not change
  // the list while it is being walked.
  const charges: ArmedCharge[] = state.armed;
  state.armed = [];

  const exploded: Vec3[] = [];
  for (const charge of charges) {
    if (charge.kind === 'unstableOre') {
      detonateUnstableOre(state, charge.pos, events, phase);
    } else {
      detonateExplosive(state, charge.pos, events, phase);
    }
    exploded.push({ ...charge.pos });
  }
  return exploded;
}

/**
 * True if the unstable ore at `pos` is braced: a support stands in one of the
 * six cells beside it (0014 item 17).
 */
export function isBraced(state: GameState, pos: Vec3): boolean {
  for (const offset of FACE_OFFSETS) {
    if (structureAt(state, offsetPosition(pos, offset)) === STRUCTURES.support.code) {
      return true;
    }
  }
  return false;
}

/**
 * The avatar has just mined the block at `minedPos`: arm the unstable ore
 * beside it (0014 item 17). `applyMine` calls this for every block it mines.
 *
 * An ore block is armed only if all of these hold:
 * - it is a face neighbour of the mined block;
 * - it is REVEALED now, which is before the reveal that follows the mining.
 *   So ore the player had not seen when it chose to mine is never armed, and
 *   every detonation follows a glow the player could read (owner question
 *   58). This is the one test that looks at `revealed`, and it only ever lets
 *   LESS happen for an unseen cell;
 * - it is not braced.
 *
 * An armed ore goes off in step (c) of the cube phase that ends this shift.
 * Emits `oreArmed` for each ore newly armed. A support placed later does not
 * disarm it; mining the ore itself does (`setBlock` forgets the charge).
 */
export function armUnstableOreBeside(state: GameState, minedPos: Vec3, events: GameEvent[]): void {
  for (const offset of FACE_OFFSETS) {
    const beside = offsetPosition(minedPos, offset);
    if (!inGrid(state.size, beside) || blockAt(state, beside) !== BLOCKS.unstableOre.code) {
      continue;
    }
    if (!isRevealed(state, beside) || isBraced(state, beside)) {
      continue;
    }
    const alreadyArmed = state.armed.some((charge) => samePosition(charge.pos, beside));
    if (alreadyArmed) {
      continue;
    }
    armCharge(state, beside, 'unstableOre');
    events.push({ type: 'oreArmed', pos: beside });
  }
}
