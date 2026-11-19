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

import { BLOCKS, SHIFT } from '../src/data';
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
 * A policy that cuts a staircase down to `targetLayer`, goes back up it,
 * and leaves from the surface.
 *
 * The pick reaches face neighbours only (issue #75), so a stair is dug the
 * Minecraft way: forward, step in, down. Seen from the side, heading right
 * (`@` is the avatar, `1` and `2` the blocks it mines, in that order):
 *
 *     @ 1        . @        . .
 *     # #   ->   # 2   ->   # @ ...
 *     # #        # #        # #
 *
 * 1. Mine the block beside the avatar (on the surface there is none: the
 *    cell beside is open air). That is also the headroom the avatar needs
 *    to step back up later.
 * 2. Walk into it. Its floor is the next stair.
 * 3. Mine the block underfoot: the avatar moves down into it (issue #75). It
 *    is now one layer lower and one cell along.
 *
 * Going back up, it retraces the cells it went down through, one move each
 * (the miner has no gravity, issue #80: it can move up into any open cell).
 *
 * The surface is a forest (issue #70): the ground under a tree cannot be
 * mined from the surface, and a tree cannot be walked into. So before the
 * first stair the policy cuts the tree on the cell ahead of the start, if
 * there is one. Underground, trees do not matter.
 *
 * At the edge of the cube the staircase turns right (east, south, west,
 * north). It never turns straight back: that would mine the stair it has
 * just dug.
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
  // True once the avatar has walked into the cell of the next stair and has
  // not yet dug down from it.
  let stepped = false;
  // Every cell the avatar has stood in on the way down, in order, so that it
  // can go back up the same way. A new cell is noted when `decide` sees the
  // avatar in it.
  const trail: Vec3[] = [];

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
   * edge of the cube the heading turns right first (the footprint is more
   * than one cell wide, so some heading always fits).
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
    const legal = legalActions(state);

    // 3. Standing on the next stair: dig down (the avatar moves down into it).
    if (stepped) {
      const below = { x: here.x, y: here.y, z: here.z + 1 };
      const dig = legal.find((action) => action.type === 'mine' && sameCell(action.target, below));
      if (dig !== undefined) {
        stepped = false;
      }
      return takeOrWait(state, dig, 'dig down');
    }

    const beside = cellAhead(state, here);
    // On the surface the way ahead must be free of trees.
    if (hasTree(state, beside)) {
      const cut = legal.find(
        (action) => action.type === 'cutTree' && sameCell(action.target, beside),
      );
      return takeOrWait(state, cut, 'cut the tree ahead');
    }
    // 1. The block beside the avatar.
    if (isSolid(state, beside)) {
      const mine = legal.find(
        (action) => action.type === 'mine' && sameCell(action.target, beside),
      );
      return takeOrWait(state, mine, 'mine the block beside the avatar');
    }
    // 2. Walk onto the next stair.
    const walk = legal.find((action) => action.type === 'move' && sameCell(action.to, beside));
    if (walk !== undefined) {
      stepped = true;
    }
    return takeOrWait(state, walk, 'walk onto the next stair');
  }

  function decideGoingUp(state: GameState): Decision {
    const here = state.avatar.pos;
    if (isSurface(state.size, here)) {
      const leave = legalActions(state).find((action) => action.type === 'leave');
      return takeOrWait(state, leave, 'leave from the surface');
    }
    // Back along the trail: the cell before this one. `trail` ends with the
    // avatar's own cell (see `decide`), and its first cell is on the surface.
    if (trail.length >= 2 && sameCell(trail[trail.length - 1] as Vec3, here)) {
      const previous = trail[trail.length - 2] as Vec3;
      const back = legalActions(state).find(
        (action) => action.type === 'move' && sameCell(action.to, previous),
      );
      if (back !== undefined) {
        trail.pop();
      }
      return takeOrWait(state, back, 'go back up the staircase');
    }
    throw new Error('staircase policy: lost its trail on the way up');
  }

  return {
    name: 'staircase',
    decide: (state: GameState): Decision => {
      if (!Number.isInteger(targetLayer) || targetLayer < 0 || targetLayer >= state.size.z) {
        throw new Error(
          `staircase target layer must be a whole number from 0 to ${state.size.z - 1}, but is ${targetLayer}`,
        );
      }
      const here = state.avatar.pos;
      const last = trail[trail.length - 1];
      if (goingDown && (last === undefined || !sameCell(last, here))) {
        trail.push({ ...here });
      }
      if (goingDown && here.z >= targetLayer) {
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
 * The first known coal block the pick can reach from the cell `stand`, or
 * `undefined` if there is none. The pick reaches face neighbours only
 * (issue #75):
 * - from the surface, the block underfoot (digging it moves the miner down
 *   into the hole the coal left);
 * - in a hole, the blocks north, east, south and west of the miner. The
 *   block underfoot is left out there: the policy goes no deeper than one
 *   block, so it can always step back up.
 */
function coalInReach(state: GameState, stand: Vec3): Vec3 | undefined {
  if (isSurface(state.size, stand)) {
    const underfoot = floorUnder(stand);
    return !isUnderTree(state, underfoot) && isKnownCoal(state, underfoot) ? underfoot : undefined;
  }
  for (const step of HEADINGS) {
    const target = { x: stand.x + step.x, y: stand.y + step.y, z: stand.z };
    if (isKnownCoal(state, target)) {
      return target;
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
 *    started with: go home (move up out of a hole if it is in one, and leave).
 * 2. It carries timber (from cutting trees): drop it, so coal always fits.
 *    It carries coal: craft fuel from it.
 * 3. Standing in a hole: mine coal in reach (north, east, south or west of
 *    it), and move back up when none is.
 * 4. On the surface:
 *    a. standing over known coal: dig it out from underfoot (issue #75),
 *       which leaves the miner in the hole;
 *    b. known coal under open ground can be walked to: take one step
 *       towards the nearest;
 *    c. a hole it has not been down shows coal at the bottom or beside it
 *       from inside: walk to it, onto the surface cell over it, and move
 *       down into it;
 *    d. no coal in sight (the forest hides much of the top layer; issue
 *       #70): dig a look-hole. Walk onto an open surface cell whose floor is
 *       cheap rock and whose hole would show cells not seen yet, and dig
 *       down into it. From there the lamp shows the sides and the floor of
 *       the hole, and step 3 takes any coal beside it. At most
 *       `LOOK_HOLES_MAX` look-holes;
 *    e. no look-hole left to dig: cut the nearest tree (at most
 *       `TREES_CUT_MAX`), which shows the ground under it and opens new
 *       ground for look-holes;
 *    f. otherwise give up and leave.
 *
 * It uses only what a player sees. It digs down only from the surface, into
 * the top layer, and goes no deeper than one block; that makes it a careful
 * player, not the best one. Its walks over the surface keep to cells with a
 * floor under them, a habit from when the miner could fall (issue #80 took
 * gravity away); it changes only the route, never what is legal.
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
  // The surface cell, as "x,y", the miner has just walked onto to move down
  // into the hole under it (step 4c); `null` when there is none.
  let enteringHole: string | null = null;

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
   * the miner must see at least `LOOK_HOLE_MIN_UNSEEN_CELLS` cells it has
   * not seen yet: the faces of the hole (its four sides and its floor).
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
    const faces = [...HEADINGS, { x: 0, y: 0, z: 1 }];
    for (const step of faces) {
      const cell = { x: floor.x + step.x, y: floor.y + step.y, z: floor.z + step.z };
      if (inFootprintOf(state, cell) && !isRevealed(state, cell)) {
        unseen += 1;
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
      const moveUp = legal.find(
        (action) => action.type === 'move' && sameCell(action.to, { ...here, z: here.z - 1 }),
      );
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
          : takeOrWait(state, moveUp, 'move up out of the hole');
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
          : takeOrWait(state, moveUp, 'move up out of the hole');
      }
      // 4c, second half: standing over the hole it chose, move down into it.
      if (enteringHole !== null && enteringHole === `${here.x},${here.y}`) {
        enteringHole = null;
        const down = legal.find(
          (action) => action.type === 'move' && sameCell(action.to, floorUnder(here)),
        );
        if (down !== undefined || state.ap >= SHIFT.apPerShift) {
          return takeOrWait(state, down, 'move down into the hole');
        }
        enteringHole = `${here.x},${here.y}`;
        return 'endShift';
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
        // 4d. Dig a look-hole at the nearest good spot: walk onto it and dig
        // down (the miner moves down into the hole).
        const toSpot =
          lookHolesDug < LOOK_HOLES_MAX && state.lampOil > 0
            ? routeOverSurface(state, (cell: Vec3): boolean => isLookHoleSpot(state, cell))
            : undefined;
        if (toSpot !== undefined && toSpot.firstStep !== undefined) {
          const nextCell = toSpot.firstStep;
          const walk = legal.find(
            (action) => action.type === 'move' && sameCell(action.to, nextCell),
          );
          return takeOrWait(state, walk, 'walk towards a look-hole');
        }
        if (toSpot !== undefined) {
          const floor = floorUnder(here);
          const dig = legal.find(
            (action) => action.type === 'mine' && sameCell(action.target, floor),
          );
          if (dig !== undefined) {
            lookHolesDug += 1;
            holesTried.add(`${here.x},${here.y}`);
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
            (action) => action.type === 'move' && sameCell(action.to, nextCell),
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
        // Beside the hole: walk onto the surface cell over it; the next call
        // moves down into it (4c, second half above). The hole is tried once.
        const hole = holeBeside(state, here);
        const stepOver = legal.find(
          (action) => action.type === 'move' && hole !== undefined && sameCell(action.to, hole),
        );
        if (hole !== undefined && stepOver !== undefined) {
          holesTried.add(`${hole.x},${hole.y}`);
          enteringHole = `${hole.x},${hole.y}`;
        }
        return takeOrWait(state, stepOver, 'walk over the hole');
      }
      // Walk one step along the route (to coal, or to a hole).
      const nextCell = route.firstStep;
      const walk = legal.find((action) => action.type === 'move' && sameCell(action.to, nextCell));
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
/** A look-hole must let the miner see at least this many cells it has not seen (of the 5 faces of its floor: four sides and below). */
const LOOK_HOLE_MIN_UNSEEN_CELLS = 4;

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
