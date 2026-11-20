// Water and lava on squares (design doc v0.2 sections 4.2, 5.2, 6.2, 6.3 and
// 6.4; issue #99, task T10; decision note 0033). One group of tests for each
// rule, each on a small hand-built pit.
//
// A pit is drawn as a grid of depths, one digit per square, row y = 0 first:
//
//   pit(['111', '121', '111'])   a 3 x 3 pit 1 level deep, 2 in the middle

import { describe, expect, it } from 'vitest';
import { BLOCKS, CAMPS, CREW, HAZARDS, STRUCTURES } from '../../src/data';
import {
  depthAt,
  endShift,
  hashState,
  knownSquare,
  legalActions,
  mineCheck,
  previewCubePhase,
} from '../../src/engine';
import type { GameEvent, GameState, Square } from '../../src/engine';
import { contentsOn } from '../../src/engine/breach';
import { isLavaStep, stepFluids } from '../../src/engine/cube/fluids';
import { newCubePhase } from '../../src/engine/cube/phase';
import type { CubePhase } from '../../src/engine/cube/phase';
import { markWorked } from '../../src/engine/crew';
import { createRng, nextInt } from '../../src/engine/rng';
import { isLavaSourceOn, lavaOn, setLavaOn, setWaterOn, waterOn } from '../../src/engine/standing';
import {
  blockAt,
  crackTimerAt,
  setBlock,
  setCrackTimer,
  setLava,
  setStructure,
  structureAt,
  setWater,
  waterAt,
} from '../../src/engine/state';
import { act, buildState, depthText, terrainLayers } from './helpers';
import type { BuildStateOptions } from './helpers';

/** What stone costs to mine. `?? 0`: the data gives every minable block a cost. */
const STONE_AP = BLOCKS.stone.mineCost ?? 0;

/** A shift in which lava flows, and one in which it does not. */
const LAVA_SHIFT = 2;
const NO_LAVA_SHIFT = 3;

/**
 * Build a pit from a grid of depths (one digit per square): stone unless
 * `materials` says otherwise (see `terrainLayers` in helpers.ts). The cube is
 * two layers deeper than its deepest square, so no square is at the bottom.
 */
function pit(
  depths: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
  materials?: string[],
): GameState {
  return buildState({
    layers: terrainLayers(depths, materials),
    shift: NO_LAVA_SHIFT,
    ...options,
  });
}

/** The water on every square, as rows of digits like the depths of `pit`. */
function waterMap(state: GameState): string[] {
  const rows: string[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    let row = '';
    for (let x = 0; x < state.size.x; x += 1) {
      row += String(waterOn(state, x, y));
    }
    rows.push(row);
  }
  return rows;
}

/** The same for lava. */
function lavaMap(state: GameState): string[] {
  const rows: string[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    let row = '';
    for (let x = 0; x < state.size.x; x += 1) {
      row += String(lavaOn(state, x, y));
    }
    rows.push(row);
  }
  return rows;
}

/** Run step (b) on `state` (in place) and return its events and notes. */
function runStep(state: GameState): { events: GameEvent[]; phase: CubePhase } {
  const events: GameEvent[] = [];
  const phase = newCubePhase();
  stepFluids(state, events, phase);
  return { events, phase };
}

/** The moves of one fluid in `events`, as "x,y>x,y" strings in order. */
function moves(events: GameEvent[], fluid: 'water' | 'lava'): string[] {
  const out: string[] = [];
  for (const event of events) {
    if (event.type === 'fluidMoved' && event.fluid === fluid) {
      out.push(`${event.from.x},${event.from.y}>${event.to.x},${event.to.y}`);
    }
  }
  return out;
}

/** All the units in a list of digit rows, added up. */
function total(rows: string[]): number {
  let sum = 0;
  for (const row of rows) {
    for (const char of row) {
      sum += Number(char);
    }
  }
  return sum;
}

describe('what stands on a square (standing.ts)', () => {
  it('is written in the cell directly above the top block, and read back', () => {
    const state = pit(['3']);
    setWaterOn(state, 0, 0, 2);
    expect(waterOn(state, 0, 0)).toBe(2);
    expect(waterAt(state, { x: 0, y: 0, z: 2 })).toBe(2);
    setLavaOn(state, 0, 0, 1, true);
    expect(lavaOn(state, 0, 0)).toBe(1);
    expect(isLavaSourceOn(state, 0, 0)).toBe(true);
    expect(knownSquare(state, 0, 0).contents).toEqual({
      water: 2,
      lava: 1,
      lavaSource: true,
      gas: 0,
    });
  });

  it('gathers water that was spread over several cells into one', () => {
    const state = pit(['3'], {
      water: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ],
    });
    expect(waterOn(state, 0, 0)).toBe(2);
    setWaterOn(state, 0, 0, 2);
    expect(waterAt(state, { x: 0, y: 0, z: 0 })).toBe(0);
    expect(waterAt(state, { x: 0, y: 0, z: 1 })).toBe(0);
    expect(waterAt(state, { x: 0, y: 0, z: 2 })).toBe(2);
  });

  it('a square with no lava is never a source', () => {
    const state = pit(['2']);
    setLavaOn(state, 0, 0, 3, true);
    setLavaOn(state, 0, 0, 0, true);
    expect(isLavaSourceOn(state, 0, 0)).toBe(false);
  });

  it('nothing can be put on a square at ground level', () => {
    const state = pit(['01']);
    expect(() => {
      setWaterOn(state, 0, 0, 1);
    }).toThrow(/ground level/);
    expect(() => {
      setLavaOn(state, 0, 0, 1, false);
    }).toThrow(/ground level/);
    // Setting none is fine: there is none.
    setWaterOn(state, 0, 0, 0);
    expect(waterOn(state, 0, 0)).toBe(0);
  });
});

