// Step (b) of the cube phase: fluids flow
// (design doc 6.2 and 6.4; 0014 item 1(b) and items 12 and 16).
//
// The order inside the step is fixed by 0014 item 1(b):
//   1. water flows (item 12: Fall, then Level);
//   2. pumps remove water (empty here; the camp tools task, issue #58);
//   3. lava flows by the same two rules, on even-numbered shifts only (item 16);
//   4. every water cell beside a lava cell, and that lava cell, become stone;
//   5. lava's damage to the avatar is recorded, once (decision note 0015).
//
// HOW A FLUID FLOWS (item 12). A cell holds one unit or none. One call of
// `flowFluid` is one step for one fluid, in two parts:
//
//   FALL, decided from the cells as they are when the step starts: every
//   unit with a free cell under it moves down one cell.
//
//   LEVEL, decided from the cells as they are after Fall. The fluid is split
//   into bodies (units joined face to face). For each body, every free cell
//   that touches a unit of the body that has not moved this step is a
//   "target". The targets are taken lowest first; each receives the body's
//   highest unit that has not moved, but only if the target is lower than
//   that unit.
//
// A unit moves at most once a step. So fluid advances one cell a step, down
// a hole or along a tunnel; the cell a unit fell from is refilled from the
// top of its body; and one layer of fluid on a flat floor stays where it is.
//
// A "free" cell is inside the grid, open, and holds neither water nor lava
// (water and lava never share a cell, item 16). The cells beyond the grid
// are solid for every flow, so nothing flows onto the surface.
//
// Nothing here uses randomness, and nothing reads anything but `state`: the
// forecast runs this step on a copy of the cube (0014 item 4).

import { BLOCKS, HAZARDS, STRUCTURES } from '../../data';
import type { Vec3 } from '../../data';
import { destroyCampsAt, destroyLooseItems, destroyStructure } from '../destroy';
import type { FluidKind, GameEvent } from '../events';
import { FACE_OFFSETS, offsetPosition } from '../neighbours';
import {
  cellCount,
  cellIndex,
  cellPosition,
  gasAt,
  inGrid,
  isLavaSource,
  isOpen,
  lavaAt,
  samePosition,
  setBlock,
  setGas,
  setLava,
  setWater,
  structureAt,
  waterAt,
} from '../state';
import type { GameState } from '../state';
import { recordDamage } from './phase';
import type { CubePhase } from './phase';

// ---------------------------------------------------------------------------
// Small readers and writers shared by water and lava
// ---------------------------------------------------------------------------

/** True if the cell `pos` holds a unit of `fluid`. */
function holdsFluid(state: GameState, fluid: FluidKind, pos: Vec3): boolean {
  return fluid === 'water' ? waterAt(state, pos) > 0 : lavaAt(state, pos) > 0;
}

/**
 * True if a unit of water or lava may move into the cell `pos`: it is inside
 * the grid, open, and holds neither water nor lava. Item 12 says "open, dry";
 * a cell of lava is not counted as dry, so that the two fluids never share a
 * cell (item 16).
 */
function isFreeForFluid(state: GameState, pos: Vec3): boolean {
  return (
    inGrid(state.size, pos) &&
    isOpen(state, pos) &&
    waterAt(state, pos) === 0 &&
    lavaAt(state, pos) === 0
  );
}

/** True if lava destroys this structure when it enters its cell (item 16). */
function lavaDestroysStructure(structureCode: number): boolean {
  // Item 16 lists ladders, torches, supports, vents, pumps and safety lamps:
  // every structure there is except a placed explosive, which is left to go
  // off in step (c).
  return structureCode !== STRUCTURES.explosive.code;
}

/**
 * Move one unit of `fluid` from `from` into the free cell `to`, and destroy
 * what the fluid destroys on entering a cell:
 * - water: any camp the cell belongs to (item 30), and nothing else;
 * - lava: the structure in the cell (not an explosive), loose items, and any
 *   camp the cell belongs to (items 16 and 30).
 *
 * A lava source that gives up its unit is full again at once (item 16), so
 * the source cell keeps its lava; the cell the unit arrives in is ordinary
 * lava, not a source.
 */
