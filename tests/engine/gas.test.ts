// Gas on squares, and ignition (design doc v0.2 sections 5.2 and 6.5; owner
// questions 64 and 94; issue #103, task T11; decision note 0034). One group
// of tests for each rule, each on a small hand-built pit. Charges and
// unstable ore are in explosions.test.ts.
//
// A pit is drawn as a grid of depths, one digit per square, row y = 0 first:
//
//   pit(['111', '121', '111'])   a 3 x 3 pit 1 level deep, 2 in the middle

import { describe, expect, it } from 'vitest';
import { BLOCKS, CREW, HAZARDS, STRUCTURES } from '../../src/data';
import { depthAt, endShift, hashState, knownSquare, previewCubePhase } from '../../src/engine';
import type { GameEvent, GameState, Square } from '../../src/engine';
import { stepFluids } from '../../src/engine/cube/fluids';
import { stepGas } from '../../src/engine/cube/gas';
import { newCubePhase } from '../../src/engine/cube/phase';
import type { CubePhase } from '../../src/engine/cube/phase';
import { markWorked } from '../../src/engine/crew';
import { createRng, nextInt } from '../../src/engine/rng';
import { gasOn, lavaOn, setGasOn, setLavaOn, setWaterOn, waterOn } from '../../src/engine/standing';
import { blockAt, gasAt, setBlock, setGas, structureAt } from '../../src/engine/state';
import { act, buildState, depthText, terrainLayers } from './helpers';
import type { BuildStateOptions } from './helpers';

/** A shift in which lava does not flow: these tests are about gas. */
const NO_LAVA_SHIFT = 3;

/** Build a pit from a grid of depths: stone, two layers deeper than its deepest square. */
function pit(
  depths: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
  layerCount?: number,
): GameState {
  return buildState({
    layers: terrainLayers(depths, undefined, layerCount),
    shift: NO_LAVA_SHIFT,
    ...options,
  });
}

/** The gas on every square, as rows of numbers joined by spaces: "0 3 3". */
function gasMap(state: GameState): string[] {
  const rows: string[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < state.size.x; x += 1) {
      row.push(gasOn(state, x, y));
    }
    rows.push(row.join(' '));
  }
  return rows;
}

/** All the gas standing on the squares of `state`. */
function totalGas(state: GameState): number {
  let sum = 0;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      sum += gasOn(state, x, y);
    }
  }
  return sum;
}

/** The squares that have gas on them, as "x,y" strings, row by row. */
function gassySquares(state: GameState): string[] {
  const out: string[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      if (gasOn(state, x, y) > 0) {
        out.push(`${x},${y}`);
      }
    }
  }
  return out;
}

/** Run step (c) on `state` (in place) and return its events and notes. */
function runStep(state: GameState): { events: GameEvent[]; phase: CubePhase } {
  const events: GameEvent[] = [];
  const phase = newCubePhase();
  stepGas(state, events, phase);
  return { events, phase };
}

/** The gifts of gas in `events`, as "x,y>x,y:units" strings in order. */
function gifts(events: GameEvent[]): string[] {
  const out: string[] = [];
  for (const event of events) {
    if (event.type === 'gasMoved') {
      out.push(`${event.from.x},${event.from.y}>${event.to.x},${event.to.y}:${event.units}`);
    }
  }
  return out;
}

/** The squares of each explosion in `events`, as "kind: x,y x,y" strings in order. */
function explosions(events: GameEvent[]): string[] {
  const out: string[] = [];
  for (const event of events) {
    if (event.type === 'exploded') {
      out.push(`${event.kind}: ${event.cells.map((cell) => `${cell.x},${cell.y}`).join(' ')}`);
    }
  }
  return out;
}

/** The units of gas the events say are gone, for one reason. */
function gasGone(events: GameEvent[], reason: string): number {
  let units = 0;
  for (const event of events) {
    if (event.type === 'gasRemoved' && event.reason === reason) {
      units += event.units;
    }
  }
  return units;
}

