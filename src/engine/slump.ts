// Which squares are unstable (design doc v0.2 section 6.1; owner question 81;
// issue #94).
//
// "Pit walls slump": a square is unstable when its top block stands at the top
// of a slope that is too tall for its material, or beside a step that is too
// steep for any material. An unstable square cracks, counts down, and then
// its top block slides to the foot of its slide path (cube/slumps.ts).
//
// This file only answers questions; it changes nothing. Everything it reads
// is something the player sees: every square's depth, the trees, the
// supports, and the top block of a square with no tree on it. It never reads
// a block below a top, or the block a tree hides. So the player can always
// see a slump coming, and the warnings built on these functions cannot leak
// anything hidden.

import { BLOCKS, CAMP_TOOLS, HAZARDS, STRUCTURES } from '../data';
import type { BlockId } from '../data';
import {
  depthIn,
  depthMapOf,
  fallIn,
  footIn,
  lowestNeighbourIn,
  setDepthIn,
  structureOnSquare,
} from './heightmap';
import type { DepthMap, Square } from './heightmap';
import { blockDefAt } from './state';
import type { GameState } from './state';
import { hasTree, surfaceCellAbove } from './surface/state';

/**
 * Why a square is unstable:
 * - 'steep': it is `HAZARDS.slump.steepStep` (2) or more levels higher than a
 *   face neighbour, whatever its material. Only a hazard can make such a step;
 * - 'tall': its fall is more than the slump limit of its top block.
 * A square that is both is reported as 'steep'.
 */
export type SlumpReason = 'steep' | 'tall';

/** What holds a square so that it never slumps: a tree's roots, or a support. */
export type SlumpHold = 'tree' | 'support';

/** The answer of `slumpCheck`. */
export interface SlumpCheck {
  /** True if the square is unstable: it cracks, and its crack counts down. */
  unstable: boolean;
  /** Why it is unstable; `null` when it is not. */
  reason: SlumpReason | null;
  /**
   * What holds the square, if anything does. A held square is never unstable,
   * and whether it would be without the hold is not worked out (under a tree
   * that would need the block the tree hides).
   */
  heldBy: SlumpHold | null;
  /** The foot of the square's slide path: where its top block would come to rest. */
  foot: Square;
  /** How many levels deeper the foot is than the square. */
  fall: number;
  /**
   * The slump limit of the square's top block. `null` if no block was looked
   * at: under a tree, or on a square with no block left.
   */
  limit: number | null;
}

/**
 * Is square (x, y) unstable, on the depth map `map`? (design doc 6.1)
 *
 * `map` is normally `depthMapOf(state)`. It may differ from the cube in the
 * depth of OTHER squares, to ask "what if that square were deeper?"; the top
 * block, the tree and the support of (x, y) itself are read from `state`, so
 * the depth of (x, y) must be the true one.
 *
 * Never unstable: a square with a tree (its roots hold it), a square with a
 * support, and a square with no block left (bedrock).
 *
 * Throws if (x, y) is not a square. Changes nothing.
 */
export function stabilityIn(state: GameState, map: DepthMap, x: number, y: number): SlumpCheck {
  const depth = depthIn(map, x, y);
  // How far down the deepest neighbour is. Most squares of a map have no
  // deeper neighbour at all; they are their own foot, and the walk down the
  // slide path is skipped for them.
  const lowest = lowestNeighbourIn(map, x, y);
  const drop = lowest === null ? 0 : depthIn(map, lowest.x, lowest.y) - depth;
  const foot = drop > 0 ? footIn(map, x, y) : { x, y };
  const fall = depthIn(map, foot.x, foot.y) - depth;
  const stable: SlumpCheck = {
    unstable: false,
    reason: null,
    heldBy: null,
    foot,
    fall,
    limit: null,
  };

  // The tree is asked about first, so that the answer for a square under a
  // tree never depends on the block the tree hides.
  if (hasTree(state, surfaceCellAbove({ x, y, z: 0 }))) {
    return { ...stable, heldBy: 'tree' }; // `{ ...a, b }`: a copy of `a` with `b` changed
  }
  if (depth >= state.size.z) {
    return stable; // no block left: the bedrock floor
  }
  if (structureOnSquare(state, x, y) === STRUCTURES.support.code) {
    return { ...stable, heldBy: 'support' };
  }

  const limit = blockDefAt(state, { x, y, z: depth }).slumpLimit;
  if (limit === null) {
    return stable; // bedrock inside the cube: it never slumps
  }

  // Steep: the deepest neighbour is 2 or more levels down.
  if (drop >= HAZARDS.slump.steepStep) {
    return { ...stable, unstable: true, reason: 'steep', limit };
  }
  // Tall: the whole slope below the square falls further than its material holds.
  if (fall > limit) {
    return { ...stable, unstable: true, reason: 'tall', limit };
  }
  return { ...stable, limit };
}

/** `stabilityIn` for the cube as it is now. Throws if (x, y) is not a square. */
export function slumpCheck(state: GameState, x: number, y: number): SlumpCheck {
  return stabilityIn(state, depthMapOf(state), x, y);
}

/** An unstable square, with why and where its top block would go. */
export interface UnstableSquare {
  x: number;
  y: number;
  reason: SlumpReason;
  foot: Square;
  fall: number;
}

/** Every unstable square of the depth map `map`, row by row (y, then x). */
function unstableSquaresIn(state: GameState, map: DepthMap): UnstableSquare[] {
  const found: UnstableSquare[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const check = stabilityIn(state, map, x, y);
      if (check.unstable && check.reason !== null) {
        found.push({ x, y, reason: check.reason, foot: check.foot, fall: check.fall });
      }
    }
  }
  return found;
}