describe('water flows downhill, one square a shift (design doc 6.3)', () => {
  it('a dry pit: the step does nothing', () => {
    const state = pit(['111', '121', '111']);
    const before = hashState(state);
    expect(runStep(state).events).toEqual([]);
    expect(hashState(state)).toBe(before);
  });

  it('one unit on a flat floor does not move', () => {
    const state = pit(['222', '222', '222']);
    setWaterOn(state, 1, 1, 1);
    const { events } = runStep(state);
    expect(events).toEqual([]);
    expect(waterMap(state)).toEqual(['000', '010', '000']);
  });

  it('a unit moves onto a square one level lower', () => {
    // The left square is 1 deep with 1 unit: its water level is 0. The right
    // square is 2 deep and dry: level 2, which is 2 lower.
    const state = pit(['12']);
    setWaterOn(state, 0, 0, 1);
    const { events } = runStep(state);
    expect(events).toEqual([
      {
        type: 'fluidMoved',
        fluid: 'water',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 1, y: 0, z: 1 },
      },
    ]);
    expect(waterMap(state)).toEqual(['01']);
  });

  it('water never flows uphill, or onto a square at the same water level', () => {
    const state = pit(['212']);
    setWaterOn(state, 0, 0, 1); // level 1, the same as the dry middle square
    setWaterOn(state, 2, 0, 1);
    expect(runStep(state).events).toEqual([]);
    expect(waterMap(state)).toEqual(['101']);
  });

  it('a unit moves at most one square in a cube phase', () => {
    // A staircase going down to the east.
    const state = pit(['1234']);
    setWaterOn(state, 0, 0, 1);
    expect(moves(runStep(state).events, 'water')).toEqual(['0,0>1,0']);
    expect(waterMap(state)).toEqual(['0100']);
    expect(moves(runStep(state).events, 'water')).toEqual(['1,0>2,0']);
    expect(moves(runStep(state).events, 'water')).toEqual(['2,0>3,0']);
    // At the foot it stays.
    expect(runStep(state).events).toEqual([]);
    expect(waterMap(state)).toEqual(['0001']);
  });

  it('a unit that has just arrived is not passed on in the same phase', () => {
    // Squares are visited from x = 0. The unit moves 0 -> 1; when square 1 is
    // visited next, it may not give that unit to square 2.
    const state = pit(['123']);
    setWaterOn(state, 0, 0, 1);
    runStep(state);
    expect(waterMap(state)).toEqual(['010']);
  });

  it('goes to the lowest neighbour; equals are taken north, east, south, west', () => {
    // The middle holds 1 unit, one level above four equal neighbours.
    const flat = pit(['222', '212', '222']);
    setWaterOn(flat, 1, 1, 1);
    expect(moves(runStep(flat).events, 'water')).toEqual(['1,1>1,0']); // north

    // With the south neighbour deeper than the others, it goes south.
    const south = pit(['222', '212', '232']);
    setWaterOn(south, 1, 1, 1);
    expect(moves(runStep(south).events, 'water')).toEqual(['1,1>1,2']);
  });

  it('a tall column of water spreads to the sides, lowest first, until level', () => {
    const state = pit(['44444', '44444', '44444', '44444', '44444']);
    setWaterOn(state, 2, 2, 4);
    const { events } = runStep(state);
    // Level 0 in the middle, 4 around it. After a unit each to the north,
    // east and south the middle holds 1 (level 3) and the west is at 4: a
    // drop of 1, so the last unit stays.
    expect(moves(events, 'water')).toEqual(['2,2>2,1', '2,2>3,2', '2,2>2,3']);
    expect(waterMap(state)).toEqual(['00000', '00100', '00110', '00100', '00000']);
    // One unit on a flat floor stays: the pit is level to within 1.
    expect(runStep(state).events).toEqual([]);
  });

  it('a square gives a neighbour a second unit while the drop is still 2 or more', () => {
    // 4 units on a square 4 deep, beside one square 4 deep; a wall elsewhere.
    const state = pit(['44']);
    setWaterOn(state, 0, 0, 4);
    runStep(state);
    // Levels 0 and 4 -> 1 and 3 -> 2 and 2.
    expect(waterMap(state)).toEqual(['22']);
  });

  it('water collects in a sump dug lower than the working area', () => {
    const state = pit(['2223']);
    setWaterOn(state, 0, 0, 1);
    setWaterOn(state, 2, 0, 1);
    for (let n = 0; n < 4; n += 1) {
      runStep(state);
    }
    // The unit beside the sump ran into it; the far one stays on the flat.
    expect(waterMap(state)).toEqual(['1001']);
  });

  it('the cube walls are not squares: nothing flows off the map', () => {
    const state = pit(['3']);
    setWaterOn(state, 0, 0, 2);
    expect(runStep(state).events).toEqual([]);
    expect(waterOn(state, 0, 0)).toBe(2);
  });

  it('the order is fixed: the same pit always flows the same way', () => {
    const build = (): GameState => {
      const state = pit(['3333', '3233', '3334', '3333']);
      setWaterOn(state, 0, 0, 3);
      setWaterOn(state, 3, 3, 2);
      setWaterOn(state, 1, 2, 3);
      return state;
    };
    const first = build();
    const second = build();
    expect(runStep(first).events).toEqual(runStep(second).events);
    expect(hashState(first)).toBe(hashState(second));
  });

  it('the flowing stops: after enough shifts nothing moves', () => {
    const state = pit(['33333', '34543', '35653', '34543', '33333']);
    setWaterOn(state, 0, 0, 3);
    setWaterOn(state, 4, 4, 3);
    setWaterOn(state, 4, 0, 3);
    let quiet = false;
    for (let n = 0; n < 50 && !quiet; n += 1) {
      quiet = runStep(state).events.length === 0;
    }
    expect(quiet).toBe(true);
    expect(total(waterMap(state))).toBe(9);
    // Level to within 1: no square's water level is 2 or more above a neighbour's.
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const here = depthAt(state, x, y) - waterOn(state, x, y);
        const east = depthAt(state, x + 1, y) - waterOn(state, x + 1, y);
        if (waterOn(state, x, y) > 0) expect(east - here).toBeLessThan(HAZARDS.water.flowMinDrop);
        if (waterOn(state, x + 1, y) > 0)
          expect(here - east).toBeLessThan(HAZARDS.water.flowMinDrop);
      }
    }
  });
});

