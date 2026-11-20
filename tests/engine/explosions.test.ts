// Placed explosives and unstable ore (design doc v0.2 sections 4.1, 5.2, 6.6
// and 8; owner questions 58, 64 and 65; issue #103, task T11; decision note
// 0035). One group of tests for each rule, each on a small hand-built pit.
// Gas by itself is in gas.test.ts.
//
// A pit is drawn as a grid of depths, one digit per square, row y = 0 first,
// with an optional grid of materials (see `terrainLayers` in helpers.ts):
//
//   pit(['000', '000'], {}, ['###', '#U#'])   flat ground, unstable ore at (1, 1)

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, BLOCKS, CREW, HAZARDS, STRUCTURES, SURFACE } from '../../src/data';
import {
  blastSquares,
  countItem,
  depthAt,
  endShift,
  explosiveCheck,
  hashState,
  isRevealed,
  isWorked,
  legalActions,
  oreArmedByMine,
  previewCubePhase,
  surfaceKindAt,
  workedSquares,
} from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { stepFluids } from '../../src/engine/cube/fluids';
import { stepGas } from '../../src/engine/cube/gas';
import { stepSlumps } from '../../src/engine/cube/slumps';
import { newCubePhase } from '../../src/engine/cube/phase';
import type { CubePhase } from '../../src/engine/cube/phase';
import { createRng, nextInt } from '../../src/engine/rng';
import { gasOn, setGasOn, setLavaOn, setWaterOn, waterOn } from '../../src/engine/standing';
import {
  armCharge,
  blockAt,
  setBlock,
  setGas,
  setRevealed,
  setStructure,
  structureAt,
} from '../../src/engine/state';
import { act, buildState, depthText, findActions, terrainLayers } from './helpers';
import type { BuildStateOptions } from './helpers';

/** Build a pit from a grid of depths and, if given, a grid of materials. */
function pit(
  depths: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
  materials?: string[],
  layerCount?: number,
): GameState {
  return buildState({
    layers: terrainLayers(depths, materials, layerCount),
    shift: 3, // a shift in which lava does not flow
    ...options,
  });
}

/** Put a placed, armed explosive on the square (x, y), as the action does. */
function plant(state: GameState, x: number, y: number): void {
  const top = { x, y, z: depthAt(state, x, y) };
  setStructure(state, top, STRUCTURES.explosive.code);
  armCharge(state, top, 'explosive');
}

/** Run step (c) on `state` (in place) and return its events and notes. */
function runStep(state: GameState): { events: GameEvent[]; phase: CubePhase } {
  const events: GameEvent[] = [];
  const phase = newCubePhase();
  stepGas(state, events, phase);
  return { events, phase };
}

