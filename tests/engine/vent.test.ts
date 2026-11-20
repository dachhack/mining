// The vent (design doc v0.2 sections 4.1, 5.2, 6.5 and 7.2; issue #107;
// decision note 0036): a camp-made tool placed on a square, which clears all
// the gas on the squares within 2 steps when a shift ends. One group of tests
// for each rule, each on a small hand-built pit.
//
// A pit is drawn as a grid of depths, one digit per square, row y = 0 first.
// Gas is put on squares in small amounts where a test wants it to stay put:
// a square gives gas away only when it holds at least one unit for itself
// and each neighbour that is no higher (cube/gas.ts).

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, CREW, HAZARDS, STRUCTURES } from '../../src/data';
import {
  countItem,
  endShift,
  isLegalAction,
  isWorked,
  previewCubePhase,
  structureOnSquare,
  ventCheck,
} from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { stepGas } from '../../src/engine/cube/gas';
import { newCubePhase } from '../../src/engine/cube/phase';
import { gasOn, setGasOn, setLavaOn, setWaterOn } from '../../src/engine/standing';
import { act, buildState, findActions, terrainLayers } from './helpers';
import type { BuildStateOptions } from './helpers';

/** A shift in which lava does not flow. */
const NO_LAVA_SHIFT = 3;

/** Build a stone pit from a grid of depths. */
function pit(depths: string[], options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({ layers: terrainLayers(depths), shift: NO_LAVA_SHIFT, ...options });
}

/** A vent standing on the square (x, y) of a pit that is `depth` deep there. */
function ventAt(x: number, y: number, depth: number) {
  return { pos: { x, y, z: depth }, structure: 'vent' as const };
}

/** The gas on every square, as rows of digits. */
function gasMap(state: GameState): string[] {
  const rows: string[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    let row = '';
    for (let x = 0; x < state.size.x; x += 1) {
      row += String(gasOn(state, x, y));
    }
    rows.push(row);
  }
  return rows;
}

/** Run step (c) of the cube phase on `state` (in place) and return its events. */
function runGas(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  stepGas(state, events, newCubePhase());
  return events;
}

/** What the vents cleared, as "units from x,y" strings in order. */
function vented(events: GameEvent[]): string[] {
  const out: string[] = [];
  for (const event of events) {
    if (event.type === 'gasRemoved' && event.reason === 'vented') {
      out.push(`${event.units} from ${event.pos.x},${event.pos.y}`);
    }
  }
  return out;
}

function ofType(events: GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((event) => event.type === type);
}

describe('placing a vent (design doc 4.1: 1 AP and the crafted item)', () => {
  it('puts the vent on the square, uses it up, costs 1 AP and makes the square worked', () => {
    const state = pit(['111'], { stockpile: { vent: 1 } });
    const { state: after, events } = act(state, { type: 'placeVent', x: 1, y: 0 });
    expect(structureOnSquare(after, 1, 0)).toBe(STRUCTURES.vent.code);
    expect(countItem(after, 'vent')).toBe(0);
    expect(after.ap).toBe(state.ap - ACTION_COSTS.placeVent);
    expect(events).toEqual([
      { type: 'structurePlaced', pos: { x: 1, y: 0, z: 1 }, structure: STRUCTURES.vent.code },
    ]);
    expect(isWorked(after, 1, 0)).toBe(true);
  });

  it('is offered for every square while a vent is held; gas on the square does not stop it', () => {
    const state = pit(['222'], { stockpile: { vent: 1 } });
    setGasOn(state, 1, 0, 2);
    expect(findActions(state, { type: 'placeVent' })).toHaveLength(3);
    expect(ventCheck(state, 1, 0)).toEqual({ allowed: true, refusal: null, ap: 1 });
    expect(isLegalAction(state, { type: 'placeVent', x: 1, y: 0, ap: 1 })).toBe(true);
    expect(isLegalAction(state, { type: 'placeVent', x: 1, y: 0, ap: 2 })).toBe(false);
    expect(findActions(pit(['222']), { type: 'placeVent' })).toEqual([]);
    expect(ventCheck(pit(['222']), 1, 0).refusal).toBe('noItem');
  });

  it('is refused where a pump is: a tree, the bottom, a structure, lava, a camp square', () => {
    const state = buildState({
      layers: [['#.#.#'], ['#.###']],
      surface: ['T....'],
      stockpile: { vent: 1 },
      supports: [{ x: 2, y: 0, z: 0 }],
      lava: [{ x: 3, y: 0, z: 0 }],
    });
    expect(ventCheck(state, 0, 0).refusal).toBe('tree');
    expect(ventCheck(state, 1, 0).refusal).toBe('bottom');
    expect(ventCheck(state, 2, 0).refusal).toBe('occupied');
    expect(ventCheck(state, 3, 0).refusal).toBe('lava');
    expect(ventCheck(state, 4, 0).allowed).toBe(true);
    const camped = pit(['111', '111', '111'], {
      stockpile: { vent: 1 },
      camps: [{ pos: { x: 1, y: 1, z: 1 }, foundedShift: 1 }],
    });
    expect(ventCheck(camped, 0, 0).refusal).toBe('camp');
  });
});