describe('nothing stands above ground level (design doc 3.1 and 6.3)', () => {
  it('water over the brim of its square drains away on the surface', () => {
    // A breach can put more on a square than it holds: 5 units, 2 levels.
    const state = pit(['020']);
    setWaterOn(state, 1, 0, 5);
    const { events } = runStep(state);
    expect(events).toEqual([
      {
        type: 'fluidRemoved',
        fluid: 'water',
        pos: { x: 1, y: 0, z: 1 },
        units: 3,
        reason: 'reachedSurface',
      },
    ]);
    expect(waterOn(state, 1, 0)).toBe(2);
  });

  it('water never flows onto a square at ground level', () => {
    const state = pit(['010']);
    setWaterOn(state, 1, 0, 1); // full to the brim: level 0, like the ground beside it
    expect(runStep(state).events).toEqual([]);
    expect(waterMap(state)).toEqual(['010']);
  });

  it('a move never fills a square over its brim', () => {
    const state = pit(['31', '11']);
    setWaterOn(state, 1, 0, 1);
    setWaterOn(state, 0, 1, 1);
    for (let n = 0; n < 5; n += 1) {
      const { events } = runStep(state);
      expect(events.some((event) => event.type === 'fluidRemoved')).toBe(false);
    }
    expect(waterMap(state)).toEqual(['20', '00']);
  });
});

describe('lava flows like water, on even-numbered shifts only (design doc 6.4)', () => {
  it('knows which shifts are lava steps', () => {
    expect(isLavaStep(LAVA_SHIFT)).toBe(true);
    expect(isLavaStep(NO_LAVA_SHIFT)).toBe(false);
    expect(HAZARDS.lava.flowEveryShifts).toBe(2);
  });

  it('does not move in the cube phase of an odd shift, and moves in an even one', () => {
    const state = pit(['12'], { shift: NO_LAVA_SHIFT });
    setLavaOn(state, 0, 0, 1, false);
    expect(moves(runStep(state).events, 'lava')).toEqual([]);
    expect(lavaMap(state)).toEqual(['10']);

    state.shift = LAVA_SHIFT;
    expect(moves(runStep(state).events, 'lava')).toEqual(['0,0>1,0']);
    expect(lavaMap(state)).toEqual(['01']);
  });

  it('through endShift: lava moves in every second cube phase', () => {
    let state = pit(['123'], { shift: 1, fuel: 20 });
    setLavaOn(state, 0, 0, 1, false);
    const seen: string[] = [];
    for (let n = 0; n < 4; n += 1) {
      state = endShift(state).state;
      seen.push(lavaMap(state).join(''));
    }
    // Shifts 1 to 4 end; lava moves at the end of shifts 2 and 4.
    expect(seen).toEqual(['100', '010', '010', '001']);
  });

  it('spreads by the same rule as water', () => {
    const water = pit(['44444', '44444', '44444', '44444', '44444'], { shift: LAVA_SHIFT });
    const lava = pit(['44444', '44444', '44444', '44444', '44444'], { shift: LAVA_SHIFT });
    setWaterOn(water, 2, 2, 4);
    setLavaOn(lava, 2, 2, 4, false);
    expect(moves(runStep(lava).events, 'lava')).toEqual(moves(runStep(water).events, 'water'));
    expect(lavaMap(lava)).toEqual(waterMap(water));
  });

  it('lava over the brim drains away, in an odd shift too', () => {
    const state = pit(['010'], { shift: NO_LAVA_SHIFT });
    setLavaOn(state, 1, 0, 3, false);
    const { events } = runStep(state);
    expect(events).toEqual([
      {
        type: 'fluidRemoved',
        fluid: 'lava',
        pos: { x: 1, y: 0, z: 0 },
        units: 2,
        reason: 'reachedSurface',
      },
    ]);
    expect(lavaOn(state, 1, 0)).toBe(1);
  });
});

describe('lava sources (design doc 6.2)', () => {
  it('a source gives 1 more unit on every lava step, and none in between', () => {
    const state = pit(['3'], { shift: LAVA_SHIFT });
    setLavaOn(state, 0, 0, 1, true);
    const { events } = runStep(state);
    expect(events).toEqual([{ type: 'lavaPoured', pos: { x: 0, y: 0, z: 2 }, units: 1 }]);
    expect(lavaOn(state, 0, 0)).toBe(2);
    expect(isLavaSourceOn(state, 0, 0)).toBe(true);

    state.shift = NO_LAVA_SHIFT;
    expect(runStep(state).events).toEqual([]);
    expect(lavaOn(state, 0, 0)).toBe(2);
  });

  it('a source always keeps 1 unit, and feeds the squares beside it', () => {
    const state = pit(['333'], { shift: LAVA_SHIFT });
    setLavaOn(state, 1, 0, 1, true);
    // Pours to 2 (level 1), two above the dry squares: one unit moves east
    // (north and south are wall; east comes before west).
    expect(moves(runStep(state).events, 'lava')).toEqual(['1,0>2,0']);
    expect(lavaMap(state)).toEqual(['011']);
    expect(moves(runStep(state).events, 'lava')).toEqual(['1,0>0,0']);
    expect(lavaMap(state)).toEqual(['111']);
    expect(isLavaSourceOn(state, 1, 0)).toBe(true);
    // The lava that left is not a source.
    expect(isLavaSourceOn(state, 0, 0)).toBe(false);
    expect(isLavaSourceOn(state, 2, 0)).toBe(false);
  });

  it('a source on a ledge keeps its last unit though the drop is there', () => {
    const state = pit(['13'], { shift: NO_LAVA_SHIFT });
    setLavaOn(state, 0, 0, 1, true);
    // No pour in an odd shift, and no flow.
    runStep(state);
    expect(lavaMap(state)).toEqual(['10']);
    // In an even shift it pours 1 (the square is full: 2 would be over the
    // brim, so 1 drains), then gives nothing away below its last unit.
    state.shift = LAVA_SHIFT;
    runStep(state);
    expect(lavaOn(state, 0, 0)).toBe(1);
    expect(isLavaSourceOn(state, 0, 0)).toBe(true);
  });

  it('a source fills its pit to ground level and no higher', () => {
    const state = pit(['020'], { shift: LAVA_SHIFT });
    setLavaOn(state, 1, 0, 1, true);
    for (let n = 0; n < 5; n += 1) {
      runStep(state);
    }
    expect(lavaOn(state, 1, 0)).toBe(2);
    expect(lavaMap(state)).toEqual(['020']);
  });
});

