// Policies: simple scripted players for the simulator and the tests.
//
// A policy looks at the state and says what to do next: one of the legal
// actions, or "end the shift". It sees the state only through the engine's
// public surface, and only what a player may see: the legal actions,
// `knownSquare`, and the numbers on the HUD. It never reads a block below a
// square's top.
//
// Two policies (issue #86; the walking policies `staircase`, `wander` and
// `coal` went with the miner):
// - `random`: every legal action except closing the mine, and "end the
//   shift", are equally likely. It never closes the mine; see
//   `makeRandomPolicy` for why.
// - `pit`: digs a terraced pit round the middle of the map, cutting the trees
//   in its way, and keeps itself in fuel from the coal it finds. It closes
//   the mine when the fuel is about to run out.
// Neither is how a person plays. Task T15 adds a terracing policy and a depth
// survey.

import { BLOCKS, SHIFT } from '../src/data';
import { actionKey, countItem, createRng, knownSquare, legalActions, nextInt } from '../src/engine';
import type { Action, CutTreeAction, GameState, MineAction } from '../src/engine';

/** What a policy chooses: a legal action, or the string 'endShift'. */
export type Decision = Action | 'endShift';

/**
 * A policy is an object with a name and one method. `decide` may keep notes
 * between calls, so make a new policy for every run.
 */
export interface Policy {
  name: string;
  decide: (state: GameState) => Decision;
}

/** The names `makePolicy` accepts. */
export const POLICY_NAMES = ['random', 'pit'];

/**
 * A short, readable form of a decision, used in logs and golden files:
 * the engine's `actionKey` for an action, or 'endShift'.
 */
export function decisionKey(decision: Decision): string {
  return decision === 'endShift' ? 'endShift' : actionKey(decision);
}

// ---------------------------------------------------------------------------
// Random policy
// ---------------------------------------------------------------------------

/**
 * A policy that picks uniformly among the legal actions other than `closeMine`,
 * and "end the shift".
 *
 * Why it never closes the mine: closing is legal at any time (issue #92). With
 * action points left there are over a thousand legal actions (a mine or a cut
 * for almost every square), so closing would hardly ever be picked; with none
 * left, closing is the ONLY legal action, and a policy that could pick it
 * would close the mine half the time at the end of its first shift. Such
 * runs say nothing. So `random` plays until the fuel runs out or the shift cap, as the
 * old `wander` policy did. (The `pit` policy does close the mine.)
 *
 * `seed` seeds the policy's own random numbers. It is mixed with a constant
 * so that a run whose cube came from seed N does not pick its actions with
 * the very same number sequence that built the cube.
 */
export function makeRandomPolicy(seed: number): Policy {
  // The policy's own generator state: a policy must never draw from
  // `state.rng`, which belongs to the rules.
  // `>>> 0` turns the result back into an unsigned 32-bit whole number.
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  return {
    name: 'random',
    decide: (state: GameState): Decision => {
      const choices = legalActions(state).filter((action) => action.type !== 'closeMine');
      // One extra slot, the last, stands for "end the shift".
      const pick = nextInt(rng, choices.length + 1);
      const action = choices[pick];
      return action === undefined ? 'endShift' : action;
    },
  };
}

// ---------------------------------------------------------------------------
// Pit policy
// ---------------------------------------------------------------------------

/** The id of the field recipe that turns coal into fuel (src/data/recipes.ts). */
export const FUEL_RECIPE_ID = 'fuel';

/**
 * The pit policy's own numbers. They are how this scripted player behaves,
 * not rules of the game, so they live here and not in src/data.
 */
export const PIT_POLICY = {
  /** With this much fuel or less, coal in the stockpile is crafted into fuel. */
  craftFuelAtOrBelow: 6,
  /** With less fuel than this, a coal block in sight is mined before the pit is dug further. */
  fetchCoalBelow: 12,
  /** With this much fuel or less and no way to make more, the policy closes the mine. */
  closeMineAtOrBelow: 1,
};

/** A square the pit policy may work on next: a legal mine or a legal cut. */
interface PitCandidate {
  action: MineAction | CutTreeAction;
  /** The square's depth now. A square with a tree on it is at depth 0. */
  depth: number;
  /** Steps from the centre of the map (north, east, south, west; no diagonals). */
  distance: number;
}

/**
 * True if `a` is a better square to work on than `b`: deeper first, then
 * nearer the centre. Candidates are listed row by row, and the first of two
 * equally good ones is kept, so the choice never depends on anything else.
 */
function isBetterCandidate(a: PitCandidate, b: PitCandidate): boolean {
  if (a.depth !== b.depth) {
    return a.depth > b.depth;
  }
  return a.distance < b.distance;
}

