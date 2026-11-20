// Policies: simple scripted players for the simulator and the tests.
//
// A policy looks at the state and says what to do next: one of the legal
// actions, or "end the shift". It sees the state only through the engine's
// public surface, and only what a player may see: the legal actions,
// `knownSquare`, and the numbers on the HUD. It never reads a block below a
// square's top.
//
// The policies (issue #86; the walking policies `staircase`, `wander` and
// `coal` went with the miner):
// - `random`: every legal action except closing the mine, and "end the
//   shift", are equally likely. It never closes the mine; see
//   `makeRandomPolicy` for why.
// - `pit`: digs a terraced pit round the middle of the map, cutting the trees
//   in its way, and keeps itself in fuel from the coal it finds. It closes
//   the mine when the fuel is about to run out. Since pit walls slump (issue
//   #94) it never takes a mine that would make a square unstable, and when a
//   square is unstable all the same it mines it down or holds it with a support.
// - `greedy`: the pit policy with its eyes shut to slumps: it digs the
//   steepest pit the level rule allows and deals with nothing. Its walls
//   crack and slump, and the crew is hurt when it works where they fall. It
//   is here so that the simulator and the golden runs exercise the slump rule.
// - `camp`: the greedy policy with a camp (issue #100): it founds a camp near
//   the middle with its starting kit, and rests there when the crew is hurt.
//   It is here so that the simulator and the golden runs exercise camps: the
//   founding, the cheaper mining, the upkeep and the rest.
// None is how a person plays. Task T15 adds a terracing policy and a depth
// survey.

import { BLOCKS, CAMPS, CREW, SHIFT } from '../src/data';
import {
  actionKey,
  countItem,
  createRng,
  knownSquare,
  legalActions,
  nextInt,
  unstableAfterMine,
  unstableSquares,
} from '../src/engine';
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
export const POLICY_NAMES = ['random', 'pit', 'greedy', 'camp'];

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
/** The id of the field recipe that makes a support (src/data/recipes.ts). */
export const SUPPORT_RECIPE_ID = 'support';

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

