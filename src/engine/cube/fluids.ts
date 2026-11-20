// Step (b) of the cube phase: water and lava flow across the squares of the
// pit (design doc v0.2 sections 4, 6.2, 6.3 and 6.4; issue #99, task T10;
// decision note 0033).
//
// THE PICTURE. Water and lava stand on squares. A square `depth` levels down
// with `units` of water on it has its water surface `depth - units` levels
// below ground: every unit raises the surface by one level.
//
//   ground level  ----+           +----      the middle square is 3 deep and
//                     |           |          holds 2 units of water, so its
//                     |~~~~~~~~~~~|          water surface is 1 level below
//                     |~~~~~~~~~~~|          ground: its LEVEL is 1.
//                     +-----------+
//
// In this file a "level" is always counted downwards from ground level, like
// depth: a bigger number is lower. A dry square's level is its depth.
//
// THE FLOW RULE (6.3: "water moves at most one square, always towards a
// neighbour with a lower water level, until the pit is level").
// - Squares are visited row by row: y = 0 first, and x = 0 first in a row.
// - The square gives one unit to its lowest face neighbour (ties broken
//   north, east, south, west) if that neighbour's level is at least
//   `HAZARDS.water.flowMinDrop` (2) lower than its own, and repeats while
//   that holds. Levels are read at that moment, after every unit moved so
//   far.
// - A unit moves at most one square in a cube phase: a square gives away only
//   units it held when the step began, never one it has just been given.
// - Lava flows by the same rule, with its own levels, and only in the cube
//   phase of an even-numbered shift (`HAZARDS.lava.flowEveryShifts`).
//
// WHY 2 AND NOT 1. A move from level a to a level 2 or more lower leaves the
// two squares closer together. A move across a drop of only 1 would swap
// them, and the unit would go back and forth for ever. So one unit on a flat
// floor does not move, and a pit that has stopped flowing is level to within
// 1. Every move also lowers the sum over all squares of (height of the
// surface) squared, so the flowing always stops.
//
// GROUND LEVEL (3.1, 6.3). Nothing stands above ground level. A square can
// hold at most `depth` units; what is over that drains away on the surface
// (`fluidRemoved`, reason 'reachedSurface'). A move never fills a square to
// the brim, so this only happens to what a breach, a lava source or a block
// that landed on the square put there.
//
// SOURCES AND SINKS. Units of water and lava are otherwise conserved:
// - in: a lava source gives `HAZARDS.lava.sourceUnitsPerStep` on every lava
//   step (`lavaPoured`); a breach puts a pocket's contents on a square
//   (breach.ts, in the player phase);
// - out: what drains at ground level; water meeting lava, where one unit of
//   each becomes one stone block (`stoneFormed`). Pumps and sealant are T13.
//
// UNDER RUBBLE. A block that comes to rest on a square (a slump, design doc
// 6.1) lands in the cell that held the square's water or lava. The slump
// lifts them onto the rubble (`liftContents` in cube/slumps.ts): the square
// comes up 1 level and keeps all of it, and what would then stand above
// ground level drains here, in step (b) of the same cube phase.

import { BLOCKS, CREW, HAZARDS } from '../../data';
import type { Vec3 } from '../../data';
import { destroyCampsAt, destroyStructure } from '../destroy';
import type { FluidKind, GameEvent } from '../events';
import { SQUARE_STEPS, depthAt } from '../heightmap';
import { setLavaOn, setWaterOn } from '../standing';
import {
  clearCrack,
  inGrid,
  isLavaSource,
  lavaAt,
  setBlock,
  setLava,
  setWater,
  waterAt,
} from '../state';
import type { GameState } from '../state';
import { recordDamage, recordDamageBeside } from './phase';
import type { CubePhase } from './phase';

/**
 * The pit as the flow rule sees it: one entry per square in each list, row
 * by row, so square (x, y) is entry `x + width * y`. The step works on this
 * table and writes the result back to the cube at the end.
 */