/**
 * A policy that digs a terraced pit round the middle of the map.
 *
 * Each time it is asked, the first of these that applies:
 * 1. Fuel is at or below `craftFuelAtOrBelow` and there is coal in the
 *    stockpile: craft fuel.
 * 2. Fuel is at or below `closeMineAtOrBelow`, with no coal to craft: close
 *    the mine, and take the salvage, before the fuel runs out.
 * 3. Fuel is below `fetchCoalBelow` and a legal mine would take a coal block
 *    the player can see: mine the best such square.
 * 4. Otherwise work on the best square there is a legal action for: the
 *    deepest, and among equally deep ones the nearest to the centre. A
 *    square with a tree on it counts as a square at depth 0, and its action
 *    is to cut the tree: so a tree is cut exactly when its square is the next
 *    the pit needs.
 * 5. Nothing to mine or cut that the AP left pay for: end the shift.
 *
 * Why this digs a terraced pit: the level rule only lets a square be mined
 * when no neighbour is higher. "Deepest first" takes the middle down a level
 * as soon as the ring round it allows, and "nearest the centre" widens the
 * ring when nothing deeper is legal. The result is a cone of 1-level steps.
 *
 * It only ever takes actions from `legalActions`, which lists what the AP
 * left can pay for. So near the end of a shift it may take a cheaper square
 * a little further out instead of waiting; that keeps the script simple and
 * costs the pit little.
 *
 * It uses no random numbers: the same state always gives the same decision.
 */
export function makePitPolicy(): Policy {
  function decide(state: GameState): Decision {
    const legal = legalActions(state);
    const centreX = Math.floor(state.size.x / 2);
    const centreY = Math.floor(state.size.y / 2);

    // 1. Keep the fuel up.
    if (state.fuel <= PIT_POLICY.craftFuelAtOrBelow && countItem(state, 'coal') > 0) {
      const craft = legal.find(
        (action) => action.type === 'craft' && action.recipe === FUEL_RECIPE_ID,
      );
      // Not legal only when no AP are left; the new shift's AP pay for it.
      return craft === undefined ? 'endShift' : craft;
    }

    // 2. About to run out, and nothing to burn: close the mine, alive.
    if (state.fuel <= PIT_POLICY.closeMineAtOrBelow) {
      const closeMine = legal.find((action) => action.type === 'closeMine');
      if (closeMine !== undefined) {
        return closeMine;
      }
    }

    // The squares there is a legal mine or cut for, with what the policy
    // needs to rank them. `knownSquare` is what the player sees of a square.
    const candidates: PitCandidate[] = [];
    for (const action of legal) {
      if (action.type !== 'mine' && action.type !== 'cutTree') {
        continue;
      }
      candidates.push({
        action,
        depth: knownSquare(state, action.x, action.y).depth,
        distance: Math.abs(action.x - centreX) + Math.abs(action.y - centreY),
      });
    }

    // 3. Low on fuel: take coal the player can see, if a mine is legal there.
    if (state.fuel < PIT_POLICY.fetchCoalBelow) {
      let bestCoal: PitCandidate | undefined = undefined;
      for (const candidate of candidates) {
        if (candidate.action.type !== 'mine') {
          continue;
        }
        const top = knownSquare(state, candidate.action.x, candidate.action.y).top;
        if (top === null || top.block !== BLOCKS.coalSeam.code) {
          continue;
        }
        if (bestCoal === undefined || isBetterCandidate(candidate, bestCoal)) {
          bestCoal = candidate;
        }
      }
      if (bestCoal !== undefined) {
        return bestCoal.action;
      }
    }

    // 4. Dig the pit.
    let best: PitCandidate | undefined = undefined;
    for (const candidate of candidates) {
      if (best === undefined || isBetterCandidate(candidate, best)) {
        best = candidate;
      }
    }
    if (best !== undefined) {
      return best.action;
    }

    // 5. Nothing the AP left pay for.
    if (state.ap >= SHIFT.apPerShift) {
      // Even a full shift's AP buy nothing: the whole map is mined out or
      // blocked. A scripted policy that waited for ever would hide that.
      throw new Error(`pit policy is stuck in shift ${state.shift}: nothing to mine or cut`);
    }
    return 'endShift';
  }

  return { name: 'pit', decide };
}

/**
 * The policy with this name, for a run with this seed. Throws on an unknown
 * name. Only the random policy uses the seed.
 */
export function makePolicy(name: string, seed: number): Policy {
  if (name === 'random') {
    return makeRandomPolicy(seed);
  }
  if (name === 'pit') {
    return makePitPolicy();
  }
  throw new Error(`Unknown policy "${name}"; the policies are ${POLICY_NAMES.join(', ')}`);
}
