// The hazard parts of the end-shift forecast (design doc 11; 0014 item 4).
//
// The cracks and the slumps are built (issue #94), the flows of water and
// lava (issue #99), and gas, charges and ignition (issue #103).
// `forecastShift` in shift.ts calls `forecastHazards` and adds the upkeep
// part.

import type { Vec3 } from '../data';
import { stepFluids } from './cube/fluids';
import { stepGas } from './cube/gas';
import { workedSquares } from './crew';
import { LOSS_BY_DAMAGE } from './cube/crewEffects';
import { newCubePhase } from './cube/phase';
import { stepSlumps } from './cube/slumps';
import type { DamageCause, GameEvent, RunEndCause } from './events';
import { depthIn, depthMapOf } from './heightmap';
import { knownCube, knownSquare } from './known';
import { stabilityIn } from './slump';
import { isRevealed } from './state';
import type { GameState } from './state';

/**
 * One countdown the player can read. Three kinds:
 *
 * - `slump`: the cracked top block at `pos` (design doc 6.1). `running` is
 *   true while its square is unstable; a stopped countdown keeps its number
 *   and goes on if the square becomes unstable again. `to` is the cell where
 *   the block would come to rest if it fell as the pit stands now (on top of
 *   the foot of its slide path), or `null` while the countdown is stopped.
 * - `unstableOre`: the armed unstable ore block at `pos` (design doc 6.6).
 * - `explosive`: the placed explosive on the top block at `pos`.
 *   Both go off in the coming cube phase: `inShifts` is always 1. Every
 *   entry listed does go off, unless a hazard of that same cube phase reaches
 *   it first (lava on a charge, rubble on the ore).
 *
 * `inShifts` is how many cube phases from now: 1 means "in the coming cube
 * phase". For a cracked block it is the stored timer plus 1, the number the
 * player is shown on the block.
 *
 * This is a tagged union, like `Action`: `kind` says which fields there are.
 */
export type CountdownForecast =
  | { kind: 'slump'; pos: Vec3; inShifts: number; running: boolean; to: Vec3 | null }
  | { kind: 'unstableOre'; pos: Vec3; inShifts: number }
  | { kind: 'explosive'; pos: Vec3; inShifts: number };

/**
 * Part 1 of the forecast, the countdowns: every cracked top block the player
 * sees, row by row (y, then x).
 *
 * A square is read through `knownSquare`, and whether its countdown is
 * running through `stabilityIn`, which reads depths, trees, supports and
 * seen top blocks only. So the result cannot depend on anything hidden.
 * After the cracks come the armed charges (armed unstable ore and placed
 * explosives), in the order of `state.armed`; only ones on a block the
 * player has seen, which every one is: ore is armed only while known, and an
 * explosive is placed on a top block. Armed ore that is no longer its
 * square's top block (sealed rock was placed on it) is left out: it is
 * smothered and will not go off.
 * Does not change `state`.
 */
export function forecastCountdowns(state: GameState): CountdownForecast[] {
  const map = depthMapOf(state);
  const countdowns: CountdownForecast[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const square = knownSquare(state, x, y);
      if (square.top === null || square.top.crackTimer === null) {
        continue;
      }
      const check = stabilityIn(state, map, x, y);
      const footDepth = depthIn(map, check.foot.x, check.foot.y);
      countdowns.push({
        kind: 'slump',
        pos: { x, y, z: square.depth },
        inShifts: square.top.crackTimer + 1,
        running: check.unstable,
        to: check.unstable ? { x: check.foot.x, y: check.foot.y, z: footDepth - 1 } : null,
      });
    }
  }
  for (const charge of state.armed) {
    if (!isRevealed(state, charge.pos)) {
      continue;
    }
    // Armed ore goes off only while it is its square's top block: the same
    // test step (c) makes (`setOffCharges` in cube/gas.ts). Ore that sealed
    // rock has buried in this player phase will not go off, so it is not
    // listed (review of PR #105). Depths are always seen.
    if (
      charge.kind === 'unstableOre' &&
      depthIn(map, charge.pos.x, charge.pos.y) !== charge.pos.z
    ) {
      continue;
    }
    countdowns.push({ kind: charge.kind, pos: { ...charge.pos }, inShifts: 1 });
  }
  return countdowns;
}

/**
 * How far a forecast amount of crew damage can be trusted (issue #112):
 *
 * - `exact`: ending the shift now deals exactly this.
 * - `atLeast`: it deals this or more. A blast will uncover a block the player
 *   has not seen (or may destroy a relic or keystone, which is decided by
 *   chance): if a pocket is under it, more gas burns or stands in the pit.
 * - `may`: this is what happens if nothing hidden comes out. A slump will
 *   uncover a block the player has not seen, before the water, lava and gas
 *   move: if a pocket is under it, its water, lava or gas can change what
 *   they do, to more damage or to less.
 */
export type DamageCertainty = 'exact' | 'atLeast' | 'may';

/** A worked square where one kind of hazard will hurt the crew, and by how much there. */
export interface CrewDamageSquare {
  x: number;
  y: number;
  amount: number;
}

