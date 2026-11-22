// Finding squares to tap in the Playwright tests.
//
// The tests play fixed seeds on the real build. Which square is dirt, where a
// tree stands and where a camp fits depend on the generated cube, and the
// cube changes whenever a generation number in src/data does. So the tests do
// not name squares by hand: each asks this file for squares that suit it,
// worked out from the same engine the build runs (`createRun` gives the same
// cube here as in the browser: the engine is deterministic).
//
// Every finder looks only at the part of the map that is on screen when a
// run starts, so that a tap needs no panning, and takes the first square
// that fits, row by row. A finder throws if nothing fits: pick another seed.
//
// This is test code, so it may read what a player cannot (the block under a
// top block), where a test needs to know what a mine will give.

import { BLOCKS } from '../../src/data';
import { openingSquare } from '../../src/app/map/tiles';
import {
  applyAction,
  blockDefAt,
  createRun,
  endShift,
  foundCampCheck,
  knownSquare,
  legalActions,
  stepsFromCamp,
  unstableAfterMine,
} from '../../src/engine';
import type { Action, GameState, Square } from '../../src/engine';

/** How many squares the map shows across when a run starts (the default zoom). */
const CELLS_ON_SCREEN = 14;

/** The squares on screen when a run starts: `left`..`right`, `top`..`bottom`, inclusive. */
export interface View {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A new run on `seed`, as the build starts it. */
export function startOf(seed: number): GameState {
  return createRun(seed, 'none', 'standard');
}

/**
 * The squares on screen when the run starts: the map opens centred on
 * `openingSquare` (issue #110), 7 squares to its left and above it, and is
 * kept inside the cube.
 */
export function openingView(state: GameState): View {
  const centre = openingSquare(state);
  const half = CELLS_ON_SCREEN / 2;
  const left = Math.max(0, Math.min(state.size.x - CELLS_ON_SCREEN, centre.x - half));
  const top = Math.max(0, Math.min(state.size.y - CELLS_ON_SCREEN, centre.y - half));
  return { left, right: left + CELLS_ON_SCREEN - 1, top, bottom: top + CELLS_ON_SCREEN - 1 };
}

/** Every square of the view, row by row. */
function squaresOf(view: View): Square[] {
  const squares: Square[] = [];
  for (let y = view.top; y <= view.bottom; y += 1) {
    for (let x = view.left; x <= view.right; x += 1) {
      squares.push({ x, y });
    }
  }
  return squares;
}

function inView(view: View, x: number, y: number): boolean {
  return x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
}

function hasTree(state: GameState, x: number, y: number): boolean {
  return knownSquare(state, x, y).tree;
}

/** True if square (x, y) is open ground whose top block is this block. */
function topIs(state: GameState, x: number, y: number, blockCode: number): boolean {
  const known = knownSquare(state, x, y);
  return !known.tree && known.top !== null && known.top.block === blockCode;
}

/** Take the legal action of this type on this square; throws if there is none. */
function take(state: GameState, type: Action['type'], square: Square): GameState {
  const action = legalActions(state).find(
    (legal) => legal.type === type && 'x' in legal && legal.x === square.x && legal.y === square.y,
  );
  if (action === undefined) {
    throw new Error(`No legal ${type} on x${square.x} y${square.y}`);
  }
  return applyAction(state, action).state;
}

/** A square as the map's data attributes write it: "x,y". */
export function key(square: Square): string {
  return `${square.x},${square.y}`;
}

// ---------------------------------------------------------------------------
// tapMap.spec.ts
// ---------------------------------------------------------------------------

export interface DirtRow {
  /** Five dirt squares side by side on open ground, west to east. */
  dirt: Square[];
  /** The stone square east of the last of them. */
  stone: Square;
}

/**
 * Five dirt squares in a row with a stone square after them, none on the
 * edge of the view (so the last dirt square has four neighbours on screen).
 */
export function findDirtRowThenStone(state: GameState, view: View): DirtRow {
  for (let y = view.top + 1; y <= view.bottom - 1; y += 1) {
    for (let x = view.left; x + 5 <= view.right; x += 1) {
      const dirt: Square[] = [];
      for (let i = 0; i < 5; i += 1) {
        if (topIs(state, x + i, y, BLOCKS.dirt.code)) {
          dirt.push({ x: x + i, y });
        }
      }
      if (dirt.length === 5 && topIs(state, x + 5, y, BLOCKS.stone.code)) {
        return { dirt, stone: { x: x + 5, y } };
      }
    }
  }
  throw new Error('No row of five dirt squares and a stone square is on screen');
}

/** A square with a tree on it. */
export function findTree(state: GameState, view: View): Square {
  const found = squaresOf(view).find((square) => hasTree(state, square.x, square.y));
  if (found === undefined) {
    throw new Error('No tree is on screen');
  }
  return found;
}

// ---------------------------------------------------------------------------
// camps.spec.ts and tools.spec.ts
// ---------------------------------------------------------------------------

export interface CampSpot {
  /** The centre of a clear, flat 3 x 3 patch: a camp can be founded here. */
  centre: Square;
  /** A stone square on open ground, one step from the patch. */
  stoneBeside: Square;
  /** An untouched square on open ground that is none of the above and not in the patch. */
  spare: Square;
  /** The name of the block under `stoneBeside`'s top block (hidden from the player). */
  underStone: string;
}

/**
 * A camp spot with coal to dig for. The top layer holds no coal (question
 * 140), so the coal is in layer 1 under `coal`. With the camp standing:
 * - shift 2: mine each square of `around` (`coal`'s four neighbours), then
 *   `coal`'s top: 5 mines at 1 AP each near the camp, the whole shift;
 * - shift 3: `coal` is now 1 level lower than all its neighbours, so its
 *   coal can be mined; then mine `stoneBeside`, craft sealant and seal it.
 *   `stoneBeside` is not next to `coal`, which ends 2 deep, so sealing it
 *   back to ground level keeps the level rule.
 * `spare` is none of these squares.
 */
export interface CampSpotWithCoal extends CampSpot {
  coal: Square;
  around: Square[];
  /**
   * True if mining the coal would leave squares unstable (the pit round it
   * is only 1 deep): the map then asks for a second tap before it mines.
   */
  coalRisky: boolean;
}

/** The squares of the 3 x 3 patch round `centre`. */
function patchOf(centre: Square): Square[] {
  const squares: Square[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      squares.push({ x: centre.x + dx, y: centre.y + dy });
    }
  }
  return squares;
}

