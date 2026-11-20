// Step (c) of the cube phase: gas spreads, vents act, charges and armed
// unstable ore go off, gas ignites (design doc v0.2 sections 4, 6.5 and 6.6;
// owner questions 64 and 94; issue #103, task T11; decision note 0035).
//
// THE PICTURE. Gas stands on squares, like water (standing.ts): a number of
// units in the open above a square's top block. It is heavier than air, so it
// lies in the pit and never climbs.
//
// 1. GAS SPREADS (6.5). A square with `u` units of gas looks at its face
//    neighbours that are NO HIGHER than it: at the same depth, or deeper. With
//    `n` such neighbours it gives floor(u / (n + 1)) units to each and keeps
//    the rest: an even share for each of them and for itself.
//
//      depth   2   2   2          the middle square holds 9 units and has two
//      gas     .   9   .          neighbours that are no higher: 9 / 3 = 3 to
//                                 each, and it keeps 3.
//      after   3   3   3
//
//    - Every gift is worked out from the gas as it stood when the step began,
//      so the order the squares are visited in does not matter. Two squares
//      at the same depth give to each other; the events report the
//      difference.
//    - Thin gas stays: a square with fewer units than it has such neighbours
//      plus one gives nothing (floor(u / (n + 1)) is 0). So gas never thins
//      out to nothing by itself; it stays for the rest of the run unless it
//      is burnt or vented.
//    - Gas does not look at water or lava: it may share a square with either.
//    - A square at ground level is higher than every pit square, so gas never
//      spreads onto one. Gas blows away only when its own square comes up to
//      ground level (`liftGasOutOf` in standing.ts).
//
// 2. VENTS ACT (6.5; issue #107; decision note 0036). A vent on a square
//    clears ALL the gas on the squares within `HAZARDS.gas.ventReach` (2)
//    steps of it, its own square included (`gasRemoved`, reason 'vented').
//    This comes after the spread and before anything goes off or burns, so
//    gas that has just spread into a vent's range is gone before it can be
//    lit, and the crew is not poisoned there. Gas beyond the range is left,
//    and spreads back in on later shifts until it has thinned out.
//
// 3. CHARGES AND ARMED ORE GO OFF (6.6): every entry of `state.armed`, in the
//    list's order (by layer, then row by row). explosions.ts does the blast.
//
// 4. IGNITION (6.5). Gas on a square burns if lava stands on that square or
//    on one beside it, or if the square is in a blast of part 3 or beside
//    one. All the gassy squares connected to it through shared sides go off
//    with it, as ONE explosion:
//    - the gas on those squares is gone (`gasRemoved`, reason 'burnt');
//    - the structure on each of those squares, and on each square beside
//      them, is destroyed, and so is a camp there;
//    - the crew is hurt if one of those squares, or a square beside one, was
//      worked this shift (`CREW.damage.gasExplosion`, 3: less than a charge's
//      6; owner, question 64).
//    A gas explosion removes no block. It cannot light other gas: any gas
//    beside it was connected to it and has already burnt. So one pass is
//    enough, and "repeated until nothing new explodes" (design doc 4) is met.
//
// 5. GAS HURTS THE CREW (5.2): `CREW.damage.gas` if gas stands on a worked
//    square now, at the end of the step. Gas that burnt hurts by its
//    explosion instead.
//
// SOURCES AND SINKS. Units of gas are otherwise conserved:
// - in: a breach puts a pocket's gas on a square (breach.ts), in the player
//   phase or when a blast or a slump takes the roof off a pocket;
// - out: gas that burns; gas on a square that comes up to ground level.
//   gas a vent clears; gas on a square that is sealed (actions/campTools.ts).
//
// RANDOMNESS. Parts 1, 2, 4 and 5 use none. Part 3 draws from the seeded RNG
// in the state only when a relic or keystone is in a charge's blast
// (explosions.ts), and never in the forecast.

import { BLOCKS, CREW, HAZARDS, STRUCTURES } from '../../data';
import type { Vec3 } from '../../data';
import { destroyCampsAt, destroyStructure } from '../destroy';
import type { GameEvent } from '../events';
import { explodeCharge, explodeOre } from '../explosions';
import { SQUARE_STEPS, depthAt, structureOnSquare, topCellOf } from '../heightmap';
import type { Square } from '../heightmap';
import { gasOn, lavaOn, setGasOn } from '../standing';
import { squaresWithinSteps } from './fluids';
import { armedAt, blockAt, disarmCharge, gasAt } from '../state';
import type { GameState } from '../state';
import { recordDamage, recordDamageBeside } from './phase';
import type { CubePhase } from './phase';