describe('what a vent does (design doc 6.5: clears all gas within 2 steps each shift)', () => {
  it('has the number of the design doc', () => {
    expect(HAZARDS.gas.ventReach).toBe(2);
  });

  it('clears all the gas within 2 steps, its own square included, and none beyond', () => {
    const state = pit(['3333333'], { structures: [ventAt(3, 0, 3)] });
    setGasOn(state, 0, 0, 1); // 3 steps away
    setGasOn(state, 2, 0, 2); // 1 step
    setGasOn(state, 3, 0, 2); // its own square
    setGasOn(state, 5, 0, 2); // 2 steps
    setGasOn(state, 6, 0, 1); // 3 steps away
    const events = runGas(state);
    // Nearest first; every unit goes, however many.
    expect(vented(events)).toEqual(['2 from 3,0', '2 from 2,0', '2 from 5,0']);
    expect(gasMap(state)).toEqual(['1000001']);
  });

  it("counts steps to face neighbours: a diagonal neighbour is 2 steps, a knight's move 3", () => {
    const state = pit(['2222', '2222', '2222'], { structures: [ventAt(0, 0, 2)] });
    setGasOn(state, 1, 1, 1); // diagonal: 2 steps
    setGasOn(state, 2, 1, 1); // 3 steps
    const events = runGas(state);
    expect(vented(events)).toEqual(['1 from 1,1']);
    expect(gasOn(state, 2, 1)).toBe(1);
  });

  it('acts after the gas has spread: gas that spreads into its reach is cleared the same shift', () => {
    // 9 units on x 0 give 4 to x 1 (one neighbour: 9 / 2). x 1 is 2 steps
    // from the vent on x 3.
    const state = pit(['33333'], { structures: [ventAt(3, 0, 3)] });
    setGasOn(state, 0, 0, 9);
    const events = runGas(state);
    expect(ofType(events, 'gasMoved')).toHaveLength(1);
    expect(vented(events)).toEqual(['4 from 1,0']);
    expect(gasMap(state)).toEqual(['50000']);
    // The gas beyond its reach goes on spreading in, and is cleared each shift.
    expect(vented(runGas(state))).toEqual(['2 from 1,0']);
    expect(vented(runGas(state))).toEqual(['1 from 1,0']);
    expect(gasMap(state)).toEqual(['20000']);
  });

  it('acts before ignition: gas in its reach is gone before lava can light it', () => {
    function scene(withVent: boolean): GameState {
      const state = pit(['333'], { structures: withVent ? [ventAt(2, 0, 3)] : [] });
      setLavaOn(state, 0, 0, 1, false);
      setGasOn(state, 1, 0, 2);
      return state;
    }
    // Without a vent the lava beside the gas sets it off.
    expect(ofType(runGas(scene(false)), 'exploded')).toHaveLength(1);
    // With one, the gas is vented first and nothing burns; the vent stands.
    const state = scene(true);
    const events = runGas(state);
    expect(ofType(events, 'exploded')).toEqual([]);
    expect(vented(events)).toEqual(['2 from 1,0']);
    expect(structureOnSquare(state, 2, 0)).toBe(STRUCTURES.vent.code);
  });

  it('keeps the crew from being poisoned on a worked square in its reach', () => {
    function scene(withVent: boolean): GameState {
      const state = pit(['333'], {
        structures: withVent ? [ventAt(2, 0, 3)] : [],
        worked: [{ x: 0, y: 0 }],
      });
      setGasOn(state, 0, 0, 1);
      return state;
    }
    const poisoned = endShift(scene(false));
    expect(poisoned.state.crew.health).toBe(CREW.startHealth - CREW.damage.gas);
    const safe = endShift(scene(true));
    expect(ofType(safe.events, 'damageTaken')).toEqual([]);
    expect(safe.state.crew.health).toBe(CREW.startHealth);
  });

  it('two vents whose reaches overlap clear a square once', () => {
    const state = pit(['33333'], { structures: [ventAt(1, 0, 3), ventAt(3, 0, 3)] });
    setGasOn(state, 2, 0, 2);
    expect(vented(runGas(state))).toEqual(['2 from 2,0']);
  });

  it('does nothing to water or lava, and nothing when there is no gas', () => {
    const state = pit(['333'], { structures: [ventAt(1, 0, 3)] });
    setWaterOn(state, 0, 0, 1);
    expect(runGas(state)).toEqual([]);
  });

  it('works at the end of a shift, and the forecast says what it will clear', () => {
    const state = pit(['333'], { stockpile: { vent: 1 } });
    setGasOn(state, 2, 0, 1);
    const placed = act(state, { type: 'placeVent', x: 0, y: 0 }).state;
    expect(vented(previewCubePhase(placed).gas)).toEqual(['1 from 2,0']);
    const ended = endShift(placed);
    expect(vented(ended.events)).toEqual(['1 from 2,0']);
    expect(gasMap(ended.state)).toEqual(['000']);
    expect(structureOnSquare(ended.state, 0, 0)).toBe(STRUCTURES.vent.code);
  });
});