describe('gas standing on a square (standing.ts)', () => {
  it('is written in the cell directly above the top block, and read back', () => {
    const state = pit(['12']);
    setGasOn(state, 1, 0, 7);
    expect(gasOn(state, 1, 0)).toBe(7);
    expect(gasAt(state, { x: 1, y: 0, z: 1 })).toBe(7);
    expect(gasAt(state, { x: 1, y: 0, z: 0 })).toBe(0);
    expect(knownSquare(state, 1, 0).contents.gas).toBe(7);
  });

  it('gathers gas that was spread over several cells into one', () => {
    const state = pit(['3']);
    setGas(state, { x: 0, y: 0, z: 0 }, 2);
    setGas(state, { x: 0, y: 0, z: 2 }, 3);
    expect(gasOn(state, 0, 0)).toBe(5);
    setGasOn(state, 0, 0, 5);
    expect(gasAt(state, { x: 0, y: 0, z: 0 })).toBe(0);
    expect(gasAt(state, { x: 0, y: 0, z: 2 })).toBe(5);
  });

  it('no gas can be put on a square at ground level', () => {
    const state = pit(['01']);
    expect(() => setGasOn(state, 0, 0, 1)).toThrow(/ground level/);
    setGasOn(state, 0, 0, 0); // taking it all away is fine
    expect(gasOn(state, 0, 0)).toBe(0);
  });
});