/** The most gas one square can store: one byte. Not a gameplay number. */
const BYTE_MAX = 255;

/**
 * The gas of the pit as the spread rule sees it: one entry per square in each
 * list, row by row, so square (x, y) is entry `x + width * y`.
 */
interface GasTable {
  width: number;
  height: number;
  /** How many levels down each square is. */
  depth: number[];
  /** Units of gas standing on each square. */
  gas: number[];
}

/** Read every square's depth and gas from the cube. Does not change `state`. */
function readGas(state: GameState): GasTable {
  const table: GasTable = { width: state.size.x, height: state.size.y, depth: [], gas: [] };
  for (let y = 0; y < table.height; y += 1) {
    for (let x = 0; x < table.width; x += 1) {
      const depth = depthAt(state, x, y);
      let gas = 0;
      // The open cells above the top block (as `contentsOn` in breach.ts).
      for (let z = 0; z < depth; z += 1) {
        gas += gasAt(state, { x, y, z });
      }
      table.depth.push(depth);
      table.gas.push(gas);
    }
  }
  return table;
}

/**
 * The squares beside the square with index `square` that are on the map, as
 * indexes, in the order north, east, south, west.
 */
function neighboursOf(table: GasTable, square: number): number[] {
  const x = square % table.width;
  const y = Math.floor(square / table.width);
  const found: number[] = [];
  for (const step of SQUARE_STEPS) {
    const nx = x + step.dx;
    const ny = y + step.dy;
    if (nx >= 0 && nx < table.width && ny >= 0 && ny < table.height) {
      found.push(nx + table.width * ny);
    }
  }
  return found;
}

/** The cell directly above the top block of the square with index `square`. */
function cellAbove(table: GasTable, square: number): Vec3 {
  return {
    x: square % table.width,
    y: Math.floor(square / table.width),
    z: (table.depth[square] as number) - 1,
  };
}

/** Units of gas that went from the square with index `from` to the one with index `to`. */
interface Gift {
  from: number;
  to: number;
  units: number;
}

/**
 * Part 1: gas spreads (see the top of this file). Changes `table.gas` and
 * emits `gasMoved` events. Returns true if the gas on any square changed.
 *
 * Two squares at the same depth both give to each other. The events say the
 * difference only: if 3 units go east and 1 comes back west, one `gasMoved`
 * says 2 went east, and if the two gifts are equal nothing is said. So a pit
 * whose gas has settled emits nothing.
 */
function spreadGas(table: GasTable, events: GameEvent[]): boolean {
  // The gas as it stood when the step began: every gift is worked out from
  // this copy, never from gas that has just arrived.
  const before = [...table.gas];
  const gifts: Gift[] = [];
  for (let square = 0; square < before.length; square += 1) {
    const units = before[square] as number;
    if (units === 0) {
      continue;
    }
    const ownDepth = table.depth[square] as number;
    // "No higher" means the same depth or deeper: a bigger number.
    const targets = neighboursOf(table, square).filter(
      (neighbour) => (table.depth[neighbour] as number) >= ownDepth,
    );
    const share = Math.floor(units / (targets.length + 1));
    if (share === 0) {
      continue; // thin gas stays where it is
    }
    for (const target of targets) {
      // A square stores at most one byte of gas. What does not fit stays with
      // the giver, so no unit is lost. Generated pockets are far too small to
      // meet this; it guards the byte, like `Math.min` in breach.ts.
      const room = BYTE_MAX - (table.gas[target] as number);
      const given = Math.min(share, room);
      if (given === 0) {
        continue;
      }
      table.gas[square] = (table.gas[square] as number) - given;
      table.gas[target] = (table.gas[target] as number) + given;
      gifts.push({ from: square, to: target, units: given });
    }
  }

  // The events: one for each pair of squares, in the order the pairs were
  // first met, saying the difference of what went each way.
  const done = new Set<string>();
  for (const gift of gifts) {
    const low = Math.min(gift.from, gift.to);
    const high = Math.max(gift.from, gift.to);
    const key = `${low}>${high}`;
    if (done.has(key)) {
      continue;
    }
    done.add(key);
    // Units that went from `low` to `high`, less those that went back.
    let net = 0;
    for (const other of gifts) {
      if (other.from === low && other.to === high) net += other.units;
      if (other.from === high && other.to === low) net -= other.units;
    }
    if (net === 0) {
      continue;
    }
    const from = net > 0 ? low : high;
    const to = net > 0 ? high : low;
    events.push({
      type: 'gasMoved',
      from: cellAbove(table, from),
      to: cellAbove(table, to),
      units: Math.abs(net),
    });
  }
  return table.gas.some((units, square) => units !== before[square]);
}