/** The face neighbours of a square that are inside the cube. */
function neighboursOf(state: GameState, square: Square): Square[] {
  return [
    { x: square.x, y: square.y - 1 },
    { x: square.x + 1, y: square.y },
    { x: square.x, y: square.y + 1 },
    { x: square.x - 1, y: square.y },
  ].filter((n) => n.x >= 0 && n.y >= 0 && n.x < state.size.x && n.y < state.size.y);
}

function sameSquare(a: Square, b: Square): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Take the legal craft of this recipe; throws if there is none. */
function craft(state: GameState, recipe: string): GameState {
  const action = legalActions(state).find(
    (legal) => legal.type === 'craft' && 'recipe' in legal && legal.recipe === recipe,
  );
  if (action === undefined) {
    throw new Error(`No legal craft of ${recipe}`);
  }
  return applyAction(state, action).state;
}

/**
 * A square to dig for coal as `CampSpotWithCoal` describes, with
 * `stoneBeside` sealed at the end, played out with the engine on a copy of
 * the run; or `undefined` if there is none. `withCamp` is the run with the
 * camp founded.
 */
function findCoalDig(
  withCamp: GameState,
  view: View,
  patch: Square[],
  stoneBeside: Square,
): { coal: Square; around: Square[]; coalRisky: boolean } | undefined {
  for (const coal of squaresOf(view)) {
    if (blockDefAt(withCamp, { x: coal.x, y: coal.y, z: 1 }).name !== BLOCKS.coalSeam.name) {
      continue;
    }
    const around = neighboursOf(withCamp, coal);
    if (around.length !== 4) {
      continue; // On the edge of the cube: the dig would not take exactly one shift.
    }
    const clear = [coal, ...around].every(
      (square) =>
        inView(view, square.x, square.y) &&
        !hasTree(withCamp, square.x, square.y) &&
        !patch.some((p) => sameSquare(p, square)) &&
        !sameSquare(square, stoneBeside),
    );
    if (!clear) {
      continue;
    }
    let coalRisky: boolean;
    try {
      let state = endShift(withCamp).state;
      for (const square of [...around, coal]) {
        state = take(state, 'mine', square);
      }
      state = endShift(state).state;
      coalRisky = unstableAfterMine(state, coal.x, coal.y).length > 0;
      state = take(state, 'mine', coal);
      if ((state.stockpile['coal'] ?? 0) < 1) {
        continue;
      }
      state = take(state, 'mine', stoneBeside);
      state = craft(state, 'sealant');
      take(state, 'seal', stoneBeside);
    } catch {
      continue; // Some step was not legal (no AP left, the level rule, ...).
    }
    return { coal, around, coalRisky };
  }
  return undefined;
}

/** A place for a camp with stone beside it, all on screen. */
export function findCampSpot(state: GameState, view: View): CampSpot {
  const spot = findSpot(state, view, false);
  return {
    centre: spot.centre,
    stoneBeside: spot.stoneBeside,
    spare: spot.spare,
    underStone: spot.underStone,
  };
}