describe('gas spreads to neighbours that are no higher (design doc 6.5)', () => {
  it('no gas and nothing armed: the step does nothing', () => {
    const state = pit(['111', '121', '111']);
    const before = hashState(state);
    expect(runStep(state).events).toEqual([]);
    expect(hashState(state)).toBe(before);
  });

  it('gives an even share to each neighbour and keeps the rest', () => {
    // 9 units, two neighbours at the same depth: 9 / 3 = 3 each, 3 kept.
    const state = pit(['222']);
    setGasOn(state, 1, 0, 9);
    const { events } = runStep(state);
    expect(gasMap(state)).toEqual(['3 3 3']);
    // North and south are off the map; east comes before west.
    expect(gifts(events)).toEqual(['1,0>2,0:3', '1,0>0,0:3']);
  });

  it('keeps what does not divide evenly', () => {
    // 11 units, two neighbours: floor(11 / 3) = 3 each, and 5 stay.
    const state = pit(['222']);
    setGasOn(state, 1, 0, 11);
    runStep(state);
    expect(gasMap(state)).toEqual(['3 5 3']);
  });

  it('events name the cells directly above the two top blocks', () => {
    const state = pit(['12']);
    setGasOn(state, 0, 0, 4);
    const { events } = runStep(state);
    expect(events).toEqual([
      { type: 'gasMoved', from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 1 }, units: 2 },
    ]);
  });

  it('thin gas stays: fewer units than neighbours plus one gives nothing', () => {
    // The middle of a flat floor has 4 neighbours: 4 units / 5 is 0.
    const state = pit(['111', '111', '111']);
    setGasOn(state, 1, 1, 4);
    expect(runStep(state).events).toEqual([]);
    expect(gasMap(state)).toEqual(['0 0 0', '0 4 0', '0 0 0']);
    // 5 units is just enough: 1 each way, 1 kept.
    setGasOn(state, 1, 1, 5);
    runStep(state);
    expect(gasMap(state)).toEqual(['0 1 0', '1 1 1', '0 1 0']);
  });

  it('never climbs: a higher neighbour gets nothing', () => {
    // The middle square is the deepest: every neighbour is higher.
    const state = pit(['111', '121', '111']);
    setGasOn(state, 1, 1, 40);
    expect(runStep(state).events).toEqual([]);
    expect(gasOn(state, 1, 1)).toBe(40);
  });

  it('runs down into a deeper neighbour', () => {
    const state = pit(['123']);
    setGasOn(state, 0, 0, 8);
    runStep(state);
    expect(gasMap(state)).toEqual(['4 4 0']);
    runStep(state);
    // (0,0) has one neighbour that is no higher; (1,0) has one too: (2,0).
    expect(gasMap(state)).toEqual(['2 4 2']);
  });

  it('never spreads onto a square at ground level', () => {
    const state = pit(['011']);
    setGasOn(state, 1, 0, 6);
    runStep(state);
    expect(gasMap(state)).toEqual(['0 3 3']);
  });

  it('every gift is worked out from the gas at the start of the step', () => {
    // (0,0) gives 3 to (1,0). (1,0) had none when the step began, so it
    // passes nothing on in the same cube phase.
    const state = pit(['111']);
    setGasOn(state, 0, 0, 6);
    runStep(state);
    expect(gasMap(state)).toEqual(['3 3 0']);
  });

  it('two squares give to each other in one step; the event says the difference', () => {
    const state = pit(['11']);
    setGasOn(state, 0, 0, 6);
    setGasOn(state, 1, 0, 2);
    const { events } = runStep(state);
    // 6 / 2 = 3 goes east and 2 / 2 = 1 goes west: 2 east in all.
    expect(gifts(events)).toEqual(['0,0>1,0:2']);
    expect(gasMap(state)).toEqual(['4 4']);
    // Now the two gifts are equal: nothing changes and nothing is said.
    expect(runStep(state).events).toEqual([]);
    expect(gasMap(state)).toEqual(['4 4']);
  });

  it('a gassy square never gives away its last unit: it keeps at least half', () => {
    // 1 unit and one neighbour: floor(1 / 2) = 0. 3 units: 1 goes, 2 stay.
    const state = pit(['11']);
    setGasOn(state, 0, 0, 1);
    expect(runStep(state).events).toEqual([]);
    setGasOn(state, 0, 0, 3);
    runStep(state);
    expect(gasMap(state)).toEqual(['2 1']);
  });

  it('spreads over a pit floor, then covers the same squares for good', () => {
    const state = pit(['11111', '12221', '12221', '12221', '11111']);
    setGasOn(state, 2, 2, 24);
    for (let n = 0; n < 30; n += 1) {
      runStep(state);
    }
    const covered = gassySquares(state);
    // All of it is still there, all of it on the floor, on every floor square.
    expect(totalGas(state)).toBe(24);
    expect(covered).toHaveLength(9);
    for (const row of [0, 4]) {
      expect(gasMap(state)[row]).toBe('0 0 0 0 0');
    }
    // The units go on shifting between equal neighbours (2 and 1 swap, and
    // so on), but which squares are gassy no longer changes.
    for (let n = 0; n < 20; n += 1) {
      runStep(state);
      expect(gassySquares(state)).toEqual(covered);
    }
    expect(totalGas(state)).toBe(24);
  });

  it('does not mind water: gas may share a square with it', () => {
    const state = pit(['22']);
    setGasOn(state, 0, 0, 4);
    setWaterOn(state, 1, 0, 1);
    runStep(state);
    expect(gasMap(state)).toEqual(['2 2']);
    expect(waterOn(state, 1, 0)).toBe(1);
  });

  it('a square never holds more than one byte of gas; what does not fit stays', () => {
    const state = pit(['111', '121', '111']);
    for (const [x, y] of [
      [1, 0],
      [2, 1],
      [1, 2],
      [0, 1],
    ] as const) {
      setGasOn(state, x, y, 250);
    }
    setGasOn(state, 1, 1, 250);
    runStep(state);
    expect(gasOn(state, 1, 1)).toBe(255);
    expect(totalGas(state)).toBe(5 * 250);
  });

  it('the order is fixed: the same pit always spreads the same way', () => {
    function play(): GameState {
      const state = pit(['2222', '2332', '2222']);
      setGasOn(state, 0, 0, 30);
      setGasOn(state, 3, 2, 17);
      for (let n = 0; n < 6; n += 1) {
        runStep(state);
      }
      return state;
    }
    expect(hashState(play())).toBe(hashState(play()));
  });
});