/** The events of one type, in order. */
function ofType(events: GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((event) => event.type === type);
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

const FLAT_3X3 = ['000', '000', '000'];

describe('the blast area (design doc 6.6)', () => {
  it('is the square and the four beside it, the square itself first', () => {
    const state = pit(FLAT_3X3);
    expect(blastSquares(state, 1, 1)).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
    expect(HAZARDS.explosion.blastReach).toBe(1);
  });

  it('leaves out squares beyond the edge of the map', () => {
    const state = pit(FLAT_3X3);
    expect(blastSquares(state, 0, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
    expect(() => blastSquares(state, 3, 0)).toThrow(/not a square/);
  });
});

describe('placing an explosive (design doc 4.1)', () => {
  it('is offered for every square once the stockpile holds one', () => {
    const none = pit(FLAT_3X3);
    expect(findActions(none, { type: 'placeExplosive' })).toEqual([]);
    expect(explosiveCheck(none, 1, 1)).toEqual({
      allowed: false,
      refusal: 'noExplosive',
      ap: null,
    });

    const state = pit(FLAT_3X3, { stockpile: { explosive: 1 } });
    const offered = findActions(state, { type: 'placeExplosive' });
    expect(offered).toHaveLength(9);
    expect(offered[0]).toEqual({
      type: 'placeExplosive',
      x: 0,
      y: 0,
      ap: ACTION_COSTS.placeExplosive,
    });
    expect(explosiveCheck(state, 1, 1)).toEqual({
      allowed: true,
      refusal: null,
      ap: ACTION_COSTS.placeExplosive,
    });
  });

  it('uses up the explosive, puts it on the top block, arms it and costs 1 AP', () => {
    const state = pit(['010', '111', '010'], { stockpile: { explosive: 2 } });
    const { state: after, events } = act(state, { type: 'placeExplosive', x: 1, y: 1 });
    expect(countItem(after, 'explosive')).toBe(1);
    expect(structureAt(after, { x: 1, y: 1, z: 1 })).toBe(STRUCTURES.explosive.code);
    expect(after.armed).toEqual([{ pos: { x: 1, y: 1, z: 1 }, kind: 'explosive' }]);
    expect(after.ap).toBe(state.ap - ACTION_COSTS.placeExplosive);
    expect(events).toEqual([
      { type: 'structurePlaced', pos: { x: 1, y: 1, z: 1 }, structure: STRUCTURES.explosive.code },
    ]);
  });

  it('does NOT make its square a worked square: the crew withdraws (design doc 5.2)', () => {
    const state = pit(FLAT_3X3, { stockpile: { explosive: 1 } });
    const { state: after } = act(state, { type: 'placeExplosive', x: 1, y: 1 });
    expect(isWorked(after, 1, 1)).toBe(false);
    expect(workedSquares(after)).toEqual([]);

    // So a charge alone never hurts the crew, though it goes off.
    const step = endShift(after);
    expect(ofType(step.events, 'exploded')).toHaveLength(1);
    expect(ofType(step.events, 'damageTaken')).toEqual([]);
    expect(step.state.crew.health).toBe(CREW.startHealth);
  });

  it('placing a support does make its square worked: the two differ', () => {
    const state = pit(FLAT_3X3, { stockpile: { support: 1 } });
    const { state: after } = act(state, { type: 'placeSupport', x: 1, y: 1 });
    expect(isWorked(after, 1, 1)).toBe(true);
  });

  it('is refused on a tree, a bottomed-out square, an occupied square, lava and a camp', () => {
    // (0,0) has a tree; (1,0) is dug to the bottom of this 2-layer cube;
    // (2,0) holds a support; (3,0) has lava on it.
    const state = buildState({
      layers: [['#.#.#####'], ['#.#######'], ['#########']],
      surface: ['T........'],
      supports: [{ x: 2, y: 0, z: 0 }],
      stockpile: { explosive: 1 },
    });
    setBlock(state, { x: 1, y: 0, z: 2 }, BLOCKS.air.code);
    setLavaOn(state, 3, 0, 1, false);
    expect(explosiveCheck(state, 0, 0).refusal).toBe('tree');
    expect(explosiveCheck(state, 1, 0).refusal).toBe('bottom');
    expect(explosiveCheck(state, 2, 0).refusal).toBe('occupied');
    expect(explosiveCheck(state, 3, 0).refusal).toBe('lava');
    expect(explosiveCheck(state, 4, 0).allowed).toBe(true);
    expect(() => explosiveCheck(state, 9, 0)).toThrow(/not a square/);
    const offered = findActions(state, { type: 'placeExplosive' }).map((action) =>
      action.type === 'placeExplosive' ? action.x : -1,
    );
    expect(offered).toEqual([4, 5, 6, 7, 8]);

    const camped = pit(FLAT_3X3, {
      stockpile: { explosive: 1 },
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
    });
    expect(explosiveCheck(camped, 1, 1).refusal).toBe('camp');
    expect(findActions(camped, { type: 'placeExplosive' })).toEqual([]);
  });

  it('is not offered without the AP for it', () => {
    const state = pit(FLAT_3X3, { stockpile: { explosive: 1 }, ap: 0 });
    expect(legalActions(state).some((action) => action.type === 'placeExplosive')).toBe(false);
  });

  it('mining the square takes the charge with the block: it never goes off', () => {
    let state = pit(FLAT_3X3, { stockpile: { explosive: 1 } });
    state = act(state, { type: 'placeExplosive', x: 1, y: 1 }).state;
    const mined = act(state, { type: 'mine', x: 1, y: 1 });
    expect(mined.state.armed).toEqual([]);
    expect(mined.events).toContainEqual({
      type: 'structureDestroyed',
      pos: { x: 1, y: 1, z: 0 },
      structure: STRUCTURES.explosive.code,
      cause: 'mined',
    });
    expect(ofType(endShift(mined.state).events, 'exploded')).toEqual([]);
  });
});

describe('a placed explosive goes off when the shift ends (design doc 6.6)', () => {
  it('destroys the top block of its square and of the four beside it, with no yield', () => {
    let state = pit(FLAT_3X3, { stockpile: { explosive: 1 } }, ['ccc', 'ccc', 'ccc']);
    state = act(state, { type: 'placeExplosive', x: 1, y: 1 }).state;
    const step = endShift(state);
    expect(depthText(step.state)).toEqual(['010', '111', '010']);
    expect(explosions(step.events)).toEqual(['explosive: 1,1 1,0 0,1 2,1 1,2']);
    expect(ofType(step.events, 'blockDestroyed')).toEqual([
      { type: 'blockDestroyed', pos: { x: 1, y: 1, z: 0 }, block: BLOCKS.coalSeam.code },
      { type: 'blockDestroyed', pos: { x: 1, y: 0, z: 0 }, block: BLOCKS.coalSeam.code },
      { type: 'blockDestroyed', pos: { x: 0, y: 1, z: 0 }, block: BLOCKS.coalSeam.code },
      { type: 'blockDestroyed', pos: { x: 2, y: 1, z: 0 }, block: BLOCKS.coalSeam.code },
      { type: 'blockDestroyed', pos: { x: 1, y: 2, z: 0 }, block: BLOCKS.coalSeam.code },
    ]);
    // Coal seams, and not one piece of coal.
    expect(ofType(step.events, 'itemGained')).toEqual([]);
    expect(countItem(step.state, 'coal')).toBe(0);
  });

  it('the event names the charge and its squares, and the charge is used up', () => {
    const state = pit(['11', '11']);
    plant(state, 0, 0);
    const { events } = runStep(state);
    expect(events[0]).toEqual({
      type: 'exploded',
      kind: 'explosive',
      pos: { x: 0, y: 0, z: 1 },
      // The cells directly above the tops, as they were before the blast.
      cells: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
    });
    expect(state.armed).toEqual([]);
    expect(state.structures.some((code) => code !== 0)).toBe(false);
    // Its own structure is used up, not "destroyed".
    expect(ofType(events, 'structureDestroyed')).toEqual([]);
  });

  it('goes off in the shift it was placed in, not later', () => {
    let state = pit(FLAT_3X3, { stockpile: { explosive: 1 } });
    state = act(state, { type: 'placeExplosive', x: 1, y: 1 }).state;
    const first = endShift(state);
    expect(ofType(first.events, 'exploded')).toHaveLength(1);
    expect(ofType(endShift(first.state).events, 'exploded')).toEqual([]);
  });

  it('ignores the level rule; a steep step it leaves cracks next shift and slumps', () => {
    // A trench 1 deep. The blast takes x = 1 to 3 down to depth 2, so the
    // ground at x = 0 stands 2 levels above its neighbour: steep.
    let state = pit(['01110']);
    plant(state, 2, 0);
    const first = endShift(state);
    state = first.state;
    expect(depthText(state)).toEqual(['02220']);
    // Step (a) ran before the blast: no crack yet.
    expect(ofType(first.events, 'blockCracked')).toEqual([]);
    const second = endShift(state);
    expect(
      ofType(second.events, 'blockCracked').map((event) =>
        event.type === 'blockCracked' ? event.pos : null,
      ),
    ).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ]);
    // Two shifts on, the walls slump into the trench.
    state = endShift(second.state).state;
    const fall = endShift(state);
    expect(ofType(fall.events, 'blockFell')).toHaveLength(2);
  });

  it('removes nothing from a square with no block left, and never bedrock', () => {
    // A 1-layer cube: after the blast the squares are at the bottom.
    const state = buildState({ layers: [['###']] });
    plant(state, 1, 0);
    runStep(state);
    expect(depthText(state)).toEqual(['111']);
    // Nothing is left to place a charge on; a blast there would do nothing.
    expect(blockAt(state, { x: 1, y: 0, z: 1 })).toBe(BLOCKS.bedrock.code);
  });
});

describe('a blast and trees (design doc 6.6)', () => {
  it('a tree in the blast is destroyed with no timber, and the block under it stays', () => {
    const state = pit(['000'], { surface: ['T..'] });
    plant(state, 1, 0);
    const step = endShift(state);
    expect(step.events).toContainEqual({ type: 'treeDestroyed', pos: { x: 0, y: 0, z: -1 } });
    expect(depthText(step.state)).toEqual(['011']);
    expect(surfaceKindAt(step.state, { x: 0, y: 0, z: -1 })).toBe(SURFACE.kinds.meadow.code);
    expect(countItem(step.state, 'timber')).toBe(0);
    // The ground the tree hid is now the square's top block, and is shown.
    expect(isRevealed(state, { x: 0, y: 0, z: 0 })).toBe(false);
    expect(isRevealed(step.state, { x: 0, y: 0, z: 0 })).toBe(true);
  });

  it('no tree grows back where a blast took one, or took the ground under a stump', () => {
    let state = pit(['000'], {
      surface: ['Ts.'],
      stumpAges: [{ pos: { x: 1, y: 0, z: 0 }, age: 9 }],
      fuel: 40,
    });
    plant(state, 1, 0);
    for (let n = 0; n < SURFACE.regrowShifts + 2; n += 1) {
      state = endShift(state).state;
    }
    expect(surfaceKindAt(state, { x: 0, y: 0, z: -1 })).toBe(SURFACE.kinds.meadow.code);
    expect(surfaceKindAt(state, { x: 1, y: 0, z: -1 })).toBe(SURFACE.kinds.meadow.code);
  });
});

describe('what a blast destroys besides blocks (design doc 6.6 and 8)', () => {
  it('structures on its squares, and none outside them', () => {
    const state = pit(['11111'], {
      structures: [
        { pos: { x: 1, y: 0, z: 1 }, structure: 'support' },
        { pos: { x: 3, y: 0, z: 1 }, structure: 'pump' },
        { pos: { x: 4, y: 0, z: 1 }, structure: 'vent' },
      ],
    });
    plant(state, 2, 0);
    const { events } = runStep(state);
    expect(ofType(events, 'structureDestroyed')).toEqual([
      {
        type: 'structureDestroyed',
        pos: { x: 1, y: 0, z: 1 },
        structure: STRUCTURES.support.code,
        cause: 'explosion',
      },
      {
        type: 'structureDestroyed',
        pos: { x: 3, y: 0, z: 1 },
        structure: STRUCTURES.pump.code,
        cause: 'explosion',
      },
    ]);
    expect(structureAt(state, { x: 4, y: 0, z: 1 })).toBe(STRUCTURES.vent.code);
  });

  it('another charge in the blast is destroyed, not set off: charges do not chain', () => {
    const state = pit(['1111']);
    plant(state, 1, 0);
    plant(state, 2, 0);
    const { events } = runStep(state);
    // The charge at x = 1 goes first (the list's order) and takes the other.
    expect(explosions(events)).toEqual(['explosive: 1,0 0,0 2,0']);
    expect(ofType(events, 'structureDestroyed')).toEqual([
      {
        type: 'structureDestroyed',
        pos: { x: 2, y: 0, z: 1 },
        structure: STRUCTURES.explosive.code,
        cause: 'explosion',
      },
    ]);
    expect(depthText(state)).toEqual(['2221']);
    expect(state.armed).toEqual([]);
  });

  it("two charges out of each other's blast both go off", () => {
    const state = pit(['11111']);
    plant(state, 0, 0);
    plant(state, 3, 0);
    expect(explosions(runStep(state).events)).toEqual([
      'explosive: 0,0 1,0',
      'explosive: 3,0 2,0 4,0',
    ]);
    expect(depthText(state)).toEqual(['22222']);
  });

  it('a camp on a blast square or beside one, and not one further away', () => {
    // A camp covers x 0 to 2 of a 7 x 3 field.
    function camped(chargeX: number): GameState {
      const state = pit(['0000000', '0000000', '0000000'], {
        camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
      });
      plant(state, chargeX, 1);
      runStep(state);
      return state;
    }
    // Charge at x = 4: its blast reaches x = 3, beside the camp's x = 2.
    expect(camped(4).camps).toEqual([]);
    // Charge at x = 3: the blast includes the camp square (2, 1).
    const inside = camped(3);
    expect(inside.camps).toEqual([]);
    expect(depthAt(inside, 2, 1)).toBe(1); // and the camp's ground goes too
    // Charge at x = 5: the blast reaches x = 4, two squares from the camp.
    expect(camped(5).camps).toHaveLength(1);
  });

  it('the camp event comes before the blocks go', () => {
    const state = pit(['0000', '0000', '0000'], {
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
    });
    plant(state, 3, 1);
    const { events } = runStep(state);
    const types = events.map((event) => event.type);
    expect(types.indexOf('campDestroyed')).toBeGreaterThan(types.indexOf('exploded'));
    expect(types.indexOf('campDestroyed')).toBeLessThan(types.indexOf('blockDestroyed'));
  });
});

describe('explosions and the camp-made tools (issues #103 and #104)', () => {
  it('the blast of a charge destroys a pump, a vent and a support on its squares', () => {
    const state = pit(['11111', '11111', '11111'], {
      structures: [
        { pos: { x: 2, y: 0, z: 1 }, structure: 'pump' },
        { pos: { x: 1, y: 1, z: 1 }, structure: 'vent' },
        { pos: { x: 3, y: 1, z: 1 }, structure: 'support' },
        // Two squares from the charge: outside the blast.
        { pos: { x: 4, y: 1, z: 1 }, structure: 'pump' },
      ],
    });
    plant(state, 2, 1);
    const { events } = runStep(state);
    const destroyed = ofType(events, 'structureDestroyed').map((event) =>
      event.type === 'structureDestroyed' ? `${event.pos.x},${event.pos.y}:${event.structure}` : '',
    );
    expect(destroyed).toEqual([
      `2,0:${STRUCTURES.pump.code}`,
      `1,1:${STRUCTURES.vent.code}`,
      `3,1:${STRUCTURES.support.code}`,
    ]);
    expect(structureAt(state, { x: 4, y: 1, z: 1 })).toBe(STRUCTURES.pump.code);
    // Nothing is given back.
    expect(countItem(state, 'pump') + countItem(state, 'vent')).toBe(0);
  });

  it('the blast of unstable ore destroys them too, though it takes no other block', () => {
    const state = pit(
      ['111'],
      {
        structures: [{ pos: { x: 0, y: 0, z: 1 }, structure: 'pump' }],
        armed: [{ pos: { x: 1, y: 0, z: 1 }, kind: 'unstableOre' }],
      },
      ['#U#'],
    );
    runStep(state);
    expect(structureAt(state, { x: 0, y: 0, z: 1 })).toBe(0);
    expect(depthText(state)).toEqual(['121']);
  });

  it('a pump that an explosion destroyed pumps no more', () => {
    // Water beside a pump; the pump is in the blast of a charge.
    let state = pit(['2222'], {
      structures: [{ pos: { x: 1, y: 0, z: 2 }, structure: 'pump' }],
      fuel: 20,
    });
    setWaterOn(state, 0, 0, 2);
    plant(state, 2, 0);
    // This shift the pump still works (step (b) comes before the blast).
    state = endShift(state).state;
    expect(structureAt(state, { x: 1, y: 0, z: 3 })).toBe(0);
    const left = waterOn(state, 0, 0) + waterOn(state, 1, 0);
    // From now on the water stays.
    state = endShift(state).state;
    expect(waterOn(state, 0, 0) + waterOn(state, 1, 0)).toBe(left);
  });

  it('sealant on armed unstable ore smothers it: it is disarmed and does not go off', () => {
    // The ore is the top block of (1, 0), one level down, and armed.
    const state = pit(
      ['11'],
      {
        armed: [{ pos: { x: 1, y: 0, z: 1 }, kind: 'unstableOre' }],
        stockpile: { sealant: 1 },
        worked: [{ x: 0, y: 0 }],
      },
      ['#U'],
    );
    const sealed = act(state, { type: 'seal', x: 1, y: 0 }).state;
    // The sealed rock is the top now; the ore lies under it, and is disarmed
    // at that moment: `state.armed` never holds buried ore.
    expect(blockAt(sealed, { x: 1, y: 0, z: 0 })).toBe(BLOCKS.sealed.code);
    expect(sealed.armed).toEqual([]);

    const step = endShift(sealed);
    expect(ofType(step.events, 'exploded')).toEqual([]);
    expect(ofType(step.events, 'damageTaken')).toEqual([]);
    expect(step.state.armed).toEqual([]);
    expect(blockAt(step.state, { x: 1, y: 0, z: 1 })).toBe(BLOCKS.unstableOre.code);
    // Dug out again later, it is plain unarmed ore: mining it yields.
    expect(previewCubePhase(step.state).countdowns).toEqual([]);
  });

  it('the forecast agrees: sealed-over armed ore is not forecast to go off', () => {
    const state = pit(
      ['11'],
      { armed: [{ pos: { x: 1, y: 0, z: 1 }, kind: 'unstableOre' }], stockpile: { sealant: 1 } },
      ['#U'],
    );
    expect(ofType(previewCubePhase(state).gas, 'exploded')).toHaveLength(1);
    expect(previewCubePhase(state).countdowns).toHaveLength(1);
    const sealed = act(state, { type: 'seal', x: 1, y: 0 }).state;
    expect(ofType(previewCubePhase(sealed).gas, 'exploded')).toEqual([]);
    // Nor is it on the list of countdowns: the two halves of the forecast
    // agree (review of PR #105).
    expect(previewCubePhase(sealed).countdowns).toEqual([]);
  });

  it('sealing a gassy square destroys its gas, so a later blast finds nothing to light', () => {
    const state = pit(['111'], { stockpile: { sealant: 1 } });
    setGasOn(state, 2, 0, 5);
    plant(state, 0, 0);
    const sealed = act(state, { type: 'seal', x: 2, y: 0 }).state;
    expect(gasOn(sealed, 2, 0)).toBe(0);
    expect(explosions(endShift(sealed).events)).toEqual(['explosive: 0,0 1,0']);
  });
});

describe('an explosion hurts the crew: 6 (design doc 5.2; owner question 64)', () => {
  it('when the blast includes a worked square', () => {
    const state = pit(['111'], { worked: [{ x: 0, y: 0 }] });
    plant(state, 1, 0);
    expect(runStep(state).phase.damage).toEqual([
      { amount: CREW.damage.explosion, cause: 'explosion' },
    ]);
  });

  it('not when the worked square is only beside the blast', () => {
    const state = pit(['1111'], { worked: [{ x: 3, y: 0 }] });
    plant(state, 1, 0);
    expect(runStep(state).phase.damage).toEqual([]);
  });

  it('two blasts on worked squares in one phase hurt once', () => {
    const state = pit(['11111'], {
      worked: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    });
    plant(state, 0, 0);
    plant(state, 3, 0);
    expect(runStep(state).phase.damage).toEqual([
      { amount: CREW.damage.explosion, cause: 'explosion' },
    ]);
  });

  it('through endShift: mine beside your own charge and lose 6; at 6 health the crew is burned', () => {
    function play(health: number): GameState {
      let state = pit(FLAT_3X3, { stockpile: { explosive: 1 }, health });
      state = act(state, { type: 'placeExplosive', x: 1, y: 1 }).state;
      state = act(state, { type: 'mine', x: 0, y: 1 }).state;
      return endShift(state).state;
    }
    expect(play(10).crew.health).toBe(10 - CREW.damage.explosion);
    expect(play(CREW.damage.explosion).status).toEqual({
      kind: 'ended',
      outcome: 'lost',
      cause: 'burned',
    });
  });

  it('a charge that sets off gas beside the crew deals 6 + 3 = 9 (owner question 64)', () => {
    // The blast covers x = 0 to 2 and includes the worked square (2, 0).
    // Thin gas on (3, 0) is beside the blast: it burns, beside the worked
    // square.
    const state = pit(['1111'], { worked: [{ x: 2, y: 0 }], health: 10 });
    plant(state, 1, 0);
    setGasOn(state, 3, 0, 1);
    const step = endShift(state);
    expect(explosions(step.events)).toEqual(['explosive: 1,0 0,0 2,0', 'gas: 3,0']);
    expect(ofType(step.events, 'damageTaken')).toEqual([
      { type: 'damageTaken', amount: 6, cause: 'explosion', health: 4 },
      { type: 'damageTaken', amount: 3, cause: 'gasExplosion', health: 1 },
    ]);
    expect(step.state.status).toEqual({ kind: 'active' });
  });
});

describe('a blast lights gas on its squares and beside them (design doc 6.6)', () => {
  it('gas on a blast square', () => {
    const state = pit(['111']);
    plant(state, 1, 0);
    setGasOn(state, 0, 0, 1);
    const { events } = runStep(state);
    expect(explosions(events)).toEqual(['explosive: 1,0 0,0 2,0', 'gas: 0,0']);
    expect(gasOn(state, 0, 0)).toBe(0);
  });

  it('gas two squares from the blast stays', () => {
    const state = pit(['11112']);
    plant(state, 1, 0);
    setGasOn(state, 4, 0, 3);
    expect(explosions(runStep(state).events)).toEqual(['explosive: 1,0 0,0 2,0']);
    expect(gasOn(state, 4, 0)).toBe(3);
  });

  it('gas a blast lets out of a pocket burns in the same cube phase', () => {
    // A gas pocket of one cell under the top block of (1, 0).
    const state = pit(['000'], {}, undefined, 4);
    setBlock(state, { x: 1, y: 0, z: 1 }, BLOCKS.air.code);
    setGas(state, { x: 1, y: 0, z: 1 }, HAZARDS.gas.pocketUnitsPerCell);
    plant(state, 1, 0);
    const { events } = runStep(state);
    expect(ofType(events, 'spaceCollapsed')).toHaveLength(1);
    expect(explosions(events)).toEqual(['explosive: 1,0 0,0 2,0', 'gas: 1,0']);
    expect(events).toContainEqual({
      type: 'gasRemoved',
      pos: { x: 1, y: 0, z: 0 },
      units: HAZARDS.gas.pocketUnitsPerCell,
      reason: 'burnt',
    });
  });
});

describe('a blast over an underground space (design doc 6.2; review of PR #97)', () => {
  it('each square drops exactly 1 level: the space collapses after the first block', () => {
    // A cavern of two cells under the tops of (1, 0) and (2, 0).
    const state = pit(['00000'], {}, undefined, 4);
    setBlock(state, { x: 1, y: 0, z: 1 }, BLOCKS.air.code);
    setBlock(state, { x: 2, y: 0, z: 1 }, BLOCKS.air.code);
    plant(state, 1, 0);
    const { events } = runStep(state);
    expect(depthText(state)).toEqual(['11100']);
    expect(ofType(events, 'spaceCollapsed')).toHaveLength(1);
    // Both squares now show rubble.
    expect(blockAt(state, { x: 1, y: 0, z: 1 })).toBe(BLOCKS.rubble.code);
    expect(blockAt(state, { x: 2, y: 0, z: 1 })).toBe(BLOCKS.rubble.code);
  });
});

describe('relics and keystones in a blast survive by chance (owner question 65)', () => {
  /** Flat ground with a relic beside the charge and a keystone under it. */
  function withRelic(seed: number): GameState {
    const state = pit(['000'], { seed }, ['rk#']);
    plant(state, 1, 0);
    return state;
  }

  it('the probability is in the data: 0.5 for now', () => {
    expect(HAZARDS.explosion.chanceBlockDestroyed).toBe(0.5);
    expect(HAZARDS.explosion.chanceBlocks).toEqual(['relic', 'keystone']);
  });

  it('each is destroyed with no yield, or left in place', () => {
    let destroyed = 0;
    let survived = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = withRelic(seed);
      const { events } = runStep(state);
      for (const [x, block] of [
        [0, BLOCKS.relic.code],
        [1, BLOCKS.keystone.code],
      ] as const) {
        const pos = { x, y: 0, z: 0 };
        const stillThere = blockAt(state, pos) === block;
        if (stillThere) {
          survived += 1;
          expect(events).toContainEqual({ type: 'blockSurvivedBlast', pos, block });
          expect(depthAt(state, x, 0)).toBe(0);
        } else {
          destroyed += 1;
          expect(events).toContainEqual({ type: 'blockDestroyed', pos, block });
          expect(depthAt(state, x, 0)).toBe(1);
        }
      }
      // The plain stone beside them always goes.
      expect(depthAt(state, 2, 0)).toBe(1);
      expect(countItem(state, 'relic') + countItem(state, 'keystone')).toBe(0);
    }
    // 120 rolls at 0.5: both outcomes happen, in about equal numbers.
    expect(destroyed).toBeGreaterThan(40);
    expect(survived).toBeGreaterThan(40);
  });

  it('uses the seeded RNG in the state: the same seed gives the same outcome', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const first = withRelic(seed);
      const second = withRelic(seed);
      runStep(first);
      runStep(second);
      expect(hashState(first)).toBe(hashState(second));
      // One draw for each relic or keystone in the blast, and it is kept.
      expect(first.rng).not.toEqual(withRelic(seed).rng);
    }
  });

  it('a blast with no relic in it draws nothing', () => {
    const state = pit(['000'], { seed: 7 });
    plant(state, 1, 0);
    const before = { ...state.rng };
    runStep(state);
    expect(state.rng).toEqual(before);
  });

  it('a relic that survives can still be mined for its item', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = withRelic(seed);
      const after = endShift(state).state;
      if (blockAt(after, { x: 0, y: 0, z: 0 }) !== BLOCKS.relic.code) {
        continue;
      }
      const mined = act(after, { type: 'mine', x: 0, y: 0 }).state;
      expect(countItem(mined, 'relic')).toBe(1);
      return;
    }
    throw new Error('no seed from 1 to 60 left the relic in place');
  });

  it('the forecast rolls no dice: it says "may be destroyed", whatever the seed', () => {
    const forecasts: string[] = [];
    for (let seed = 1; seed <= 5; seed += 1) {
      const state = withRelic(seed);
      const rngBefore = { ...state.rng };
      const forecast = previewCubePhase(state);
      expect(state.rng).toEqual(rngBefore);
      expect(forecast.gas).toContainEqual({
        type: 'blockMayBeDestroyed',
        pos: { x: 0, y: 0, z: 0 },
        block: BLOCKS.relic.code,
      });
      expect(forecast.gas).toContainEqual({
        type: 'blockMayBeDestroyed',
        pos: { x: 1, y: 0, z: 0 },
        block: BLOCKS.keystone.code,
      });
      expect(ofType(forecast.gas, 'blockSurvivedBlast')).toEqual([]);
      forecasts.push(JSON.stringify(forecast));
    }
    expect(new Set(forecasts).size).toBe(1);
  });
});

