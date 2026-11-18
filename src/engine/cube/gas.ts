// Step (c) of the cube phase: gas, vents, charges, ignition
// (design doc 6.3 and 6.5; 0014 item 1(c) and items 13 to 15 and 17).
//
// The order, fixed by 0014 item 1(c):
// 1. gas spreads (item 13);
// 2. vents act (the vent is task M2-8; `ventsAct` is its place);
// 3. armed unstable ore and placed explosives go off (items 15 and 17);
// 4. ignition (item 14), repeated until nothing new explodes.
//
// The forecast runs this step on a copy of the cube (0014 item 4), so nothing
// here reads anything but the `state` it is given and the numbers in src/data.

import { STRUCTURES } from '../../data';
import type { Vec3 } from '../../data';
import type { GameEvent } from '../events';
import { detonateCharges, explode } from '../explosions';
import { FACE_OFFSETS, offsetPosition } from '../neighbours';
import {
  cellCount,
  cellIndex,
  cellPosition,
  gasAt,
  inGrid,
  isOpen,
  lavaAt,
  setGas,
  structureAt,
  waterAt,
} from '../state';
import type { GameState } from '../state';
import type { CubePhase } from './phase';

// ---------------------------------------------------------------------------
// 1. Gas spreads
// ---------------------------------------------------------------------------

/**
 * True if gas can flow into the cell `pos`: it is open, and holds neither
 * water nor lava (0014 item 13). The surface layer above the cube is open, so
 * gas flows into it (and is then gone). Everything else outside the grid is
 * bedrock.
 */
function takesGas(state: GameState, pos: Vec3): boolean {
  return isOpen(state, pos) && waterAt(state, pos) === 0 && lavaAt(state, pos) === 0;
}

/**
 * Gas spreads one cell (0014 item 13).
 *
 * A gas cell with u units and n face neighbours that take gas gives
 * floor(u / (n + 1)) units to each and keeps the rest. Every gift is worked
 * out from the cube as it is at the START of the step, so the order the cells
 * are visited in does not matter: first all gifts are listed, then all are
 * handed over.
 *
 * - A cell with fewer units than n + 1 gives nothing, so thin gas stays.
 * - Units are conserved, except that a gift to the surface layer is gone
 *   (`gasRemoved`, reason `reachedSurface`, reported at the cell it left).
 * - Emits one `gasMoved` for each gift, givers in cell order and each
 *   giver's neighbours in the order of `FACE_OFFSETS`.
 */
