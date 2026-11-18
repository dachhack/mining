// Camps (design doc 8, [Decided]; 0014 items 25 to 30).
//
// This file holds the camp rules that are not an action of their own:
// - which cells a camp covers, and which camp the avatar is in;
// - whether a camp may be founded here, and if not, why (item 26);
// - the limit of one camp kit carried (design doc 8; item 25);
// - the fuel that camps burn at upkeep (item 28);
// - rest, applied in step (e) of the cube phase (item 27).
//
// The actions themselves (found, rest, stash, decommission) are in
// actions/camp.ts, camp recipes are in actions/craft.ts, the air line is in
// airLine.ts, and destruction is `destroyCampsAt` in destroy.ts, which each
// hazard calls at the moment of its event (item 30).

import { AVATAR, CAMPS, HAZARDS, NO_STRUCTURE, blockDefByCode } from '../data';
import type { Vec3 } from '../data';
import { campAirLineIntact } from './airLine';
import type { GameEvent } from './events';
import { knownCell } from './known';
import { countItem, inGrid, samePosition } from './state';
import type { Camp, GameState } from './state';

/**
 * The cells of a camp (0014 item 26): `CAMPS.halfWidth` cells to each side of
 * `camp.pos` (3 x 3 with today's numbers), on `CAMPS.height` layers: the
 * layer of `camp.pos` and the ones above it (2 with today's numbers, so 18
 * cells). Listed top layer first, then by row, then by column.
 */
export function campCells(camp: Camp): Vec3[] {
  return campCellsAround(camp.pos);
}

/** The cells a camp founded at `pos` covers; see `campCells`. */
function campCellsAround(pos: Vec3): Vec3[] {
  const cells: Vec3[] = [];
  // "Above" is a smaller z: the top layer of the camp is listed first.
  for (let dz = CAMPS.height - 1; dz >= 0; dz -= 1) {
    for (let dy = -CAMPS.halfWidth; dy <= CAMPS.halfWidth; dy += 1) {
      for (let dx = -CAMPS.halfWidth; dx <= CAMPS.halfWidth; dx += 1) {
        cells.push({ x: pos.x + dx, y: pos.y + dy, z: pos.z - dz });
      }
    }
  }
  return cells;
}

/**
 * The cells under a camp founded at `pos`: its floor (9 with today's
 * numbers), by row, then by column. With the camp's own cells these are the
 * 27 cells founding is judged by (0014 item 26).
 */
function campFloorCellsAround(pos: Vec3): Vec3[] {
  const cells: Vec3[] = [];
  for (let dy = -CAMPS.halfWidth; dy <= CAMPS.halfWidth; dy += 1) {
    for (let dx = -CAMPS.halfWidth; dx <= CAMPS.halfWidth; dx += 1) {
      cells.push({ x: pos.x + dx, y: pos.y + dy, z: pos.z + 1 });
    }
  }
  return cells;
}

/** The active camps that the cell `pos` belongs to, in the order of `state.camps`. */
export function campsAt(state: GameState, pos: Vec3): Camp[] {
  return state.camps.filter((camp) => campCells(camp).some((cell) => samePosition(cell, pos)));
}

/**
 * The active camp the avatar is in (its cell is one of the camp's 18), or
 * `null` if it is in none. Camps do not overlap (`foundingProblem`), so there
 * is at most one; if a hand-built state has two, the first in `state.camps`
 * is used.
 *
 * This is one of the objects in `state.camps`, not a copy: changing its stash
 * changes the state.
 */
export function campOfAvatar(state: GameState): Camp | null {
  const camps = campsAt(state, state.avatar.pos);
  // `?? null`: an empty list has no first entry, which reads as `undefined`.
  return camps[0] ?? null;
}

// ---------------------------------------------------------------------------
// The camp kit (design doc 8; 0014 item 25)
// ---------------------------------------------------------------------------

/**
 * How many more of `item` the avatar may take, as far as the camp-kit limit
 * goes: "the avatar can carry only one kit" (design doc 8). For the kit this
 * is `CAMPS.maxKitsCarried` less the kits carried; for every other item there
 * is no such limit and the answer is `Infinity`.
 *
 * The carry weight is a separate limit (inventory.ts). Everything that puts
 * an item into the inventory by the player's choice asks both: picking up,
 * taking from a stash, and crafting.
 */
export function kitLimitRoomFor(state: GameState, item: string): number {
  if (item !== CAMPS.kitItem) {
    return Infinity;
  }
  return Math.max(0, CAMPS.maxKitsCarried - countItem(state, CAMPS.kitItem));
}

// ---------------------------------------------------------------------------
// Founding (design doc 8; 0014 item 26)
// ---------------------------------------------------------------------------

/**
 * Why a camp cannot be founded where the avatar stands:
 * - `noKit`: the avatar carries no camp kit;
 * - `noAp`: fewer than `CAMPS.foundMinAp` action points are left;
 * - `notInCube`: the avatar is on the surface, not in a cell of the cube;
 * - `unrevealed`: one of the 27 cells has not been seen;
 * - `overlap`: one of the 18 camp cells belongs to an active camp;
 * - `notCleared`: one of the 18 camp cells is solid, or holds a structure,
 *   water, lava or gas;
 * - `noFloor`: one of the 9 cells under them is not solid.
 *
 * (A `type` made of quoted words is a string that may only be one of them,
 * like Python's `Literal['noKit', 'noAp', ...]`.)
 */