describe('unstable ore is armed by a mine beside it on its own layer (design doc 6.6)', () => {
  it('known, unbraced ore beside the mined block is armed, and the player is told', () => {
    const state = pit(FLAT_3X3, {}, ['###', '#U#', '###']);
    expect(oreArmedByMine(state, 0, 1)).toEqual([{ x: 1, y: 1, z: 0 }]);
    const { state: after, events } = act(state, { type: 'mine', x: 0, y: 1 });
    expect(after.armed).toEqual([{ pos: { x: 1, y: 1, z: 0 }, kind: 'unstableOre' }]);
    expect(events).toContainEqual({ type: 'oreArmed', pos: { x: 1, y: 1, z: 0 } });
    // It is on the hazard list at once.
    expect(previewCubePhase(after).countdowns).toContainEqual({
      kind: 'unstableOre',
      pos: { x: 1, y: 1, z: 0 },
      inShifts: 1,
    });
    // Once armed it is not armed again.
    expect(oreArmedByMine(after, 1, 0)).toEqual([]);
  });

  it('a mine on a diagonal, or two squares away, arms nothing', () => {
    const state = pit(['0000', '0000'], {}, ['###U', '####']);
    expect(oreArmedByMine(state, 2, 1)).toEqual([]);
    expect(oreArmedByMine(state, 1, 0)).toEqual([]);
    expect(act(state, { type: 'mine', x: 2, y: 1 }).state.armed).toEqual([]);
  });

  it('ore on another layer is not beside the mined block', () => {
    // The ore lies one layer down in the next column.
    const state = buildState({ layers: [['##'], ['#U'], ['##']] });
    expect(oreArmedByMine(state, 0, 0)).toEqual([]);
    expect(act(state, { type: 'mine', x: 0, y: 0 }).state.armed).toEqual([]);
  });

  it('braced ore is not armed: a support on its square', () => {
    const state = pit(['00'], { supports: [{ x: 1, y: 0, z: 0 }] }, ['#U']);
    expect(oreArmedByMine(state, 0, 0)).toEqual([]);
    const after = act(state, { type: 'mine', x: 0, y: 0 }).state;
    expect(after.armed).toEqual([]);
    expect(ofType(endShift(after).events, 'exploded')).toEqual([]);
  });

  it('ore the player has not seen is not armed (owner question 58)', () => {
    // The ore is under a tree that was never cut.
    const state = pit(['00'], { surface: ['.T'] }, ['#U']);
    expect(isRevealed(state, { x: 1, y: 0, z: 0 })).toBe(false);
    expect(oreArmedByMine(state, 0, 0)).toEqual([]);
    const after = act(state, { type: 'mine', x: 0, y: 0 }).state;
    expect(after.armed).toEqual([]);
  });

  it('ore seen before a tree grew back over it is known, and is armed', () => {
    const state = pit(['00'], { surface: ['.T'] }, ['#U']);
    setRevealed(state, { x: 1, y: 0, z: 0 }, true);
    const after = act(state, { type: 'mine', x: 0, y: 0 }).state;
    expect(after.armed).toHaveLength(1);
    // The blast takes the tree and the ore.
    const step = endShift(after);
    expect(step.events).toContainEqual({ type: 'treeDestroyed', pos: { x: 1, y: 0, z: -1 } });
    expect(depthText(step.state)).toEqual(['11']);
  });

  it('mining the ore itself never sets it off: it yields rare ore', () => {
    const state = pit(['00'], {}, ['#U']);
    const mined = act(state, { type: 'mine', x: 1, y: 0 });
    expect(countItem(mined.state, 'rareOre')).toBe(1);
    expect(mined.state.armed).toEqual([]);
    expect(ofType(endShift(mined.state).events, 'exploded')).toEqual([]);
  });

  it('armed ore that is then mined out yields, and does not go off', () => {
    let state = pit(['00'], { ap: 10 }, ['#U']);
    state = act(state, { type: 'mine', x: 0, y: 0 }).state;
    expect(state.armed).toHaveLength(1);
    state = act(state, { type: 'mine', x: 1, y: 0 }).state;
    expect(state.armed).toEqual([]);
    expect(countItem(state, 'rareOre')).toBe(1);
    expect(ofType(endShift(state).events, 'exploded')).toEqual([]);
  });

  it('a support placed after the ore is armed does not disarm it, and is lost', () => {
    let state = pit(['00'], { ap: 10, stockpile: { support: 1 } }, ['#U']);
    state = act(state, { type: 'mine', x: 0, y: 0 }).state;
    state = act(state, { type: 'placeSupport', x: 1, y: 0 }).state;
    const step = endShift(state);
    expect(explosions(step.events)).toEqual(['unstableOre: 1,0 0,0']);
    expect(step.events).toContainEqual({
      type: 'structureDestroyed',
      pos: { x: 1, y: 0, z: 0 },
      structure: STRUCTURES.support.code,
      cause: 'explosion',
    });
  });

  it('two ore blocks beside one mine are both armed, and both go off', () => {
    const state = pit(['000'], {}, ['U#U']);
    const after = act(state, { type: 'mine', x: 1, y: 0 }).state;
    expect(after.armed).toHaveLength(2);
    expect(explosions(endShift(after).events)).toEqual([
      'unstableOre: 0,0 1,0',
      'unstableOre: 2,0 1,0',
    ]);
  });
});