/** The camp policy's own numbers: how this scripted player behaves, not rules of the game. */
export const CAMP_POLICY = {
  /** With this much crew health or less, the crew rests at the camp. */
  restAtOrBelow: CREW.startHealth - 4,
  /**
   * The camp's centre is at least this many steps from the centre of the
   * map, so that the camp does not sit on the spot where the pit goes down.
   */
  minStepsFromCentre: 3,
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
 * True if taking this candidate would make no square unstable (design doc
 * 6.1). A cut never does. `unstableAfterMine` reads only what the player
 * sees.
 */
function isSafeCandidate(state: GameState, candidate: PitCandidate, heedSlumps: boolean): boolean {
  if (!heedSlumps) {
    return true; // the greedy policy takes any legal square
  }
  if (candidate.action.type !== 'mine') {
    return true;
  }
  return unstableAfterMine(state, candidate.action.x, candidate.action.y).length === 0;
}

/**
 * The best candidate that is safe to take, or `undefined` if none is.
 * Candidates are tried from the best down, so the check that costs the most
 * (`isSafeCandidate`) is run on a few squares and not on a thousand.
 */
function bestSafeCandidate(
  state: GameState,
  candidates: PitCandidate[],
  heedSlumps: boolean,
): PitCandidate | undefined {
  // `[...list]` copies the list; `sort` would otherwise reorder the caller's.
  // The sort is stable: equally good candidates stay in row order.
  const ranked = [...candidates].sort((a, b) => {
    if (isBetterCandidate(a, b)) return -1;
    if (isBetterCandidate(b, a)) return 1;
    return 0;
  });
  return ranked.find((candidate) => isSafeCandidate(state, candidate, heedSlumps));
}

/**
 * A policy that digs a terraced pit round the middle of the map.
 *
 * Each time it is asked, the first of these that applies:
 * 1. Fuel is at or below `craftFuelAtOrBelow` and there is coal in the
 *    stockpile: craft fuel.
 * 2. Fuel is at or below `closeMineAtOrBelow`, with no coal to craft: close
 *    the mine, and take the salvage, before the fuel runs out.
 * 3. A square is unstable (it is cracked, or will crack when the shift ends):
 *    lay the slope back by mining that square, if that is legal and safe;
 *    otherwise place a support on it; with none in the stockpile, craft one.
 *    This happens when a cut tree stops holding weak ground, or a block
 *    turns out weaker than the one that was above it: rule 5 never makes a
 *    square unstable knowingly.
 * 4. Fuel is below `fetchCoalBelow` and a safe, legal mine would take a coal
 *    block the player can see: mine the best such square.
 * 5. Otherwise work on the best square there is a safe, legal action for:
 *    the deepest, and among equally deep ones the nearest to the centre. A
 *    square with a tree on it counts as a square at depth 0, and its action
 *    is to cut the tree: so a tree is cut exactly when its square is the next
 *    the pit needs. "Safe" means the mine would make no square unstable
 *    (design doc 6.1), so the pit grows the level benches its material needs:
 *    wide ones in dirt, narrower ones in rock.
 * 6. Nothing to mine or cut that the AP left pay for: end the shift.
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
 *
 * `heedSlumps` false makes the `greedy` policy: rule 3 is skipped and every
 * legal square counts as safe, so it digs the plain cone of 1-level steps and
 * lets its walls slump (design doc 6.1).
 *
 * `useCamp` true adds two rules between rules 2 and 3 (design doc 8):
 * - 2a. Crew health is at or below `CAMP_POLICY.restAtOrBelow` and a rest is
 *   legal: rest at the first camp on the list.
 * - 2b. There is a camp kit and a camp can be founded: found it on the legal
 *   site nearest the centre of the map that is at least
 *   `CAMP_POLICY.minStepsFromCentre` steps from it (the first such site in
 *   row order among equally near ones). This takes the rest of the shift.
 * With `heedSlumps` false as well, this is the `camp` policy.
 */
export function makePitPolicy(heedSlumps = true, useCamp = false): Policy {
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

    if (useCamp) {
      // 2a. The crew is hurt: rest at a camp, if one stands and AP are left.
      if (state.crew.health <= CAMP_POLICY.restAtOrBelow) {
        const rest = legal.find((action) => action.type === 'rest');
        if (rest !== undefined) {
          return rest;
        }
      }
      // 2b. A kit in hand: found the camp near the middle, but not on it.
      if (countItem(state, CAMPS.kitItem) > 0) {
        let bestSite: Action | undefined;
        let bestDistance = Infinity;
        for (const action of legal) {
          if (action.type !== 'foundCamp') {
            continue;
          }
          const distance = Math.abs(action.x - centreX) + Math.abs(action.y - centreY);
          if (distance >= CAMP_POLICY.minStepsFromCentre && distance < bestDistance) {
            bestSite = action;
            bestDistance = distance;
          }
        }
        if (bestSite !== undefined) {
          return bestSite;
        }
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

    // 3. Deal with an unstable square. The first square in row order that a
    //    way works for is the one dealt with; laying the slope back is tried
    //    for every square before a support is spent on any.
    const unstable = heedSlumps ? unstableSquares(state) : [];
    if (unstable.length > 0) {
      for (const square of unstable) {
        const mine = candidates.find(
          (candidate) =>
            candidate.action.type === 'mine' &&
            candidate.action.x === square.x &&
            candidate.action.y === square.y &&
            isSafeCandidate(state, candidate, heedSlumps),
        );
        if (mine !== undefined) {
          return mine.action;
        }
      }
      for (const square of unstable) {
        const place = legal.find(
          (action) =>
            action.type === 'placeSupport' && action.x === square.x && action.y === square.y,
        );
        if (place !== undefined) {
          return place;
        }
      }
      if (countItem(state, 'support') === 0) {
        const craft = legal.find(
          (action) => action.type === 'craft' && action.recipe === SUPPORT_RECIPE_ID,
        );
        if (craft !== undefined) {
          return craft;
        }
      }
    }

    // 4. Low on fuel: take coal the player can see, if a safe mine is legal there.
    if (state.fuel < PIT_POLICY.fetchCoalBelow) {
      const coal = candidates.filter((candidate) => {
        if (candidate.action.type !== 'mine') {
          return false;
        }
        const top = knownSquare(state, candidate.action.x, candidate.action.y).top;
        return top !== null && top.block === BLOCKS.coalSeam.code;
      });
      const bestCoal = bestSafeCandidate(state, coal, heedSlumps);
      if (bestCoal !== undefined) {
        return bestCoal.action;
      }
    }

    // 5. Dig the pit.
    const best = bestSafeCandidate(state, candidates, heedSlumps);
    if (best !== undefined) {
      return best.action;
    }

    // 6. Nothing the AP left pay for.
    if (state.ap >= SHIFT.apPerShift) {
      // Even a full shift's AP buy nothing: the whole map is mined out or
      // blocked. A scripted policy that waited for ever would hide that.
      throw new Error(`pit policy is stuck in shift ${state.shift}: nothing to mine or cut`);
    }
    return 'endShift';
  }

  let name = heedSlumps ? 'pit' : 'greedy';
  if (useCamp) {
    name = heedSlumps ? 'pit with a camp' : 'camp';
  }
  return { name, decide };
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
  if (name === 'greedy') {
    return makePitPolicy(false);
  }
  if (name === 'camp') {
    return makePitPolicy(false, true);
  }
  throw new Error(`Unknown policy "${name}"; the policies are ${POLICY_NAMES.join(', ')}`);
}