export type FoundingProblem =
  'noKit' | 'noAp' | 'notInCube' | 'unrevealed' | 'overlap' | 'notCleared' | 'noFloor';

/**
 * The first reason, in the order of `FoundingProblem`, that a camp cannot be
 * founded around the avatar's cell now, or `null` if it can (0014 item 26).
 *
 * The camp is judged by 27 cells centred on the avatar: the 18 camp cells
 * (3 x 3, 2 high, the avatar in the middle of the lower layer) must be
 * cleared, meaning open with no structure, water, lava or gas; the 9 cells
 * under them must be solid.
 *
 * Hidden information (0014 item 3): the cells are read only through
 * `knownCell`, and whether all 27 are revealed is settled before anything
 * about their contents is looked at. So neither the answer nor the reason can
 * depend on a cell the player has not seen. Does not change `state`.
 */
export function foundingProblem(state: GameState): FoundingProblem | null {
  if (countItem(state, CAMPS.kitItem) < 1) {
    return 'noKit';
  }
  if (state.ap < CAMPS.foundMinAp) {
    return 'noAp';
  }
  const pos = state.avatar.pos;
  if (!inGrid(state.size, pos)) {
    return 'notInCube';
  }
  const campCellList = campCellsAround(pos);
  const floorCellList = campFloorCellsAround(pos);

  // 1. All 27 must be revealed. Cells outside the grid count as revealed:
  //    they are surface air or bedrock (`knownCell`).
  for (const cell of [...campCellList, ...floorCellList]) {
    if (knownCell(state, cell) === null) {
      return 'unrevealed';
    }
  }

  // 2. Camps do not overlap. The player knows where its own camps are.
  for (const cell of campCellList) {
    if (campsAt(state, cell).length > 0) {
      return 'overlap';
    }
  }

  // 3. The 18 camp cells are cleared.
  for (const cell of campCellList) {
    const known = knownCell(state, cell);
    if (
      known === null ||
      blockDefByCode(known.block).solid ||
      known.structure !== NO_STRUCTURE ||
      known.water > 0 ||
      known.lava > 0 ||
      known.gas > 0
    ) {
      return 'notCleared';
    }
  }

  // 4. The 9 cells under them are solid. Bedrock under the cube counts.
  for (const cell of floorCellList) {
    const known = knownCell(state, cell);
    if (known === null || !blockDefByCode(known.block).solid) {
      return 'noFloor';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Upkeep (design doc 4 and 8; 0014 item 28)
// ---------------------------------------------------------------------------

/**
 * True if `camp` burns fuel at the upkeep that ends the current shift: each
 * active camp burns at the end of every `CAMPS.upkeepEveryShifts`-th shift,
 * counting the shift it was founded in as its first. So with 4, a camp
 * founded in shift 10 burns at the end of shifts 13, 17, 21, ...
 */
export function campUpkeepIsDue(state: GameState, camp: Camp): boolean {
  const shiftsActive = state.shift - camp.foundedShift + 1;
  return shiftsActive > 0 && shiftsActive % CAMPS.upkeepEveryShifts === 0;
}

/**
 * The fuel all active camps together burn at the upkeep that ends the current
 * shift, on top of the avatar's own (design doc 4). A destroyed or
 * decommissioned camp is no longer in `state.camps` and burns nothing.
 * Does not change `state`.
 */
export function campFuelDue(state: GameState): number {
  let fuel = 0;
  for (const camp of state.camps) {
    if (campUpkeepIsDue(state, camp)) {
      fuel += CAMPS.upkeepFuel;
    }
  }
  return fuel;
}

// ---------------------------------------------------------------------------
// Rest (design doc 4.1 and 8; 0014 items 2 and 27)
// ---------------------------------------------------------------------------

/**
 * Apply the rest the avatar chose this shift. Called in step (e) of the cube
 * phase when `state.avatar.resting` is true and the avatar is alive after
 * damage and air (0014 items 2 and 27).
 *
 * - Restores health to full (`healthRestored`), and air to full if the
 *   camp's air line is intact (`airChanged`, reason `rested`). No event for a
 *   gauge that was already full.
 * - The camp is the one the avatar is in now. If a hazard destroyed it
 *   earlier in this cube phase there is no camp left to rest in, and nothing
 *   is restored: camps are destroyed at the moment of the event (item 2).
 * - Does not clear `state.avatar.resting`: `stepAvatarEffects` does.
 */
export function applyRest(state: GameState, events: GameEvent[]): void {
  const camp = campOfAvatar(state);
  if (camp === null) {
    return;
  }

  const healthGained = AVATAR.startHealth - state.avatar.health;
  if (healthGained > 0) {
    state.avatar.health = AVATAR.startHealth;
    events.push({ type: 'healthRestored', amount: healthGained, health: state.avatar.health });
  }

  const airGained = HAZARDS.air.max - state.avatar.air;
  if (airGained > 0 && campAirLineIntact(state, camp)) {
    state.avatar.air = HAZARDS.air.max;
    events.push({ type: 'airChanged', delta: airGained, air: state.avatar.air, reason: 'rested' });
  }
}