/** Every square that is unstable now, row by row (y, then x). */
export function unstableSquares(state: GameState): UnstableSquare[] {
  return unstableSquaresIn(state, depthMapOf(state));
}

/**
 * The squares that mining square (x, y) would make unstable (design doc 11:
 * "before a mine, the screen marks the squares it would make unstable"): the
 * squares that are stable now and would be unstable with (x, y) one level
 * deeper, row by row. Empty for a square with no block left.
 *
 * The mined square itself is never in the list, and it never needs to be: a
 * mine cannot make its own square unstable. The level rule allows the mine
 * only when no neighbour is higher, so afterwards the square can stand at the
 * top of a fall of 2 only if a neighbour was already 2 below it, and then it
 * was steep, and unstable, before the mine. Whether such a square is STILL
 * unstable afterwards depends on its new top block, which the player has not
 * seen yet, so it is not said here.
 *
 * Whether the mine is allowed is not looked at: ask `mineCheck` for that.
 * Throws if (x, y) is not a square. Changes nothing.
 *
 * `depths` may be given by a caller that asks about many squares of the same
 * state (a simulator policy): `depthMapOf(state)`, worked out once. It is
 * handed back unchanged.
 *
 * ONLY SQUARES NEAR THE MINE ARE LOOKED AT, because no other square can
 * change. Say the mined square is at depth d. A square's answer depends on
 * the squares beside it and on its slide path. The mine changes the path of a
 * square q only if that path comes to the mined square or to a square beside
 * it that would now step into it; such a square is at depth d or less. Every
 * step of a path goes at least 1 level down and depths start at 0, so the
 * path has taken at most d steps by then. So q is within d + 1 steps of the
 * mined square. (A test checks this against looking at every square.)
 */
export function unstableAfterMine(
  state: GameState,
  x: number,
  y: number,
  depths?: DepthMap,
): UnstableSquare[] {
  const map = depths ?? depthMapOf(state);
  const depth = depthIn(map, x, y);
  if (depth >= state.size.z) {
    return [];
  }
  const reach = depth + 1;

  // The squares within `reach` steps, row by row (y, then x).
  const near: Square[] = [];
  for (let ny = Math.max(0, y - reach); ny <= Math.min(map.height - 1, y + reach); ny += 1) {
    for (let nx = Math.max(0, x - reach); nx <= Math.min(map.width - 1, x + reach); nx += 1) {
      const steps = Math.abs(nx - x) + Math.abs(ny - y);
      if (steps > 0 && steps <= reach) {
        near.push({ x: nx, y: ny }); // `steps > 0` leaves out the mined square: see above
      }
    }
  }

  // Which of them are stable now?
  const stableNow = near.filter((square) => !stabilityIn(state, map, square.x, square.y).unstable);

  // And which of those would be unstable with (x, y) one level deeper? The
  // table is changed for the question and put back afterwards (`finally`
  // runs even if something throws), so the caller's table is never left
  // changed.
  const made: UnstableSquare[] = [];
  setDepthIn(map, x, y, depth + 1);
  try {
    for (const square of stableNow) {
      const check = stabilityIn(state, map, square.x, square.y);
      if (check.unstable && check.reason !== null) {
        made.push({
          x: square.x,
          y: square.y,
          reason: check.reason,
          foot: check.foot,
          fall: check.fall,
        });
      }
    }
  } finally {
    setDepthIn(map, x, y, depth);
  }
  return made;
}

/**
 * The squares that sealing square (x, y) would make unstable (design doc 6.1
 * and 7.2; issue #107): the squares that are stable now and would be unstable
 * with (x, y) one level higher and sealed rock on top of it. Row by row.
 *
 * The sealed square itself is the usual one: sealant raises it by 1, so its
 * fall grows by 1, and at the top of a run of steps that can be more than
 * sealed rock holds. It is never "steep": a square with a deeper neighbour
 * cannot be sealed. Raising a square can also turn another square's slide
 * path towards a deeper foot, so every other square is asked too.
 *
 * For a square that cannot be sealed (ground level, or no such square) the
 * list is empty. Like `unstableAfterMine`, it reads only what the player
 * sees. Does not change `state`.
 */
export function unstableAfterSeal(state: GameState, x: number, y: number): UnstableSquare[] {
  const before = depthMapOf(state);
  const depth = depthIn(before, x, y);
  if (depth <= 0) {
    return [];
  }
  const after = depthMapOf(state);
  setDepthIn(after, x, y, depth - 1);

  const made: UnstableSquare[] = [];
  for (let sy = 0; sy < state.size.y; sy += 1) {
    for (let sx = 0; sx < state.size.x; sx += 1) {
      if (sx === x && sy === y) {
        // The sealed square: its new top is sealed rock, which `state` does
        // not hold yet, so its limit is read from the data. Sealant clears
        // any structure check: a square that holds one cannot be sealed.
        // `as BlockId`: `validateData` checks that the id names a block.
        const limit = BLOCKS[CAMP_TOOLS.sealedBlock as BlockId].slumpLimit;
        const fall = fallIn(after, x, y);
        if (limit !== null && fall > limit) {
          made.push({ x, y, reason: 'tall', foot: footIn(after, x, y), fall });
        }
        continue;
      }
      if (stabilityIn(state, before, sx, sy).unstable) {
        continue; // unstable already: the seal does not make it so
      }
      const check = stabilityIn(state, after, sx, sy);
      if (check.unstable && check.reason !== null) {
        made.push({ x: sx, y: sy, reason: check.reason, foot: check.foot, fall: check.fall });
      }
    }
  }
  return made;
}
