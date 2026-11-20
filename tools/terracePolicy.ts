// The terracing policy: a scripted player that digs as a careful person
// would (issue #108, task T15).
//
// What it does differently from the `pit` policy (tools/policies.ts):
// - It digs in a CORNER of the map. The bedrock sides of the cube do not
//   count for the level rule (design doc 3.1), so a pit in a corner needs
//   about a third of the blocks of a pit in the middle (design doc 12).
// - It PLANS the pit before it digs: a cone of 1-level steps down to a target
//   depth, the steepest shape the level rule allows.
// - It digs the plan LAYER BY LAYER, so the floor of the pit is always flat
//   and every square of the wall is already at the depth it will keep.
// - It holds the wall with SUPPORTS instead of level benches. A support on a
//   square stops it slumping (design doc 6.1) and costs 1 timber, 1 stone and
//   2 AP; the benches that dirt needs would double the width of the pit. A
//   support is lost when its square is mined, which is why the wall squares
//   must be at their final depth before they are supported.
// - It takes every coal block it can see, wherever it is: 2 AP for 3 shifts
//   of fuel.
// - Optionally it founds a camp beside the pit and rests there when hurt, and
//   it places a pump when water stands in the pit and it has one.
//
// Like every policy it sees only what a player sees: the legal actions,
// `knownSquare`, the depths, and the HUD numbers.

import { BLOCKS, CAMPS, SHIFT } from '../src/data';
import {
  countItem,
  depthIn,
  depthMapOf,
  knownCell,
  knownSquare,
  legalActions,
  mineDiscountAt,
  oreArmedByMine,
  unstableAfterMine,
  unstableSquares,
} from '../src/engine';
import type { Action, DepthMap, GameState, Square } from '../src/engine';
import type { Decision, Policy } from './policies';

/** The terracing policy's own numbers: how this scripted player behaves, not rules of the game. */
export const TERRACE_POLICY = {
  /**
   * How deep the corner of the planned pit goes when no target is given.
   * The depth survey (docs/surveys/depth-survey.md) tries several targets;
   * this one is the deepest that most runs finish with today's numbers.
   */
  targetDepth: 6,
  /** With this much fuel or less, coal in the stockpile is crafted into fuel. */
  craftFuelAtOrBelow: 6,
  /** With this much fuel or less and no coal to fetch or craft, the policy closes the mine. */
  closeMineAtOrBelow: 1,
  /** With this much crew health or less, the crew rests at the camp (if there is one). */
  restAtOrBelow: 6,
  /**
   * A mine that would make more squares than this unstable at once is not
   * taken: each needs a support placed (1 AP) before its crack falls two
   * shifts later, and a shift has 5 AP, some of which go on crafting fuel.
   */
  mostNewCracksPerMine: 8,
};

/** Recipe ids from src/data/recipes.ts. */
const FUEL_RECIPE_ID = 'fuel';
const SUPPORT_RECIPE_ID = 'support';
const PUMP_RECIPE_ID = 'pump';
const SMELT_RECIPE_IDS = ['ironIngot', 'copperIngot'];

/** How the terracing policy is set up. Every field may be left out. */
export interface TerraceOptions {
  /** How deep the corner of the planned pit goes. Default: `TERRACE_POLICY.targetDepth`. */
  targetDepth?: number;
  /** Found a camp beside the pit with the starting kit, and rest there when hurt. Default: false. */
  useCamp?: boolean;
}

/** Steps between two squares (north, east, south, west; no diagonals). */
function stepsBetween(a: Square, b: Square): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** The first action of the list that passes the test, or `undefined`. */
function findAction(legal: Action[], test: (action: Action) => boolean): Action | undefined {
  return legal.find(test);
}

/**
 * The legal actions that name a square, looked up by type and square. A
 * decision asks "is there a legal mine on this square?" for many squares, and
 * the list of legal actions has over a thousand entries, so they are put in a
 * table once per decision. (`Map` is TypeScript's dict.)
 */
type ActionTable = Map<string, Action>;

function tableKey(type: string, x: number, y: number): string {
  return `${type} ${x},${y}`;
}

function tableOf(legal: Action[]): ActionTable {
  const table: ActionTable = new Map();
  for (const action of legal) {
    // `'x' in action`: only the actions that name a square have an x.
    if ('x' in action) {
      table.set(tableKey(action.type, action.x, action.y), action);
    }
  }
  return table;
}

/** The legal action of this type on this square, or `undefined`. */
function actionOn(table: ActionTable, type: string, square: Square): Action | undefined {
  return table.get(tableKey(type, square.x, square.y));
}