function moveUnit(
  state: GameState,
  fluid: FluidKind,
  from: Vec3,
  to: Vec3,
  events: GameEvent[],
): void {
  if (fluid === 'water') {
    setWater(state, from, 0);
    setWater(state, to, HAZARDS.water.unitsPerCell);
  } else {
    if (!isLavaSource(state, from)) {
      setLava(state, from, 0);
    }
    setLava(state, to, HAZARDS.lava.unitsPerCell);
  }
  events.push({ type: 'fluidMoved', fluid, from: { ...from }, to: { ...to } });

  if (fluid === 'lava') {
    if (lavaDestroysStructure(structureAt(state, to))) {
      destroyStructure(state, to, 'lava', events);
    }
    destroyLooseItems(state, to, 'lava', events);
  }
  destroyCampsAt(state, to, fluid, events);
}

// ---------------------------------------------------------------------------
// One flow step for one fluid (item 12)
// ---------------------------------------------------------------------------

/**
 * The indices of all cells, bottom layer first, index order within a layer:
 * the order item 12 takes cells in.
 */
function cellsBottomLayerFirst(state: GameState): number[] {
  const perLayer = state.size.x * state.size.y;
  const order: number[] = [];
  for (let z = state.size.z - 1; z >= 0; z -= 1) {
    for (let inLayer = 0; inLayer < perLayer; inLayer += 1) {
      order.push(z * perLayer + inLayer);
    }
  }
  return order;
}

/**
 * One flow step for `fluid`: Fall, then Level. Changes `state` in place and
 * appends a `fluidMoved` (and whatever the fluid destroyed) for each move.
 */
function flowFluid(state: GameState, fluid: FluidKind, events: GameEvent[]): void {
  const size = state.size;
  const cells = cellCount(size);

  // `moved[i]` is 1 when the unit now in cell i has already moved this step.
  // A unit that arrives in a cell is marked there. A lava source that gave
  // its unit away is NOT marked: it is full again and "can give again in the
  // same step" (item 16).
  const moved = new Uint8Array(cells);

  // --- Fall -----------------------------------------------------------------
  // Decided from the cells as they are now, before anything moves: first list
  // every unit that will fall, then move them. A column of water over a hole
  // therefore loses only its bottom unit to Fall; Level then refills it.
  const falls: { from: Vec3; to: Vec3 }[] = [];
  for (const index of cellsBottomLayerFirst(state)) {
    const from = cellPosition(size, index);
    if (!holdsFluid(state, fluid, from)) {
      continue;
    }
    const below = { x: from.x, y: from.y, z: from.z + 1 };
    if (isFreeForFluid(state, below)) {
      falls.push({ from, to: below });
    }
  }
  for (const fall of falls) {
    // "A move into a cell already taken this step is skipped." Two units
    // never fall into one cell, so this cannot happen here; the check keeps
    // the rule in one visible place all the same.
    if (!isFreeForFluid(state, fall.to)) {
      continue;
    }
    moveUnit(state, fluid, fall.from, fall.to, events);
    moved[cellIndex(size, fall.to)] = 1;
  }

  // --- Level ----------------------------------------------------------------
  // Decided from the cells as they are after Fall: first work out every body,
  // its unmoved units and its targets; only then move anything.
  const plans = planLevel(state, fluid, moved);
  for (const plan of plans) {
    // `next` walks the body's unmoved units from the highest down.
    let next = 0;
    for (const target of plan.targets) {
      if (!isFreeForFluid(state, target)) {
        // Another body (taken earlier) filled this cell: the move is skipped.
        continue;
      }
      const giver = plan.givers[next];
      if (giver === undefined) {
        break; // No unmoved unit remains in this body.
      }
      // The target must be LOWER than the unit it would receive. Depth grows
      // with z, so "lower" is a larger z. Fluid never moves level or up.
      if (target.z <= giver.z) {
        continue;
      }
      const giverIsSource = fluid === 'lava' && isLavaSource(state, giver);
      moveUnit(state, fluid, giver, target, events);
      moved[cellIndex(size, target)] = 1;
      if (!giverIsSource) {
        // An ordinary cell is now empty: the next target is served by the
        // next highest unit. A source is full again and gives again.
        next += 1;
      }
    }
  }
}

