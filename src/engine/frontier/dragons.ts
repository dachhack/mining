// Dragons (docs/plans/hazards.md, section 4; hazards PR 4).
//
// The owner: "Wandering dragons can eat your sheep and apples and set fire to
// things. They don't go away until you get a sword and drive them away."
//
// At End shift (`nightOfDragons`), after the fires and pumps, before rain:
// 1. each dragon takes a new heading, one of the 8 directions drawn from the
//    state's generator, and flies FRONTIER_DRAGON.steps squares along it in
//    a straight line, over anything (trees, pits, water, camps), bouncing off
//    the map's edge (owner, on the hazards build: "Dragon doesn't seem to
//    move": random single steps mostly went back and forth);
// 2. it eats one animal on or beside its square (the lowest id first); if
//    there is none and it is on a camp's ground, one animal from that camp's
//    pen; and every apple on the apple trees on or beside its square (they
//    come back as if picked: FRONTIER_SHIFT.appleRegrowShifts);
// 3. with a chance of FRONTIER_DRAGON.fireChance it sets fire to one thing
//    that can burn (fire.ts) on or beside its square, drawn from those not
//    burning;
// 4. then, from shift FRONTIER_DRAGON.fromShift, while fewer than
//    FRONTIER_DRAGON.most are on the map, a new dragon flies in at a square
//    of the map's edge with a chance of FRONTIER_DRAGON.chance. It does
//    nothing until the next night.
// In the day it keeps flying (owner: "Let's make the dragon fly every time
// you mine. Or every 3-7 mines. So it stays put for a bit."): each mining tap
// counts down its `restMines`; when it runs out the dragon flies
// FRONTIER_DRAGON.stepsPerMine squares along its heading, bouncing off the
// edge, and rests again for a count drawn from FRONTIER_DRAGON.restMines
// (`dragonsFlyOnMine`).
// "Beside" is the 8 squares round it. A tap on a dragon with a sword in the
// store drives it off the map (tap.ts); without one it does nothing.
//
// The numbers are in src/data/frontier.ts.

import { FRONTIER_DRAGON, FRONTIER_SHIFT } from '../../data/frontier';
import { nextFloat, nextInt } from '../rng';
import type { RngState } from '../rng';
import { campAt } from './camps';
import { isCombustible, withFires } from './fire';
import { APPLE_TREE } from './state';
import type { FrontierDragon, FrontierState } from './state';

/** The 8 directions a dragon can fly: the 4 sides and the 4 corners. */
const DIRECTIONS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;

/**
 * `dragon` after flying `steps` squares along its heading, bouncing off the
 * edge of a `width` x `height` map (the heading flips on the side it hits).
 */
export function flyDragon(
  dragon: FrontierDragon,
  steps: number,
  width: number,
  height: number,
): FrontierDragon {
  let { x, y, dx, dy } = dragon;
  for (let k = 0; k < steps; k += 1) {
    if (x + dx < 0 || x + dx >= width) dx = -dx;
    if (y + dy < 0 || y + dy >= height) dy = -dy;
    x += dx;
    y += dy;
  }
  return { ...dragon, x, y, dx, dy };
}

/** A new rest, in mining taps: a whole number in FRONTIER_DRAGON.restMines, drawn with `rng`. */
export function drawRest(rng: RngState): number {
  const [low, high] = FRONTIER_DRAGON.restMines;
  return low + nextInt(rng, high - low + 1);
}

/**
 * `state` after a mining tap: each dragon's rest counts down; one whose rest
 * runs out flies FRONTIER_DRAGON.stepsPerMine squares along its heading and
 * rests again for a new count (drawn on a copy of the state's generator,
 * kept in the new state).
 */
export function dragonsFlyOnMine(state: FrontierState): FrontierState {
  if (state.hazards.dragons.length === 0) return state;
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  const rng = { ...state.rng };
  const dragons = state.hazards.dragons.map((d) => {
    if (d.restMines > 1) return { ...d, restMines: d.restMines - 1 };
    const flown = flyDragon(d, FRONTIER_DRAGON.stepsPerMine, width, height);
    return { ...flown, restMines: drawRest(rng) };
  });
  return { ...state, rng, hazards: { ...state.hazards, dragons } };
}

/** The dragon on square (x, y), or `null`. */
export function dragonAt(state: FrontierState, x: number, y: number): FrontierDragon | null {
  return state.hazards.dragons.find((d) => d.x === x && d.y === y) ?? null;
}

/** `state` with dragon `id` driven off the map. */
export function driveOff(state: FrontierState, id: number): FrontierState {
  const dragons = state.hazards.dragons.filter((d) => d.id !== id);
  return { ...state, hazards: { ...state.hazards, dragons } };
}

