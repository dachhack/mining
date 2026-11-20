// The camp-made tools: pump, sealant, scanner, drill (design doc v0.2
// sections 3.4, 3.5, 4.1, 5.2, 6.3 and 7.2; owner question 93; issue #104,
// task T13; decision note 0034). One group of tests for each rule, each on a
// small hand-built pit.
//
// A pit is drawn as a grid of depths, one digit per square, row y = 0 first:
//
//   pit(['111', '121', '111'])   a 3 x 3 pit 1 level deep, 2 in the middle

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, BLOCKS, CAMP_TOOLS, CREW, HAZARDS, STRUCTURES } from '../../src/data';
import {
  actionKey,
  applyAction,
  countItem,
  createRun,
  depthAt,
  endShift,
  hashState,
  isLegalAction,
  isRevealed,
  isWorked,
  knownSquare,
  legalActions,
  mineCheck,
  previewCubePhase,
  pumpCheck,
  scanCells,
  scanCheck,
  sealCheck,
  squaresWithinSteps,
  structureOnSquare,
  unstableAfterSeal,
  unstableSquares,
} from '../../src/engine';
import type { Action, GameEvent, GameState } from '../../src/engine';
import { contentsOn } from '../../src/engine/breach';
import { stepFluids } from '../../src/engine/cube/fluids';
import { newCubePhase } from '../../src/engine/cube/phase';
import { knownCube } from '../../src/engine/known';
import { isLavaSourceOn, lavaOn, setLavaOn, setWaterOn, waterOn } from '../../src/engine/standing';
import { blockAt, crackTimerAt, setGas, structureAt } from '../../src/engine/state';
import { act, buildState, depthText, findActions, terrainLayers } from './helpers';
import type { BuildStateOptions } from './helpers';

/** A shift in which lava flows, and one in which it does not. */
const LAVA_SHIFT = 2;
const NO_LAVA_SHIFT = 3;

/** Build a pit from a grid of depths: stone unless `materials` says otherwise. */
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

/** Run step (b) of the cube phase on `state` (in place) and return its events. */
function runFluids(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  stepFluids(state, events, newCubePhase());
  return events;
}

/** What the pumps took, as "units from x,y" strings in the order they took it. */
function pumped(events: GameEvent[]): string[] {
  const out: string[] = [];
  for (const event of events) {
    if (event.type === 'fluidRemoved' && event.reason === 'pumped') {
      out.push(`${event.units} from ${event.pos.x},${event.pos.y}`);
    }
  }
  return out;
}

/** The events of one type, picked out of a list. */
function ofType(events: GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((event) => event.type === type);
}

// ---------------------------------------------------------------------------
// Pump
// ---------------------------------------------------------------------------

describe('placing a pump (design doc 4.1: 1 AP and the crafted item)', () => {
  it('puts the pump on the square, uses it up, costs 1 AP and makes the square worked', () => {
    const state = pit(['111', '111'], { stockpile: { pump: 2 } });
    const { state: after, events } = act(state, { type: 'placePump', x: 1, y: 1 });
    expect(structureOnSquare(after, 1, 1)).toBe(STRUCTURES.pump.code);
    // Stored with the square's top block, like a support.
    expect(structureAt(after, { x: 1, y: 1, z: 1 })).toBe(STRUCTURES.pump.code);
    expect(countItem(after, 'pump')).toBe(1);
    expect(after.ap).toBe(state.ap - ACTION_COSTS.placePump);
    expect(events).toEqual([
      { type: 'structurePlaced', pos: { x: 1, y: 1, z: 1 }, structure: STRUCTURES.pump.code },
    ]);
    // Design doc 5.2: a square the player placed a pump on is a worked square.
    expect(isWorked(after, 1, 1)).toBe(true);
    expect(isWorked(after, 0, 0)).toBe(false);
  });

  it('is offered for every square while a pump is held, and for none without one', () => {
    const withPump = pit(['11', '11'], { stockpile: { pump: 1 } });
    expect(findActions(withPump, { type: 'placePump' })).toHaveLength(4);
    const without = pit(['11', '11']);
    expect(findActions(without, { type: 'placePump' })).toEqual([]);
    expect(pumpCheck(without, 0, 0)).toEqual({ allowed: false, refusal: 'noItem', ap: null });
  });

  it('is refused on a tree, at the bottom, on a structure, on lava and on a camp square', () => {
    // A tree (x 0), a square with no block left (x 1), a support (x 2), lava (x 3).
    const state = buildState({
      layers: [['#.#.#'], ['#.###']],
      surface: ['T....'],
      stockpile: { pump: 1 },
      supports: [{ x: 2, y: 0, z: 0 }],
      lava: [{ x: 3, y: 0, z: 0 }],
    });
    expect(pumpCheck(state, 0, 0).refusal).toBe('tree');
    expect(pumpCheck(state, 1, 0).refusal).toBe('bottom');
    expect(pumpCheck(state, 2, 0).refusal).toBe('occupied');
    expect(pumpCheck(state, 3, 0).refusal).toBe('lava');
    expect(pumpCheck(state, 4, 0)).toEqual({ allowed: true, refusal: null, ap: 1 });
    // The list agrees: only x 4 is offered.
    expect(findActions(state, { type: 'placePump' })).toEqual([
      { type: 'placePump', x: 4, y: 0, ap: 1 },
    ]);

    const camped = pit(['111', '111', '111'], {
      stockpile: { pump: 1 },
      camps: [{ pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 }],
    });
    expect(pumpCheck(camped, 1, 1).refusal).toBe('camp');
    expect(pumpCheck(camped, 0, 0).refusal).toBe('camp');
  });

  it('may be placed on a flooded square', () => {
    const state = pit(['222'], { stockpile: { pump: 1 } });
    setWaterOn(state, 1, 0, 1);
    expect(pumpCheck(state, 1, 0).allowed).toBe(true);
  });

  it('throws for a square the cube does not have', () => {
    const state = pit(['11'], { stockpile: { pump: 1 } });
    expect(() => pumpCheck(state, 2, 0)).toThrow('not a square');
  });
});