describe('armed unstable ore goes off when the shift ends (design doc 6.6)', () => {
  it('the ore is destroyed with no yield, and no other block is removed', () => {
    const state = pit(FLAT_3X3, {}, ['###', '#U#', '###']);
    const after = act(state, { type: 'mine', x: 0, y: 1 }).state;
    const step = endShift(after);
    // (0,1) was mined; the ore's own square went down 1; nothing else moved.
    expect(depthText(step.state)).toEqual(['000', '110', '000']);
    expect(ofType(step.events, 'blockDestroyed')).toEqual([
      { type: 'blockDestroyed', pos: { x: 1, y: 1, z: 0 }, block: BLOCKS.unstableOre.code },
    ]);
    expect(countItem(step.state, 'rareOre')).toBe(0);
    expect(step.state.armed).toEqual([]);
    expect(step.events).toContainEqual({
      type: 'exploded',
      kind: 'unstableOre',
      pos: { x: 1, y: 1, z: 0 },
      cells: [
        { x: 1, y: 1, z: -1 },
        { x: 1, y: 0, z: -1 },
        { x: 0, y: 1, z: 0 },
        { x: 2, y: 1, z: -1 },
        { x: 1, y: 2, z: -1 },
      ],
    });
  });

  it('hurts the crew that armed it: the mined square is in the blast (6)', () => {
    const state = pit(FLAT_3X3, {}, ['###', '#U#', '###']);
    const after = act(state, { type: 'mine', x: 0, y: 1 }).state;
    const step = endShift(after);
    expect(step.state.crew.health).toBe(CREW.startHealth - CREW.damage.explosion);
    expect(ofType(step.events, 'damageTaken')).toEqual([
      {
        type: 'damageTaken',
        amount: CREW.damage.explosion,
        cause: 'explosion',
        health: CREW.startHealth - CREW.damage.explosion,
      },
    ]);
  });

  it('its blast destroys structures and camps and lights gas, like a charge', () => {
    const state = pit(
      ['1111'],
      {
        supports: [{ x: 2, y: 0, z: 1 }],
        armed: [{ pos: { x: 1, y: 0, z: 1 }, kind: 'unstableOre' }],
      },
      ['#U##'],
    );
    setGasOn(state, 3, 0, 1);
    const { events } = runStep(state);
    expect(explosions(events)).toEqual(['unstableOre: 1,0 0,0 2,0', 'gas: 3,0']);
    expect(structureAt(state, { x: 2, y: 0, z: 1 })).toBe(0);
    expect(depthText(state)).toEqual(['1211']);
  });

  it('a guard: step (c) itself never sets off armed ore that is not a top block', () => {
    // The armed ore lies one layer under a rubble top block. The engine
    // disarms ore at the moment it is buried, so this state cannot arise in
    // play; step (c) checks all the same.
    const state = buildState({
      layers: [['#R'], ['#U'], ['##']],
      armed: [{ pos: { x: 1, y: 0, z: 1 }, kind: 'unstableOre' }],
    });
    const { events } = runStep(state);
    expect(events).toEqual([]);
    expect(state.armed).toEqual([]);
    expect(blockAt(state, { x: 1, y: 0, z: 1 })).toBe(BLOCKS.unstableOre.code);
  });

  it('rubble that slumps onto armed ore disarms it at that moment', () => {
    // Dirt at ground level beside a hole 2 deep, cracked and due; the hole's
    // top block is armed ore. Step (a) drops the dirt onto the ore.
    const state = pit(
      ['02'],
      {
        cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
        armed: [{ pos: { x: 1, y: 0, z: 2 }, kind: 'unstableOre' }],
      },
      ['dU'],
    );
    const slumped: GameEvent[] = [];
    stepSlumps(state, slumped, newCubePhase());
    expect(ofType(slumped, 'blockFell')).toHaveLength(1);
    expect(state.armed).toEqual([]);
    expect(blockAt(state, { x: 1, y: 0, z: 2 })).toBe(BLOCKS.unstableOre.code);
    // And through a whole end of shift nothing goes off.
    const whole = pit(
      ['02'],
      {
        cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
        armed: [{ pos: { x: 1, y: 0, z: 2 }, kind: 'unstableOre' }],
      },
      ['dU'],
    );
    expect(ofType(endShift(whole).events, 'exploded')).toEqual([]);
  });

  it('stone that forms on armed ore disarms it', () => {
    const state = pit(['2'], { armed: [{ pos: { x: 0, y: 0, z: 2 }, kind: 'unstableOre' }] }, [
      'U',
    ]);
    setWaterOn(state, 0, 0, 1);
    setLavaOn(state, 0, 0, 1, false);
    stepFluids(state, [], newCubePhase());
    expect(depthAt(state, 0, 0)).toBe(1);
    expect(state.armed).toEqual([]);
  });

  it('ore in the blast of a charge is destroyed as a block: it does not go off', () => {
    const state = pit(['111'], {}, ['#U#']);
    plant(state, 0, 0);
    const { events } = runStep(state);
    expect(explosions(events)).toEqual(['explosive: 0,0 1,0']);
    expect(depthText(state)).toEqual(['221']);
  });
});