/**
 * The code of the top block of square (x, y) as the player sees it, or
 * `null` if it has not been seen (it is under a tree) or the square has no
 * block left. `knownCell` answers `null` for a cell that is not revealed, so
 * this never reads a hidden block. It is cheaper than `knownSquare`, which
 * also works out the square's tells and contents.
 */
function seenTopBlock(state: GameState, depths: DepthMap, x: number, y: number): number | null {
  const depth = depthIn(depths, x, y);
  if (depth >= state.size.z) {
    return null;
  }
  const cell = knownCell(state, { x, y, z: depth });
  return cell === null ? null : cell.block;
}

/** The legal craft of this recipe, or `undefined`. */
function craftOf(legal: Action[], recipeId: string): Action | undefined {
  return legal.find((action) => action.type === 'craft' && action.recipe === recipeId);
}

/**
 * A policy that digs a planned, supported pit in a corner of the map.
 *
 * THE PLAN. `corner` is one of the four corner squares. A square `k` steps
 * from it is to end at depth `targetDepth - k` (and squares further away than
 * `targetDepth` are left alone). That is the cone of 1-level steps.
 *
 * Each time it is asked, the first of these that applies:
 *  1. Fuel is low and there is coal in the stockpile: craft fuel.
 *  2. (With a camp.) The crew is hurt and a rest is legal: rest.
 *  3. A square is unstable (cracked, or about to crack). If it still has to
 *     go down under the plan and mining it is legal, mine it. Otherwise hold
 *     it: place a support, or craft one, or cut a tree for the timber.
 *  4. A coal block is in sight and mining it is legal and makes nothing
 *     unstable: mine it (the nearest to the corner first).
 *  5. Fuel is about to run out and rules 1 and 4 found nothing: close the mine.
 *  6. (With a camp.) No camp yet and a kit in hand: found one beside the pit.
 *     A camp whose cheaper mining no longer reaches any square of the plan is
 *     taken down, to stop its upkeep.
 *  7. Water stands on a square of the plan: place a pump there, or craft one
 *     at the camp, or smelt the ingots for one.
 *  8. Dig the plan: the shallowest square that still has to go down, and
 *     among those the nearest to the corner. A tree on such a square is cut.
 *     A mine is taken only if every square it would make unstable can be
 *     held: it is at its final depth, and the stockpile already holds a
 *     support for it. A mine that would arm
 *     unstable ore (design doc 6.6) waits until the ore is braced.
 *  9. Short of supports: craft one; with no timber, cut the nearest tree;
 *     with no stone, mine the nearest stone in sight.
 * 10. The plan is finished, or nothing at all can be done with a full
 *     shift's AP: close the mine. Otherwise end the shift.
 *
 * It uses no random numbers: the same state always gives the same decision.
 */