describe('what a pump does (design doc 6.3: 3 units a shift from squares within 2 steps)', () => {
  it('has the numbers of the design doc', () => {
    expect(HAZARDS.water.pumpUnitsPerShift).toBe(3);
    expect(HAZARDS.water.pumpReach).toBe(2);
  });

  it('takes water from its own square first, then the nearest, and not from beyond 2 steps', () => {
    // A flat floor, so that single units stay where they are.
    const state = pit(['3333333'], {
      structures: [{ pos: { x: 3, y: 0, z: 3 }, structure: 'pump' }],
    });
    setWaterOn(state, 0, 0, 1); // 3 steps away: out of reach
    setWaterOn(state, 2, 0, 1); // 1 step
    setWaterOn(state, 3, 0, 1); // its own square
    setWaterOn(state, 5, 0, 1); // 2 steps
    const events = runFluids(state);
    expect(pumped(events)).toEqual(['1 from 3,0', '1 from 2,0', '1 from 5,0']);
    expect(waterMap(state)).toEqual(['1000000']);
  });

  it('stops at 3 units: among squares equally far, the lower y and then the lower x come first', () => {
    const state = pit(['222', '222', '222'], {
      structures: [{ pos: { x: 1, y: 1, z: 2 }, structure: 'pump' }],
    });
    setWaterOn(state, 1, 0, 1); // north
    setWaterOn(state, 0, 1, 1); // west
    setWaterOn(state, 2, 1, 1); // east
    setWaterOn(state, 1, 2, 1); // south
    const events = runFluids(state);
    expect(pumped(events)).toEqual(['1 from 1,0', '1 from 0,1', '1 from 2,1']);
    expect(waterMap(state)).toEqual(['000', '000', '010']);
  });

  it('empties a square before going on to the next, and leaves what is over 3 units', () => {
    const state = pit(['3333'], { structures: [{ pos: { x: 0, y: 0, z: 3 }, structure: 'pump' }] });
    setWaterOn(state, 0, 0, 2);
    setWaterOn(state, 1, 0, 2);
    const events = runFluids(state);
    expect(pumped(events)).toEqual(['2 from 0,0', '1 from 1,0']);
    expect(waterMap(state)).toEqual(['0100']);
  });

  it('acts before the water flows', () => {
    // 3 units on x 1 would spill onto x 2 (a drop of 3). The pump on x 0
    // takes all 3 first, so nothing moves.
    const state = pit(['333'], { structures: [{ pos: { x: 0, y: 0, z: 3 }, structure: 'pump' }] });
    setWaterOn(state, 1, 0, 3);
    const events = runFluids(state);
    expect(pumped(events)).toEqual(['3 from 1,0']);
    expect(ofType(events, 'fluidMoved')).toEqual([]);
    expect(waterMap(state)).toEqual(['000']);
  });

  it('two pumps take 3 units each, one after the other, row by row', () => {
    const state = pit(['33333'], {
      structures: [
        { pos: { x: 0, y: 0, z: 3 }, structure: 'pump' },
        { pos: { x: 4, y: 0, z: 3 }, structure: 'pump' },
      ],
    });
    // 3 units on the middle square, in reach of both; 3 more on the pumps' own squares.
    setWaterOn(state, 0, 0, 1);
    setWaterOn(state, 2, 0, 3);
    setWaterOn(state, 4, 0, 2);
    const events = runFluids(state);
    expect(pumped(events)).toEqual(['1 from 0,0', '2 from 2,0', '2 from 4,0', '1 from 2,0']);
    expect(waterMap(state)).toEqual(['00000']);
  });

  it('does nothing to lava', () => {
    const state = pit(['333'], {
      shift: NO_LAVA_SHIFT,
      structures: [{ pos: { x: 0, y: 0, z: 3 }, structure: 'pump' }],
    });
    setLavaOn(state, 2, 0, 1, false);
    const events = runFluids(state);
    expect(pumped(events)).toEqual([]);
    expect(lavaOn(state, 2, 0)).toBe(1);
  });

  it('works at the end of a shift, and the forecast says what it will take', () => {
    const state = pit(['333'], { stockpile: { pump: 1 } });
    setWaterOn(state, 1, 0, 1);
    const placed = act(state, { type: 'placePump', x: 0, y: 0 }).state;
    const forecast = previewCubePhase(placed).flows;
    expect(pumped(forecast)).toEqual(['1 from 1,0']);
    const ended = endShift(placed);
    expect(pumped(ended.events)).toEqual(['1 from 1,0']);
    expect(waterOn(ended.state, 1, 0)).toBe(0);
    // The pump stays, and nothing hurt the crew.
    expect(structureOnSquare(ended.state, 0, 0)).toBe(STRUCTURES.pump.code);
    expect(ended.state.crew.health).toBe(CREW.startHealth);
  });

  it('squaresWithinSteps lists a range nearest first and leaves out what is off the map', () => {
    const near = squaresWithinSteps(3, 3, 0, 0, 2);
    expect(near.map((square) => `${square.x},${square.y}:${square.steps}`)).toEqual([
      '0,0:0',
      '1,0:1',
      '0,1:1',
      '2,0:2',
      '1,1:2',
      '0,2:2',
    ]);
    // In the open, a range of 2 is 13 squares.
    expect(squaresWithinSteps(9, 9, 4, 4, 2)).toHaveLength(13);
  });
});