describe('gas hurts the crew on worked squares (design doc 5.2)', () => {
  it('gas on a worked square: 1', () => {
    const state = pit(['1'], { worked: [{ x: 0, y: 0 }] });
    setGasOn(state, 0, 0, 2);
    expect(runStep(state).phase.damage).toEqual([{ amount: CREW.damage.gas, cause: 'gas' }]);
  });

  it('gas on a square nobody worked, or beside a worked one: nothing', () => {
    const state = pit(['12'], { worked: [{ x: 0, y: 0 }] });
    setGasOn(state, 1, 0, 1);
    expect(runStep(state).phase.damage).toEqual([]);
  });

  it('is counted from where the gas is at the end of the step', () => {
    // The gas spreads onto the worked square in this very phase.
    const state = pit(['11'], { worked: [{ x: 1, y: 0 }] });
    setGasOn(state, 0, 0, 4);
    expect(runStep(state).phase.damage).toEqual([{ amount: CREW.damage.gas, cause: 'gas' }]);
  });

  it('gas on several worked squares still hurts once', () => {
    const state = pit(['11'], {
      worked: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    setGasOn(state, 0, 0, 1);
    setGasOn(state, 1, 0, 1);
    expect(runStep(state).phase.damage).toEqual([{ amount: CREW.damage.gas, cause: 'gas' }]);
  });

  it('through endShift: the crew loses the health, and can be poisoned', () => {
    const state = pit(['1'], { worked: [{ x: 0, y: 0 }], health: 3 });
    setGasOn(state, 0, 0, 2);
    const first = endShift(state);
    expect(first.state.crew.health).toBe(3 - CREW.damage.gas);
    expect(first.events).toContainEqual({
      type: 'damageTaken',
      amount: CREW.damage.gas,
      cause: 'gas',
      health: 3 - CREW.damage.gas,
    });

    const weak = pit(['1'], { worked: [{ x: 0, y: 0 }], health: CREW.damage.gas });
    setGasOn(weak, 0, 0, 2);
    expect(endShift(weak).state.status).toEqual({
      kind: 'ended',
      outcome: 'lost',
      cause: 'poisoned',
    });
  });
});

describe('ignition: lava lights gas (design doc 6.5)', () => {
  it('lava on the gassy square itself', () => {
    const state = pit(['2']);
    setGasOn(state, 0, 0, 5);
    setLavaOn(state, 0, 0, 1, false);
    const { events } = runStep(state);
    expect(explosions(events)).toEqual(['gas: 0,0']);
    expect(gasOn(state, 0, 0)).toBe(0);
    expect(events).toContainEqual({
      type: 'gasRemoved',
      pos: { x: 0, y: 0, z: 1 },
      units: 5,
      reason: 'burnt',
    });
  });

  it('lava on a square beside it', () => {
    // The gas square is the deepest, so the gas stays put.
    const state = pit(['12']);
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 1, 0, 3);
    expect(explosions(runStep(state).events)).toEqual(['gas: 1,0']);
    expect(totalGas(state)).toBe(0);
  });

  it('lava two squares away, or on a diagonal: nothing', () => {
    const far = pit(['112']);
    setLavaOn(far, 0, 0, 1, false);
    setGasOn(far, 2, 0, 3);
    expect(explosions(runStep(far).events)).toEqual([]);
    expect(gasOn(far, 2, 0)).toBe(3);

    const diagonal = pit(['10', '02']);
    setLavaOn(diagonal, 0, 0, 1, false);
    setGasOn(diagonal, 1, 1, 3);
    expect(explosions(runStep(diagonal).events)).toEqual([]);
  });

  it('all the connected gassy squares go off as one explosion', () => {
    // Thin gas on a row (it does not spread: 2 units, 2 or 3 to share with),
    // lava beside the west end only.
    const state = pit(['11111']);
    setLavaOn(state, 0, 0, 1, false);
    for (const x of [1, 2, 3]) {
      setGasOn(state, x, 0, 1);
    }
    const { events } = runStep(state);
    expect(explosions(events)).toEqual(['gas: 1,0 2,0 3,0']);
    expect(gasGone(events, 'burnt')).toBe(3);
    expect(totalGas(state)).toBe(0);
  });

  it('gas that is not connected to the burning patch stays', () => {
    const state = pit(['11011']);
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 1, 0, 1);
    setGasOn(state, 3, 0, 1);
    const { events } = runStep(state);
    expect(explosions(events)).toEqual(['gas: 1,0']);
    expect(gasMap(state)).toEqual(['0 0 0 1 0']);
  });

  it('gas that spreads next to lava burns in the same cube phase', () => {
    const state = pit(['1111']);
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 3, 0, 8);
    // Phase 1: 4 units move to (2,0), which is not beside the lava.
    expect(explosions(runStep(state).events)).toEqual([]);
    // Phase 2: gas reaches (1,0), beside the lava, and it all goes off.
    const { events } = runStep(state);
    expect(explosions(events)).toEqual(['gas: 1,0 2,0 3,0']);
    expect(gasGone(events, 'burnt')).toBe(8);
  });

  it('lava lights gas in every cube phase, not only when lava flows', () => {
    for (const shift of [2, 3]) {
      const state = pit(['12'], { shift });
      setLavaOn(state, 0, 0, 1, false);
      setGasOn(state, 1, 0, 3);
      expect(explosions(runStep(state).events), `shift ${shift}`).toEqual(['gas: 1,0']);
    }
  });

  it('removes no block', () => {
    const state = pit(['212']);
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 2, 0, 6);
    setGasOn(state, 1, 0, 2);
    const before = depthText(state);
    const { events } = runStep(state);
    expect(explosions(events)).toHaveLength(1);
    expect(depthText(state)).toEqual(before);
    expect(events.some((event) => event.type === 'blockDestroyed')).toBe(false);
  });
});