interface Pit {
  width: number;
  height: number;
  /** How many levels down each square is. */
  depth: number[];
  /** Units of water standing on each square. */
  water: number[];
  /** Units of lava standing on each square. */
  lava: number[];
  /** True where the lava is a source (design doc 6.2). */
  source: boolean[];
}

/** One unit that moved from the square with index `from` to the one with index `to`. */
interface Move {
  from: number;
  to: number;
}

/** Read the pit from the cube. Does not change `state`. */
function readPit(state: GameState): Pit {
  const width = state.size.x;
  const height = state.size.y;
  const pit: Pit = { width, height, depth: [], water: [], lava: [], source: [] };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const depth = depthAt(state, x, y);
      let water = 0;
      let lava = 0;
      let source = false;
      // The open cells above the top block (as `contentsOn` in breach.ts).
      for (let z = 0; z < depth; z += 1) {
        const cell = { x, y, z };
        water += waterAt(state, cell);
        lava += lavaAt(state, cell);
        if (isLavaSource(state, cell)) {
          source = true;
        }
      }
      pit.depth.push(depth);
      pit.water.push(water);
      pit.lava.push(lava);
      pit.source.push(source);
    }
  }
  return pit;
}

/** The list of the pit that holds `fluid`. */
function unitsOf(pit: Pit, fluid: FluidKind): number[] {
  return fluid === 'water' ? pit.water : pit.lava;
}

/** The x and y of the square with index `square`. */
function squareX(pit: Pit, square: number): number {
  return square % pit.width;
}
function squareY(pit: Pit, square: number): number {
  return Math.floor(square / pit.width);
}

/**
 * The cell directly above a square's top block: where events say a square's
 * water or lava is. For a square at ground level this is the surface cell
 * (z = -1), the open air above the cube.
 */
function cellAbove(pit: Pit, square: number): Vec3 {
  return { x: squareX(pit, square), y: squareY(pit, square), z: (pit.depth[square] as number) - 1 };
}

/**
 * Ground level: a square holds at most `depth` units of a fluid. Whatever is
 * over that drains away on the surface.
 */
function drainAboveGround(pit: Pit, fluid: FluidKind, events: GameEvent[]): void {
  const units = unitsOf(pit, fluid);
  for (let square = 0; square < units.length; square += 1) {
    const room = pit.depth[square] as number;
    const here = units[square] as number;
    if (here <= room) {
      continue;
    }
    units[square] = room;
    if (fluid === 'lava' && room === 0) {
      pit.source[square] = false; // a square with no lava is never a source
    }
    events.push({
      type: 'fluidRemoved',
      fluid,
      pos: cellAbove(pit, square),
      units: here - room,
      reason: 'reachedSurface',
    });
  }
}

/**
 * The flow rule for one fluid (see the top of this file). Changes the pit's
 * list of that fluid and returns the moves in the order they were made.
 */
function flow(pit: Pit, fluid: FluidKind): Move[] {
  const units = unitsOf(pit, fluid);
  const minDrop = HAZARDS.water.flowMinDrop;
  // What each square may still give away: the units it held when the step
  // began. A unit it is given during the step is not in here, so no unit
  // moves twice.
  const mayGive = [...units];
  const moves: Move[] = [];

  for (let square = 0; square < units.length; square += 1) {
    // A lava source never gives away its last unit (see hazards.ts).
    const keeps = fluid === 'lava' && pit.source[square] ? HAZARDS.lava.sourceKeepsUnits : 0;
    const x = squareX(pit, square);
    const y = squareY(pit, square);

    while ((mayGive[square] as number) > 0 && (units[square] as number) > keeps) {
      // The lowest neighbour: the biggest level, the first of equals.
      let lowest = -1;
      let lowestLevel = 0;
      for (const step of SQUARE_STEPS) {
        const nx = x + step.dx;
        const ny = y + step.dy;
        if (nx < 0 || nx >= pit.width || ny < 0 || ny >= pit.height) {
          continue; // the cube's wall is not a square
        }
        const neighbour = nx + pit.width * ny;
        const level = (pit.depth[neighbour] as number) - (units[neighbour] as number);
        if (lowest === -1 || level > lowestLevel) {
          lowest = neighbour;
          lowestLevel = level;
        }
      }
      const ownLevel = (pit.depth[square] as number) - (units[square] as number);
      if (lowest === -1 || lowestLevel - ownLevel < minDrop) {
        break;
      }
      units[square] = (units[square] as number) - 1;
      mayGive[square] = (mayGive[square] as number) - 1;
      units[lowest] = (units[lowest] as number) + 1;
      moves.push({ from: square, to: lowest });
    }
  }
  return moves;
}