describe('what destroys a placed pump (design doc 6.1 and 6.4)', () => {
  it('mining its square takes the pump with the block; it is lost', () => {
    const state = pit(['11'], {
      structures: [{ pos: { x: 0, y: 0, z: 1 }, structure: 'pump' }],
    });
    const { state: after, events } = act(state, { type: 'mine', x: 0, y: 0 });
    expect(events[0]).toEqual({
      type: 'structureDestroyed',
      pos: { x: 0, y: 0, z: 1 },
      structure: STRUCTURES.pump.code,
      cause: 'mined',
    });
    expect(structureOnSquare(after, 0, 0)).toBe(0);
    expect(countItem(after, 'pump')).toBe(0);
  });

  it('a block that slumps from its square carries it off', () => {
    // x 0 stands 2 levels above x 1 (steep) and its crack is due.
    const state = pit(['02'], {
      structures: [{ pos: { x: 0, y: 0, z: 0 }, structure: 'pump' }],
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
    });
    const { state: after, events } = endShift(state);
    expect(ofType(events, 'structureDestroyed')).toEqual([
      {
        type: 'structureDestroyed',
        pos: { x: 0, y: 0, z: 0 },
        structure: STRUCTURES.pump.code,
        cause: 'rockfall',
      },
    ]);
    expect(depthText(after)).toEqual(['11']);
    expect(structureOnSquare(after, 0, 0)).toBe(0);
  });

  it('a block that slumps onto its square buries it', () => {
    const state = pit(['02'], {
      structures: [{ pos: { x: 1, y: 0, z: 2 }, structure: 'pump' }],
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
    });
    const { state: after, events } = endShift(state);
    expect(ofType(events, 'structureDestroyed')).toEqual([
      {
        type: 'structureDestroyed',
        pos: { x: 1, y: 0, z: 2 },
        structure: STRUCTURES.pump.code,
        cause: 'rockfall',
      },
    ]);
    expect(structureOnSquare(after, 1, 0)).toBe(0);
    expect(structureAt(after, { x: 1, y: 0, z: 2 })).toBe(0);
  });

  it('lava on its square destroys it', () => {
    const state = pit(['22'], {
      structures: [{ pos: { x: 0, y: 0, z: 2 }, structure: 'pump' }],
    });
    setLavaOn(state, 0, 0, 1, false);
    const { state: after, events } = endShift(state);
    expect(ofType(events, 'structureDestroyed')).toEqual([
      {
        type: 'structureDestroyed',
        pos: { x: 0, y: 0, z: 2 },
        structure: STRUCTURES.pump.code,
        cause: 'lava',
      },
    ]);
    expect(structureOnSquare(after, 0, 0)).toBe(0);
  });

  it('water leaves it alone', () => {
    // 4 units is more than the pump takes in a shift: the square stays flooded.
    const state = pit(['4'], { structures: [{ pos: { x: 0, y: 0, z: 4 }, structure: 'pump' }] });
    setWaterOn(state, 0, 0, 4);
    const { state: after, events } = endShift(state);
    expect(ofType(events, 'structureDestroyed')).toEqual([]);
    expect(waterOn(after, 0, 0)).toBe(1);
    expect(structureOnSquare(after, 0, 0)).toBe(STRUCTURES.pump.code);
  });
});

// ---------------------------------------------------------------------------
// Sealant
// ---------------------------------------------------------------------------