describe('water meets lava: stone (design doc 6.4)', () => {
  it('one unit of each on a square becomes one stone block, and the square rises by 1', () => {
    const state = pit(['3']);
    setWaterOn(state, 0, 0, 1);
    setLavaOn(state, 0, 0, 1, false);
    const { events } = runStep(state);
    expect(events).toEqual([
      { type: 'stoneFormed', pos: { x: 0, y: 0, z: 2 } },
      {
        type: 'fluidRemoved',
        fluid: 'water',
        pos: { x: 0, y: 0, z: 1 },
        units: 1,
        reason: 'turnedToStone',
      },
      {
        type: 'fluidRemoved',
        fluid: 'lava',
        pos: { x: 0, y: 0, z: 1 },
        units: 1,
        reason: 'turnedToStone',
      },
    ]);
    expect(depthAt(state, 0, 0)).toBe(2);
    expect(blockAt(state, { x: 0, y: 0, z: 2 })).toBe(BLOCKS.stone.code);
    expect(contentsOn(state, 0, 0)).toEqual({ water: 0, lava: 0, lavaSource: false, gas: 0 });
    // Nothing is left behind in the cell that is now stone.
    expect(waterAt(state, { x: 0, y: 0, z: 2 })).toBe(0);
  });

  it('pairs go on until one of the two is used up; the rest stays on the higher square', () => {
    const state = pit(['5']);
    setWaterOn(state, 0, 0, 3);
    setLavaOn(state, 0, 0, 2, false);
    runStep(state);
    expect(depthAt(state, 0, 0)).toBe(3);
    expect(waterOn(state, 0, 0)).toBe(1);
    expect(lavaOn(state, 0, 0)).toBe(0);
  });

  it('never raises a square above ground level', () => {
    // A square 1 deep, with far more of both than it holds: each drains to 1
    // first, then the one pair fills the square to ground level.
    const state = pit(['1']);
    setWaterOn(state, 0, 0, 4);
    setLavaOn(state, 0, 0, 6, true);
    runStep(state);
    expect(depthAt(state, 0, 0)).toBe(0);
    expect(contentsOn(state, 0, 0)).toEqual({ water: 0, lava: 0, lavaSource: false, gas: 0 });
  });

  it('a source that turns to stone stops', () => {
    const state = pit(['4'], { shift: LAVA_SHIFT });
    setLavaOn(state, 0, 0, 2, true);
    setWaterOn(state, 0, 0, 1);
    runStep(state);
    // It poured once more (3 lava), then one pair became stone.
    expect(depthAt(state, 0, 0)).toBe(3);
    expect(lavaOn(state, 0, 0)).toBe(2);
    expect(isLavaSourceOn(state, 0, 0)).toBe(false);
    const { events } = runStep(state);
    expect(events.some((event) => event.type === 'lavaPoured')).toBe(false);
    expect(lavaOn(state, 0, 0)).toBe(2);
  });

  it('water that flows onto a lava square meets it there', () => {
    const state = pit(['23'], { shift: NO_LAVA_SHIFT });
    setWaterOn(state, 0, 0, 1);
    setLavaOn(state, 1, 0, 1, false);
    const { events } = runStep(state);
    expect(moves(events, 'water')).toEqual(['0,0>1,0']);
    expect(depthText(state)).toEqual(['22']);
    expect(total(waterMap(state)) + total(lavaMap(state))).toBe(0);
  });

  it('a crack on the block the stone covers is gone', () => {
    const state = pit(['3']);
    setCrackTimer(state, { x: 0, y: 0, z: 3 }, 1);
    setWaterOn(state, 0, 0, 1);
    setLavaOn(state, 0, 0, 1, false);
    runStep(state);
    expect(crackTimerAt(state, { x: 0, y: 0, z: 3 })).toBeNull();
  });
});

describe('what lava and water destroy (design doc 6.3 and 6.4)', () => {
  it('lava destroys a support, pump, vent or explosive on a square it stands on', () => {
    for (const id of ['support', 'pump', 'vent', 'explosive'] as const) {
      const state = pit(['23'], { shift: LAVA_SHIFT });
      // A structure on a square is stored with the square's top block.
      const top = { x: 1, y: 0, z: 3 };
      setStructure(state, top, STRUCTURES[id].code);
      setLavaOn(state, 0, 0, 1, false);
      const { events } = runStep(state);
      expect(structureAt(state, top), id).toBe(0);
      expect(events).toContainEqual({
        type: 'structureDestroyed',
        pos: top,
        structure: STRUCTURES[id].code,
        cause: 'lava',
      });
    }
  });

  it('a destroyed explosive is no longer armed', () => {
    const top = { x: 0, y: 0, z: 2 };
    const state = pit(['2'], { armed: [{ pos: top, kind: 'explosive' }] });
    setStructure(state, top, STRUCTURES.explosive.code);
    setLavaOn(state, 0, 0, 1, false);
    runStep(state);
    expect(state.armed).toEqual([]);
  });

  it('lava that was put on a square in the player phase destroys what is there, in an odd shift too', () => {
    const top = { x: 0, y: 0, z: 2 };
    const state = pit(['2'], { shift: NO_LAVA_SHIFT, supports: [top] });
    setLavaOn(state, 0, 0, 1, false);
    runStep(state);
    expect(structureAt(state, top)).toBe(0);
  });

  it('water leaves structures alone', () => {
    const top = { x: 1, y: 0, z: 3 };
    const state = pit(['23'], { supports: [top] });
    setWaterOn(state, 0, 0, 1);
    runStep(state);
    expect(waterOn(state, 1, 0)).toBe(1);
    expect(structureAt(state, top)).toBe(STRUCTURES.support.code);
  });

  it('water that enters a camp square destroys the camp; so does lava', () => {
    // A camp around (1, 1, 1): its cells are the 3 x 3 squares, layers 0 and 1.
    const camp = { pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 };
    const flooded = pit(['2220', '2223', '2220'], { camps: [camp] });
    setWaterOn(flooded, 3, 1, 3); // level 0: two above the camp's floor
    const water = runStep(flooded);
    expect(flooded.camps).toEqual([]);
    expect(water.events).toContainEqual({ type: 'campDestroyed', pos: camp.pos, cause: 'water' });

    const burned = pit(['2220', '2223', '2220'], { camps: [camp], shift: LAVA_SHIFT });
    setLavaOn(burned, 3, 1, 3, false);
    const lava = runStep(burned);
    expect(burned.camps).toEqual([]);
    expect(lava.events).toContainEqual({ type: 'campDestroyed', pos: camp.pos, cause: 'lava' });
  });

  it('water that only stands beside a camp does not destroy it', () => {
    const camp = { pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 };
    const state = pit(['2220', '2223', '2220'], { camps: [camp] });
    setWaterOn(state, 3, 1, 1); // level 2: the same as the camp's floor
    runStep(state);
    expect(state.camps).toHaveLength(1);
  });
});