/** Write the table's gas back to the cube (standing.ts says where). */
function writeGas(state: GameState, table: GasTable): void {
  for (let square = 0; square < table.gas.length; square += 1) {
    if ((table.depth[square] as number) === 0) {
      continue; // ground level: no gas stands there, and there is no cell to clear
    }
    setGasOn(
      state,
      square % table.width,
      Math.floor(square / table.width),
      table.gas[square] as number,
    );
  }
}

/**
 * Part 3: every armed charge goes off, in the order of `state.armed`. Returns
 * the squares of all the blasts, for ignition.
 */
function setOffCharges(state: GameState, events: GameEvent[], phase: CubePhase): Square[] {
  const blasted: Square[] = [];
  // A copy of the list: a blast changes `state.armed` while this loop runs.
  const charges = state.armed.map((charge) => ({ pos: { ...charge.pos }, kind: charge.kind }));
  for (const charge of charges) {
    // Looked at now, not when the list was copied: an earlier blast may have
    // destroyed this charge, and a destroyed charge does not go off.
    if (armedAt(state, charge.pos) !== charge.kind) {
      continue;
    }
    if (charge.kind === 'explosive') {
      blasted.push(...explodeCharge(state, charge.pos, events, phase));
      continue;
    }
    // Armed ore goes off only while it is its square's top block. If rubble
    // slumped onto it, or stone formed on it, since it was armed, it is
    // smothered: it is disarmed and nothing happens.
    const top = topCellOf(state, charge.pos.x, charge.pos.y);
    const isTop = top !== null && top.z === charge.pos.z;
    if (!isTop || blockAt(state, charge.pos) !== BLOCKS.unstableOre.code) {
      disarmCharge(state, charge.pos);
      continue;
    }
    blasted.push(...explodeOre(state, charge.pos, events, phase));
  }
  return blasted;
}

/**
 * Part 4: ignition (see the top of this file). `blasted` is every square in a
 * blast of part 3. Changes `state` in place.
 */
function igniteGas(
  state: GameState,
  blasted: Square[],
  events: GameEvent[],
  phase: CubePhase,
): void {
  // Read afresh: a blast may have changed depths, and released more gas.
  const table = readGas(state);
  if (!table.gas.some((units) => units > 0)) {
    return;
  }

  // A square "sparks" if lava stands on it or it was in a blast. Gas burns
  // on a sparking square and on a square beside one.
  const sparks: boolean[] = table.gas.map(() => false);
  for (const square of blasted) {
    sparks[square.x + table.width * square.y] = true;
  }
  for (let square = 0; square < sparks.length; square += 1) {
    if (lavaOn(state, square % table.width, Math.floor(square / table.width)) > 0) {
      sparks[square] = true;
    }
  }
  function isLit(square: number): boolean {
    if (sparks[square]) {
      return true;
    }
    return neighboursOf(table, square).some((neighbour) => sparks[neighbour] === true);
  }

  // Each lit gassy square, row by row, sets off its whole connected patch.
  const burnt: boolean[] = table.gas.map(() => false);
  for (let start = 0; start < table.gas.length; start += 1) {
    if ((table.gas[start] as number) === 0 || burnt[start] || !isLit(start)) {
      continue;
    }
    // Flood fill over gassy squares that share a side (a breadth-first search).
    const patch: number[] = [start];
    burnt[start] = true;
    for (let next = 0; next < patch.length; next += 1) {
      for (const neighbour of neighboursOf(table, patch[next] as number)) {
        if ((table.gas[neighbour] as number) > 0 && !burnt[neighbour]) {
          burnt[neighbour] = true;
          patch.push(neighbour);
        }
      }
    }
    explodeGasPatch(state, table, patch, events, phase);
  }
}