describe('the forecast of charges and armed ore (design doc 6 and 11)', () => {
  it('lists a placed explosive with the cracks, and says what its blast will do', () => {
    let state = pit(FLAT_3X3, { stockpile: { explosive: 1 } });
    state = act(state, { type: 'placeExplosive', x: 1, y: 1 }).state;
    const before = hashState(state);
    const forecast = previewCubePhase(state);
    expect(hashState(state)).toBe(before);
    expect(forecast.countdowns).toEqual([
      { kind: 'explosive', pos: { x: 1, y: 1, z: 0 }, inShifts: 1 },
    ]);
    expect(explosions(forecast.gas)).toEqual(['explosive: 1,1 1,0 0,1 2,1 1,2']);
    expect(ofType(forecast.gas, 'blockDestroyed')).toHaveLength(5);

    // And that is what step (c) then does.
    const real = endShift(state).events.filter(
      (event) => event.type === 'exploded' || event.type === 'blockDestroyed',
    );
    expect(real).toEqual(forecast.gas);
  });

  it('does not depend on what lies under the blast: a hidden cavern changes nothing', () => {
    function charged(withCavern: boolean): GameState {
      const state = pit(FLAT_3X3, {}, undefined, 5);
      if (withCavern) {
        setBlock(state, { x: 1, y: 1, z: 1 }, BLOCKS.air.code);
        setGas(state, { x: 1, y: 1, z: 1 }, HAZARDS.gas.pocketUnitsPerCell);
        setBlock(state, { x: 1, y: 1, z: 2 }, BLOCKS.unstableOre.code);
      }
      plant(state, 1, 1);
      return state;
    }
    expect(previewCubePhase(charged(true))).toEqual(previewCubePhase(charged(false)));
    // What really happens does differ: the pocket comes out and burns.
    const real = endShift(charged(true)).events;
    expect(ofType(real, 'spaceCollapsed')).toHaveLength(1);
  });

  it('the block under a tree in the blast is not in the forecast', () => {
    function underTree(material: string): GameState {
      const state = pit(['000'], { surface: ['T..'] }, [`${material}##`]);
      plant(state, 1, 0);
      return state;
    }
    expect(previewCubePhase(underTree('k'))).toEqual(previewCubePhase(underTree('#')));
  });
});