/**
 * Every cell of a square's column from layer 0 down to its top block: where a
 * structure on the square can be. (A structure placed on a square is stored
 * with its top block; the cells above are looked at too, to be safe.)
 */
function cellsOnSquare(state: GameState, pit: Pit, square: number): Vec3[] {
  const cells: Vec3[] = [];
  const x = squareX(pit, square);
  const y = squareY(pit, square);
  for (let z = 0; z <= (pit.depth[square] as number); z += 1) {
    const cell = { x, y, z };
    if (inGrid(state.size, cell)) {
      cells.push(cell);
    }
  }
  return cells;
}

/**
 * Water meets lava (design doc 6.4): on a square that holds both, one unit of
 * water and one unit of lava become one stone block, which raises the square
 * by 1, again and again until one of the two is used up. The square cannot
 * rise above ground level: each holds at most `depth` units by now. A source
 * that turns to stone stops.
 */
function formStone(state: GameState, pit: Pit, events: GameEvent[]): void {
  for (let square = 0; square < pit.depth.length; square += 1) {
    const pairs = Math.min(pit.water[square] as number, pit.lava[square] as number);
    if (pairs === 0) {
      continue;
    }
    const x = squareX(pit, square);
    const y = squareY(pit, square);
    for (let n = 0; n < pairs; n += 1) {
      const depth = pit.depth[square] as number;
      const oldTop = { x, y, z: depth };
      const stone = { x, y, z: depth - 1 };
      // The block that was the top is buried: a crack belongs to a top block.
      if (inGrid(state.size, oldTop)) {
        clearCrack(state, oldTop);
      }
      // The cell may still hold the square's water or lava as it was stored
      // before this step; the pit table has the count, so empty the cell.
      setWater(state, stone, 0);
      setLava(state, stone, 0);
      setBlock(state, stone, BLOCKS.stone.code);
      pit.depth[square] = depth - 1;
      events.push({ type: 'stoneFormed', pos: stone });
    }
    pit.water[square] = (pit.water[square] as number) - pairs;
    pit.lava[square] = (pit.lava[square] as number) - pairs;
    pit.source[square] = false;
    const pos = cellAbove(pit, square);
    events.push({
      type: 'fluidRemoved',
      fluid: 'water',
      pos,
      units: pairs,
      reason: 'turnedToStone',
    });
    events.push({
      type: 'fluidRemoved',
      fluid: 'lava',
      pos,
      units: pairs,
      reason: 'turnedToStone',
    });
  }
}

/** Write the pit's water and lava back to the cube (standing.ts says where). */
function writePit(state: GameState, pit: Pit): void {
  for (let square = 0; square < pit.depth.length; square += 1) {
    if ((pit.depth[square] as number) === 0) {
      continue; // ground level: nothing stands there, and there is no cell to clear
    }
    const x = squareX(pit, square);
    const y = squareY(pit, square);
    setWaterOn(state, x, y, pit.water[square] as number);
    setLavaOn(state, x, y, pit.lava[square] as number, pit.source[square] as boolean);
  }
}

