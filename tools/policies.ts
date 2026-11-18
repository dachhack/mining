// Policies: simple scripted players for the simulator and the tests.
//
// A policy looks at the state and says what to do next: one of the legal
// actions, or "end the shift". It sees the state only through the engine's
// public surface, as any other player would.
//
// Three policies:
// - `random`: every legal action and "end the shift" are equally likely.
// - `wander`: the same, but it never chooses to leave. It exists because a
//   `random` player starts on the surface, where leaving is always on offer,
//   so about four in five of its runs end within a few choices and say little
//   about play underground. `wander` gives the simulator and the property
//   tests long, deep runs. Neither is how a person plays.
// - `staircase`: cuts a staircase down to a target layer, walks back up it,
//   and leaves. This is the M1 acceptance test's policy.

import { SHIFT } from '../src/data';
import type { Vec3 } from '../src/data';
import { actionKey, createRng, isSolid, isSurface, legalActions, nextInt } from '../src/engine';
import type { Action, GameState } from '../src/engine';

/** What a policy chooses: a legal action, or the string 'endShift'. */
export type Decision = Action | 'endShift';

/**
 * A policy is an object with a name and one method. `decide` may keep notes
 * between calls (the staircase policy remembers which way it is heading), so
 * make a new policy for every run.
 */
export interface Policy {
  name: string;
  decide: (state: GameState) => Decision;
}

/** The names `makePolicy` accepts. */
export const POLICY_NAMES = ['random', 'wander', 'staircase'];

/** The layer the staircase policy digs to unless told otherwise (M1 acceptance). */
export const DEFAULT_STAIRCASE_TARGET_LAYER = 8;

/**
 * A short, readable form of a decision, used in logs and golden files:
 * the engine's `actionKey` for an action, or 'endShift'.
 */
export function decisionKey(decision: Decision): string {
  return decision === 'endShift' ? 'endShift' : actionKey(decision);
}

// ---------------------------------------------------------------------------
// Random policies
// ---------------------------------------------------------------------------

/**
 * A policy that picks uniformly among the legal actions and "end the shift".
 * With `allowLeave` false, the leave action is taken out of the list first.
 *
 * `seed` seeds the policy's own random numbers. It is mixed with a constant
 * so that a run whose cube came from seed N does not pick its actions with
 * the very same number sequence that built the cube.
 */
export function makeRandomPolicy(seed: number, allowLeave: boolean): Policy {
  // The policy's own generator state: a policy must never draw from
  // `state.rng`, which belongs to the rules.
  // `>>> 0` turns the result back into an unsigned 32-bit whole number.
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  return {
    name: allowLeave ? 'random' : 'wander',
    decide: (state: GameState): Decision => {
      let choices = legalActions(state);
      if (!allowLeave) {
        choices = choices.filter((action) => action.type !== 'leave');
      }
      // One extra slot, the last, stands for "end the shift".
      const pick = nextInt(rng, choices.length + 1);
      const action = choices[pick];
      return action === undefined ? 'endShift' : action;
    },
  };
}

// ---------------------------------------------------------------------------
// Staircase policy
// ---------------------------------------------------------------------------

/** The four sideways directions, in the order the staircase turns: east, south, west, north. */
const HEADINGS: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: -1, z: 0 },
];

/**
 * A policy that cuts a staircase down to `targetLayer`, climbs back up it,
 * and leaves from the surface.
 *
 * One stair, seen from the side, heading right (`@` is the avatar, `1` and
 * `2` the two blocks it mines, in that order):
 *
 *     @ 1        . .        . .
 *     # 2   ->   # @   ->   # .
 *     # #        # #        # @ ...
 *
 * 1. Mine the block beside the avatar. That is the headroom the avatar needs
 *    to step back up later (a step up needs the cell over its head open).
 * 2. Mine the block under that one.
 * 3. Walk into the gap and drop one block. The avatar is now one layer lower
 *    and one cell along.
 *
 * Going back up is then one "step up" move per stair. No ladders are used.
 *
 * At the edge of the cube the staircase turns right (east, south, west,
 * north). It never turns straight back: that would mine the stair the avatar
 * has to climb.
 *
 * When the action it wants is not legal, the only cause the policy expects
 * is too few AP, so it ends the shift. If the action is still not legal with
 * a full shift's AP, the policy is stuck, and it throws: a scripted policy
 * that silently waits forever would hide the problem.
 */