describe('property: random pits with charges, armed ore and gas', () => {
  /** A random pit; some squares get a charge, some are armed ore, some hold gas or a relic. */
  function randomPit(seed: number): GameState {
    const rng = createRng(seed);
    const size = 3 + nextInt(rng, 4);
    const depths: string[] = [];
    const materials: string[] = [];
    for (let y = 0; y < size; y += 1) {
      let depthRow = '';
      let materialRow = '';
      for (let x = 0; x < size; x += 1) {
        depthRow += String(nextInt(rng, 4));
        materialRow += '#####dHUrk'.charAt(nextInt(rng, 10));
      }
      depths.push(depthRow);
      materials.push(materialRow);
    }
    const state = pit(depths, { seed, health: 200 }, materials, 7);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const depth = depthAt(state, x, y);
        const top = { x, y, z: depth };
        const roll = nextInt(rng, 10);
        if (roll === 0) {
          plant(state, x, y);
        } else if (roll === 1 && blockAt(state, top) === BLOCKS.unstableOre.code) {
          armCharge(state, top, 'unstableOre');
        } else if (roll <= 4 && depth > 0) {
          setGasOn(state, x, y, 1 + nextInt(rng, 30));
        }
        if (nextInt(rng, 3) === 0) {
          state.worked[x + size * y] = 1;
        }
      }
    }
    return state;
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

  it('150 pits: nothing throws, charges are spent, a blast takes at most 1 block a square, gas only burns', () => {
    let blasts = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const state = randomPit(seed);
      const label = `seed ${seed}`;
      const gasBefore = totalGas(state);
      const depthsBefore: number[] = [];
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          depthsBefore.push(depthAt(state, x, y));
        }
      }
      const { events, phase } = runStep(state);

      expect(state.armed, label).toEqual([]);
      expect(
        state.structures.some((code) => code === STRUCTURES.explosive.code),
        label,
      ).toBe(false);
      let burnt = 0;
      // How many blasts of a charge or of ore covered each square: "x,y" -> count.
      const covered = new Map<string, number>();
      for (const event of events) {
        if (event.type === 'exploded') {
          blasts += 1;
          if (event.kind !== 'gas') {
            for (const cell of event.cells) {
              const key = `${cell.x},${cell.y}`;
              covered.set(key, (covered.get(key) ?? 0) + 1);
            }
          }
        }
        if (event.type === 'gasRemoved') {
          expect(event.reason, label).toBe('burnt');
          burnt += event.units;
        }
      }
      expect(totalGas(state), `${label}: gas`).toBe(gasBefore - burnt);
      // Each blast takes one block from a square at most (two charges whose
      // blasts overlap take two), and nothing raises a square.
      let index = 0;
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          const drop = depthAt(state, x, y) - (depthsBefore[index] as number);
          const most = covered.get(`${x},${y}`) ?? 0;
          expect(drop >= 0 && drop <= most, `${label}: (${x}, ${y}) dropped ${drop}`).toBe(true);
          index += 1;
        }
      }
      // Each kind of damage is recorded once at most.
      const causes = phase.damage.map((entry) => entry.cause);
      expect(new Set(causes).size, label).toBe(causes.length);
    }
    expect(blasts).toBeGreaterThan(150);
  });

  it('a replay gives the same hash, through whole ends of shift', { timeout: 30_000 }, () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      let first = randomPit(seed);
      let second = randomPit(seed);
      for (let n = 0; n < 6 && first.status.kind === 'active'; n += 1) {
        first = endShift(first).state;
        second = endShift(second).state;
      }
      expect(hashState(first), `seed ${seed}`).toBe(hashState(second));
    }
  });
});