/** One gas explosion: the gassy squares `patch` (indexes into `table`) go off together. */
function explodeGasPatch(
  state: GameState,
  table: GasTable,
  patch: number[],
  events: GameEvent[],
  phase: CubePhase,
): void {
  events.push({
    type: 'exploded',
    kind: 'gas',
    pos: cellAbove(table, patch[0] as number),
    cells: patch.map((square) => cellAbove(table, square)),
  });

  // The gas is gone.
  for (const square of patch) {
    const x = square % table.width;
    const y = Math.floor(square / table.width);
    events.push({
      type: 'gasRemoved',
      pos: cellAbove(table, square),
      units: table.gas[square] as number,
      reason: 'burnt',
    });
    setGasOn(state, x, y, 0);
    table.gas[square] = 0;
  }

  // What it destroys and whom it hurts: on those squares and beside them.
  // A square beside two burning squares is met twice; the second time there
  // is nothing left to destroy, and damage of one kind counts once.
  for (const square of patch) {
    const x = square % table.width;
    const y = Math.floor(square / table.width);
    for (const reached of [square, ...neighboursOf(table, square)]) {
      const rx = reached % table.width;
      const ry = Math.floor(reached / table.width);
      const top = topCellOf(state, rx, ry);
      if (top !== null) {
        destroyStructure(state, top, 'explosion', events);
      }
      destroyCampsAt(state, { x: rx, y: ry, z: 0 }, 'explosion', events);
    }
    recordDamage(state, phase, 'gasExplosion', CREW.damage.gasExplosion, x, y);
    recordDamageBeside(state, phase, 'gasExplosion', CREW.damage.gasExplosion, x, y);
  }
}

/**
 * Part 2: vents (see the top of this file). Vents are visited row by row;
 * each clears every gassy square within its reach, nearest first, and emits
 * one `gasRemoved` (reason 'vented') for each. Returns true if any gas went.
 */
function runVents(state: GameState, events: GameEvent[]): boolean {
  let vented = false;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      if (structureOnSquare(state, x, y) !== STRUCTURES.vent.code) {
        continue;
      }
      const reach = HAZARDS.gas.ventReach;
      for (const near of squaresWithinSteps(state.size.x, state.size.y, x, y, reach)) {
        const units = gasOn(state, near.x, near.y);
        if (units === 0) {
          continue;
        }
        setGasOn(state, near.x, near.y, 0);
        events.push({
          type: 'gasRemoved',
          // The cell directly above the square's top block, as for every gas event.
          pos: { x: near.x, y: near.y, z: depthAt(state, near.x, near.y) - 1 },
          units,
          reason: 'vented',
        });
        vented = true;
      }
    }
  }
  return vented;
}

/**
 * Step (c). Changes `state` in place and appends to `events`. The five parts
 * are described at the top of this file.
 *
 * Everything read here is in the open above the top blocks or is a top block
 * the player sees, so the forecast can run this step on `knownCube(state)`
 * (forecast.ts). It reads nothing but `state`.
 */
export function stepGas(state: GameState, events: GameEvent[], phase: CubePhase): void {
  const table = readGas(state);
  const anyGas = table.gas.some((units) => units > 0);
  if (!anyGas && state.armed.length === 0) {
    return; // no gas and nothing armed: nothing to do
  }

  // 1. Gas spreads.
  if (anyGas && spreadGas(table, events)) {
    writeGas(state, table);
  }

  // 2. Vents clear the gas within their reach, before anything goes off.
  if (anyGas) {
    runVents(state, events);
  }

  // 3. Charges and armed unstable ore go off.
  const blasted = setOffCharges(state, events, phase);

  // 4. Ignition: lava and the blasts light the gas.
  igniteGas(state, blasted, events, phase);

  // 5. Gas hurts the crew, from where it stands now.
  const after = readGas(state);
  for (let square = 0; square < after.gas.length; square += 1) {
    if ((after.gas[square] as number) > 0) {
      const x = square % after.width;
      const y = Math.floor(square / after.width);
      recordDamage(state, phase, 'gas', CREW.damage.gas, x, y);
    }
  }
}