export function makeStaircasePolicy(targetLayer: number): Policy {
  // The policy's notes between calls.
  let goingDown = true;
  let heading = 0; // index into HEADINGS

  /** Take `wanted` if it is legal; otherwise end the shift, or throw if stuck. */
  function takeOrWait(state: GameState, wanted: Action | undefined, what: string): Decision {
    if (wanted !== undefined) {
      return wanted;
    }
    if (state.ap >= SHIFT.apPerShift) {
      const here = state.avatar.pos;
      throw new Error(
        `staircase policy is stuck at (${here.x}, ${here.y}, ${here.z}) in shift ${state.shift}: cannot ${what} even with full AP`,
      );
    }
    return 'endShift';
  }

  /**
   * The cell beside `here` in the direction the staircase is heading. At the
   * edge of the cube's footprint the heading turns right first (the footprint
   * is more than one cell wide, so some heading always fits).
   */
  function cellAhead(state: GameState, here: Vec3): Vec3 {
    for (let turns = 0; turns < HEADINGS.length; turns += 1) {
      // `as Vec3`: `heading` is always a valid index, which the compiler cannot see.
      const step = HEADINGS[heading] as Vec3;
      const beside = { x: here.x + step.x, y: here.y + step.y, z: here.z };
      const inFootprint =
        beside.x >= 0 && beside.x < state.size.x && beside.y >= 0 && beside.y < state.size.y;
      if (inFootprint) {
        return beside;
      }
      heading = (heading + 1) % HEADINGS.length;
    }
    throw new Error('staircase policy: the cube is one cell wide, there is nowhere to go');
  }

  function decideGoingDown(state: GameState): Decision {
    const here = state.avatar.pos;

    const beside = cellAhead(state, here);
    const belowBeside = { x: beside.x, y: beside.y, z: beside.z + 1 };

    // 1. Headroom. (On the surface the cell beside is already open air.)
    if (isSolid(state, beside)) {
      const mine = legalActions(state).find(
        (action) => action.type === 'mine' && sameCell(action.target, beside),
      );
      return takeOrWait(state, mine, 'mine the block beside the avatar');
    }
    // 2. The next stair's cell.
    if (isSolid(state, belowBeside)) {
      const mine = legalActions(state).find(
        (action) => action.type === 'mine' && sameCell(action.target, belowBeside),
      );
      return takeOrWait(state, mine, 'mine the block below and beside the avatar');
    }
    // 3. Walk in and drop one block.
    const walk = legalActions(state).find(
      (action) => action.type === 'move' && sameCell(action.to, beside) && action.drop === 1,
    );
    return takeOrWait(state, walk, 'walk onto the next stair');
  }

  function decideGoingUp(state: GameState): Decision {
    const here = state.avatar.pos;
    if (isSurface(state.size, here)) {
      const leave = legalActions(state).find((action) => action.type === 'leave');
      return takeOrWait(state, leave, 'leave from the surface');
    }
    // Below the top layer exactly one move goes up a layer: the step back
    // onto the stair the avatar came down from. From the top layer there can
    // be several ways up onto the surface; the first will do.
    const stepUp = legalActions(state).find(
      (action) => action.type === 'move' && action.to.z === here.z - 1,
    );
    return takeOrWait(state, stepUp, 'step up the staircase');
  }

  return {
    name: 'staircase',
    decide: (state: GameState): Decision => {
      if (!Number.isInteger(targetLayer) || targetLayer < 0 || targetLayer >= state.size.z) {
        throw new Error(
          `staircase target layer must be a whole number from 0 to ${state.size.z - 1}, but is ${targetLayer}`,
        );
      }
      if (goingDown && state.avatar.pos.z >= targetLayer) {
        goingDown = false;
      }
      return goingDown ? decideGoingDown(state) : decideGoingUp(state);
    },
  };
}

function sameCell(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * The policy with this name, for a run with this seed. Throws on an unknown
 * name. Only the random policies use the seed.
 */
export function makePolicy(name: string, seed: number): Policy {
  if (name === 'random') {
    return makeRandomPolicy(seed, true);
  }
  if (name === 'wander') {
    return makeRandomPolicy(seed, false);
  }
  if (name === 'staircase') {
    return makeStaircasePolicy(DEFAULT_STAIRCASE_TARGET_LAYER);
  }
  throw new Error(`Unknown policy "${name}"; the policies are ${POLICY_NAMES.join(', ')}`);
}