describe('a pinned blast (in place of a golden run that reaches gas)', () => {
  // No recorded run reaches a gas pocket or unstable ore yet: pockets start 8
  // levels down and the ore 20, and no policy digs that deep (question 85;
  // tests/golden/README.md). Until one does, this scenario pins step (c) the
  // way a golden run would: a fixed pit, every action through `applyAction`,
  // twelve ends of shift, and the hash of the final state. If the hash
  // changes, the rule changed: say so in the PR, as for a golden run.
  //
  // The pit is hard rock, terraced down to a 5 x 3 floor 2 levels deep. Under
  // the west of the floor lies a gas pocket of 6 cells (24 units); the top
  // block at the east end of the floor's middle row is unstable ore.
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
      ap: 30,
      fuel: 20,
      health: 40,
      stockpile: { explosive: 1 },
    });
    for (const cell of [
      { x: 2, y: 2, z: 3 },
      { x: 3, y: 2, z: 3 },
      { x: 2, y: 3, z: 3 },
      { x: 3, y: 3, z: 3 },
      { x: 2, y: 4, z: 3 },
      { x: 3, y: 4, z: 3 },
    ]) {
      setBlock(state, cell, BLOCKS.air.code);
      setGas(state, cell, HAZARDS.gas.pocketUnitsPerCell);
    }
    setBlock(state, { x: 6, y: 3, z: 2 }, BLOCKS.unstableOre.code);
    // As the engine would have it: the tops are seen.
    setRevealed(state, { x: 6, y: 3, z: 2 }, true);
    return state;
  }

  it('plays out the same way every time, to a recorded hash', () => {
    const seen = new Set<string>();
    function note(events: GameEvent[]): void {
      for (const event of events) {
        seen.add(event.type);
      }
    }
    function endOfShift(state: GameState): GameState {
      const step = endShift(state);
      note(step.events);
      // Fresh AP for the next shift's script, whatever the data says.
      return { ...step.state, ap: 30 };
    }

    let state = basin();
    // Shift 1: break into the gas pocket. The gas lies in the hole.
    const breach = act(state, { type: 'mine', x: 3, y: 3 });
    note(breach.events);
    state = breach.state;
    expect(gasOn(state, 3, 3)).toBe(24);
    state = endOfShift(state);
    expect(gasOn(state, 3, 3)).toBe(24);
    expect(state.crew.health).toBe(40 - CREW.damage.gas);

    // Shift 2: dig the square beside it down; the gas spreads there.
    state = act(state, { type: 'mine', x: 4, y: 3 }).state;
    state = endOfShift(state);
    expect(gasOn(state, 3, 3)).toBe(12);
    expect(gasOn(state, 4, 3)).toBe(12);

    // Shift 3: mine beside the unstable ore (it is armed), and place a charge
    // on the gas.
    const armed = act(state, { type: 'mine', x: 5, y: 3 });
    note(armed.events);
    state = armed.state;
    state = act(state, { type: 'placeExplosive', x: 4, y: 3 }).state;
    expect(previewCubePhase(state).countdowns.map((countdown) => countdown.kind)).toEqual([
      'unstableOre',
      'explosive',
    ]);
    state = endOfShift(state);
    expect(gasOn(state, 3, 3) + gasOn(state, 4, 3)).toBe(0);
    // The mined square (5, 3) was in the blast of the ore (6, once) and
    // beside the gas that the charge lit (3).
    expect(state.crew.health).toBe(
      40 - CREW.damage.gas * 2 - CREW.damage.explosion - CREW.damage.gasExplosion,
    );

    for (let n = 0; n < 9; n += 1) {
      state = endOfShift(state);
    }
    for (const type of [
      'spaceCollapsed',
      'gasMoved',
      'oreArmed',
      'exploded',
      'blockDestroyed',
      'gasRemoved',
      'damageTaken',
    ]) {
      expect([...seen], type).toContain(type);
    }
    expect(state.status).toEqual({ kind: 'active' });
    // Where it ended: the blasts left steep steps in the floor and the
    // terraces, and over the next shifts those slumped into the holes.
    expect(depthText(state)).toEqual([
      '000111000',
      '011121110',
      '012222210',
      '012322221',
      '012222210',
      '011121110',
      '000010000',
    ]);
    expect(hashState(state)).toBe('e241214cd8125676');
  });
});