/**
 * A place for a camp with stone beside it and coal to dig for near it, all
 * on screen. The dig is checked by playing it out with the engine on a copy
 * of the run.
 */
export function findCampSpotWithCoal(state: GameState, view: View): CampSpotWithCoal {
  return findSpot(state, view, true);
}

/** The first camp spot that fits; with `wantCoal`, also a coal dig (else `coal` is unused). */
function findSpot(state: GameState, view: View, wantCoal: boolean): CampSpotWithCoal {
  const onScreen = squaresOf(view);
  for (const centre of onScreen) {
    const patch = patchOf(centre);
    if (!patch.every((square) => inView(view, square.x, square.y))) {
      continue;
    }
    if (!foundCampCheck(state, centre.x, centre.y).allowed) {
      continue;
    }
    const withCamp = take(state, 'foundCamp', centre);
    const camp = withCamp.camps[0];
    if (camp === undefined) {
      continue;
    }
    for (const stoneBeside of onScreen) {
      if (
        stepsFromCamp(camp, stoneBeside.x, stoneBeside.y) !== 1 ||
        !topIs(state, stoneBeside.x, stoneBeside.y, BLOCKS.stone.code)
      ) {
        continue;
      }
      const dig = wantCoal
        ? findCoalDig(withCamp, view, patch, stoneBeside)
        : { coal: stoneBeside, around: [], coalRisky: false };
      if (dig === undefined) {
        continue;
      }
      const dug = [stoneBeside, dig.coal, ...dig.around];
      const spare = onScreen.find(
        (square) =>
          topIs(state, square.x, square.y, BLOCKS.dirt.code) &&
          stepsFromCamp(camp, square.x, square.y) >= 1 &&
          !dug.some((d) => sameSquare(d, square)),
      );
      if (spare === undefined) {
        continue;
      }
      const underStone = blockDefAt(state, { x: stoneBeside.x, y: stoneBeside.y, z: 1 }).name;
      return {
        centre,
        stoneBeside,
        coal: dig.coal,
        around: dig.around,
        coalRisky: dig.coalRisky,
        spare,
        underStone,
      };
    }
  }
  throw new Error(
    wantCoal
      ? 'No camp site with stone beside it and coal to dig for near it is on screen'
      : 'No camp site with stone beside it is on screen',
  );
}

export interface TreePatch {
  /** The centre of a 3 x 3 patch that is flat and clear but for one tree. */
  centre: Square;
  /** The square the tree stands on. */
  tree: Square;
}

/** A patch a camp cannot be founded on because exactly one tree stands on it. */
export function findPatchWithOneTree(state: GameState, view: View): TreePatch {
  for (const centre of squaresOf(view)) {
    const patch = patchOf(centre);
    if (!patch.every((square) => inView(view, square.x, square.y))) {
      continue;
    }
    const trees = patch.filter((square) => hasTree(state, square.x, square.y));
    if (trees.length === 1) {
      return { centre, tree: trees[0] as Square };
    }
  }
  throw new Error('No patch with exactly one tree is on screen');
}

// ---------------------------------------------------------------------------
// slump.spec.ts
// ---------------------------------------------------------------------------

export interface RiskyPlus {
  /** The middle square of a plus of five dirt squares; stone lies under it. */
  middle: Square;
  /** The middle first, then the four squares beside it: the order to mine them in. */
  plus: Square[];
  /**
   * The squares that mining the middle a second level down makes unstable,
   * row by row, once the plus is 1 level down and a shift has ended.
   */
  unstable: Square[];
}

/**
 * A plus of five dirt squares with stone under the middle one, where digging
 * the middle a second level down makes at least two squares unstable. Worked
 * out by playing those mines in a copy of the run.
 */
export function findRiskyPlus(state: GameState, view: View): RiskyPlus {
  for (let y = view.top + 2; y <= view.bottom - 2; y += 1) {
    for (let x = view.left + 2; x <= view.right - 2; x += 1) {
      const middle = { x, y };
      const plus = [middle, { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }];
      if (!plus.every((square) => topIs(state, square.x, square.y, BLOCKS.dirt.code))) {
        continue;
      }
      if (blockDefAt(state, { x, y, z: 1 }).name !== BLOCKS.stone.name) {
        continue;
      }
      let dug = state;
      for (const square of plus) {
        dug = take(dug, 'mine', square);
      }
      dug = endShift(dug).state;
      const unstable = unstableAfterMine(dug, x, y).map((square) => ({ x: square.x, y: square.y }));
      if (unstable.length >= 2) {
        return { middle, plus, unstable };
      }
    }
  }
  throw new Error('No plus of dirt with stone under its middle is on screen');
}