describe('what a gas explosion destroys (design doc 6.5 and 8)', () => {
  it('structures on the burning squares and on the squares beside them', () => {
    // Lava at (0,0); gas at (1,0). Supports on the gas square, beside it at
    // (2,0), and two away at (3,0).
    const state = pit(['2322'], {
      structures: [
        { pos: { x: 1, y: 0, z: 3 }, structure: 'pump' },
        { pos: { x: 2, y: 0, z: 2 }, structure: 'support' },
        { pos: { x: 3, y: 0, z: 2 }, structure: 'support' },
      ],
    });
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 1, 0, 3);
    const { events } = runStep(state);
    expect(structureAt(state, { x: 1, y: 0, z: 3 })).toBe(0);
    expect(structureAt(state, { x: 2, y: 0, z: 2 })).toBe(0);
    expect(structureAt(state, { x: 3, y: 0, z: 2 })).toBe(STRUCTURES.support.code);
    const destroyed = events.filter((event) => event.type === 'structureDestroyed');
    expect(destroyed).toEqual([
      {
        type: 'structureDestroyed',
        pos: { x: 1, y: 0, z: 3 },
        structure: STRUCTURES.pump.code,
        cause: 'explosion',
      },
      {
        type: 'structureDestroyed',
        pos: { x: 2, y: 0, z: 2 },
        structure: STRUCTURES.support.code,
        cause: 'explosion',
      },
    ]);
  });

  it('a camp on a burning square or beside one, and not one further away', () => {
    // A row of 9 squares, 3 deep. Camps (3 x 3) need 3 rows.
    function camped(gasX: number): { state: GameState; events: GameEvent[] } {
      const state = pit(['111111112', '111111112', '111111112'], {
        camps: [{ pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 }],
      });
      // Thin gas on one square of the middle row, lit by lava at the far end
      // through a chain of thin gas.
      setLavaOn(state, 8, 1, 1, false);
      for (let x = gasX; x <= 7; x += 1) {
        setGasOn(state, x, 1, 1);
      }
      return { state, events: runStep(state).events };
    }
    // The camp covers x 0 to 2. Gas reaching x = 3 is beside it.
    const beside = camped(3);
    expect(beside.state.camps).toEqual([]);
    expect(beside.events).toContainEqual({
      type: 'campDestroyed',
      pos: { x: 1, y: 1, z: 1 },
      cause: 'explosion',
    });
    // Gas reaching only x = 4 is two squares from the camp.
    const away = camped(4);
    expect(away.state.camps).toHaveLength(1);
  });

  it('gas that only stands on a camp square, unlit, leaves the camp alone', () => {
    const state = pit(['111', '111', '111'], {
      camps: [{ pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 }],
    });
    setGasOn(state, 1, 1, 3);
    runStep(state);
    expect(state.camps).toHaveLength(1);
  });
});