describe('water and lava hurt the crew on worked squares (design doc 5.2)', () => {
  it('water that enters a worked square: 1', () => {
    const state = pit(['12'], { worked: [{ x: 1, y: 0 }] });
    setWaterOn(state, 0, 0, 1);
    expect(runStep(state).phase.damage).toEqual([{ cause: 'water', amount: CREW.damage.water }]);
  });

  it('water that enters a square nobody worked: nothing', () => {
    const state = pit(['12'], { worked: [{ x: 0, y: 0 }] });
    setWaterOn(state, 0, 0, 1);
    expect(runStep(state).phase.damage).toEqual([]);
  });

  it('water that stands still on a worked square: nothing (it did not enter)', () => {
    const state = pit(['22'], { worked: [{ x: 0, y: 0 }] });
    setWaterOn(state, 0, 0, 1);
    expect(runStep(state).phase.damage).toEqual([]);
  });

  it('water entering several worked squares in one phase still hurts once', () => {
    const state = pit(['44444', '44444', '44444', '44444', '44444'], {
      worked: [
        { x: 2, y: 1 },
        { x: 3, y: 2 },
        { x: 2, y: 3 },
      ],
    });
    setWaterOn(state, 2, 2, 4);
    expect(runStep(state).phase.damage).toEqual([{ cause: 'water', amount: CREW.damage.water }]);
  });

  it('lava on a worked square: 5; beside one: 1; further away: nothing', () => {
    const on = pit(['222'], { worked: [{ x: 0, y: 0 }] });
    setLavaOn(on, 0, 0, 1, false);
    expect(runStep(on).phase.damage).toEqual([{ cause: 'lava', amount: CREW.damage.lavaOn }]);

    const beside = pit(['222'], { worked: [{ x: 1, y: 0 }] });
    setLavaOn(beside, 0, 0, 1, false);
    expect(runStep(beside).phase.damage).toEqual([
      { cause: 'lava', amount: CREW.damage.lavaBeside },
    ]);

    const far = pit(['222'], { worked: [{ x: 2, y: 0 }] });
    setLavaOn(far, 0, 0, 1, false);
    expect(runStep(far).phase.damage).toEqual([]);
  });

  it('lava hurts in every cube phase, not only when it flows', () => {
    expect(isLavaStep(NO_LAVA_SHIFT)).toBe(false);
    const state = pit(['2'], { shift: NO_LAVA_SHIFT, worked: [{ x: 0, y: 0 }] });
    setLavaOn(state, 0, 0, 1, false);
    expect(runStep(state).phase.damage).toEqual([{ cause: 'lava', amount: CREW.damage.lavaOn }]);
  });

  it('lava is counted from where it is at the end of the step', () => {
    // The lava flows from the unworked square onto the worked one.
    const state = pit(['12'], { shift: LAVA_SHIFT, worked: [{ x: 1, y: 0 }] });
    setLavaOn(state, 0, 0, 1, false);
    expect(runStep(state).phase.damage).toEqual([{ cause: 'lava', amount: CREW.damage.lavaOn }]);
  });

  it('through endShift: the crew loses the health, and can be lost to lava or water', () => {
    const burned = pit(['2'], { worked: [{ x: 0, y: 0 }], health: CREW.damage.lavaOn });
    setLavaOn(burned, 0, 0, 1, false);
    const afterLava = endShift(burned);
    expect(afterLava.state.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'burned' });

    const drowned = pit(['12'], { worked: [{ x: 1, y: 0 }], health: CREW.damage.water });
    setWaterOn(drowned, 0, 0, 1);
    const afterWater = endShift(drowned);
    expect(afterWater.events).toContainEqual({
      type: 'damageTaken',
      amount: CREW.damage.water,
      cause: 'water',
      health: 0,
    });
    expect(afterWater.state.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'drowned' });
  });
});

describe('mining with water or lava on the square (design doc 4.2; question 91)', () => {
  it('a flooded square costs 1 AP more', () => {
    const state = pit(['11', '11']);
    const dry = mineCheck(state, 0, 0);
    setWaterOn(state, 0, 0, 1);
    const flooded = mineCheck(state, 0, 0);
    expect(dry.ap).toBe(STONE_AP);
    expect(flooded.allowed).toBe(true);
    expect(flooded.ap).toBe(STONE_AP + HAZARDS.water.floodedMineExtraAp);

    const before = state.ap;
    const after = act(state, { type: 'mine', x: 0, y: 0 }).state;
    expect(before - after.ap).toBe(STONE_AP + HAZARDS.water.floodedMineExtraAp);
    // The water stays on the square, which is now 1 deeper.
    expect(depthAt(after, 0, 0)).toBe(2);
    expect(waterOn(after, 0, 0)).toBe(1);
  });

  it('a flooded block that then costs more than the AP left is not offered', () => {
    const state = pit(['11', '11'], { ap: STONE_AP });
    setWaterOn(state, 0, 0, 1);
    const offered = legalActions(state).filter((action) => action.type === 'mine');
    expect(
      offered.some((action) => action.type === 'mine' && action.x === 0 && action.y === 0),
    ).toBe(false);
    expect(offered).toHaveLength(3);
  });

  it('a square with lava on it cannot be mined, and the refusal says why', () => {
    const state = pit(['11', '11']);
    setLavaOn(state, 0, 0, 1, false);
    expect(mineCheck(state, 0, 0)).toEqual({
      allowed: false,
      refusal: 'lava',
      higherNeighbours: [],
      ap: null,
      campDiscount: null,
      drillSaving: null,
    });
    expect(
      legalActions(state).some(
        (action) => action.type === 'mine' && action.x === 0 && action.y === 0,
      ),
    ).toBe(false);
  });

  it('lava is the reason given even when the level rule also forbids the mine', () => {
    const state = pit(['21']);
    setLavaOn(state, 0, 0, 1, false);
    expect(mineCheck(state, 0, 0).refusal).toBe('lava');
  });

  it('near a camp: the discount first, with its floor, then the 1 AP for water (question 107)', () => {
    // A camp on the west of a flat dirt field; the square beside it is near.
    const dirt = ['ddddd', 'ddddd', 'ddddd'];
    const state = pit(
      ['11111', '11111', '11111'],
      { camps: [{ pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 }] },
      dirt,
    );
    const dirtAp = BLOCKS.dirt.mineCost ?? 0;
    // Dirt already costs the least a mine may cost, so the discount takes nothing off.
    expect(mineCheck(state, 3, 1)).toMatchObject({ ap: dirtAp, campDiscount: 0 });
    setWaterOn(state, 3, 1, 1);
    expect(mineCheck(state, 3, 1)).toMatchObject({
      ap: dirtAp + HAZARDS.water.floodedMineExtraAp,
      campDiscount: 0,
      drillSaving: 0,
    });

    // Stone: 1 off for the camp, then 1 on for the water.
    const stone = pit(['11111', '11111', '11111'], {
      camps: [{ pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 }],
    });
    setWaterOn(stone, 3, 1, 1);
    expect(mineCheck(stone, 3, 1)).toMatchObject({
      ap: STONE_AP - CAMPS.mineDiscountAp + HAZARDS.water.floodedMineExtraAp,
      campDiscount: CAMPS.mineDiscountAp,
    });
  });

  it('once the lava has gone the square can be mined again', () => {
    const state = pit(['12', '11'], { shift: LAVA_SHIFT });
    setLavaOn(state, 0, 0, 1, false);
    runStep(state); // it flows east, onto the lower square
    expect(mineCheck(state, 0, 0).allowed).toBe(true);
  });
});