/** The damage one kind of hazard will do to the crew when the shift ends. */
export interface CrewDamageForecast {
  cause: DamageCause;
  /**
   * What the crew loses to this kind: the largest amount it deals on any
   * worked square, because a kind hurts once a shift (design doc 5.2).
   */
  amount: number;
  certainty: DamageCertainty;
  /** The worked squares where this kind hurts the crew, in the order the cube phase meets them. */
  squares: CrewDamageSquare[];
}

/**
 * Whether ending the shift now loses the run because crew health reaches 0:
 * - 'yes': the damage that is certain is enough;
 * - 'may': the damage as far as it can be seen is enough, but part of it
 *   is not certain (see `DamageCertainty`);
 * - 'no': what can be seen is not enough. If `CrewForecast.exact` is false,
 *   something hidden may still add to it.
 */
export type RunLostForecast = 'yes' | 'may' | 'no';

/** What the coming cube phase will do to the crew (design doc 5.2; issue #112). */
export interface CrewForecast {
  /**
   * One entry for each kind of hazard that will hurt the crew, in the order
   * the cube phase meets them, which is the order step (e) applies them in.
   * Empty when nothing seen will hurt the crew.
   */
  damage: CrewDamageForecast[];
  /** The sum of the amounts in `damage`: the damage as far as it can be seen. */
  total: number;
  /** The part of `total` that is certain: the entries that are `exact` or `atLeast`. */
  totalAtLeast: number;
  /**
   * True if nothing hidden can change the damage: then `total` is what
   * `endShift` deals (never more than the health that is left). False if a
   * slump or a blast will uncover a block the player has not seen, or a
   * relic or keystone is in a blast: a pocket under it may add damage, also
   * of a kind that is not in `damage`. (Always true when the crew worked no
   * square this shift: then nothing can hurt it.)
   */
  exact: boolean;
  /** Crew health now. */
  health: number;
  /** Crew health after `total` damage, never below 0. Rest is not counted. */
  healthAfter: number;
  runLost: RunLostForecast;
  /**
   * If `runLost` is not 'no': what the loss would be named, from the entry
   * that brings health to 0 when `damage` is applied in order. Otherwise `null`.
   */
  lossCause: RunEndCause | null;
}

/** The hazard parts of the forecast: see `ShiftForecast` in shift.ts. */
export interface HazardForecast {
  slumps: GameEvent[];
  flows: GameEvent[];
  gas: GameEvent[];
  crew: CrewForecast;
}

/**
 * True if one of `events` (the forecast's events of one step) takes the top
 * block off a square and the forecast cannot know what is under it:
 *
 * - a block slumps away (`blockFell`) or a blast destroys one
 *   (`blockDestroyed`), and the cell under it is not revealed. The forecast
 *   takes it to be plain rock; it may be the roof of a pocket;
 * - a space the player has scanned collapses (`spaceCollapsed`): the cells
 *   of it that are not revealed hold more than the forecast counts;
 * - a relic or keystone is in a blast (`blockMayBeDestroyed`): chance decides
 *   whether it goes, and nothing says what is under it.
 *
 * Only whether a cell is revealed is read, never what an unrevealed cell holds.
 */
function uncoversHidden(state: GameState, events: GameEvent[]): boolean {
  for (const event of events) {
    if (event.type === 'spaceCollapsed' || event.type === 'blockMayBeDestroyed') {
      return true;
    }
    let removed: Vec3 | null = null;
    if (event.type === 'blockFell') {
      removed = event.from;
    } else if (event.type === 'blockDestroyed') {
      removed = event.pos;
    }
    if (removed === null) {
      continue;
    }
    const under = { x: removed.x, y: removed.y, z: removed.z + 1 };
    // Below the bottom layer there is nothing to uncover.
    if (under.z < state.size.z && !isRevealed(state, under)) {
      return true;
    }
  }
  return false;
}

/**
 * How certain the forecast damage of kind `cause` is. `slumpUncovers` and
 * `blastUncovers` say whether step (a), and the blasts of step (c), uncover
 * something hidden (`uncoversHidden`).
 *
 * - A slump (step (a)) reads only depths, top blocks, trees and supports,
 *   all seen: always exact.
 * - If a slump uncovers a hidden block, a pocket's water, lava or gas may
 *   stand on that square before steps (b) and (c) run, and can change all
 *   they do (water turns lava to stone; lava destroys a charge or lights
 *   gas): every other kind is 'may'.
 * - If only a blast uncovers one, steps (a) and (b) are over. The blasts
 *   themselves do not depend on it. Gas that comes out can only add to what
 *   burns: gas and gas explosions are 'atLeast'.
 */
function certaintyOf(
  cause: DamageCause,
  slumpUncovers: boolean,
  blastUncovers: boolean,
): DamageCertainty {
  if (cause === 'slump') {
    return 'exact';
  }
  if (slumpUncovers) {
    return 'may';
  }
  if (blastUncovers && (cause === 'gas' || cause === 'gasExplosion')) {
    return 'atLeast';
  }
  return 'exact';
}

