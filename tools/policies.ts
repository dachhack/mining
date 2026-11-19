// Policies: simple scripted players for the simulator and the tests.
//
// A policy looks at the state and says what to do next: one of the legal
// actions, or "end the shift". It sees the state only through the engine's
// public surface, as any other player would.
//
// Four policies:
// - `random`: every legal action and "end the shift" are equally likely.
// - `wander`: the same, but it never chooses to leave. It exists because a
//   `random` player starts on the surface, where leaving is always on offer,
//   so about four in five of its runs end within a few choices and say little
//   about play underground. `wander` gives the simulator and the property
//   tests long, deep runs. Neither is how a person plays.
// - `staircase`: cuts a staircase down to a target layer, walks back up it,
//   and leaves. This is the M1 acceptance test's policy.
// - `coal`: walks over the surface to the nearest coal it can see in the top
//   layer, mines it, turns it into fuel, and leaves once the fuel gauge is
//   back to what the run started with. If the top layer runs out first it
//   follows a seam one block down. It measures whether the starting fuel is
//   enough to get to coal (issue #51); see tools/coalSurvey.ts.

import { ACTION_COSTS, BLOCKS, SHIFT } from '../src/data';
import type { Vec3 } from '../src/data';
import {
  actionKey,
  blockAt,
  blockDefAt,
  countItem,
  createRng,
  hasTree,
  isRevealed,
  isSolid,
  isSurface,
  isUnderTree,
  legalActions,
  nextInt,
} from '../src/engine';
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
export const POLICY_NAMES = ['random', 'wander', 'staircase', 'coal'];

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
 * The surface is a forest (issue #70), and the ground under a tree cannot be
 * mined from the surface. The first two stairs need the layer-0 blocks under
 * the two surface cells ahead of the start, so before it digs the policy
 * clears them: it cuts the tree on the cell ahead if there is one; for the
 * cell after that it walks onto the cell ahead, cuts, and walks back to where
 * it started. From the second stair on it is underground, where trees do not
 * matter.
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
  // Where the staircase starts: the avatar's cell at the first decision.
  let origin: Vec3 | null = null;

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

  /**
   * On the surface before the first stair: the action that clears the trees
   * off the two surface cells ahead of `start`, or `null` once both are
   * clear and the avatar is back on `start`.
   */
  function clearTheWay(state: GameState, start: Vec3): Decision | null {
    const here = state.avatar.pos;
    const ahead = cellAhead(state, start);
    const step = HEADINGS[heading] as Vec3;
    const afterThat = { x: ahead.x + step.x, y: ahead.y + step.y, z: ahead.z };
    const legal = legalActions(state);
    const cut = (target: Vec3): Action | undefined =>
      legal.find((action) => action.type === 'cutTree' && sameCell(action.target, target));
    const walkTo = (to: Vec3): Action | undefined =>
      legal.find((action) => action.type === 'move' && sameCell(action.to, to));
    if (hasTree(state, ahead)) {
      return takeOrWait(state, cut(ahead), 'cut the tree ahead');
    }
    if (hasTree(state, afterThat)) {
      return sameCell(here, ahead)
        ? takeOrWait(state, cut(afterThat), 'cut the second tree ahead')
        : takeOrWait(state, walkTo(ahead), 'walk to the cell ahead');
    }
    if (!sameCell(here, start)) {
      return takeOrWait(state, walkTo(start), 'walk back to the start of the staircase');
    }
    return null;
  }

  function decideGoingDown(state: GameState): Decision {
    const here = state.avatar.pos;
    if (origin === null) {
      origin = { ...here };
    }
    if (isSurface(state.size, here)) {
      const clearing = clearTheWay(state, origin);
      if (clearing !== null) {
        return clearing;
      }
    }

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

// ---------------------------------------------------------------------------
// Coal policy
// ---------------------------------------------------------------------------

/** The id of the field recipe that turns coal into fuel (src/data/recipes.ts). */
export const FUEL_RECIPE_ID = 'fuel';

/** The eight cells around a cell on the same level, as (x, y) steps, in a fixed order. */
const AROUND: Vec3[] = [
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 1, z: 0 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: -1, z: 0 },
];

/** The top-layer block under the surface cell `surfaceCell`. */
function floorUnder(surfaceCell: Vec3): Vec3 {
  return { x: surfaceCell.x, y: surfaceCell.y, z: 0 };
}

/**
 * True if the player has seen the top-layer cell under `surfaceCell` and it
 * still holds a block: a floor to walk on. False for a hole.
 *
 * The top layer is in daylight, so `updateReveal` reveals all of it in every
 * state and the `isRevealed` test never fails today. It is written out so
 * that "the policy uses only what a player sees" does not rest on that fact.
 */
function hasKnownFloor(state: GameState, surfaceCell: Vec3): boolean {
  const floor = floorUnder(surfaceCell);
  return isRevealed(state, floor) && isSolid(state, floor);
}

/**
 * True if the miner can walk on the surface cell: no tree stands in it
 * (issue #70) and its floor is known to be there.
 */
function isWalkable(state: GameState, surfaceCell: Vec3): boolean {
  return !hasTree(state, surfaceCell) && hasKnownFloor(state, surfaceCell);
}

/** True if the player has seen the top-layer cell under `surfaceCell` and it is a hole. */
function isKnownHole(state: GameState, surfaceCell: Vec3): boolean {
  const floor = floorUnder(surfaceCell);
  return isRevealed(state, floor) && !isSolid(state, floor);
}

/** True if the cell holds a coal seam the player has seen. */
function isKnownCoal(state: GameState, pos: Vec3): boolean {
  return isRevealed(state, pos) && blockAt(state, pos) === BLOCKS.coalSeam.code;
}

/**
 * The first known coal block the pick can reach from the cell `stand` without
 * taking the miner's own floor away, or `undefined` if there is none.
 *
 * The pick reaches the eight cells around the miner and, one level down, the
 * block underfoot and the eight around that one (decision note 0005 item 10).
 * The block underfoot is left out: mining it would drop the miner into the
 * hole. From the surface only the level below can hold a block, and a block
 * under a tree cannot be mined from there (issue #70).
 */
function coalInReach(state: GameState, stand: Vec3): Vec3 | undefined {
  const fromSurface = isSurface(state.size, stand);
  for (const levelsDown of [0, 1]) {
    for (const step of AROUND) {
      const target = { x: stand.x + step.x, y: stand.y + step.y, z: stand.z + levelsDown };
      if (fromSurface && isUnderTree(state, target)) {
        continue;
      }
      if (isKnownCoal(state, target)) {
        return target;
      }
    }
  }
  return undefined;
}

/** Where the coal policy should walk next: see `routeOverSurface`. */
interface SurfaceRoute {
  /** How many steps away the nearest goal cell is; 0 if the miner is on it. */
  steps: number;
  /** The first cell to walk into; `undefined` when `steps` is 0. */
  firstStep: Vec3 | undefined;
}

/**
 * The shortest walk over the surface from the miner's cell to a surface cell
 * for which `isGoal` is true, or `undefined` if there is no such cell.
 *
 * The walk only crosses surface cells whose floor is still there and that
 * hold no tree, so it goes round the holes left by coal already mined and
 * round the forest. This is a breadth-first search:
 * `frontier` holds the cells reached in exactly `steps` steps.
 *
 * `isGoal` is a function passed in as a value, as in Python.
 */
function routeOverSurface(
  state: GameState,
  isGoal: (surfaceCell: Vec3) => boolean,
): SurfaceRoute | undefined {
  const start = state.avatar.pos;
  if (isGoal(start)) {
    return { steps: 0, firstStep: undefined };
  }
  // For each cell reached, the first step of the walk that reached it.
  // Keyed by "x,y"; every cell here is on the surface.
  const firstStepTo = new Map<string, Vec3>();
  const seen = new Set<string>([`${start.x},${start.y}`]);
  let frontier: Vec3[] = [start];
  let steps = 0;
  while (frontier.length > 0) {
    steps += 1;
    const next: Vec3[] = [];
    for (const from of frontier) {
      for (const step of HEADINGS) {
        const to = { x: from.x + step.x, y: from.y + step.y, z: from.z };
        const key = `${to.x},${to.y}`;
        const inFootprint = to.x >= 0 && to.x < state.size.x && to.y >= 0 && to.y < state.size.y;
        if (!inFootprint || seen.has(key) || !isWalkable(state, to)) {
          continue;
        }
        seen.add(key);
        // The first step is `to` itself when leaving the start cell, and
        // otherwise whatever first step led to `from`.
        const firstStep = firstStepTo.get(`${from.x},${from.y}`) ?? to;
        firstStepTo.set(key, firstStep);
        if (isGoal(to)) {
          return { steps, firstStep };
        }
        next.push(to);
      }
    }
    frontier = next;
  }
  return undefined;
}

/**
 * A policy that fetches coal from the top of the cube and leaves as soon as
 * the trip has paid for itself in fuel.
 *
 * Each time it is asked, the first of these that applies:
 * 1. It has crafted fuel and the gauge is back to at least what the run
 *    started with: go home (step up out of a hole if it is in one, and leave).
 * 2. It carries timber (from cutting trees): drop it, so coal always fits.
 *    It carries coal: craft fuel from it.
 * 3. Standing in a hole: mine coal in reach, and step back up when none is.
 * 4. On the surface:
 *    a. top-layer coal is in reach beside it: mine it;
 *    b. top-layer coal can be walked to: take one step towards the nearest;
 *    c. no top-layer coal is left, but a hole it has not been down shows coal
 *       at the bottom or in reach from inside: walk to it and step in (a
 *       drop of one block);
 *    d. no coal in sight (the forest hides much of the top layer; issue
 *       #70): dig a look-hole. Walk beside an open surface cell that borders
 *       the forest and whose floor is cheap rock, mine that floor and step
 *       into the hole. From there the lamp shows the ground under the trees
 *       round it and the layer below, and step 3 takes any coal in reach. At
 *       most `LOOK_HOLES_MAX` look-holes;
 *    e. no look-hole left to dig: cut the nearest tree (at most
 *       `TREES_CUT_MAX`), which shows the ground under it and opens new
 *       ground for look-holes;
 *    f. otherwise give up and leave.
 *
 * It uses only what a player sees: the top layer is in daylight except under
 * the trees, and the bottom of a hole is seen from above. It never mines the
 * block underfoot, so it takes no damage and uses no ladders. It goes no
 * deeper than one block; that makes it a careful player, not the best one.
 *
 * When the action it wants costs more AP than are left it ends the shift; if
 * the action is missing even with full AP it throws, as the staircase does.
 */
export function makeCoalPolicy(): Policy {
  // The policy's notes between calls.
  let fuelAtStart: number | null = null;
  let hasCraftedFuel = false;
  // The holes it has stepped into, as "x,y" strings, so it tries each once.
  const holesTried = new Set<string>();
  let lookHolesDug = 0;
  let treesCut = 0;
  // Holes left where it mined top-layer coal, as "x,y": coal comes in veins,
  // so the ground round such a hole is worth a look from inside.
  const coalHoles = new Set<string>();
  // A look-hole just dug and not yet stepped into.
  let pendingLookHole: Vec3 | null = null;

  function takeOrWait(state: GameState, wanted: Action | undefined, what: string): Decision {
    if (wanted !== undefined) {
      return wanted;
    }
    if (state.ap >= SHIFT.apPerShift) {
      const here = state.avatar.pos;
      throw new Error(
        `coal policy is stuck at (${here.x}, ${here.y}, ${here.z}) in shift ${state.shift}: cannot ${what} even with full AP`,
      );
    }
    return 'endShift';
  }

  /** Is the top-layer cell under `surfaceCell` a hole worth stepping into? */
  function isHoleWithCoal(state: GameState, surfaceCell: Vec3): boolean {
    const hole = floorUnder(surfaceCell);
    const bottom = { x: hole.x, y: hole.y, z: hole.z + 1 };
    return (
      !holesTried.has(`${hole.x},${hole.y}`) &&
      !hasTree(state, surfaceCell) &&
      isKnownHole(state, surfaceCell) &&
      (isKnownCoal(state, bottom) ||
        coalInReach(state, hole) !== undefined ||
        coalHoles.has(`${hole.x},${hole.y}`))
    );
  }

  /**
   * Is the surface cell a good place for a look-hole (step 4d)? It must be
   * open ground with a known floor of cheap rock, and from inside the hole
   * the pick (and so the lamp) must reach at least
   * `LOOK_HOLE_MIN_UNSEEN_CELLS` cells the player has not seen.
   */
  function isLookHoleSpot(state: GameState, surfaceCell: Vec3): boolean {
    if (!isWalkable(state, surfaceCell)) {
      return false;
    }
    const floor = floorUnder(surfaceCell);
    const cost = blockDefAt(state, floor).mineCost;
    if (cost === null || cost > LOOK_HOLE_MAX_MINE_AP) {
      return false;
    }
    let unseen = 0;
    for (const levelsDown of [0, 1]) {
      for (const step of AROUND) {
        const cell = { x: floor.x + step.x, y: floor.y + step.y, z: floor.z + levelsDown };
        if (inFootprintOf(state, cell) && !isRevealed(state, cell)) {
          unseen += 1;
        }
      }
    }
    return unseen >= LOOK_HOLE_MIN_UNSEEN_CELLS;
  }

  /** A surface cell beside `stand` with a tree in it, if any. */
  function treeBeside(state: GameState, stand: Vec3): Vec3 | undefined {
    for (const step of HEADINGS) {
      const beside = { x: stand.x + step.x, y: stand.y + step.y, z: stand.z };
      if (hasTree(state, beside)) {
        return beside;
      }
    }
    return undefined;
  }

  /** A cell beside the surface cell `stand` that is a good look-hole spot, if any. */
  function lookHoleSpotBeside(state: GameState, stand: Vec3): Vec3 | undefined {
    for (const step of HEADINGS) {
      const beside = { x: stand.x + step.x, y: stand.y + step.y, z: stand.z };
      if (inFootprintOf(state, beside) && isLookHoleSpot(state, beside)) {
        return beside;
      }
    }
    return undefined;
  }

  /** The surface cell beside `surfaceCell` that is over a hole worth stepping into, if any. */
  function holeBeside(state: GameState, surfaceCell: Vec3): Vec3 | undefined {
    for (const step of HEADINGS) {
      const beside = { x: surfaceCell.x + step.x, y: surfaceCell.y + step.y, z: surfaceCell.z };
      if (isHoleWithCoal(state, beside)) {
        return beside;
      }
    }
    return undefined;
  }

  function decide(state: GameState): Decision {
    {
      if (fuelAtStart === null) {
        fuelAtStart = state.fuel;
      }
      const here = state.avatar.pos;
      const onSurface = isSurface(state.size, here);
      const legal = legalActions(state);
      const leave = legal.find((action) => action.type === 'leave');
      const stepUp = legal.find((action) => action.type === 'move' && action.to.z === here.z - 1);
      const mineCoal = (coal: Vec3 | undefined): Action | undefined => {
        const found = legal.find(
          (action) => action.type === 'mine' && coal !== undefined && sameCell(action.target, coal),
        );
        if (found !== undefined && coal !== undefined && coal.z === 0) {
          coalHoles.add(`${coal.x},${coal.y}`);
        }
        return found;
      };

      // 1. The trip has paid for itself.
      if (hasCraftedFuel && state.fuel >= fuelAtStart) {
        return onSurface
          ? takeOrWait(state, leave, 'leave from the surface')
          : takeOrWait(state, stepUp, 'step up out of the hole');
      }
      // 2a. Timber from cut trees is no use to this trip and weighs the pack
      // down, so that coal no longer fits: drop it (0 AP).
      const dropTimber = legal.find(
        (action) =>
          action.type === 'drop' &&
          action.item === 'timber' &&
          action.count === countItem(state, 'timber'),
      );
      if (dropTimber !== undefined) {
        return dropTimber;
      }
      // 2b. Turn coal into fuel as soon as it is in the pack.
      if (countItem(state, 'coal') > 0) {
        const craft = legal.find(
          (action) => action.type === 'craft' && action.recipe === FUEL_RECIPE_ID,
        );
        if (craft !== undefined) {
          hasCraftedFuel = true;
        }
        return takeOrWait(state, craft, 'craft fuel from coal');
      }
      // 3. In a hole: take the coal in reach, then climb out.
      if (!onSurface) {
        const coal = coalInReach(state, here);
        return coal !== undefined
          ? takeOrWait(state, mineCoal(coal), 'mine the coal in reach')
          : takeOrWait(state, stepUp, 'step up out of the hole');
      }
      // 4d, continued: step into the look-hole just dug (a drop of one block).
      if (pendingLookHole !== null) {
        const spot = pendingLookHole;
        const stepIn = legal.find(
          (action) => action.type === 'move' && sameCell(action.to, spot) && action.drop === 1,
        );
        if (stepIn !== undefined) {
          pendingLookHole = null;
          holesTried.add(`${spot.x},${spot.y}`);
          return stepIn;
        }
        if (state.ap < ACTION_COSTS_MOVE) {
          return 'endShift';
        }
        // The drop cannot be seen (the lamp is out): forget this hole.
        pendingLookHole = null;
        holesTried.add(`${spot.x},${spot.y}`);
      }
      // 4a and 4b. Top-layer coal, worked from the surface.
      const toCoal = routeOverSurface(
        state,
        (cell: Vec3): boolean => coalInReach(state, cell) !== undefined,
      );
      if (toCoal !== undefined && toCoal.firstStep === undefined) {
        return takeOrWait(state, mineCoal(coalInReach(state, here)), 'mine the coal in reach');
      }
      // 4c. A hole with coal at the bottom or in reach from inside.
      const toHole = routeOverSurface(
        state,
        (cell: Vec3): boolean => holeBeside(state, cell) !== undefined,
      );
      // A hole near by is looked into first (the vein may go on under the
      // trees); then coal it can see, however far; a look-hole only when no
      // coal is in sight. (Tried the other way round, look-holes before long
      // walks, the survey came out worse: a look-hole finds coal less often
      // than a walk to coal already seen.)
      const isNear = (found: SurfaceRoute | undefined): boolean =>
        found !== undefined && found.steps <= COAL_WALK_MAX_STEPS;
      let route: SurfaceRoute | undefined = isNear(toHole) ? toHole : toCoal;
      if (route === undefined) {
        // 4d. Dig a look-hole beside the nearest good spot.
        const toSpot =
          lookHolesDug < LOOK_HOLES_MAX && state.lampOil > 0
            ? routeOverSurface(
                state,
                (cell: Vec3): boolean => lookHoleSpotBeside(state, cell) !== undefined,
              )
            : undefined;
        if (toSpot !== undefined && toSpot.firstStep !== undefined) {
          const nextCell = toSpot.firstStep;
          const walk = legal.find(
            (action) =>
              action.type === 'move' && sameCell(action.to, nextCell) && action.drop === 0,
          );
          return takeOrWait(state, walk, 'walk towards a look-hole');
        }
        if (toSpot !== undefined) {
          const spot = lookHoleSpotBeside(state, here) as Vec3;
          const floor = floorUnder(spot);
          const dig = legal.find(
            (action) => action.type === 'mine' && sameCell(action.target, floor),
          );
          if (dig !== undefined) {
            // Dug now and stepped into at the next decision (see above).
            lookHolesDug += 1;
            pendingLookHole = spot;
          }
          return takeOrWait(state, dig, 'dig a look-hole');
        }
        // No look-hole left to dig: walk to coal or a hole however far it is.
        route = toCoal ?? toHole;
      }
      if (route === undefined) {
        // 4e. Cut into the forest: the nearest tree, which shows the ground
        // under it and makes room for more look-holes.
        const toTree =
          treesCut < TREES_CUT_MAX
            ? routeOverSurface(
                state,
                (cell: Vec3): boolean => treeBeside(state, cell) !== undefined,
              )
            : undefined;
        if (toTree !== undefined && toTree.firstStep !== undefined) {
          const nextCell = toTree.firstStep;
          const walk = legal.find(
            (action) =>
              action.type === 'move' && sameCell(action.to, nextCell) && action.drop === 0,
          );
          return takeOrWait(state, walk, 'walk towards a tree');
        }
        if (toTree !== undefined) {
          const tree = treeBeside(state, here) as Vec3;
          const cut = legal.find(
            (action) => action.type === 'cutTree' && sameCell(action.target, tree),
          );
          if (cut !== undefined) {
            treesCut += 1;
          }
          return takeOrWait(state, cut, 'cut a tree');
        }
        // 4f. Nothing left to try: give up.
        return takeOrWait(state, leave, 'leave from the surface');
      }
      if (route.firstStep === undefined) {
        const hole = holeBeside(state, here);
        const stepIn = legal.find(
          (action) =>
            action.type === 'move' &&
            hole !== undefined &&
            sameCell(action.to, hole) &&
            action.drop === 1,
        );
        if (hole !== undefined && (stepIn !== undefined || state.ap >= SHIFT.apPerShift)) {
          // Tried once, whether the step in is offered or not: with the lamp
          // out the drop cannot be seen, and a deeper hole is not a drop of 1.
          holesTried.add(`${hole.x},${hole.y}`);
          if (stepIn === undefined) {
            return decide(state);
          }
        }
        return takeOrWait(state, stepIn, 'step into the hole');
      }
      // Walk one step along the route (to coal, or to a hole).
      const nextCell = route.firstStep;
      const walk = legal.find(
        (action) => action.type === 'move' && sameCell(action.to, nextCell) && action.drop === 0,
      );
      return takeOrWait(state, walk, 'walk over the surface');
    }
  }

  return { name: 'coal', decide };
}

/** A hole no further than this many steps away is looked into before walking to coal (step 4c). */
const COAL_WALK_MAX_STEPS = 10;
/** The most look-holes the coal policy digs before it gives up (step 4d). */
export const LOOK_HOLES_MAX = 12;
/** The most trees the coal policy cuts before it gives up (step 4e). */
export const TREES_CUT_MAX = 20;
/** A look-hole is dug only through rock that costs at most this much AP to mine. */
const LOOK_HOLE_MAX_MINE_AP = 1;
/** A look-hole must let the miner see at least this many cells it has not seen. */
const LOOK_HOLE_MIN_UNSEEN_CELLS = 10;
/** What a step costs, for the coal policy's own bookkeeping. */
const ACTION_COSTS_MOVE = ACTION_COSTS.move;

/** True if the cell's column is inside the cube's footprint and the cell is in the grid or on the surface. */
function inFootprintOf(state: GameState, pos: Vec3): boolean {
  return (
    pos.x >= 0 && pos.x < state.size.x && pos.y >= 0 && pos.y < state.size.y && pos.z < state.size.z
  );
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
  if (name === 'coal') {
    return makeCoalPolicy();
  }
  throw new Error(`Unknown policy "${name}"; the policies are ${POLICY_NAMES.join(', ')}`);
}