describe('sealant (design doc 4.1 and 7.2: a block of sealed rock on a square)', () => {
  it('raises the square by 1 with sealed rock, uses 1 sealant, costs 1 AP, makes it worked', () => {
    const state = pit(['121'], { stockpile: { sealant: 2 } });
    const { state: after, events } = act(state, { type: 'seal', x: 1, y: 0 });
    expect(depthText(after)).toEqual(['111']);
    expect(blockAt(after, { x: 1, y: 0, z: 1 })).toBe(BLOCKS.sealed.code);
    expect(countItem(after, 'sealant')).toBe(1);
    expect(after.ap).toBe(state.ap - ACTION_COSTS.seal);
    expect(events).toEqual([{ type: 'cellSealed', pos: { x: 1, y: 0, z: 1 } }]);
    expect(isWorked(after, 1, 0)).toBe(true);
    // The new top is known, like any top.
    expect(knownSquare(after, 1, 0).top?.block).toBe(BLOCKS.sealed.code);
  });

  it('destroys the water, lava and gas standing on the square', () => {
    const state = pit(['131'], { stockpile: { sealant: 1 } });
    setWaterOn(state, 1, 0, 2);
    setLavaOn(state, 1, 0, 1, false);
    setGas(state, { x: 1, y: 0, z: 2 }, 4);
    const { state: after, events } = act(state, { type: 'seal', x: 1, y: 0 });
    const cell = { x: 1, y: 0, z: 2 };
    expect(events).toEqual([
      { type: 'fluidRemoved', fluid: 'water', pos: cell, units: 2, reason: 'sealed' },
      { type: 'fluidRemoved', fluid: 'lava', pos: cell, units: 1, reason: 'sealed' },
      { type: 'gasRemoved', pos: cell, units: 4, reason: 'sealed' },
      { type: 'cellSealed', pos: cell },
    ]);
    expect(contentsOn(after, 1, 0)).toEqual({ water: 0, lava: 0, lavaSource: false, gas: 0 });
    expect(depthAt(after, 1, 0)).toBe(2);
  });

  it('plugs a lava source: lava does not stop the seal, and the source stops (design doc 6.2)', () => {
    const state = pit(['121'], { stockpile: { sealant: 1 }, shift: LAVA_SHIFT });
    setLavaOn(state, 1, 0, 1, true);
    expect(isLavaSourceOn(state, 1, 0)).toBe(true);
    expect(sealCheck(state, 1, 0).allowed).toBe(true);
    const sealed = act(state, { type: 'seal', x: 1, y: 0 }).state;
    expect(isLavaSourceOn(sealed, 1, 0)).toBe(false);
    expect(lavaOn(sealed, 1, 0)).toBe(0);
    // This is a lava step: an unsealed source would pour.
    const ended = endShift(sealed);
    expect(ofType(ended.events, 'lavaPoured')).toEqual([]);
    expect(ofType(endShift(state).events, 'lavaPoured')).toHaveLength(1);
    // The square can be mined again: the lava is gone.
    expect(mineCheck(ended.state, 1, 0).refusal).not.toBe('lava');
  });

  it('is a dam: water that would spill onto the square stays behind it', () => {
    // 2 units on x 0 stand 2 levels above the dry floor of x 1, so 1 would flow.
    const open = pit(['3333'], { stockpile: { sealant: 1 } });
    setWaterOn(open, 0, 0, 2);
    expect(waterMap(endShift(open).state)).toEqual(['1100']);
    // With x 1 raised by 1 the drop is only 1: the water stays.
    const dammed = act(open, { type: 'seal', x: 1, y: 0 }).state;
    expect(depthText(dammed)).toEqual(['3233']);
    expect(waterMap(endShift(dammed).state)).toEqual(['2000']);
  });

  it('is not used at ground level, which also covers every tree', () => {
    const state = buildState({
      layers: terrainLayers(['001']),
      surface: ['T..'],
      stockpile: { sealant: 1 },
    });
    expect(sealCheck(state, 0, 0).refusal).toBe('groundLevel');
    expect(sealCheck(state, 1, 0).refusal).toBe('groundLevel');
    expect(sealCheck(state, 2, 0).allowed).toBe(true);
    expect(findActions(state, { type: 'seal' })).toEqual([{ type: 'seal', x: 2, y: 0, ap: 1 }]);
  });

  it('is refused without sealant, on a camp square and on a square that holds a structure', () => {
    expect(sealCheck(pit(['1']), 0, 0).refusal).toBe('noSealant');
    const camped = pit(['111', '111', '111'], {
      stockpile: { sealant: 1 },
      camps: [{ pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 }],
    });
    expect(sealCheck(camped, 2, 2).refusal).toBe('camp');
    const built = pit(['11'], {
      stockpile: { sealant: 1 },
      supports: [{ x: 0, y: 0, z: 1 }],
    });
    expect(sealCheck(built, 0, 0).refusal).toBe('occupied');
    expect(sealCheck(built, 1, 0).allowed).toBe(true);
  });

  it('is refused where it would leave the square 2 levels above a neighbour', () => {
    // x 1 (depth 1) has a deeper neighbour, x 2 (depth 2).
    const state = pit(['112'], { stockpile: { sealant: 1 } });
    expect(sealCheck(state, 1, 0)).toEqual({
      allowed: false,
      refusal: 'neighbourDeeper',
      deeperNeighbours: [{ x: 2, y: 0 }],
      ap: null,
    });
    // The deeper square itself may be sealed: it ends level with x 1.
    expect(sealCheck(state, 2, 0).allowed).toBe(true);
    // So no seal ever leaves a step of more than 1 between neighbours.
    for (const action of findActions(state, { type: 'seal' })) {
      const depths = depthText(applyAction(state, action).state)[0] ?? '';
      for (let x = 0; x + 1 < depths.length; x += 1) {
        expect(Math.abs(Number(depths[x]) - Number(depths[x + 1]))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('may be used on a square with no block left: the sealed rock stands on the floor', () => {
    const state = buildState({ layers: [['#.#']], stockpile: { sealant: 1 } });
    expect(depthAt(state, 1, 0)).toBe(1); // the bottom of this 1-layer cube
    const after = act(state, { type: 'seal', x: 1, y: 0 }).state;
    expect(depthAt(after, 1, 0)).toBe(0);
    expect(blockAt(after, { x: 1, y: 0, z: 0 })).toBe(BLOCKS.sealed.code);
  });

  it('buries the old top block, and its crack with it', () => {
    const state = pit(['121'], {
      stockpile: { sealant: 1 },
      cracks: [{ pos: { x: 1, y: 0, z: 2 }, timer: 1 }],
    });
    const after = act(state, { type: 'seal', x: 1, y: 0 }).state;
    expect(crackTimerAt(after, { x: 1, y: 0, z: 2 })).toBeNull();
    expect(crackTimerAt(after, { x: 1, y: 0, z: 1 })).toBeNull();
    // The buried block was seen, so it stays known under the new top.
    expect(knownSquare(after, 1, 0).below.map((cell) => cell.z)).toEqual([2]);
  });

  it('sealed rock can be mined out again, for the cost in the data and no yield', () => {
    const state = pit(['121'], { stockpile: { sealant: 1 } });
    const sealed = act(state, { type: 'seal', x: 1, y: 0 }).state;
    expect(mineCheck(sealed, 1, 0).ap).toBe(BLOCKS.sealed.mineCost);
    const mined = act(sealed, { type: 'mine', x: 1, y: 0 });
    expect(ofType(mined.events, 'itemGained')).toEqual([]);
    expect(depthText(mined.state)).toEqual(['121']);
  });

  it('a sealed square is a worked square: lava beside it then hurts the crew', () => {
    const state = pit(['222'], { stockpile: { sealant: 1 } });
    setLavaOn(state, 0, 0, 1, false);
    const sealed = act(state, { type: 'seal', x: 1, y: 0 }).state;
    const ended = endShift(sealed);
    expect(ofType(ended.events, 'damageTaken')).toEqual([
      {
        type: 'damageTaken',
        amount: CREW.damage.lavaBeside,
        cause: 'lava',
        health: CREW.startHealth - CREW.damage.lavaBeside,
      },
    ]);
  });
});

describe('a seal that would make a square unstable (design doc 6.1; issue #107)', () => {
  it('sealing the top of a run of steps makes the sealed square itself tall', () => {
    // x 0 and x 1 are 2 deep, and the floor steps down to depth 4. Sealed,
    // x 0 is 1 deep and its slide path falls 3: more than sealed rock holds (2).
    const state = pit(['2234'], { stockpile: { sealant: 1 } });
    expect(sealCheck(state, 0, 0).allowed).toBe(true);
    expect(unstableAfterSeal(state, 0, 0)).toEqual([
      { x: 0, y: 0, reason: 'tall', foot: { x: 3, y: 0 }, fall: 3 },
    ]);
    // And it is what then happens: the sealed block cracks when the shift ends.
    const sealed = act(state, { type: 'seal', x: 0, y: 0 }).state;
    const cracked = endShift(sealed).events.filter((event) => event.type === 'blockCracked');
    expect(cracked).toEqual([
      { type: 'blockCracked', pos: { x: 0, y: 0, z: 1 }, block: BLOCKS.sealed.code, timer: 1 },
    ]);
  });

  it('a seal on a level floor, or one that keeps the fall within 2, makes nothing unstable', () => {
    expect(unstableAfterSeal(pit(['121'], { stockpile: { sealant: 1 } }), 1, 0)).toEqual([]);
    // Sealed, x 0 falls 2: sealed rock holds that.
    expect(unstableAfterSeal(pit(['223'], { stockpile: { sealant: 1 } }), 0, 0)).toEqual([]);
  });

  it('agrees with what a seal then makes unstable, on every square of a stepped pit', () => {
    const state = pit(['2234', '1223', '1123'], { stockpile: { sealant: 1 } }, [
      'dd##',
      'dd##',
      'dd##',
    ]);
    for (const action of findActions(state, { type: 'seal' })) {
      const seal = action as { x: number; y: number };
      const before = new Set(unstableSquares(state).map((square) => `${square.x},${square.y}`));
      const after = unstableSquares(applyAction(state, action).state)
        .map((square) => `${square.x},${square.y}`)
        .filter((key) => !before.has(key));
      const told = unstableAfterSeal(state, seal.x, seal.y).map(
        (square) => `${square.x},${square.y}`,
      );
      expect(told, `seal ${seal.x},${seal.y}`).toEqual(after);
    }
  });

  it('gives nothing for a square at ground level', () => {
    expect(unstableAfterSeal(pit(['012']), 0, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/** How many cells of the cube are revealed. */
function revealedCount(state: GameState): number {
  let count = 0;
  for (const flag of state.revealed) {
    count += flag;
  }
  return count;
}

/** A flat 5 x 5 cube, 6 layers of stone, with one scanner charge. */
function scanCube(options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({
    layers: terrainLayers(['00000', '00000', '00000', '00000', '00000'], undefined, 6),
    stockpile: { scannerCharge: 1 },
    ...options,
  });
}

describe('the scanner (design doc 7.2; owner question 93)', () => {
  it('has the numbers of the design doc: 2 AP, 1 charge, 3 x 3 squares, 3 blocks down', () => {
    expect(ACTION_COSTS.scan).toBe(2);
    expect(CAMP_TOOLS.scanChargesPerScan).toBe(1);
    expect(CAMP_TOOLS.scanHalfWidth).toBe(1);
    expect(CAMP_TOOLS.scanDepth).toBe(3);
  });

  it('reveals the 3 blocks under each top of the 3 x 3 patch, and nothing else', () => {
    const state = scanCube();
    expect(revealedCount(state)).toBe(25); // the tops
    const { state: after, events } = act(state, { type: 'scan', x: 2, y: 2 });
    expect(revealedCount(after)).toBe(25 + 27);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const inPatch = x >= 1 && x <= 3 && y >= 1 && y <= 3;
        for (let z = 1; z < 6; z += 1) {
          expect(isRevealed(after, { x, y, z }), `(${x}, ${y}, ${z})`).toBe(inPatch && z <= 3);
        }
      }
    }
    expect(countItem(after, 'scannerCharge')).toBe(0);
    expect(after.ap).toBe(state.ap - ACTION_COSTS.scan);
    // The events: the scan, then one reveal for each new cell, top layer first.
    expect(events[0]).toEqual({ type: 'scanned', x: 2, y: 2, cells: 27 });
    const reveals = ofType(events, 'blockRevealed');
    expect(reveals).toHaveLength(27);
    expect(reveals[0]).toEqual({
      type: 'blockRevealed',
      pos: { x: 1, y: 1, z: 1 },
      block: BLOCKS.stone.code,
    });
    expect(events).toHaveLength(28);
  });

  it('does not make a square worked (design doc 5.2 does not list it)', () => {
    const after = act(scanCube(), { type: 'scan', x: 2, y: 2 }).state;
    expect(after.worked.every((flag) => flag === 0)).toBe(true);
  });

  it('may be aimed at any square; the part of the patch off the map is left out', () => {
    const state = scanCube();
    expect(findActions(state, { type: 'scan' })).toHaveLength(25);
    const after = act(state, { type: 'scan', x: 0, y: 0 }).state;
    // 4 squares of the patch are on the map: 12 cells.
    expect(revealedCount(after)).toBe(25 + 12);
  });

  it("counts the 3 blocks from each square's own top, and stops at the bottom of the cube", () => {
    // The middle square is 2 deep; the cube has 6 layers (z 0 to 5).
    const state = buildState({
      layers: terrainLayers(['111', '121', '111'], undefined, 6),
      stockpile: { scannerCharge: 1 },
    });
    expect(scanCells(state, 1, 1).filter((cell) => cell.x === 1 && cell.y === 1)).toEqual([
      { x: 1, y: 1, z: 3 },
      { x: 1, y: 1, z: 4 },
      { x: 1, y: 1, z: 5 },
    ]);
    expect(scanCells(state, 1, 1).filter((cell) => cell.x === 0 && cell.y === 0)).toEqual([
      { x: 0, y: 0, z: 2 },
      { x: 0, y: 0, z: 3 },
      { x: 0, y: 0, z: 4 },
    ]);
    // A shallow cube: only 2 layers lie under the tops.
    const shallow = buildState({
      layers: terrainLayers(['000', '000', '000'], undefined, 3),
      stockpile: { scannerCharge: 1 },
    });
    expect(scanCells(shallow, 1, 1)).toHaveLength(18);
  });

  it('under a tree it shows layers 1 to 3; the layer-0 block stays hidden until the tree is cut', () => {
    const state = scanCube({ surface: ['.....', '.....', '..T..', '.....', '.....'] });
    expect(isRevealed(state, { x: 2, y: 2, z: 0 })).toBe(false);
    const after = act(state, { type: 'scan', x: 2, y: 2 }).state;
    expect(isRevealed(after, { x: 2, y: 2, z: 0 })).toBe(false);
    expect(knownSquare(after, 2, 2).top).toBeNull();
    expect(knownSquare(after, 2, 2).below.map((cell) => cell.z)).toEqual([1, 2, 3]);
  });

  it('needs a charge, and uses one even when it shows nothing new', () => {
    expect(scanCheck(scanCube({ stockpile: {} }), 2, 2)).toEqual({
      allowed: false,
      refusal: 'noCharge',
      ap: null,
    });
    expect(findActions(scanCube({ stockpile: {} }), { type: 'scan' })).toEqual([]);
    const state = scanCube({ stockpile: { scannerCharge: 2 } });
    const once = act(state, { type: 'scan', x: 2, y: 2 }).state;
    const twice = act(once, { type: 'scan', x: 2, y: 2 });
    expect(twice.events).toEqual([{ type: 'scanned', x: 2, y: 2, cells: 0 }]);
    expect(countItem(twice.state, 'scannerCharge')).toBe(0);
    expect(() => scanCheck(state, 5, 0)).toThrow('not a square');
  });
});

describe('what a scan shows (design doc 3.4, 3.7 and 7.2)', () => {
  // Under the middle top: iron ore, then a 1-cell water pocket, then stone.
  // Under (0, 1): an empty cavern cell in layer 1.
  function prospect(): GameState {
    const state = buildState({
      layers: [
        ['###', '###', '###'],
        ['###', '.i#', '###'],
        ['###', '#.#', '###'],
        ['###', '###', '###'],
        ['###', '###', '###'],
      ],
      water: [{ x: 1, y: 1, z: 2 }],
      stockpile: { scannerCharge: 1 },
    });
    return state;
  }

  it('knownSquare lists the known cells under the top, from the highest down', () => {
    const before = prospect();
    expect(knownSquare(before, 1, 1).below).toEqual([]);
    const after = act(before, { type: 'scan', x: 1, y: 1 }).state;
    const below = knownSquare(after, 1, 1).below;
    expect(below.map((cell) => cell.z)).toEqual([1, 2, 3]);
    expect(below[0]?.cell.block).toBe(BLOCKS.ironOre.code);
    // The pocket: open space with 1 unit of water in it.
    expect(below[1]?.cell.block).toBe(BLOCKS.air.code);
    expect(below[1]?.cell.water).toBe(1);
    expect(below[2]?.cell.block).toBe(BLOCKS.stone.code);
    // The cavern cell under (0, 1).
    const cavern = knownSquare(after, 0, 1).below[0];
    expect(cavern?.cell.block).toBe(BLOCKS.air.code);
    expect(cavern?.cell.water).toBe(0);
  });

  it('tells show on scanned blocks: damp stone beside the pocket, mineral traces beside the ore', () => {
    const scanned = act(prospect(), { type: 'scan', x: 1, y: 1 });
    // (1, 1, 3) is the stone directly under the water pocket.
    const underPocket = knownSquare(scanned.state, 1, 1).below[2];
    expect(underPocket?.tells.dampStone).toBe(true);
    // (2, 1, 1) is stone beside the iron ore: it carries traces, and the
    // scan notes them.
    const besideOre = knownSquare(scanned.state, 2, 1).below[0];
    expect(besideOre?.traces).toBe(true);
    expect(scanned.events).toContainEqual({ type: 'mineralTracesSeen', pos: { x: 2, y: 1, z: 1 } });
    // Open space carries no tell.
    expect(knownSquare(scanned.state, 1, 1).below[1]?.tells.dampStone).toBe(false);
  });

  it('what was scanned stays known as the square is mined down', () => {
    const scanned = act(prospect(), { type: 'scan', x: 1, y: 1 }).state;
    const mined = act(scanned, { type: 'mine', x: 2, y: 2 }).state;
    expect(knownSquare(mined, 2, 2).depth).toBe(1);
    expect(knownSquare(mined, 2, 2).below.map((cell) => cell.z)).toEqual([2, 3]);
    // Layer 4 was never scanned.
    expect(isRevealed(mined, { x: 2, y: 2, z: 4 })).toBe(false);
  });

  it('the forecast knows a scanned block and still takes an unscanned one for plain rock', () => {
    const scanned = act(prospect(), { type: 'scan', x: 1, y: 1 }).state;
    const known = knownCube(scanned);
    expect(blockAt(known, { x: 1, y: 1, z: 1 })).toBe(BLOCKS.ironOre.code);
    expect(blockAt(known, { x: 1, y: 1, z: 2 })).toBe(BLOCKS.air.code);
    // Before the scan the same cells were taken to be stone.
    expect(blockAt(knownCube(prospect()), { x: 1, y: 1, z: 1 })).toBe(BLOCKS.stone.code);
    expect(blockAt(knownCube(prospect()), { x: 1, y: 1, z: 2 })).toBe(BLOCKS.stone.code);
  });

  it('only the scanned cells become known: a difference anywhere else still shows nowhere', () => {
    // Two cubes that differ in layer 4 (below the scan) and outside the patch.
    function cube(deep: string, far: string): GameState {
      return buildState({
        layers: [
          ['#####', '#####', '#####'],
          [`####${far}`, '#####', '#####'],
          ['#####', '#####', '#####'],
          ['#####', '#####', '#####'],
          ['#####', `#${deep}###`, '#####'],
          ['#####', '#####', '#####'],
        ],
        stockpile: { scannerCharge: 1 },
      });
    }
    /** Everything `knownSquare` says of every square, as one string. */
    function seen(state: GameState): string {
      const squares = [];
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          squares.push(knownSquare(state, x, y));
        }
      }
      return JSON.stringify(squares);
    }
    // (No ore among the differences: ore near a known block shows traces.)
    const one = act(cube('#', '#'), { type: 'scan', x: 1, y: 1 });
    const two = act(cube('H', 'd'), { type: 'scan', x: 1, y: 1 });
    expect(seen(two.state)).toBe(seen(one.state));
    expect(two.events).toEqual(one.events);
    expect(legalActions(two.state)).toEqual(legalActions(one.state));
    // A difference inside the scanned cells does show: the scan has teeth.
    const three = buildState({
      layers: [
        ['#####', '#####', '#####'],
        ['#####', '#H###', '#####'],
        ['#####', '#####', '#####'],
        ['#####', '#####', '#####'],
        ['#####', '#####', '#####'],
        ['#####', '#####', '#####'],
      ],
      stockpile: { scannerCharge: 1 },
    });
    expect(seen(act(three, { type: 'scan', x: 1, y: 1 }).state)).not.toBe(seen(one.state));
  });
});

// ---------------------------------------------------------------------------
// Drill
// ---------------------------------------------------------------------------

describe('the drill (design doc 3.5 and 7.2: hard rock costs 2 AP)', () => {
  const HARD_ROCK_AP = BLOCKS.hardRock.mineCost ?? 0;
  const DRILLED_AP = BLOCKS.hardRock.mineCostWithDrill ?? 0;

  it('has the numbers of the design doc', () => {
    expect(HARD_ROCK_AP).toBe(3);
    expect(DRILLED_AP).toBe(2);
  });

  it('hard rock costs 2 with a drill in the stockpile and 3 without', () => {
    const without = pit(['00'], {}, ['H#']);
    expect(mineCheck(without, 0, 0)).toMatchObject({ ap: HARD_ROCK_AP, drillSaving: 0 });
    const withDrill = pit(['00'], { stockpile: { drill: 1 } }, ['H#']);
    expect(mineCheck(withDrill, 0, 0)).toMatchObject({ ap: DRILLED_AP, drillSaving: 1 });
    expect(findActions(withDrill, { type: 'mine', x: 0, y: 0 })).toEqual([
      { type: 'mine', x: 0, y: 0, ap: DRILLED_AP },
    ]);
  });

  it('makes no difference to any other block', () => {
    const withDrill = pit(['00'], { stockpile: { drill: 1 } }, ['H#']);
    expect(mineCheck(withDrill, 1, 0)).toMatchObject({ ap: BLOCKS.stone.mineCost, drillSaving: 0 });
  });

  it('is not used up by mining', () => {
    const state = pit(['00'], { stockpile: { drill: 1 } }, ['H#']);
    const after = act(state, { type: 'mine', x: 0, y: 0 }).state;
    expect(countItem(after, 'drill')).toBe(1);
    expect(after.ap).toBe(state.ap - DRILLED_AP);
  });

  it('the camp discount and the flooded surcharge apply to the drilled cost', () => {
    // A camp on x 0-2; the hard rock on x 3 is 1 step from it.
    const state = pit(
      ['1111', '1111', '1111'],
      { stockpile: { drill: 1 }, camps: [{ pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 }] },
      ['###H', '###H', '###H'],
    );
    expect(mineCheck(state, 3, 1)).toMatchObject({ ap: 1, campDiscount: 1, drillSaving: 1 });
    setWaterOn(state, 3, 1, 1);
    expect(mineCheck(state, 3, 1)).toMatchObject({
      ap: 1 + HAZARDS.water.floodedMineExtraAp,
      campDiscount: 1,
      drillSaving: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Checking one action directly (issue #88 item 6)
// ---------------------------------------------------------------------------

describe('isLegalAction: one action checked without building the list', () => {
  // A small pit with something of everything: a tree, a camp site, a dug
  // square, and every tool in the stockpile.
  function busy(): GameState {
    return buildState({
      layers: terrainLayers(['00000', '00000', '00000', '00011'], undefined, 5),
      surface: ['....T', '.....', '.....', '.....'],
      stockpile: {
        support: 1,
        pump: 1,
        sealant: 1,
        scannerCharge: 1,
        campKit: 1,
        coal: 1,
        timber: 1,
        stone: 1,
      },
    });
  }

  it('says yes to every action of the list, and applyAction takes each', () => {
    const state = busy();
    const legal = legalActions(state);
    const kinds = new Set(legal.map((action) => action.type));
    for (const kind of ['mine', 'cutTree', 'placeSupport', 'placePump', 'seal', 'scan']) {
      expect(kinds.has(kind as Action['type']), kind).toBe(true);
    }
    expect(kinds.has('foundCamp')).toBe(true);
    expect(kinds.has('craft')).toBe(true);
    for (const action of legal) {
      expect(isLegalAction(state, action), actionKey(action)).toBe(true);
      expect(() => applyAction(state, action), actionKey(action)).not.toThrow();
    }
  });

  it('says no to an action with a wrong cost, a wrong square or too little AP', () => {
    const state = busy();
    for (const action of legalActions(state)) {
      const dearer = { ...action, ap: action.ap + 1 };
      expect(isLegalAction(state, dearer), actionKey(dearer)).toBe(false);
      expect(() => applyAction(state, dearer)).toThrow('Not a legal action');
    }
    // Squares the cube does not have are refused, not thrown at.
    const offMap: Action[] = [
      { type: 'mine', x: 5, y: 0, ap: 2 },
      { type: 'cutTree', x: -1, y: 0, ap: 2 },
      { type: 'placeSupport', x: 0, y: 9, ap: 1 },
      { type: 'placePump', x: 5, y: 4, ap: 1 },
      { type: 'seal', x: 0.5, y: 0, ap: 1 },
      { type: 'scan', x: 0, y: -1, ap: 2 },
    ];
    for (const action of offMap) {
      expect(isLegalAction(state, action), actionKey(action)).toBe(false);
    }
    // Not at ground level; no tree there; no vent is held.
    expect(isLegalAction(state, { type: 'seal', x: 1, y: 1, ap: 1 })).toBe(false);
    expect(isLegalAction(state, { type: 'cutTree', x: 1, y: 1, ap: 2 })).toBe(false);
    expect(isLegalAction(state, { type: 'placeVent', x: 1, y: 1, ap: 1 })).toBe(false);
    // With 1 AP left a scan (2 AP) is not legal, though the charge is there.
    const tired = { ...state, ap: 1 };
    expect(isLegalAction(tired, { type: 'scan', x: 1, y: 1, ap: 2 })).toBe(false);
    expect(isLegalAction(tired, { type: 'placePump', x: 1, y: 1, ap: 1 })).toBe(true);
  });

  it('says no to everything once the run has ended', () => {
    const state = busy();
    const legal = legalActions(state);
    state.status = { kind: 'ended', outcome: 'salvage', cause: 'mineClosed' };
    for (const action of legal) {
      expect(isLegalAction(state, action)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// A fixed scenario, pinned by its hash
// ---------------------------------------------------------------------------

describe('a generated run that uses a camp-made tool', () => {
  // No recorded golden run reaches a camp tool: the policies never craft one.
  // This plays seed 1 by hand instead: found a camp, mine stone and coal
  // near it, craft sealant, seal the dug square. The hash pins the result.
  it('seed 1: camp, sealant, seal; the final state has the recorded hash', () => {
    let state = createRun(1, 'none', 'standard');
    const steps: (object | 'endShift')[] = [
      { type: 'foundCamp', x: 17, y: 12 },
      'endShift',
      { type: 'mine', x: 16, y: 10 },
      { type: 'mine', x: 14, y: 15 },
      { type: 'craft', recipe: 'sealant' },
      { type: 'seal', x: 16, y: 10 },
      'endShift',
    ];
    for (const step of steps) {
      state = step === 'endShift' ? endShift(state).state : act(state, step).state;
    }
    expect(depthAt(state, 16, 10)).toBe(0);
    expect(blockAt(state, { x: 16, y: 10, z: 0 })).toBe(BLOCKS.sealed.code);
    expect(countItem(state, 'sealant')).toBe(0);
    expect(hashState(state)).toBe('94b77867c729415f');
  });
});