describe('water and lava under a block that slumps onto their square (issue #99)', () => {
  // Square x=0 is dirt at ground level, with a crack that is due; x=1 is a
  // hole beside it. The dirt block slumps into the hole in step (a), which
  // lifts what stands there onto the rubble (`liftContents` in
  // cube/slumps.ts). Step (b) then finds it one level higher.
  function slumpInto(holeDepth: number, options: Omit<BuildStateOptions, 'layers'>): GameState {
    return pit(
      [`0${holeDepth}`],
      { cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }], fuel: 10, ...options },
      ['d#'],
    );
  }

  it('the water is pushed up: the square rises by 1 and keeps all of it', () => {
    const state = slumpInto(4, {});
    setWaterOn(state, 1, 0, 2);
    const { state: after, events } = endShift(state);
    expect(events.some((event) => event.type === 'blockFell')).toBe(true);
    expect(depthText(after)).toEqual(['13']);
    expect(waterOn(after, 1, 0)).toBe(2);
    expect(events.some((event) => event.type === 'fluidRemoved')).toBe(false);
    // Nothing is left in the cell the rubble is in.
    expect(blockAt(after, { x: 1, y: 0, z: 3 })).toBe(BLOCKS.rubble.code);
    expect(waterAt(after, { x: 1, y: 0, z: 3 })).toBe(0);
  });

  it('what is pushed above ground level drains in the same cube phase', () => {
    const state = slumpInto(2, {});
    setWaterOn(state, 1, 0, 2); // full to the brim
    const { state: after, events } = endShift(state);
    expect(depthText(after)).toEqual(['11']);
    expect(events).toContainEqual({
      type: 'fluidRemoved',
      fluid: 'water',
      pos: { x: 1, y: 0, z: 0 },
      units: 1,
      reason: 'reachedSurface',
    });
    expect(waterOn(after, 1, 0)).toBe(1);
  });

  it('pushed-up water then flows like any other', () => {
    // The hole is 3 deep with 2 units (level 1). The rubble lifts it to
    // level 0, two above the square the block left (now 1 deep and dry)...
    const state = slumpInto(3, {});
    setWaterOn(state, 1, 0, 2);
    const { state: after, events } = endShift(state);
    expect(depthText(after)).toEqual(['12']);
    // ...but a drop of 1 is not enough: it stays.
    expect(moves(events, 'water')).toEqual([]);
    expect(waterMap(after)).toEqual(['02']);
  });

  it('lava is pushed up the same way, and a buried source is still a source', () => {
    const state = slumpInto(4, { shift: NO_LAVA_SHIFT });
    setLavaOn(state, 1, 0, 2, true);
    const after = endShift(state).state;
    expect(depthText(after)).toEqual(['13']);
    expect(lavaOn(after, 1, 0)).toBe(2);
    expect(isLavaSourceOn(after, 1, 0)).toBe(true);
  });

  it('the forecast of the flows takes the slump into account', () => {
    const state = slumpInto(2, {});
    setWaterOn(state, 1, 0, 2);
    const forecast = previewCubePhase(state);
    const fluidTypes = ['fluidMoved', 'fluidRemoved', 'lavaPoured', 'stoneFormed'];
    const happened = endShift(state).events.filter((event) => fluidTypes.includes(event.type));
    expect(happened).toHaveLength(1);
    expect(forecast.flows).toEqual(happened);
  });

  it('water in a pocket under the surface is left alone', () => {
    // A sealed water pocket one block under a dry pit floor.
    const state = buildState({
      layers: [['...'], ['###'], ['#.#'], ['###']],
      water: [{ x: 1, y: 0, z: 2 }],
      shift: NO_LAVA_SHIFT,
    });
    expect(runStep(state).events).toEqual([]);
    expect(waterAt(state, { x: 1, y: 0, z: 2 })).toBe(1);
    expect(waterOn(state, 1, 0)).toBe(0);
  });
});