describe('a gas explosion hurts the crew: 3 (design doc 5.2; owner question 64)', () => {
  /** Gas at (2,0) lit by lava at (3,0); the crew worked the square `worked`. */
  function lit(worked: Square): CubePhase {
    const state = pit(['11121'], { worked: [worked] });
    setLavaOn(state, 3, 0, 1, false);
    setGasOn(state, 2, 0, 1);
    return runStep(state).phase;
  }

  it('on the exploding square', () => {
    expect(lit({ x: 2, y: 0 }).damage).toEqual([
      { amount: CREW.damage.gasExplosion, cause: 'gasExplosion' },
    ]);
  });

  it('beside it', () => {
    expect(lit({ x: 1, y: 0 }).damage).toEqual([
      { amount: CREW.damage.gasExplosion, cause: 'gasExplosion' },
    ]);
  });

  it('two squares away: nothing', () => {
    expect(lit({ x: 0, y: 0 }).damage).toEqual([]);
  });

  it('gas that burnt does not also poison: the explosion is what hurts', () => {
    const causes = lit({ x: 2, y: 0 }).damage.map((entry) => entry.cause);
    expect(causes).toEqual(['gasExplosion']);
  });

  it('is weaker than a charge (the owner: "less powerful than the explosive")', () => {
    expect(CREW.damage.gasExplosion).toBe(3);
    expect(CREW.damage.explosion).toBe(6);
    expect(CREW.damage.gasExplosion).toBeLessThan(CREW.damage.explosion);
  });

  it('through endShift: 3 health, and a crew at 3 is burned', () => {
    function litPit(health: number): GameState {
      const state = pit(['12'], { worked: [{ x: 1, y: 0 }], health });
      setLavaOn(state, 0, 0, 1, false);
      setGasOn(state, 1, 0, 2);
      return state;
    }
    // Lava beside the worked square takes 1 as well (step (b) comes first).
    const after = endShift(litPit(10)).state;
    expect(after.crew.health).toBe(10 - CREW.damage.lavaBeside - CREW.damage.gasExplosion);
    const lost = endShift(litPit(CREW.damage.lavaBeside + CREW.damage.gasExplosion)).state;
    expect(lost.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'burned' });
  });
});

describe('gas on a square that rises (stone from water meeting lava)', () => {
  /** Run step (b) on `state`, in place. */
  function runFluids(state: GameState): GameEvent[] {
    const events: GameEvent[] = [];
    stepFluids(state, events, newCubePhase());
    return events;
  }

  it('rises with the top: it stands on the new stone', () => {
    const state = pit(['2']);
    setWaterOn(state, 0, 0, 1);
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 0, 0, 6);
    const events = runFluids(state);
    expect(depthAt(state, 0, 0)).toBe(1);
    expect(gasOn(state, 0, 0)).toBe(6);
    expect(gasAt(state, { x: 0, y: 0, z: 1 })).toBe(0); // not inside the stone
    expect(events.some((event) => event.type === 'gasRemoved')).toBe(false);
  });

  it('blows away when the square comes up to ground level', () => {
    const state = pit(['1']);
    setWaterOn(state, 0, 0, 1);
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 0, 0, 6);
    const events = runFluids(state);
    expect(depthAt(state, 0, 0)).toBe(0);
    expect(gasAt(state, { x: 0, y: 0, z: 0 })).toBe(0);
    expect(events).toContainEqual({
      type: 'gasRemoved',
      pos: { x: 0, y: 0, z: -1 },
      units: 6,
      reason: 'reachedSurface',
    });
  });
});