/** What the dragons did in a night. */
export interface DragonNight {
  state: FrontierState;
  /** Animals eaten, roaming and penned. */
  animalsEaten: number;
  /** Apples eaten off the trees. */
  applesEaten: number;
  /** Squares the dragons set on fire. */
  fires: { x: number; y: number }[];
  /** True if a new dragon flew in. */
  came: boolean;
}

/** True if (x, y) is (cx, cy) or one of the 8 squares round it. */
function near(x: number, y: number, cx: number, cy: number): boolean {
  return Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1;
}

/** The night's dragons on `state`, rolled with `rng` (which it advances): see the top of this file. */
export function nightOfDragons(state: FrontierState, rng: RngState): DragonNight {
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  let next = state;
  let animalsEaten = 0;
  let applesEaten = 0;
  const fires: { x: number; y: number }[] = [];
  const moved: FrontierDragon[] = [];
  for (const dragon of state.hazards.dragons) {
    // 1. A new heading, and a straight flight along it, bouncing off the edge.
    const heading = DIRECTIONS[nextInt(rng, DIRECTIONS.length)] ?? [1, 0];
    const flown = flyDragon(
      { ...dragon, dx: heading[0], dy: heading[1] },
      FRONTIER_DRAGON.steps,
      width,
      height,
    );
    const { x, y } = flown;
    moved.push(flown);
    // 2. It eats: one animal, roaming or else penned; and apples.
    const prey = next.animals.filter((a) => near(a.x, a.y, x, y)).sort((a, b) => a.id - b.id)[0];
    if (prey !== undefined) {
      next = { ...next, animals: next.animals.filter((a) => a.id !== prey.id) };
      animalsEaten += 1;
    } else {
      const camp = campAt(next.camps, x, y);
      if (camp !== null && camp.penned > 0) {
        const penned = camp.penned - 1;
        // A pen of fewer than 2 cannot breed: its count stops (pens.ts).
        const breedIn = penned < 2 ? 0 : camp.breedIn;
        next = {
          ...next,
          camps: next.camps.map((c) => (c.id === camp.id ? { ...c, penned, breedIn } : c)),
        };
        animalsEaten += 1;
      }
    }
    const apples = [...next.apples];
    const regrowIn = [...next.regrowIn];
    let ate = false;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
        const i = xx + width * yy;
        if (next.features[i] === APPLE_TREE && (apples[i] ?? 0) > 0) {
          applesEaten += apples[i] ?? 0;
          apples[i] = 0;
          regrowIn[i] = FRONTIER_SHIFT.appleRegrowShifts;
          ate = true;
        }
      }
    }
    if (ate) next = { ...next, apples, regrowIn };
    // 3. It may set something on fire.
    if (nextFloat(rng) < FRONTIER_DRAGON.fireChance) {
      const can: { x: number; y: number }[] = [];
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
          if (next.hazards.fires[xx + width * yy] === true) continue;
          if (isCombustible(next, xx, yy)) can.push({ x: xx, y: yy });
        }
      }
      const lit = can[nextInt(rng, Math.max(1, can.length))];
      if (lit !== undefined && can.length > 0) {
        next = withFires(next, [lit]);
        fires.push(lit);
      }
    }
  }
  let dragons = moved;
  let nextDragonId = state.hazards.nextDragonId;
  let came = false;
  // 4. A new dragon may fly in at the edge.
  if (
    state.shift >= FRONTIER_DRAGON.fromShift &&
    dragons.length < FRONTIER_DRAGON.most &&
    nextFloat(rng) < FRONTIER_DRAGON.chance
  ) {
    const edge = 2 * width + 2 * (height - 2);
    const k = nextInt(rng, edge);
    // The edge squares in order: the top row, the bottom row, then the
    // left and right columns between them.
    let at: { x: number; y: number };
    if (k < width) at = { x: k, y: 0 };
    else if (k < 2 * width) at = { x: k - width, y: height - 1 };
    else {
      const j = k - 2 * width;
      at = { x: j % 2 === 0 ? 0 : width - 1, y: 1 + Math.floor(j / 2) };
    }
    // It comes in heading across the map, away from the edge it came in at.
    const dx = at.x === 0 ? 1 : at.x === width - 1 ? -1 : 0;
    const dy = at.y === 0 ? 1 : at.y === height - 1 ? -1 : 0;
    dragons = [
      ...dragons,
      { id: nextDragonId, x: at.x, y: at.y, dx, dy, restMines: drawRest(rng) },
    ];
    nextDragonId += 1;
    came = true;
  }
  return {
    state: { ...next, hazards: { ...next.hazards, dragons, nextDragonId } },
    animalsEaten,
    applesEaten,
    fires,
    came,
  };
}