/** What Level will try for one body of fluid. */
interface LevelPlan {
  /**
   * The body's units that have not moved this step, highest cell first, and
   * the last index first among cells on one layer ("the body's highest cell,
   * last index among the highest").
   */
  givers: Vec3[];
  /**
   * The free cells that touch an unmoved unit of the body, lowest cell first,
   * then in index order.
   */
  targets: Vec3[];
}

/**
 * Split the fluid into bodies (units joined face to face) and work out each
 * body's `LevelPlan`. Bodies come out in the order of their lowest-index
 * cell. Does not change `state`.
 */
function planLevel(state: GameState, fluid: FluidKind, moved: Uint8Array): LevelPlan[] {
  const size = state.size;
  const cells = cellCount(size);
  const inSomeBody = new Uint8Array(cells);
  const plans: LevelPlan[] = [];

  for (let start = 0; start < cells; start += 1) {
    if (inSomeBody[start] === 1 || !holdsFluid(state, fluid, cellPosition(size, start))) {
      continue;
    }
    // Flood fill from `start`: collect the indices of every unit of the body.
    const body: number[] = [];
    const queue: number[] = [start];
    inSomeBody[start] = 1;
    while (queue.length > 0) {
      const index = queue.pop() as number;
      body.push(index);
      const pos = cellPosition(size, index);
      for (const offset of FACE_OFFSETS) {
        const beside = offsetPosition(pos, offset);
        if (!inGrid(size, beside) || !holdsFluid(state, fluid, beside)) {
          continue;
        }
        const besideIndex = cellIndex(size, beside);
        if (inSomeBody[besideIndex] === 0) {
          inSomeBody[besideIndex] = 1;
          queue.push(besideIndex);
        }
      }
    }

    // The units that may still move, and the free cells beside them.
    const giverIndices: number[] = [];
    const targetIndices = new Set<number>();
    for (const index of body) {
      if (moved[index] === 1) {
        continue;
      }
      giverIndices.push(index);
      const pos = cellPosition(size, index);
      for (const offset of FACE_OFFSETS) {
        const beside = offsetPosition(pos, offset);
        if (isFreeForFluid(state, beside)) {
          targetIndices.add(cellIndex(size, beside));
        }
      }
    }
    if (giverIndices.length === 0 || targetIndices.size === 0) {
      continue;
    }

    // A cell's index grows with its depth (state.ts: cells are stored layer
    // by layer from the top), so the layer of index i is floor(i / perLayer).
    const perLayer = size.x * size.y;
    const layerOf = (index: number): number => Math.floor(index / perLayer);
    // Givers: highest layer first (smaller z), then the LAST index first.
    giverIndices.sort((a, b) => layerOf(a) - layerOf(b) || b - a);
    // Targets: lowest layer first (larger z), then index order.
    const sortedTargets = [...targetIndices].sort((a, b) => layerOf(b) - layerOf(a) || a - b);

    plans.push({
      givers: giverIndices.map((index) => cellPosition(size, index)),
      targets: sortedTargets.map((index) => cellPosition(size, index)),
    });
  }
  return plans;
}

// ---------------------------------------------------------------------------
// Pumps (0014 item 1(b): after water, before lava)
// ---------------------------------------------------------------------------

/**
 * Pumps remove water (0014 item 12: up to `HAZARDS.water.pumpUnitsPerShift`
 * units a shift from water cells within `HAZARDS.water.pumpReach` steps of
 * the pump through open cells, nearest first, then index order).
 *
 * EMPTY ON PURPOSE. The camp tools task (M2-8, issue #58) fills this in.
 * It is called here so that its place in the order is already fixed: after
 * water has flowed and before lava flows, so a pump can stop water and lava
 * from making stone, and on an even shift lava can enter a cell pumped dry in
 * the same step.
 *
 * Contract for M2-8: changes `state` in place, emits `fluidRemoved` with
 * reason `pumped` for each unit, reads nothing but `state`.
 */
export function stepPumps(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet.
}

// ---------------------------------------------------------------------------
// Water beside lava turns to stone (item 16)
// ---------------------------------------------------------------------------

/** True if a face neighbour of `pos` holds a unit of `fluid`. */
function isBesideFluid(state: GameState, fluid: FluidKind, pos: Vec3): boolean {
  return FACE_OFFSETS.some((offset) => holdsFluid(state, fluid, offsetPosition(pos, offset)));
}