describe('breaking into a gas pocket, then the cube phase (design doc 6.2 and 6.5)', () => {
  /**
   * A flat floor 1 deep, 5 x 3, with a gas pocket of 3 cells under the
   * middle square's top block: 12 units.
   */
  function overPocket(): GameState {
    const state = pit(['11111', '11111', '11111'], { ap: 10 }, 5);
    for (const cell of [
      { x: 2, y: 1, z: 2 },
      { x: 2, y: 1, z: 3 },
      { x: 3, y: 1, z: 2 },
    ]) {
      setBlock(state, cell, BLOCKS.air.code);
      setGas(state, cell, HAZARDS.gas.pocketUnitsPerCell);
    }
    return state;
  }

  it('the gas comes out on the mined square, stays in the hole, and poisons the crew there', () => {
    let state = overPocket();
    expect(knownSquare(state, 2, 1).tells.pittedRock).toBe(true);
    state = act(state, { type: 'mine', x: 2, y: 1 }).state;
    expect(gasOn(state, 2, 1)).toBe(12);

    // The mined square is now the deepest: the gas cannot climb out of it.
    const step = endShift(state);
    expect(gasOn(step.state, 2, 1)).toBe(12);
    expect(gifts(step.events)).toEqual([]);
    expect(step.state.crew.health).toBe(CREW.startHealth - CREW.damage.gas);
  });

  it('dig the floor down beside it and the gas spreads there', () => {
    let state = overPocket();
    state = act(state, { type: 'mine', x: 2, y: 1 }).state;
    state = endShift(state).state;
    state = act(state, { type: 'mine', x: 1, y: 1 }).state;
    const step = endShift(state);
    // One neighbour is no higher now: half each.
    expect(gasOn(step.state, 2, 1)).toBe(6);
    expect(gasOn(step.state, 1, 1)).toBe(6);
  });
});

describe('the forecast of gas (design doc 6 and 11)', () => {
  it('says where gas will spread and what will burn, and changes nothing', () => {
    const state = pit(['1112']);
    setGasOn(state, 0, 0, 4);
    setGasOn(state, 2, 0, 1);
    setLavaOn(state, 3, 0, 1, false);
    const before = hashState(state);
    const forecast = previewCubePhase(state);
    expect(hashState(state)).toBe(before);
    expect(gifts(forecast.gas)).toEqual(['0,0>1,0:2']);
    expect(explosions(forecast.gas)).toEqual(['gas: 2,0 1,0 0,0']);

    // And that is what then happens.
    const real: GameEvent[] = [];
    stepGas(state, real, newCubePhase());
    expect(real).toEqual(forecast.gas);
  });

  it('is empty for a pit with no gas and no charge', () => {
    expect(previewCubePhase(pit(['111', '121', '111'])).gas).toEqual([]);
  });

  it('takes the flows into account: lava that flows next to gas lights it', () => {
    // An even shift: the lava at (0,0) runs down to (1,0), beside the gas.
    const state = pit(['1332'], { shift: 2 });
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 2, 0, 1);
    const forecast = previewCubePhase(state);
    expect(lavaOn(state, 1, 0)).toBe(0);
    expect(explosions(forecast.gas)).toEqual(['gas: 2,0']);
  });

  it('does not depend on a pocket the player has not seen', () => {
    const plain = pit(['111', '121', '111'], {}, 6);
    setGasOn(plain, 1, 1, 3);
    const withPocket = pit(['111', '121', '111'], {}, 6);
    setGasOn(withPocket, 1, 1, 3);
    for (const cell of [
      { x: 1, y: 1, z: 4 },
      { x: 0, y: 1, z: 4 },
    ]) {
      setBlock(withPocket, cell, BLOCKS.air.code);
      setGas(withPocket, cell, HAZARDS.gas.pocketUnitsPerCell);
    }
    expect(previewCubePhase(withPocket)).toEqual(previewCubePhase(plain));
  });
});