export function spreadGas(state: GameState, events: GameEvent[]): void {
  interface Gift {
    from: Vec3;
    to: Vec3;
    units: number;
  }
  const gifts: Gift[] = [];

  // Pass 1: list the gifts. Nothing is changed yet.
  const cells = cellCount(state.size);
  for (let index = 0; index < cells; index += 1) {
    // `as number`: the index is inside the array.
    const units = state.gas[index] as number;
    if (units === 0) {
      continue;
    }
    const from = cellPosition(state.size, index);
    const takers: Vec3[] = [];
    for (const offset of FACE_OFFSETS) {
      const beside = offsetPosition(from, offset);
      if (takesGas(state, beside)) {
        takers.push(beside);
      }
    }
    const share = Math.floor(units / (takers.length + 1));
    if (share === 0) {
      continue;
    }
    for (const to of takers) {
      gifts.push({ from, to, units: share });
    }
  }

  // Pass 2: hand them over.
  for (const gift of gifts) {
    setGas(state, gift.from, gasAt(state, gift.from) - gift.units);
    if (inGrid(state.size, gift.to)) {
      setGas(state, gift.to, gasAt(state, gift.to) + gift.units);
      events.push({ type: 'gasMoved', from: gift.from, to: gift.to, units: gift.units });
    } else {
      // The only open cells outside the grid are the surface layer.
      events.push({
        type: 'gasRemoved',
        pos: gift.from,
        units: gift.units,
        reason: 'reachedSurface',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Vents
// ---------------------------------------------------------------------------

/**
 * PLACEHOLDER for the camp tools task (M2-8, issue #58): vents act here,
 * after gas has spread and before anything explodes (0014 item 13).
 *
 * Contract for M2-8: for each vent structure, if a path of open cells (gassy
 * or not, not flooded) joins it to the surface, remove all gas within
 * `HAZARDS.gas.ventReach` steps of it through open cells, emitting
 * `gasRemoved` with reason `vented`. Read nothing but `state`.
 */
export function ventsAct(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet: there is no way to place a vent until M2-8.
}

// ---------------------------------------------------------------------------
// 4. Ignition
// ---------------------------------------------------------------------------

/**
 * True if something in the cell `pos` lights gas (0014 item 14): a torch,
 * lava, or an explosion of this step (`explodedCells` marks those cells with
 * 1). A safety lamp does not, and neither does the avatar's own lamp, which
 * is why the avatar is not looked at here at all.
 */
function lightsGas(state: GameState, pos: Vec3, explodedCells: Uint8Array): boolean {
  if (!inGrid(state.size, pos)) {
    return false;
  }
  return (
    structureAt(state, pos) === STRUCTURES.torch.code ||
    lavaAt(state, pos) > 0 ||
    explodedCells[cellIndex(state.size, pos)] === 1
  );
}

/**
 * The bodies of gas in the cube: each is a list of gassy cells (1 unit or
 * more) joined face to face, in the order the search reached them. Bodies
 * come in the order of their lowest-index cell.
 */
function gasBodies(state: GameState): Vec3[][] {
  const cells = cellCount(state.size);
  const seen = new Uint8Array(cells);
  const bodies: Vec3[][] = [];
  for (let index = 0; index < cells; index += 1) {
    if (seen[index] === 1 || state.gas[index] === 0) {
      continue;
    }
    // Flood fill from this cell.
    const body: Vec3[] = [];
    const queue: Vec3[] = [cellPosition(state.size, index)];
    seen[index] = 1;
    while (queue.length > 0) {
      // `as Vec3`: the queue is not empty.
      const cell = queue.shift() as Vec3;
      body.push(cell);
      for (const offset of FACE_OFFSETS) {
        const beside = offsetPosition(cell, offset);
        if (gasAt(state, beside) === 0) {
          continue; // also true for every cell outside the grid
        }
        const besideIndex = cellIndex(state.size, beside);
        if (seen[besideIndex] === 0) {
          seen[besideIndex] = 1;
          queue.push(beside);
        }
      }
    }
    bodies.push(body);
  }
  return bodies;
}

/**
 * Ignition (0014 item 14), repeated until nothing new explodes.
 *
 * Each round: find every body of gas that has a torch, lava, or a cell that
 * has exploded in this step in or beside one of its cells, judged from the
 * cube as it is at the start of the round; then each such body goes off as
 * ONE explosion (item 15) and its gas is burnt. Judging the whole round
 * first means a torch that stands between two separate bodies lights both,
 * whichever is taken first.
 *
 * `exploded` is the cells that went off earlier in this step (the charges).
 *
 * How long a chain can be: bodies are joined face to face, so no gas is left
 * beside a body that has just burnt, and exploding gas never lights other
 * gas. A chain is therefore a charge that lights gas, and the second round
 * finds nothing. The loop is still written as "until nothing new explodes",
 * as item 1(c) words it, so that it stays right if a later rule lets an
 * explosion reach further.
 */
export function igniteGas(
  state: GameState,
  exploded: readonly Vec3[],
  events: GameEvent[],
  phase: CubePhase,
): void {
  // 1 for every cell that has exploded in this step, charges and gas alike.
  const explodedCells = new Uint8Array(cellCount(state.size));
  for (const cell of exploded) {
    explodedCells[cellIndex(state.size, cell)] = 1;
  }

  for (;;) {
    // Judge every body before anything goes off.
    const lit: Vec3[][] = [];
    for (const body of gasBodies(state)) {
      const isLit = body.some(
        (cell) =>
          lightsGas(state, cell, explodedCells) ||
          FACE_OFFSETS.some((offset) =>
            lightsGas(state, offsetPosition(cell, offset), explodedCells),
          ),
      );
      if (isLit) {
        lit.push(body);
      }
    }
    if (lit.length === 0) {
      return;
    }

    for (const body of lit) {
      // Report the cells in cell order, whatever order the search found them in.
      const cells = [...body].sort((a, b) => cellIndex(state.size, a) - cellIndex(state.size, b));
      explode(state, cells, events, phase);
      for (const cell of cells) {
        const units = gasAt(state, cell);
        setGas(state, cell, 0);
        events.push({ type: 'gasRemoved', pos: cell, units, reason: 'burnt' });
        explodedCells[cellIndex(state.size, cell)] = 1;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/**
 * Step (c). Changes `state` in place and appends to `events`. Uses no
 * randomness and never moves the avatar (0014 item 2): an explosion's damage
 * is recorded in `phase`, once for each explosion, and step (e) applies it.
 *
 * Reads nothing but `state`, so the forecast can run it on a copy.
 */
export function stepGas(state: GameState, events: GameEvent[], phase: CubePhase): void {
  spreadGas(state, events);
  ventsAct(state, events);
  const exploded = detonateCharges(state, events, phase);
  igniteGas(state, exploded, events, phase);
}