/**
 * What steps (a), (b) and (c) of the coming cube phase will do to what the
 * player sees (design doc 6 and 11): the steps are run in order on
 * `knownCube(state)`, the copy in which every unrevealed cell is plain rock
 * with nothing in it, and the events of each are returned apart.
 *
 * - `slumps`: step (a), `stepSlumps`: `blockFell`, `blockCracked`, what a
 *   slump destroys.
 * - `flows`: step (b), `stepFluids`: `fluidMoved`, `fluidRemoved`,
 *   `lavaPoured`, `stoneFormed`, what water or lava destroys.
 * - `gas`: step (c), `stepGas`: `gasMoved`, `exploded` for each charge, armed
 *   ore and gas explosion, `blockDestroyed`, `treeDestroyed`, `gasRemoved`,
 *   and what an explosion destroys.
 *
 * Each step runs after the ones before it, because a slump changes the pit
 * the water then flows in, and lava that has flowed lights gas.
 *
 * NO DICE. The phase is marked as a forecast (`CubePhase.forecast`), so a
 * relic or keystone in a blast is not rolled for: the forecast says
 * `blockMayBeDestroyed` and nothing is drawn from the RNG, not even from the
 * copy's (decision note 0017 item 3).
 *
 * HOW EXACT. Everything these steps read is seen (depths, tops, what stands
 * on squares, structures, armed charges), so this is what will happen, with
 * one kind of exception: a top block that a slump or a blast removes shows a
 * new top block, which is not seen yet and is taken to be plain rock with
 * solid rock under it. If it is weaker it may crack as well, and if it was
 * the roof of a cavern or pocket, the space collapses and its contents come
 * out, which the forecast cannot know.
 *
 * THE CREW. `crew` is the damage the three steps record for the squares the
 * crew worked this shift, by the rules of `recordDamage` (worked squares
 * only, once per kind, the largest amount), with how certain each amount is
 * (`DamageCertainty`): where hidden cells or chance can change it, it says
 * "at least" or "may", never what is hidden.
 *
 * Does not change `state`.
 */
export function forecastHazards(state: GameState): HazardForecast {
  const copy = knownCube(state);
  const phase = newCubePhase(true);
  const slumps: GameEvent[] = [];
  stepSlumps(copy, slumps, phase);
  const flows: GameEvent[] = [];
  stepFluids(copy, flows, phase);
  const gas: GameEvent[] = [];
  stepGas(copy, gas, phase);

  // The crew. The three steps wrote the damage into the phase's notes
  // through `recordDamage`, exactly as in a real cube phase; here it is read
  // instead of applied. (The worked squares are the player's own actions.)
  const slumpUncovers = uncoversHidden(state, slumps);
  const blastUncovers = uncoversHidden(state, gas);
  const damage: CrewDamageForecast[] = [];
  let total = 0;
  let totalAtLeast = 0;
  let lossCause: RunEndCause | null = null;
  for (const entry of phase.damage) {
    const certainty = certaintyOf(entry.cause, slumpUncovers, blastUncovers);
    const squares: CrewDamageSquare[] = [];
    for (const square of phase.damageSquares) {
      if (square.cause === entry.cause) {
        squares.push({ x: square.x, y: square.y, amount: square.amount });
      }
    }
    damage.push({ cause: entry.cause, amount: entry.amount, certainty, squares });
    total += entry.amount;
    if (certainty !== 'may') {
      totalAtLeast += entry.amount;
    }
    // The first entry to bring health to 0 names the loss, as in step (e).
    if (lossCause === null && total >= state.crew.health) {
      lossCause = LOSS_BY_DAMAGE[entry.cause];
    }
  }
  const health = state.crew.health;
  let runLost: RunLostForecast = 'no';
  if (totalAtLeast >= health) {
    runLost = 'yes';
  } else if (total >= health) {
    runLost = 'may';
  }
  const crew: CrewForecast = {
    damage,
    total,
    totalAtLeast,
    // With no worked square nothing can hurt the crew, whatever is hidden.
    exact: (!slumpUncovers && !blastUncovers) || workedSquares(state).length === 0,
    health,
    healthAfter: Math.max(0, health - total),
    runLost,
    lossCause,
  };
  return { slumps, flows, gas, crew };
}

/**
 * What step (a) of the coming cube phase will do: `forecastHazards(state).slumps`.
 * See `ShiftForecast.slumps` in shift.ts for how exact this is. Does not
 * change `state`.
 */
export function forecastSlumps(state: GameState): GameEvent[] {
  return forecastHazards(state).slumps;
}

/**
 * Part 2 of the forecast, the flows: what step (b) of the coming cube phase
 * will do to the water and lava the player sees: `forecastHazards(state).flows`.
 * Does not change `state`.
 */
export function forecastFlows(state: GameState): GameEvent[] {
  return forecastHazards(state).flows;
}

/**
 * Part 3 of the forecast: what step (c) of the coming cube phase will do: gas
 * spreading, charges and armed ore going off, gas burning:
 * `forecastHazards(state).gas`. Does not change `state`.
 */
export function forecastGas(state: GameState): GameEvent[] {
  return forecastHazards(state).gas;
}