describe('what destroys a placed vent (design doc 6.1, 6.4 and 6.6)', () => {
  // An explosion: tests/engine/explosions.test.ts ("the blast of a charge
  // destroys a pump, a vent and a support on its squares").
  it('mining its square takes the vent with the block; it is lost', () => {
    const state = pit(['11'], { structures: [ventAt(0, 0, 1)] });
    const { state: after, events } = act(state, { type: 'mine', x: 0, y: 0 });
    expect(events[0]).toEqual({
      type: 'structureDestroyed',
      pos: { x: 0, y: 0, z: 1 },
      structure: STRUCTURES.vent.code,
      cause: 'mined',
    });
    expect(countItem(after, 'vent')).toBe(0);
  });

  it('a block that slumps from its square, or onto it, destroys it', () => {
    for (const vent of [ventAt(0, 0, 0), ventAt(1, 0, 2)]) {
      const state = pit(['02'], {
        structures: [vent],
        cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
      });
      const { state: after, events } = endShift(state);
      expect(ofType(events, 'structureDestroyed')).toEqual([
        {
          type: 'structureDestroyed',
          pos: vent.pos,
          structure: STRUCTURES.vent.code,
          cause: 'rockfall',
        },
      ]);
      expect(structureOnSquare(after, vent.pos.x, 0)).toBe(0);
    }
  });

  it('lava on its square destroys it; water does not', () => {
    const burnt = pit(['22'], { structures: [ventAt(0, 0, 2)] });
    setLavaOn(burnt, 0, 0, 1, false);
    const afterLava = endShift(burnt);
    expect(ofType(afterLava.events, 'structureDestroyed')).toHaveLength(1);
    expect(structureOnSquare(afterLava.state, 0, 0)).toBe(0);

    const wet = pit(['22'], { structures: [ventAt(0, 0, 2)] });
    setWaterOn(wet, 0, 0, 1);
    const afterWater = endShift(wet);
    expect(ofType(afterWater.events, 'structureDestroyed')).toEqual([]);
    expect(structureOnSquare(afterWater.state, 0, 0)).toBe(STRUCTURES.vent.code);
  });

  it('a vent destroyed by a slump in step (a) clears nothing in step (c) of that shift', () => {
    // The vent on x 0 goes with the block that slumps from under it.
    const state = pit(['022'], {
      structures: [ventAt(0, 0, 0)],
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
    });
    setGasOn(state, 2, 0, 1);
    const ended = endShift(state);
    expect(vented(ended.events)).toEqual([]);
    expect(gasOn(ended.state, 2, 0)).toBeGreaterThan(0);
  });
});