describe('breaking into a pocket, then the cube phase (design doc 6.2)', () => {
  it('the water a breach puts on the mined square spreads over the pit floor', () => {
    // A pit floor 1 deep; under the middle square a pocket of 3 water cells.
    const state = buildState({
      layers: [['.....'], ['#####'], ['#...#'], ['#####']],
      water: [
        { x: 1, y: 0, z: 2 },
        { x: 2, y: 0, z: 2 },
        { x: 3, y: 0, z: 2 },
      ],
      ap: 10,
      fuel: 10,
    });
    const mined = act(state, { type: 'mine', x: 2, y: 0 }).state;
    expect(waterMap(mined)).toEqual(['00300']);
    // The mined square is 2 deep and holds 3: one unit is over the brim.
    const { state: after, events } = endShift(mined);
    expect(events).toContainEqual({
      type: 'fluidRemoved',
      fluid: 'water',
      pos: { x: 2, y: 0, z: 1 },
      units: 1,
      reason: 'reachedSurface',
    });
    // Level 0 on the mined square against 1 on the dry floor: no flow.
    expect(waterMap(after)).toEqual(['00200']);
    // The mined square was worked, but no water ENTERED it in the cube phase.
    expect(after.crew.health).toBe(CREW.startHealth);
  });

  it('a lava breach burns the crew that made it, and leaves a source that cannot be mined', () => {
    const cells = HAZARDS.lava.sourcePocketCellsOver + 1;
    const pocket = [];
    for (let x = 1; x <= cells; x += 1) {
      pocket.push({ x, y: 0, z: 2 });
    }
    const width = cells + 2;
    const state = buildState({
      layers: [
        ['.'.repeat(width)],
        ['#'.repeat(width)],
        ['#' + '.'.repeat(cells) + '#'],
        ['#'.repeat(width)],
      ],
      lava: pocket,
      shift: 1,
      fuel: 10,
    });
    const mined = act(state, { type: 'mine', x: 1, y: 0 }).state;
    expect(isLavaSourceOn(mined, 1, 0)).toBe(true);
    const { state: after, events } = endShift(mined);
    expect(events).toContainEqual({
      type: 'damageTaken',
      amount: CREW.damage.lavaOn,
      cause: 'lava',
      health: CREW.startHealth - CREW.damage.lavaOn,
    });
    // Over the brim drained; the source keeps the square full.
    expect(lavaOn(after, 1, 0)).toBe(2);
    expect(mineCheck(after, 1, 0).refusal).toBe('lava');
  });
});

describe('the forecast (design doc 6 and 11)', () => {
  it('says what the coming cube phase will do, and changes nothing', () => {
    const state = pit(['1234'], { shift: LAVA_SHIFT, fuel: 10 });
    setWaterOn(state, 0, 0, 1);
    setLavaOn(state, 2, 0, 1, true);
    const before = hashState(state);
    const flows = previewCubePhase(state).flows;
    expect(hashState(state)).toBe(before);
    expect(flows.length).toBeGreaterThan(0);

    // What then happens is exactly what was forecast.
    const fluidTypes = ['fluidMoved', 'fluidRemoved', 'lavaPoured', 'stoneFormed'];
    const happened = endShift(state).events.filter((event) => fluidTypes.includes(event.type));
    expect(flows).toEqual(happened);
  });

  it('is empty for a dry pit', () => {
    expect(previewCubePhase(pit(['121'])).flows).toEqual([]);
  });

  it('does not depend on a pocket the player has not seen', () => {
    const dry = buildState({ layers: [['...'], ['###'], ['#.#'], ['###']] });
    const wet = buildState({
      layers: [['...'], ['###'], ['#.#'], ['###']],
      water: [{ x: 1, y: 0, z: 2 }],
      lavaSources: [],
    });
    setWaterOn(dry, 0, 0, 1);
    setWaterOn(wet, 0, 0, 1);
    expect(previewCubePhase(wet).flows).toEqual(previewCubePhase(dry).flows);
  });
});

describe('property: water and lava are conserved, apart from the named sources and sinks', () => {
  /** A random pit with water, lava and sources on it. */
  function randomPit(seed: number): GameState {
    const rng = createRng(seed);
    const size = 3 + nextInt(rng, 4); // 3 to 6 squares a side
    const rows: string[] = [];
    for (let y = 0; y < size; y += 1) {
      let row = '';
      for (let x = 0; x < size; x += 1) {
        row += String(nextInt(rng, 7)); // depth 0 to 6
      }
      rows.push(row);
    }
    const state = pit(rows, { shift: 1 + nextInt(rng, 2) });
    const worked: Square[] = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const depth = depthAt(state, x, y);
        if (depth === 0) {
          continue;
        }
        const roll = nextInt(rng, 6);
        if (roll === 0) {
          // Sometimes more than the square holds, as after a breach.
          setWaterOn(state, x, y, 1 + nextInt(rng, depth + 3));
        } else if (roll === 1) {
          setLavaOn(state, x, y, 1 + nextInt(rng, depth + 3), nextInt(rng, 3) === 0);
        } else if (roll === 2) {
          // Both on one square: only a breach in the player phase can do this.
          setWaterOn(state, x, y, 1 + nextInt(rng, 3));
          setLavaOn(state, x, y, 1 + nextInt(rng, 3), false);
        }
        if (nextInt(rng, 4) === 0) {
          worked.push({ x, y });
        }
      }
    }
    for (const square of worked) {
      markWorked(state, square.x, square.y);
    }
    return state;
  }

  it('holds on 150 random pits, for 12 cube phases each', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const state = randomPit(seed);
      for (let phase = 0; phase < 12; phase += 1) {
        const label = `seed ${seed}, phase ${phase}`;
        const waterBefore = total2(state, 'water');
        const lavaBefore = total2(state, 'lava');
        const { events } = runStep(state);

        // Add up what the events say came in and went out.
        let waterOut = 0;
        let lavaOut = 0;
        let lavaIn = 0;
        let stone = 0;
        const arrivals = new Map<string, number>();
        const departures = new Map<string, number>();
        for (const event of events) {
          if (event.type === 'fluidRemoved') {
            expect(['reachedSurface', 'turnedToStone'], label).toContain(event.reason);
            if (event.fluid === 'water') waterOut += event.units;
            else lavaOut += event.units;
          } else if (event.type === 'lavaPoured') {
            lavaIn += event.units;
          } else if (event.type === 'stoneFormed') {
            stone += 1;
          } else if (event.type === 'fluidMoved') {
            // A move is to a face neighbour: exactly one step away.
            const step = Math.abs(event.from.x - event.to.x) + Math.abs(event.from.y - event.to.y);
            expect(step, label).toBe(1);
            const from = `${event.fluid} ${event.from.x},${event.from.y}`;
            const to = `${event.fluid} ${event.to.x},${event.to.y}`;
            departures.set(from, (departures.get(from) ?? 0) + 1);
            arrivals.set(to, (arrivals.get(to) ?? 0) + 1);
            if (event.fluid === 'lava') {
              expect(isLavaStep(state.shift), label).toBe(true);
            }
          }
        }
        expect(total2(state, 'water'), `${label}: water`).toBe(waterBefore - waterOut);
        expect(total2(state, 'lava'), `${label}: lava`).toBe(lavaBefore + lavaIn - lavaOut);
        // One stone block takes exactly one unit of each.
        const toStone = events.filter(
          (event) => event.type === 'fluidRemoved' && event.reason === 'turnedToStone',
        );
        let unitsToStone = 0;
        for (const event of toStone) {
          if (event.type === 'fluidRemoved') unitsToStone += event.units;
        }
        expect(unitsToStone, `${label}: stone`).toBe(2 * stone);

        for (let y = 0; y < state.size.y; y += 1) {
          for (let x = 0; x < state.size.x; x += 1) {
            const depth = depthAt(state, x, y);
            const contents = contentsOn(state, x, y);
            // Nothing above ground level, and never both on one square.
            expect(contents.water, `${label}: water over the brim`).toBeLessThanOrEqual(depth);
            expect(contents.lava, `${label}: lava over the brim`).toBeLessThanOrEqual(depth);
            expect(Math.min(contents.water, contents.lava), `${label}: both`).toBe(0);
            // A source always has lava.
            if (contents.lavaSource) expect(contents.lava, label).toBeGreaterThan(0);
          }
        }
        state.shift += 1;
      }
    }
  });

  /** All the water or lava standing on the squares of `state`. */
  function total2(state: GameState, fluid: 'water' | 'lava'): number {
    return total(fluid === 'water' ? waterMap(state) : lavaMap(state));
  }

  it('water alone always comes to rest', () => {
    for (let seed = 200; seed < 260; seed += 1) {
      const state = randomPit(seed);
      // Take the lava away: a source never rests.
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          if (depthAt(state, x, y) > 0) setLavaOn(state, x, y, 0, false);
        }
      }
      let quiet = false;
      for (let phase = 0; phase < 200 && !quiet; phase += 1) {
        quiet = runStep(state).events.length === 0;
      }
      expect(quiet, `seed ${seed}`).toBe(true);
    }
  });
});