describe('property: gas is conserved, apart from the named sinks', () => {
  /** A random pit with gas, some lava, some structures and some worked squares. */
  function randomPit(seed: number): GameState {
    const rng = createRng(seed);
    const size = 3 + nextInt(rng, 4); // 3 to 6 squares a side
    const rows: string[] = [];
    for (let y = 0; y < size; y += 1) {
      let row = '';
      for (let x = 0; x < size; x += 1) {
        row += String(nextInt(rng, 5)); // depth 0 to 4
      }
      rows.push(row);
    }
    const state = pit(rows, { shift: 1 + nextInt(rng, 2) });
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (depthAt(state, x, y) === 0) {
          continue;
        }
        const roll = nextInt(rng, 8);
        if (roll <= 2) {
          setGasOn(state, x, y, 1 + nextInt(rng, 40));
        } else if (roll === 3 && seed % 3 === 0) {
          setLavaOn(state, x, y, 1, false); // a third of the pits have lava
        }
        if (nextInt(rng, 4) === 0) {
          markWorked(state, x, y);
        }
      }
    }
    return state;
  }

  it('holds on 150 random pits, for 12 cube phases each', () => {
    let explosionsSeen = 0;
    let giftsSeen = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const state = randomPit(seed);
      for (let phase = 0; phase < 12; phase += 1) {
        const label = `seed ${seed}, phase ${phase}`;
        const before = totalGas(state);
        const depthsBefore = depthText(state);
        const { events } = runStep(state);

        let burnt = 0;
        for (const event of events) {
          if (event.type === 'gasRemoved') {
            // The only sink in this step is burning.
            expect(event.reason, label).toBe('burnt');
            burnt += event.units;
          } else if (event.type === 'gasMoved') {
            giftsSeen += 1;
            expect(event.units, label).toBeGreaterThan(0);
            // A gift goes to a face neighbour that is no higher.
            const step = Math.abs(event.from.x - event.to.x) + Math.abs(event.from.y - event.to.y);
            expect(step, label).toBe(1);
            expect(event.to.z, label).toBeGreaterThanOrEqual(event.from.z);
          } else if (event.type === 'exploded') {
            explosionsSeen += 1;
            expect(event.kind, label).toBe('gas');
          }
        }
        expect(totalGas(state), `${label}: gas`).toBe(before - burnt);
        // Gas moves no block.
        expect(depthText(state), label).toEqual(depthsBefore);

        for (let y = 0; y < state.size.y; y += 1) {
          for (let x = 0; x < state.size.x; x += 1) {
            const gas = gasOn(state, x, y);
            expect(gas, label).toBeLessThanOrEqual(255);
            // No gas at ground level, and none left beside lava.
            if (depthAt(state, x, y) === 0) expect(gas, label).toBe(0);
            if (gas > 0) expect(lavaOn(state, x, y), `${label}: gas on lava`).toBe(0);
          }
        }
        state.shift += 1;
      }
    }
    // The pits did exercise the rule.
    expect(giftsSeen).toBeGreaterThan(100);
    expect(explosionsSeen).toBeGreaterThan(10);
  });

  it('with no lava and no charge: gassy squares stay gassy, and the gas stops reaching new ones', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      if (seed % 3 === 0) {
        continue; // those pits have lava
      }
      const state = randomPit(seed);
      const before = totalGas(state);
      let covered = gassySquares(state);
      let lastGrew = 0;
      for (let phase = 1; phase <= 120; phase += 1) {
        runStep(state);
        const now = gassySquares(state);
        // A square gives away at most half of its gas, so it never empties.
        for (const square of covered) {
          expect(now, `seed ${seed}, phase ${phase}`).toContain(square);
        }
        if (now.length > covered.length) {
          lastGrew = phase;
        }
        covered = now;
      }
      // Long before the end, the gas had reached every square it ever will.
      expect(lastGrew, `seed ${seed}`).toBeLessThan(60);
      expect(totalGas(state), `seed ${seed}`).toBe(before);
    }
  });

  it('a replay gives the same hash', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const first = randomPit(seed);
      const second = randomPit(seed);
      for (let phase = 0; phase < 8; phase += 1) {
        runStep(first);
        runStep(second);
      }
      expect(hashState(first), `seed ${seed}`).toBe(hashState(second));
    }
  });
});

// A check on the helper itself, so a broken `gasMap` cannot hide a failure.
describe('the test helpers', () => {
  it('gasMap reads what setGasOn wrote', () => {
    const state = pit(['12']);
    setGasOn(state, 1, 0, 12);
    expect(gasMap(state)).toEqual(['0 12']);
    expect(blockAt(state, { x: 1, y: 0, z: 2 })).toBe(BLOCKS.stone.code);
  });
});