/** True in the cube phase of a shift in which lava flows (design doc 6.4: even-numbered shifts). */
export function isLavaStep(shift: number): boolean {
  return shift % HAZARDS.lava.flowEveryShifts === 0;
}

/**
 * Step (b). Changes `state` in place and appends to `events`; uses no
 * randomness. In this order:
 *
 * 1. Water: what stands above ground level drains; then water flows. Water
 *    that enters a square destroys a camp there and hurts the crew if the
 *    square was worked this shift (design doc 5.2: "water enters a worked
 *    square").
 * 2. Lava: on a lava step every source pours; what stands above ground level
 *    drains (every shift); on a lava step lava flows.
 * 3. Lava destroys the structures (supports, pumps, vents, explosives) and
 *    camps on every square it stands on.
 * 4. Water meets lava: stone.
 * 5. The cube is updated.
 * 6. Lava hurts the crew: on a worked square, or beside one (5.2), from
 *    where the lava is now.
 *
 * Everything read here is in the open above the top blocks, which the player
 * sees, so the forecast can run this step on `knownCube(state)` and get what
 * will happen (forecast.ts). It reads nothing but `state`.
 */
export function stepFluids(state: GameState, events: GameEvent[], phase: CubePhase): void {
  const pit = readPit(state);
  const anyWater = pit.water.some((units) => units > 0);
  const anyLava = pit.lava.some((units) => units > 0);
  if (!anyWater && !anyLava) {
    return; // a dry pit: nothing to do
  }

  // 1. Water.
  drainAboveGround(pit, 'water', events);
  // T13: pumps act here, on `pit.water`, before the water flows.
  for (const move of flow(pit, 'water')) {
    events.push({
      type: 'fluidMoved',
      fluid: 'water',
      from: cellAbove(pit, move.from),
      to: cellAbove(pit, move.to),
    });
    // A camp covers its squares whatever the layer, so one cell names the square.
    destroyCampsAt(state, cellAbove(pit, move.to), 'water', events);
    recordDamage(
      state,
      phase,
      'water',
      CREW.damage.water,
      squareX(pit, move.to),
      squareY(pit, move.to),
    );
  }

  // 2. Lava.
  const lavaStep = isLavaStep(state.shift);
  if (lavaStep) {
    for (let square = 0; square < pit.lava.length; square += 1) {
      if (pit.source[square]) {
        pit.lava[square] = (pit.lava[square] as number) + HAZARDS.lava.sourceUnitsPerStep;
        events.push({
          type: 'lavaPoured',
          pos: cellAbove(pit, square),
          units: HAZARDS.lava.sourceUnitsPerStep,
        });
      }
    }
  }
  drainAboveGround(pit, 'lava', events);
  if (lavaStep) {
    for (const move of flow(pit, 'lava')) {
      events.push({
        type: 'fluidMoved',
        fluid: 'lava',
        from: cellAbove(pit, move.from),
        to: cellAbove(pit, move.to),
      });
    }
  }

  // 3. Lava destroys what stands on its squares, at this moment: before step
  //    (c), so a destroyed explosive does not go off.
  for (let square = 0; square < pit.lava.length; square += 1) {
    if ((pit.lava[square] as number) === 0) {
      continue;
    }
    for (const cell of cellsOnSquare(state, pit, square)) {
      destroyStructure(state, cell, 'lava', events);
    }
    destroyCampsAt(state, cellAbove(pit, square), 'lava', events);
  }

  // 4. Water meets lava.
  formStone(state, pit, events);

  // 5. The cube.
  writePit(state, pit);

  // 6. Lava hurts the crew, from where it is now.
  for (let square = 0; square < pit.lava.length; square += 1) {
    if ((pit.lava[square] as number) === 0) {
      continue;
    }
    const x = squareX(pit, square);
    const y = squareY(pit, square);
    recordDamage(state, phase, 'lava', CREW.damage.lavaOn, x, y);
    recordDamageBeside(state, phase, 'lava', CREW.damage.lavaBeside, x, y);
  }
}