/**
 * Every water cell beside a lava cell, and that lava cell, become stone. All
 * of them are found first and changed afterwards, so the result does not
 * depend on the order the cells are looked at. The avatar's own cell never
 * turns to stone: its water or lava stays as it is.
 *
 * A source that turns to stone stops being one. A solid cell holds nothing,
 * so whatever was in the cell (gas, loose items, a structure that the water
 * had spared) is destroyed with it.
 */
function turnWaterBesideLavaToStone(state: GameState, events: GameEvent[]): void {
  const size = state.size;
  const cells = cellCount(size);
  const toStone: { pos: Vec3; fluid: FluidKind }[] = [];
  for (let index = 0; index < cells; index += 1) {
    const pos = cellPosition(size, index);
    if (samePosition(pos, state.avatar.pos)) {
      continue;
    }
    if (waterAt(state, pos) > 0 && isBesideFluid(state, 'lava', pos)) {
      toStone.push({ pos, fluid: 'water' });
    } else if (lavaAt(state, pos) > 0 && isBesideFluid(state, 'water', pos)) {
      toStone.push({ pos, fluid: 'lava' });
    }
  }

  for (const cell of toStone) {
    const pos = cell.pos;
    if (cell.fluid === 'water') {
      setWater(state, pos, 0);
    } else {
      setLava(state, pos, 0); // Also clears the source flag.
    }
    events.push({
      type: 'fluidRemoved',
      fluid: cell.fluid,
      pos: { ...pos },
      reason: 'turnedToStone',
    });

    destroyStructure(state, pos, 'lava', events);
    destroyLooseItems(state, pos, 'lava', events);
    const gas = gasAt(state, pos);
    if (gas > 0) {
      setGas(state, pos, 0);
      events.push({ type: 'gasRemoved', pos: { ...pos }, units: gas, reason: 'turnedToStone' });
    }

    setBlock(state, pos, BLOCKS.stone.code);
    events.push({ type: 'stoneFormed', pos: { ...pos } });
  }
}

// ---------------------------------------------------------------------------
// Lava and the avatar (item 16)
// ---------------------------------------------------------------------------

/** True if lava flows in the cube phase that ends the shift numbered `shift`. */
export function lavaFlowsInShift(shift: number): boolean {
  return shift % HAZARDS.lava.flowEveryShifts === 0;
}

/**
 * Record lava's damage to the avatar, from where the lava is now: lava in
 * the avatar's own cell deals `HAZARDS.lava.damageInCell`; otherwise lava in
 * one or more of the cells beside it deals `HAZARDS.lava.damageBeside`, once
 * however many of them hold lava. Recorded once a cube phase, on odd shifts
 * as well as even ones: standing in or beside lava burns whether or not the
 * lava moved.
 */
function recordLavaDamage(state: GameState, phase: CubePhase): void {
  const here = state.avatar.pos;
  if (lavaAt(state, here) > 0) {
    recordDamage(phase, HAZARDS.lava.damageInCell, 'lava');
  } else if (isBesideFluid(state, 'lava', here)) {
    recordDamage(phase, HAZARDS.lava.damageBeside, 'lava');
  }
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/**
 * Step (b) of the cube phase, in the order 0014 item 1(b) gives:
 * 1. water flows (item 12: Fall, then Level);
 * 2. pumps remove water (`stepPumps`, empty until M2-8);
 * 3. lava flows by the same rules, in the cube phase of even-numbered shifts
 *    only (item 16);
 * 4. every water cell beside a lava cell, and that lava cell, become stone;
 * 5. lava's damage to the avatar (in its cell, or beside it) is recorded
 *    with `recordDamage(phase, ...)`, from where the lava is at the end of
 *    this step (decision note 0015).
 *
 * Changes `state` in place and appends to `events`. Uses no randomness.
 * Never moves the avatar (0014 item 2).
 *
 * The forecast runs this step on a copy of the cube (0014 item 4), so it
 * reads nothing but `state`.
 */
export function stepFluids(state: GameState, events: GameEvent[], phase: CubePhase): void {
  flowFluid(state, 'water', events);
  stepPumps(state, events);
  if (lavaFlowsInShift(state.shift)) {
    flowFluid(state, 'lava', events);
  }
  turnWaterBesideLavaToStone(state, events);
  recordLavaDamage(state, phase);
}
