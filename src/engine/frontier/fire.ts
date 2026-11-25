// Fire (docs/plans/hazards.md, section 3; hazards PR 3).
//
// The owner: "This blows away blocks and starts fires on combustable
// squares. You need to put out each fire with a click."
//
// - What burns (`isCombustible`): grass, a tree, an apple tree, a stump or a
//   planted sapling, and a camp's ground.
// - A gas blast (gas.ts) sets fire to the combustible squares near it;
//   dragons set fires too (a later hazard).
// - A tap on a burning square puts its fire out, for 1 tap (tap.ts). Nothing
//   else happens to the square.
// - A fire left burning at End shift (`burnFires`) first spreads to each
//   combustible face neighbour that is not burning, then burns its own
//   square out: grass is gone and grows back as cut grass does
//   (FRONTIER_SHIFT.grassRegrowShifts, if grass grows beside it); a tree or
//   apple tree is gone and leaves a stump that grows back as a felled tree's
//   does (FRONTIER_SHIFT.treeRegrowShifts); a stump or sapling starts its
//   wait again (a sapling becomes a stump); a camp loses one upgrade
//   (`stripCamp`). Its fire then goes out. The fires it spread burn the next
//   night if nobody puts them out.
// - A fire on a square no camp lights (in the fog, or greyed) cannot be put
//   out, so it does not spread: it burns its square out and goes out
//   (question 195; the simulator showed unseen fires burning through whole
//   forests).
//
// The numbers are in src/data/frontier.ts.

import { FRONTIER_SHIFT } from '../../data/frontier';
import { campAt, sightAt } from './camps';
import { GRASS, NO_FEATURE, isTree } from './state';
import type { Feature, FrontierCamp, FrontierState } from './state';

/** The four face neighbours of a square, in a fixed order. */
const STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** True if something on square (x, y) can burn: a plant, a stump or sapling, or a camp's ground. */
export function isCombustible(state: FrontierState, x: number, y: number): boolean {
  const i = x + state.cube.size.x * y;
  if ((state.features[i] ?? NO_FEATURE) !== NO_FEATURE) return true;
  if ((state.stumps[i] ?? NO_FEATURE) !== NO_FEATURE) return true;
  return campAt(state.camps, x, y) !== null;
}

/** True if square (x, y) is burning. */
export function isBurning(state: FrontierState, x: number, y: number): boolean {
  return state.hazards.fires[x + state.cube.size.x * y] === true;
}

/** `state` with fires set on `squares` (those already burning stay so). */
export function withFires(
  state: FrontierState,
  squares: { x: number; y: number }[],
): FrontierState {
  if (squares.length === 0) return state;
  const fires = [...state.hazards.fires];
  for (const sq of squares) fires[sq.x + state.cube.size.x * sq.y] = true;
  return { ...state, hazards: { ...state.hazards, fires } };
}

/** `state` with the fire on (x, y) put out. */
export function putOut(state: FrontierState, x: number, y: number): FrontierState {
  const fires = [...state.hazards.fires];
  fires[x + state.cube.size.x * y] = false;
  return { ...state, hazards: { ...state.hazards, fires } };
}

/**
 * `camp` with its `count` best upgrades taken away, in this order: the
 * lantern, the pen (its animals are lost), the smelter, then camp levels, one
 * at a time, down to level 1. A deep camp keeps its level (it is never
 * upgraded): it loses only its lantern, pen and smelter. Also says how many
 * upgrades were taken and how many penned animals were lost.
 */
export function stripCamp(
  camp: FrontierCamp,
  count: number,
): { camp: FrontierCamp; taken: number; animalsLost: number } {
  let next = { ...camp };
  let taken = 0;
  let animalsLost = 0;
  while (taken < count) {
    if (next.lantern) {
      next = { ...next, lantern: false };
    } else if (next.pen) {
      animalsLost += next.penned;
      next = { ...next, pen: false, penned: 0, breedIn: 0 };
    } else if (next.smelter) {
      next = { ...next, smelter: false };
    } else if (!next.deep && next.level > 1) {
      next = { ...next, level: next.level - 1 };
    } else {
      break; // nothing left to take: back to basic
    }
    taken += 1;
  }
  return { camp: next, taken, animalsLost };
}

/** What the fires did in a night. */
export interface Burning {
  state: FrontierState;
  /** Squares that burned out. */
  burned: number;
  /** New fires the old ones spread to. */
  spread: number;
  /** Upgrades the camps lost to fire. */
  campUpgradesLost: number;
}

/**
 * The night's fires (see the top of this file): each fire burning now
 * spreads to its combustible face neighbours that are not burning, then
 * burns out its own square. Row by row, so the result does not depend on the
 * order fires were set.
 */
export function burnFires(state: FrontierState): Burning {
  const fires = state.hazards.fires;
  if (!fires.includes(true)) {
    return { state, burned: 0, spread: 0, campUpgradesLost: 0 };
  }
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  const burningNow: number[] = [];
  fires.forEach((f, i) => {
    if (f) burningNow.push(i);
  });
  // Spread first, from the fires burning now, to what can burn now.
  const next = new Array<boolean>(fires.length).fill(false);
  let spread = 0;
  for (const i of burningNow) {
    const x = i % width;
    const y = Math.floor(i / width);
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = nx + width * ny;
      if (fires[j] === true || next[j]) continue;
      // A fire the player cannot see or reach does not spread.
      if (sightAt(state, x, y) !== 'shown') continue;
      if (!isCombustible(state, nx, ny)) continue;
      next[j] = true;
      spread += 1;
    }
  }
  // Then each old fire burns its square out.
  const features: Feature[] = [...state.features];
  const apples = [...state.apples];
  const stumps: Feature[] = [...state.stumps];
  const regrowIn = [...state.regrowIn];
  const planted = [...state.planted];
  const grassIn = [...state.grassIn];
  let camps = state.camps;
  let campUpgradesLost = 0;
  const campsHit = new Set<number>();
  for (const i of burningNow) {
    const feature = features[i] ?? NO_FEATURE;
    if (feature === GRASS) {
      grassIn[i] = FRONTIER_SHIFT.grassRegrowShifts; // grows back as cut grass does
    } else if (isTree(feature)) {
      stumps[i] = feature; // a stump, as a felled tree leaves
      regrowIn[i] = FRONTIER_SHIFT.treeRegrowShifts;
    } else if ((stumps[i] ?? NO_FEATURE) !== NO_FEATURE) {
      regrowIn[i] = FRONTIER_SHIFT.treeRegrowShifts; // the stump's wait starts again
    }
    features[i] = NO_FEATURE;
    apples[i] = 0;
    planted[i] = false;
    const camp = campAt(camps, i % width, Math.floor(i / width));
    // A camp loses one upgrade a night, however many of its squares burn.
    if (camp !== null && !campsHit.has(camp.id)) {
      campsHit.add(camp.id);
      const stripped = stripCamp(camp, 1);
      campUpgradesLost += stripped.taken;
      camps = camps.map((c) => (c.id === camp.id ? stripped.camp : c));
    }
  }
  return {
    state: {
      ...state,
      features,
      apples,
      stumps,
      regrowIn,
      planted,
      grassIn,
      camps,
      hazards: { ...state.hazards, fires: next },
    },
    burned: burningNow.length,
    spread,
    campUpgradesLost,
  };
}