export function makeTerracePolicy(options: TerraceOptions = {}): Policy {
  const targetDepth = options.targetDepth ?? TERRACE_POLICY.targetDepth;
  const useCamp = options.useCamp ?? false;

  // The corner the pit goes down in. Chosen at the first decision and kept.
  let corner: Square | null = null;

  /** How deep the plan takes square (x, y). 0 for a square the plan leaves alone. */
  function plannedDepth(x: number, y: number): number {
    if (corner === null) {
      return 0;
    }
    return Math.max(0, targetDepth - stepsBetween(corner, { x, y }));
  }

  /**
   * Choose the corner: the one with the most coal in sight on the squares of
   * its plan, and among equals the one with the fewest trees to cut there.
   * The first of equally good corners (north-west, north-east, south-west,
   * south-east) is kept.
   */
  function chooseCorner(state: GameState): Square {
    const lastX = state.size.x - 1;
    const lastY = state.size.y - 1;
    const corners: Square[] = [
      { x: 0, y: 0 },
      { x: lastX, y: 0 },
      { x: 0, y: lastY },
      { x: lastX, y: lastY },
    ];
    let best = corners[0] as Square;
    let bestCoal = -1;
    let bestTrees = Infinity;
    for (const candidate of corners) {
      let coal = 0;
      let trees = 0;
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          if (stepsBetween(candidate, { x, y }) >= targetDepth) {
            continue;
          }
          const known = knownSquare(state, x, y);
          if (known.tree) {
            trees += 1;
          } else if (known.top !== null && known.top.block === BLOCKS.coalSeam.code) {
            coal += 1;
          }
        }
      }
      if (coal > bestCoal || (coal === bestCoal && trees < bestTrees)) {
        best = candidate;
        bestCoal = coal;
        bestTrees = trees;
      }
    }
    return best;
  }

  /** True if the square still has to go down under the plan. */
  function hasToGoDown(depths: DepthMap, x: number, y: number): boolean {
    return depthIn(depths, x, y) < plannedDepth(x, y);
  }

  /** The legal cut of the tree nearest the corner, or `undefined` if no cut is legal. */
  function nearestCut(legal: Action[], from: Square): Action | undefined {
    let best: Action | undefined;
    let bestSteps = Infinity;
    for (const action of legal) {
      if (action.type !== 'cutTree') {
        continue;
      }
      const steps = stepsBetween(from, action);
      if (steps < bestSteps) {
        best = action;
        bestSteps = steps;
      }
    }
    return best;
  }

  function decide(state: GameState): Decision {
    if (corner === null) {
      corner = chooseCorner(state);
    }
    const home = corner;
    const legal = legalActions(state);
    const table = tableOf(legal);
    const depths = depthMapOf(state);

    // 1. Keep the fuel up.
    if (state.fuel <= TERRACE_POLICY.craftFuelAtOrBelow && countItem(state, 'coal') > 0) {
      const craft = craftOf(legal, FUEL_RECIPE_ID);
      // Not legal only when no AP are left; the new shift's AP pay for it.
      return craft ?? 'endShift';
    }

    // 2. The crew is hurt: rest at the camp.
    if (state.crew.health <= TERRACE_POLICY.restAtOrBelow) {
      const rest = findAction(legal, (action) => action.type === 'rest');
      if (rest !== undefined) {
        return rest;
      }
    }

    // 3. Deal with unstable squares before anything falls.
    const unstable = unstableSquares(state);
    for (const square of unstable) {
      if (hasToGoDown(depths, square.x, square.y)) {
        const mine = actionOn(table, 'mine', square);
        if (mine !== undefined) {
          return mine;
        }
      }
    }
    for (const square of unstable) {
      const place = actionOn(table, 'placeSupport', square);
      if (place !== undefined) {
        return place;
      }
    }
    if (unstable.length > 0) {
      const craft = craftOf(legal, SUPPORT_RECIPE_ID);
      if (craft !== undefined) {
        return craft;
      }
      if (countItem(state, 'support') === 0 && countItem(state, 'timber') === 0) {
        const cut = nearestCut(legal, home);
        if (cut !== undefined) {
          return cut;
        }
      }
    }

    // 4. Coal in sight: take it, the nearest to the corner first.
    let bestCoal: Action | undefined;
    let bestCoalSteps = Infinity;
    for (const action of legal) {
      if (action.type !== 'mine') {
        continue;
      }
      if (seenTopBlock(state, depths, action.x, action.y) !== BLOCKS.coalSeam.code) {
        continue;
      }
      const steps = stepsBetween(home, action);
      if (steps >= bestCoalSteps) {
        continue;
      }
      if (unstableAfterMine(state, action.x, action.y, depths).length > 0) {
        continue;
      }
      if (oreArmedByMine(state, action.x, action.y).length > 0) {
        continue;
      }
      bestCoal = action;
      bestCoalSteps = steps;
    }
    if (bestCoal !== undefined) {
      return bestCoal;
    }

    // 5. About to run out, and nothing to burn: close the mine, alive.
    if (state.fuel <= TERRACE_POLICY.closeMineAtOrBelow) {
      const closeMine = findAction(legal, (action) => action.type === 'closeMine');
      if (closeMine !== undefined) {
        return closeMine;
      }
    }

    // The squares of the plan that still have to go down.
    const toDig: Square[] = [];
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        if (hasToGoDown(depths, x, y)) {
          toDig.push({ x, y });
        }
      }
    }

    // 6. The camp.
    if (useCamp) {
      if (state.camps.length === 0 && countItem(state, CAMPS.kitItem) > 0 && toDig.length > 0) {
        // The site nearest the corner none of whose 9 squares is in the plan
        // or on its rim (the rim squares hold the top of the wall).
        let bestSite: Action | undefined;
        let bestSteps = Infinity;
        for (const action of legal) {
          if (action.type !== 'foundCamp') {
            continue;
          }
          // The camp's nearest square is 2 steps nearer the corner than its centre.
          const nearestCampSquare = stepsBetween(home, action) - 2 * CAMPS.halfWidth;
          if (nearestCampSquare <= targetDepth) {
            continue;
          }
          const steps = stepsBetween(home, action);
          if (steps < bestSteps) {
            bestSite = action;
            bestSteps = steps;
          }
        }
        if (bestSite !== undefined) {
          return bestSite;
        }
      }
      if (state.camps.length > 0) {
        const stillUseful = toDig.some((square) => mineDiscountAt(state, square.x, square.y) > 0);
        if (!stillUseful) {
          const takeDown = findAction(legal, (action) => action.type === 'decommissionCamp');
          if (takeDown !== undefined) {
            return takeDown;
          }
        }
      }
    }

    // 7. Water in the pit: a pump, if there is one or one can be made.
    const wet = toDig.filter((square) => knownSquare(state, square.x, square.y).contents.water > 0);
    if (wet.length > 0) {
      for (const square of wet) {
        const place = actionOn(table, 'placePump', square);
        if (place !== undefined) {
          return place;
        }
      }
      if (countItem(state, 'pump') === 0) {
        const craftPump = craftOf(legal, PUMP_RECIPE_ID);
        if (craftPump !== undefined) {
          return craftPump;
        }
        for (const recipeId of SMELT_RECIPE_IDS) {
          const smelt = craftOf(legal, recipeId);
          if (smelt !== undefined) {
            return smelt;
          }
        }
      }
    }

    // 8. Dig the plan, the shallowest squares first (so the floor stays
    //    flat), and among equally deep ones the nearest to the corner.
    // `[...list]` copies the list before sorting it. The sort is stable.
    const ranked = [...toDig].sort((a, b) => {
      const depthA = depthIn(depths, a.x, a.y);
      const depthB = depthIn(depths, b.x, b.y);
      if (depthA !== depthB) {
        return depthA - depthB;
      }
      return stepsBetween(home, a) - stepsBetween(home, b);
    });
    let shortOfSupports = false;
    for (const square of ranked) {
      const cut = actionOn(table, 'cutTree', square);
      if (cut !== undefined) {
        return cut;
      }
      const mine = actionOn(table, 'mine', square);
      if (mine === undefined) {
        continue; // the level rule forbids it for now, or the AP left do not pay for it
      }
      // Unstable ore beside it: brace the ore first.
      const armed = oreArmedByMine(state, square.x, square.y);
      if (armed.length > 0) {
        for (const ore of armed) {
          const brace = actionOn(table, 'placeSupport', ore);
          if (brace !== undefined) {
            return brace;
          }
        }
        shortOfSupports = true;
        continue;
      }
      // Would the mine make squares unstable? Take it only if each of them
      // can be held: it is at its final depth, and there is a support for it.
      const made = unstableAfterMine(state, square.x, square.y, depths);
      if (made.length === 0) {
        return mine;
      }
      const allAtFinalDepth = made.every((other) => !hasToGoDown(depths, other.x, other.y));
      if (!allAtFinalDepth) {
        continue;
      }
      // The supports must be made already, and there must be time to place
      // them: a crack falls at the end of the shift after next, and placing
      // costs 1 AP each. Squares that are unstable already come first.
      if (unstable.length > 0 || made.length > TERRACE_POLICY.mostNewCracksPerMine) {
        continue;
      }
      if (countItem(state, 'support') >= made.length) {
        return mine;
      }
      shortOfSupports = true;
    }

    // 9. Short of supports: make one, or fetch the timber for one.
    if (shortOfSupports) {
      const craft = craftOf(legal, SUPPORT_RECIPE_ID);
      if (craft !== undefined) {
        return craft;
      }
      if (countItem(state, 'timber') === 0) {
        const cut = nearestCut(legal, home);
        if (cut !== undefined) {
          return cut;
        }
      }
      if (countItem(state, 'stone') === 0) {
        // No stone for a support: mine the nearest block in sight that
        // yields stone, where that makes nothing unstable.
        let bestStone: Action | undefined;
        let bestStoneSteps = Infinity;
        for (const action of legal) {
          if (action.type !== 'mine') {
            continue;
          }
          const top = seenTopBlock(state, depths, action.x, action.y);
          const yieldsStone = top === BLOCKS.stone.code || top === BLOCKS.hardRock.code;
          const steps = stepsBetween(home, action);
          if (!yieldsStone || steps >= bestStoneSteps) {
            continue;
          }
          if (unstableAfterMine(state, action.x, action.y, depths).length > 0) {
            continue;
          }
          bestStone = action;
          bestStoneSteps = steps;
        }
        if (bestStone !== undefined) {
          return bestStone;
        }
      }
    }

    // 10. The plan is finished, or nothing can be done even with a full
    //     shift's AP: close the mine. Otherwise wait for the next shift.
    if (toDig.length === 0 || state.ap >= SHIFT.apPerShift) {
      const closeMine = findAction(legal, (action) => action.type === 'closeMine');
      if (closeMine !== undefined) {
        return closeMine;
      }
    }
    return 'endShift';
  }

  let name = options.targetDepth === undefined ? 'terrace' : `terrace:${targetDepth}`;
  if (useCamp) {
    name = `terrace:${targetDepth}:camp`;
  }
  return { name, decide };
}