describe('a pinned flood (in place of a golden run that floods)', () => {
  // No recorded run reaches a water pocket yet: pockets start 8 levels down,
  // and no policy digs that deep (tests/golden/README.md). Until one does,
  // this scenario pins the flow rule the way a golden run would: a fixed
  // pit, two breaches through `applyAction`, twelve ends of shift, and the
  // hash of the final state. If the hash changes, the rule changed: say so
  // in the PR, as for a golden run.
  //
  // The pit is hard rock, terraced down to a 5 x 3 floor 2 levels deep.
  // Under the west of the floor lies a pocket of 6 water cells, under the
  // east a pocket of 9 lava cells (a source: more than 8).
  function basin(): GameState {
    const depths = [
      '000000000',
      '011111110',
      '012222210',
      '012222210',
      '012222210',
      '011111110',
      '000000000',
    ];
    const hardRock = depths.map((row) => 'H'.repeat(row.length));
    const state = buildState({
      layers: terrainLayers(depths, hardRock, 7),
      shift: 1,
      ap: 20,
      fuel: 20,
      health: 40,
    });
    // The pockets: open cells in layers 3 and 4, under the floor's top blocks.
    const waterCells = [
      { x: 2, y: 2, z: 3 },
      { x: 3, y: 2, z: 3 },
      { x: 2, y: 3, z: 3 },
      { x: 3, y: 3, z: 3 },
      { x: 2, y: 4, z: 3 },
      { x: 3, y: 4, z: 3 },
    ];
    const lavaCells = [
      { x: 5, y: 2, z: 3 },
      { x: 6, y: 2, z: 3 },
      { x: 5, y: 3, z: 3 },
      { x: 6, y: 3, z: 3 },
      { x: 5, y: 4, z: 3 },
      { x: 6, y: 4, z: 3 },
      { x: 5, y: 2, z: 4 },
      { x: 5, y: 3, z: 4 },
      { x: 6, y: 3, z: 4 },
    ];
    for (const cell of waterCells) {
      setBlock(state, cell, BLOCKS.air.code);
      setWater(state, cell, HAZARDS.water.unitsPerCell);
    }
    for (const cell of lavaCells) {
      setBlock(state, cell, BLOCKS.air.code);
      setLava(state, cell, HAZARDS.lava.unitsPerCell);
    }
    return state;
  }

  it('plays out the same way every time, to a recorded hash', () => {
    let state = basin();
    // Break into the water pocket, then into the lava pocket.
    state = act(state, { type: 'mine', x: 3, y: 3 }).state;
    expect(waterOn(state, 3, 3)).toBe(6);
    state = act(state, { type: 'mine', x: 5, y: 3 }).state;
    expect(lavaOn(state, 5, 3)).toBe(9);
    expect(isLavaSourceOn(state, 5, 3)).toBe(true);

    const seen = new Set<string>();
    for (let n = 0; n < 12; n += 1) {
      const step = endShift(state);
      state = step.state;
      for (const event of step.events) {
        seen.add(event.type);
      }
    }
    // The run met everything the step does.
    for (const type of ['fluidMoved', 'fluidRemoved', 'lavaPoured', 'stoneFormed', 'damageTaken']) {
      expect([...seen], type).toContain(type);
    }
    expect(state.status).toEqual({ kind: 'active' });
    // Where it ended: the lava source fills its hole and has spread one
    // square each way; the water hole met lava and is stone, one level up.
    expect(depthText(state)).toEqual([
      '000000000',
      '011111110',
      '012222210',
      '012223210',
      '012222210',
      '011111110',
      '000000000',
    ]);
    expect(waterMap(state)).toEqual([
      '000000000',
      '000000000',
      '000100000',
      '000100000',
      '000000000',
      '000000000',
      '000000000',
    ]);
    expect(lavaMap(state)).toEqual([
      '000000000',
      '000000000',
      '000001000',
      '000013100',
      '000001000',
      '000000000',
      '000000000',
    ]);
    // The lava breach burned the crew once (5), on the square it had mined.
    expect(state.crew.health).toBe(40 - CREW.damage.lavaOn);
    expect(hashState(state)).toBe('2008a9ed8739b913');
  });
});
