// Scenario tests for camps (design doc v0.2 sections 4.1, 5 and 8; issue
// #100; decision note 0032): founding on a flat 3 x 3 patch, the mining
// discount near a camp, rest, camp recipes, upkeep and decommissioning.
//
// What a slump does to a camp is tested with the slump rule, in
// tests/engine/campHazards.test.ts.

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, BLOCKS, CAMPS, CAMP_RECIPES, CREW, SHIFT } from '../../src/data';
import {
  applyAction,
  campAtSquare,
  campSquares,
  createRun,
  endShift,
  foundCampCheck,
  hasStump,
  hasTree,
  isWorked,
  legalActions,
  mineCheck,
  mineDiscountAt,
  previewCubePhase,
  stepsFromCamp,
  workedSquares,
} from '../../src/engine';
import type { Action, Camp, GameEvent, GameState } from '../../src/engine';
import { applyRest } from '../../src/engine/camps';
import { stepCrewEffects } from '../../src/engine/cube/crewEffects';
import { newCubePhase, recordDamage } from '../../src/engine/cube/phase';
import { destroyCampsAt } from '../../src/engine/destroy';
import { act, buildState, findActions } from './helpers';
import type { BuildStateOptions } from './helpers';

/** `count` rows of `width` copies of `char`: one layer of a hand-built cube. */
function layer(char: string, width = 7, count = 7): string[] {
  return Array.from({ length: count }, () => char.repeat(width));
}

/**
 * A flat 7 x 7 field of stone, 3 layers thick, with one camp kit and nothing
 * else. `Omit<BuildStateOptions, 'layers'>` is "the same options, without
 * `layers`": the field supplies those itself unless a test passes its own.
 */
function field(options: Partial<BuildStateOptions> = {}): GameState {
  return buildState({
    layers: [layer('#'), layer('#'), layer('#')],
    stockpile: { campKit: 1 },
    ...options,
  });
}

/** A camp in the middle of the field, on the ground, founded in shift 1. */
const MIDDLE_CAMP: Camp = { pos: { x: 3, y: 3, z: 0 }, foundedShift: 1 };

/** The field with a camp already standing in the middle. */
function campField(options: Partial<BuildStateOptions> = {}): GameState {
  return field({ stockpile: {}, camps: [MIDDLE_CAMP], ...options });
}

/** The centre squares where founding is legal now, as "x,y" strings. */
function foundable(state: GameState): string[] {
  return findActions(state, { type: 'foundCamp' }).map((action) =>
    action.type === 'foundCamp' ? `${action.x},${action.y}` : '',
  );
}

describe('the data these scenarios assume', () => {
  it('has the camp numbers of design doc 8', () => {
    expect(CAMPS.halfWidth).toBe(1); // 3 x 3
    expect(CAMPS.mineDiscountAp).toBe(1);
    expect(CAMPS.mineMinAp).toBe(1);
    expect(CAMPS.mineDiscountSteps).toBe(8);
    expect(CAMPS.mineDiscountMaxDeeper).toBe(4);
    expect(CAMPS.upkeepFuel).toBe(1);
    expect(CAMPS.upkeepEveryShifts).toBe(8);
    expect(ACTION_COSTS.decommissionCamp).toBe(1);
    expect(ACTION_COSTS.campCraft).toBe(1);
    expect(BLOCKS.dirt.mineCost).toBe(1);
    expect(BLOCKS.stone.mineCost).toBe(2);
    expect(BLOCKS.hardRock.mineCost).toBe(3);
  });
});

describe('founding a camp (design doc 8: a camp kit and a flat 3 x 3 patch)', () => {
  it('uses up the kit, takes the rest of the shift, and records the camp', () => {
    const state = field({ ap: 3, shift: 6 });
    const { state: after, events } = act(state, { type: 'foundCamp', x: 2, y: 4 });
    expect(after.camps).toEqual([{ pos: { x: 2, y: 4, z: 0 }, foundedShift: 6 }]);
    expect(after.stockpile).toEqual({ campKit: 0 });
    expect(after.ap).toBe(0);
    expect(events).toEqual([{ type: 'campFounded', pos: { x: 2, y: 4, z: 0 } }]);
    // The 9 squares are the camp's.
    const camp = after.camps[0] as Camp;
    expect(campSquares(camp)).toHaveLength(9);
    for (const square of campSquares(camp)) {
      expect(campAtSquare(after, square.x, square.y)).toBe(camp);
    }
    expect(campAtSquare(after, 4, 4)).toBeNull();
    // Founding is not work on the squares (design doc 5.2 does not list it).
    expect(workedSquares(after)).toEqual([]);
  });

  it('costs all the AP that is left, and needs at least 1', () => {
    expect(findActions(field({ ap: 5 }), { type: 'foundCamp', x: 3, y: 3 })).toEqual([
      { type: 'foundCamp', x: 3, y: 3, ap: 5 },
    ]);
    expect(findActions(field({ ap: 1 }), { type: 'foundCamp', x: 3, y: 3 })).toEqual([
      { type: 'foundCamp', x: 3, y: 3, ap: 1 },
    ]);
    expect(CAMPS.foundMinAp).toBe(1);
    expect(findActions(field({ ap: 0 }), { type: 'foundCamp' })).toEqual([]);
  });

  it('is offered for every centre whose whole patch is on the map, and no other', () => {
    // On a flat 7 x 7 field: the 5 x 5 centres that are not on the edge.
    const centres = foundable(field());
    expect(centres).toHaveLength(25);
    expect(centres[0]).toBe('1,1');
    expect(centres[24]).toBe('5,5');
    expect(foundCampCheck(field(), 0, 3)).toEqual({
      allowed: false,
      refusal: 'offMap',
      squares: [],
    });
    expect(foundCampCheck(field(), 3, 6)).toEqual({
      allowed: false,
      refusal: 'offMap',
      squares: [],
    });
    expect(() => foundCampCheck(field(), 7, 3)).toThrow('not a square');
  });

  it('needs a camp kit', () => {
    const state = field({ stockpile: {} });
    expect(foundable(state)).toEqual([]);
    expect(foundCampCheck(state, 3, 3)).toEqual({ allowed: false, refusal: 'noKit', squares: [] });
    const wanted: Action = { type: 'foundCamp', x: 3, y: 3, ap: state.ap };
    expect(() => applyAction(state, wanted)).toThrow('Not a legal action');
  });

  it('refuses a patch with a tree, and names the squares', () => {
    const surface = layer('.');
    surface[2] = '....T..'; // a tree on (4, 2)
    const state = field({ surface });
    expect(foundCampCheck(state, 3, 3)).toEqual({
      allowed: false,
      refusal: 'tree',
      squares: [{ x: 4, y: 2 }],
    });
    // Every patch that holds (4, 2) is refused; the others are not.
    expect(foundable(state)).not.toContain('3,3');
    expect(foundable(state)).not.toContain('5,1');
    expect(foundable(state)).toContain('2,3');
    expect(foundable(state)).toContain('4,4');
  });

  it('refuses a patch that is not flat, and names the squares off the level', () => {
    // (2, 2) and (3, 2) are 1 level down.
    const top = layer('#');
    top[2] = '##..###';
    const state = field({ layers: [top, layer('#'), layer('#')] });
    expect(foundCampCheck(state, 3, 3)).toEqual({
      allowed: false,
      refusal: 'notFlat',
      squares: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ],
    });
    // Asked from a low centre, the squares off the level are the high ones.
    expect(foundCampCheck(state, 2, 2).refusal).toBe('notFlat');
    expect(foundCampCheck(state, 2, 2).squares).toHaveLength(7);
    expect(foundCampCheck(state, 3, 5).allowed).toBe(true);
  });

  it('founds at depth: the patch is the floor of a pit, and the camp remembers its depth', () => {
    // A 3 x 3 pit, 2 levels deep, in the middle of the field.
    const pitLayer = layer('#');
    for (const y of [2, 3, 4]) {
      pitLayer[y] = '##...##';
    }
    const state = field({ layers: [pitLayer, pitLayer, layer('#'), layer('#')] });
    expect(foundable(state)).toEqual(['3,3']);
    const { state: after } = act(state, { type: 'foundCamp', x: 3, y: 3 });
    expect(after.camps).toEqual([{ pos: { x: 3, y: 3, z: 2 }, foundedShift: 1 }]);
  });

  it('refuses a patch with water, lava or gas standing on it', () => {
    // The whole field is 1 level down, so that something can stand on it.
    const layers = [layer('.'), layer('#'), layer('#')];
    const here = { x: 4, y: 4, z: 0 };
    const wet = field({ layers, water: [here] });
    expect(foundCampCheck(wet, 3, 3)).toEqual({
      allowed: false,
      refusal: 'water',
      squares: [{ x: 4, y: 4 }],
    });
    const hot = field({ layers, lava: [here] });
    expect(foundCampCheck(hot, 3, 3).refusal).toBe('lava');
    const gassy = field({ layers, gas: [{ pos: here, units: 2 }] });
    expect(foundCampCheck(gassy, 3, 3).refusal).toBe('gas');
    for (const state of [wet, hot, gassy]) {
      expect(foundable(state)).not.toContain('3,3');
      expect(foundable(state)).toContain('1,1'); // a patch clear of it
    }
  });

  it('refuses a patch with a structure on it', () => {
    const state = field({ supports: [{ x: 2, y: 3, z: 0 }] });
    expect(foundCampCheck(state, 3, 3)).toEqual({
      allowed: false,
      refusal: 'structure',
      squares: [{ x: 2, y: 3 }],
    });
    expect(foundCampCheck(state, 4, 3).allowed).toBe(true);
  });

  it('refuses a patch on the bedrock floor', () => {
    const state = field({ layers: [layer('.'), layer('.')] });
    expect(foundCampCheck(state, 3, 3).refusal).toBe('bottom');
    expect(foundable(state)).toEqual([]);
  });

  it('camps do not overlap, but may stand side by side', () => {
    const state = campField({ stockpile: { campKit: 1 } });
    expect(foundCampCheck(state, 4, 4)).toEqual({
      allowed: false,
      refusal: 'camp',
      squares: [
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
      ],
    });
    // A 7 x 7 field has no room for a second 3 x 3 patch clear of the middle.
    expect(foundable(state)).toEqual([]);

    const wide = buildState({
      layers: [layer('#', 8, 5), layer('#', 8, 5)],
      stockpile: { campKit: 1 },
      camps: [{ pos: { x: 1, y: 2, z: 0 }, foundedShift: 1 }],
    });
    expect(foundCampCheck(wide, 3, 2).refusal).toBe('camp');
    expect(foundCampCheck(wide, 4, 2).allowed).toBe(true);
    const { state: after } = act(wide, { type: 'foundCamp', x: 4, y: 2 });
    expect(after.camps).toHaveLength(2);
  });

  it('clears a stump on the patch for good: no tree grows on a camp', () => {
    const surface = layer('.');
    surface[3] = '...s...'; // a stump on the centre square
    const state = field({ surface, stumpAges: [{ pos: { x: 3, y: 3, z: 0 }, age: 9 }] });
    const stumpCell = { x: 3, y: 3, z: -1 };
    expect(hasStump(state, stumpCell)).toBe(true);
    let { state: after } = act(state, { type: 'foundCamp', x: 3, y: 3 });
    expect(hasStump(after, stumpCell)).toBe(false);
    // The stump was due to grow back at the end of this shift; it does not.
    after = endShift(after).state;
    expect(hasTree(after, stumpCell)).toBe(false);
  });
});

describe('camp squares cannot be mined while the camp stands (design doc 8)', () => {
  it('refuses the 9 squares with the reason "camp", and no others', () => {
    const state = campField({ ap: 100 });
    expect(mineCheck(state, 3, 3)).toEqual({
      allowed: false,
      refusal: 'camp',
      higherNeighbours: [],
      ap: null,
      campDiscount: null,
      drillSaving: null,
    });
    const mineable = findActions(state, { type: 'mine' });
    expect(mineable).toHaveLength(49 - 9);
    for (const square of campSquares(MIDDLE_CAMP)) {
      expect(mineCheck(state, square.x, square.y).refusal).toBe('camp');
    }
    const wanted: Action = { type: 'mine', x: 3, y: 3, ap: 1 };
    expect(() => applyAction(state, wanted)).toThrow('Not a legal action');
  });

  it('lets them be mined again once the camp is decommissioned', () => {
    let state = campField({ ap: 100 });
    state = act(state, { type: 'decommissionCamp', x: 3, y: 3 }).state;
    expect(mineCheck(state, 3, 3).allowed).toBe(true);
    expect(findActions(state, { type: 'mine' })).toHaveLength(49);
  });
});

describe('mining near a camp is cheaper (design doc 8; owner, question 90)', () => {
  /** A 12 x 3 strip with a camp at its west end: squares up to 9 steps east of it. */
  function strip(top: string, options: Partial<BuildStateOptions> = {}): GameState {
    return buildState({
      layers: [[top, top, top], layer('#', 12, 3), layer('#', 12, 3)],
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
      ap: 100,
      ...options,
    });
  }

  it('counts steps from the nearest camp square, with no diagonals', () => {
    expect(stepsFromCamp(MIDDLE_CAMP, 3, 3)).toBe(0); // the centre
    expect(stepsFromCamp(MIDDLE_CAMP, 4, 4)).toBe(0); // a corner square of the camp
    expect(stepsFromCamp(MIDDLE_CAMP, 5, 3)).toBe(1); // beside the east edge
    expect(stepsFromCamp(MIDDLE_CAMP, 3, 0)).toBe(2);
    expect(stepsFromCamp(MIDDLE_CAMP, 6, 6)).toBe(4); // 2 east and 2 south of the corner
    expect(stepsFromCamp(MIDDLE_CAMP, 0, 6)).toBe(4);
  });

  it('takes 1 AP off within 8 steps of a camp square, and nothing further away', () => {
    const state = strip('############');
    // The camp covers x = 0..2. x = 3..10 are 1 to 8 steps away; x = 11 is 9.
    for (const x of [3, 4, 7, 10]) {
      expect(mineDiscountAt(state, x, 1)).toBe(1);
      expect(mineCheck(state, x, 1)).toMatchObject({ allowed: true, ap: 1, campDiscount: 1 });
    }
    for (const x of [11]) {
      expect(mineDiscountAt(state, x, 1)).toBe(0);
      expect(mineCheck(state, x, 1)).toMatchObject({ allowed: true, ap: 2, campDiscount: 0 });
    }
    // A corner of the reach: (10, 0) is 8 east and 0 north of the camp's edge
    // rows (y = 0..2 are all camp rows here), so it is 8 steps away.
    expect(mineDiscountAt(state, 10, 0)).toBe(1);
  });

  it('is what the mine action charges', () => {
    const state = strip('############', { ap: 5 });
    const near = act(state, { type: 'mine', x: 4, y: 1 });
    expect(near.state.ap).toBe(4); // stone: 2, less 1
    const far = act(state, { type: 'mine', x: 11, y: 1 });
    expect(far.state.ap).toBe(3); // stone at its own cost
    // The undiscounted price is no longer a legal action near the camp.
    const fullPrice: Action = { type: 'mine', x: 4, y: 1, ap: 2 };
    expect(() => applyAction(state, fullPrice)).toThrow('Not a legal action');
  });

  it('never takes a mine below 1 AP', () => {
    const state = strip('###dH#######');
    // Dirt costs 1 already: it stays 1, and no discount is counted.
    expect(mineCheck(state, 3, 1)).toMatchObject({ ap: 1, campDiscount: 0 });
    // Hard rock: 3 becomes 2.
    expect(mineCheck(state, 4, 1)).toMatchObject({ ap: 2, campDiscount: 1 });
  });

  it('applies no more than 4 levels below the camp, and anywhere above it', () => {
    // A hazard-made hole (the level rule would not let the player dig it):
    // the square (4, 1) is 4 levels down and (5, 1) is 5 levels down.
    const rows = (row: string): string[] => [row, row, row];
    const state = buildState({
      layers: [
        rows('####..##'),
        rows('####..##'),
        rows('####..##'),
        rows('####..##'),
        rows('#####.##'),
        rows('########'),
      ],
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
    });
    expect(mineDiscountAt(state, 4, 1)).toBe(1); // 4 deeper: still near enough
    expect(mineDiscountAt(state, 5, 1)).toBe(0); // 5 deeper: too deep, though 3 steps away

    // A camp on the floor of a pit gives the discount to the higher ground
    // round it too.
    const pitLayer = layer('#');
    for (const y of [2, 3, 4]) {
      pitLayer[y] = '##...##';
    }
    const pit = buildState({
      layers: [pitLayer, pitLayer, layer('#'), layer('#')],
      camps: [{ pos: { x: 3, y: 3, z: 2 }, foundedShift: 1 }],
    });
    expect(mineDiscountAt(pit, 1, 3)).toBe(1); // ground level, 2 levels above the camp
  });

  it('is given once where two camps are both near', () => {
    const state = buildState({
      layers: [layer('#', 9, 3), layer('#', 9, 3)],
      camps: [
        { pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 },
        { pos: { x: 7, y: 1, z: 0 }, foundedShift: 1 },
      ],
    });
    // (4, 1) is 2 steps from each camp. Stone: 2 less 1, not 2 less 2.
    expect(mineCheck(state, 4, 1)).toMatchObject({ ap: 1, campDiscount: 1 });
  });

  it('ends when the camp is decommissioned or destroyed', () => {
    const standing = strip('############');
    expect(mineCheck(standing, 4, 1).ap).toBe(1);
    const decommissioned = act(standing, { type: 'decommissionCamp', x: 1, y: 1 }).state;
    expect(mineCheck(decommissioned, 4, 1).ap).toBe(2);
    const destroyed = strip('############');
    destroyCampsAt(destroyed, { x: 0, y: 0, z: 0 }, 'water', []);
    expect(mineCheck(destroyed, 4, 1).ap).toBe(2);
  });
});

describe('resting at a camp (design doc 4.1, 5.1 and 8)', () => {
  it('is offered for each camp, costs all the AP left, and needs at least 1', () => {
    const state = buildState({
      layers: [layer('#', 9, 3), layer('#', 9, 3)],
      ap: 3,
      camps: [
        { pos: { x: 7, y: 1, z: 0 }, foundedShift: 2 },
        { pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 },
      ],
    });
    expect(findActions(state, { type: 'rest' })).toEqual([
      { type: 'rest', x: 1, y: 1, ap: 3 },
      { type: 'rest', x: 7, y: 1, ap: 3 },
    ]);
    expect(CAMPS.restMinAp).toBe(1);
    expect(findActions(campField({ ap: 0 }), { type: 'rest' })).toEqual([]);
    // No camp, no rest.
    expect(findActions(field(), { type: 'rest' })).toEqual([]);
  });

  it('restores crew health to full at the end of the shift', () => {
    const state = campField({ health: 4, ap: 2 });
    const rested = act(state, { type: 'rest', x: 3, y: 3 });
    expect(rested.state.ap).toBe(0);
    expect(rested.state.crew).toEqual({ health: 4, restingAt: { x: 3, y: 3 } });
    expect(rested.events).toEqual([{ type: 'restStarted', pos: { x: 3, y: 3, z: 0 } }]);

    const { state: after, events } = endShift(rested.state);
    expect(after.crew).toEqual({ health: CREW.startHealth, restingAt: null });
    expect(events).toContainEqual({
      type: 'healthRestored',
      amount: CREW.startHealth - 4,
      health: CREW.startHealth,
    });
  });

  it('a crew at full health may rest; nothing is restored', () => {
    const rested = act(campField(), { type: 'rest', x: 3, y: 3 }).state;
    const { state: after, events } = endShift(rested);
    expect(after.crew.health).toBe(CREW.startHealth);
    expect(events.filter((event) => event.type === 'healthRestored')).toEqual([]);
  });

  it("makes the camp's 9 squares worked squares from the moment of the action", () => {
    // The T5 reviewer's point: the squares must be worked BEFORE step (a) of
    // the cube phase, so that a hazard reaching the camp hurts the resting
    // crew; step (e) forgets worked squares only after the rest.
    const state = campField({ worked: [{ x: 0, y: 0 }] });
    const rested = act(state, { type: 'rest', x: 3, y: 3 }).state;
    expect(workedSquares(rested)).toEqual([{ x: 0, y: 0 }, ...campSquares(MIDDLE_CAMP)]);

    // A hazard step that reaches a camp square during the cube phase finds
    // it worked, and its damage is recorded.
    const phase = newCubePhase();
    expect(recordDamage(rested, phase, 'slump', CREW.damage.slump, 4, 2)).toBe(true);
    expect(recordDamage(rested, phase, 'gas', CREW.damage.gas, 6, 6)).toBe(false);

    // After the end of the shift nothing is worked any more.
    const after = endShift(rested).state;
    expect(workedSquares(after)).toEqual([]);
    expect(isWorked(after, 3, 3)).toBe(false);
  });

  it('damage comes first, then rest: a hurt crew that lives is restored to full', () => {
    const rested = act(campField({ health: 5 }), { type: 'rest', x: 3, y: 3 }).state;
    const phase = newCubePhase();
    recordDamage(rested, phase, 'gas', 1, 3, 3);
    const events: GameEvent[] = [];
    stepCrewEffects(rested, events, phase);
    expect(events).toEqual([
      { type: 'damageTaken', amount: 1, cause: 'gas', health: 4 },
      { type: 'healthRestored', amount: 6, health: 10 },
    ]);
    expect(rested.crew).toEqual({ health: 10, restingAt: null });
  });

  it('rest does not save a crew that the same cube phase kills', () => {
    const rested = act(campField({ health: 3 }), { type: 'rest', x: 3, y: 3 }).state;
    const phase = newCubePhase();
    recordDamage(rested, phase, 'slump', 3, 3, 3);
    const events: GameEvent[] = [];
    stepCrewEffects(rested, events, phase);
    expect(rested.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'buried' });
    expect(rested.crew.health).toBe(0);
    expect(events.filter((event) => event.type === 'healthRestored')).toEqual([]);
  });

  it('there is no rest at a camp that was destroyed earlier in the cube phase', () => {
    const rested = act(campField({ health: 5 }), { type: 'rest', x: 3, y: 3 }).state;
    const events: GameEvent[] = [];
    // Water enters a camp square in step (b), say, and hurts the crew there.
    const phase = newCubePhase();
    destroyCampsAt(rested, { x: 2, y: 2, z: 0 }, 'water', events);
    recordDamage(rested, phase, 'water', CREW.damage.water, 2, 2);
    stepCrewEffects(rested, events, phase);
    expect(events).toEqual([
      { type: 'campDestroyed', pos: { x: 3, y: 3, z: 0 }, cause: 'water' },
      { type: 'damageTaken', amount: 1, cause: 'water', health: 4 },
    ]);
    expect(rested.crew).toEqual({ health: 4, restingAt: null });
  });

  it('resting at one camp is not undone by losing another', () => {
    const state = buildState({
      layers: [layer('#', 9, 3), layer('#', 9, 3)],
      health: 2,
      camps: [
        { pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 },
        { pos: { x: 7, y: 1, z: 0 }, foundedShift: 1 },
      ],
    });
    const rested = act(state, { type: 'rest', x: 1, y: 1 }).state;
    // Only the camp rested at has worked squares.
    expect(isWorked(rested, 1, 1)).toBe(true);
    expect(isWorked(rested, 7, 1)).toBe(false);
    destroyCampsAt(rested, { x: 7, y: 1, z: 0 }, 'lava', []);
    applyRest(rested, []);
    expect(rested.crew.health).toBe(CREW.startHealth);
  });
});

describe('decommissioning a camp (design doc 8)', () => {
  it('costs 1 AP, removes the camp, and does not give the kit back', () => {
    const state = campField({ ap: 5 });
    expect(findActions(state, { type: 'decommissionCamp' })).toEqual([
      { type: 'decommissionCamp', x: 3, y: 3, ap: 1 },
    ]);
    const { state: after, events } = act(state, { type: 'decommissionCamp', x: 3, y: 3 });
    expect(after.ap).toBe(4);
    expect(after.camps).toEqual([]);
    expect(after.stockpile).toEqual({});
    expect(events).toEqual([{ type: 'campDecommissioned', pos: { x: 3, y: 3, z: 0 } }]);
    // With the camp go its rest and its recipes.
    expect(findActions(after, { type: 'rest' })).toEqual([]);
    expect(findActions(after, { type: 'decommissionCamp' })).toEqual([]);
  });

  it('is not offered with no AP left, or with no camp', () => {
    expect(findActions(campField({ ap: 0 }), { type: 'decommissionCamp' })).toEqual([]);
    expect(findActions(field(), { type: 'decommissionCamp' })).toEqual([]);
  });
});

describe('camp recipes (design doc 7.2: camp only)', () => {
  /** A stockpile holding exactly the inputs of every camp recipe, added up. */
  function inputsOfEverything(): Record<string, number> {
    const stockpile: Record<string, number> = {};
    for (const recipe of CAMP_RECIPES) {
      for (const input of recipe.inputs) {
        stockpile[input.item] = (stockpile[input.item] ?? 0) + input.count;
      }
    }
    return stockpile;
  }

  /** The ids of the recipes that can be crafted now, in list order. */
  function craftable(state: GameState): string[] {
    return findActions(state, { type: 'craft' }).map((action) =>
      action.type === 'craft' ? action.recipe : '',
    );
  }

  it('has the recipes of the design doc table', () => {
    expect(CAMP_RECIPES.map((recipe) => recipe.id)).toEqual([
      'ironIngot',
      'copperIngot',
      'drill',
      'pump',
      'vent',
      'scannerCharge',
      'sealant',
      'explosive',
      'campKit',
    ]);
  });

  it('are offered only while a camp stands', () => {
    const stockpile = inputsOfEverything();
    const noCamp = field({ stockpile });
    // Timber and stone, and coal, are there: the two field recipes and no more.
    expect(craftable(noCamp)).toEqual(['support', 'fuel']);
    const smelt: Action = { type: 'craft', recipe: 'ironIngot', ap: ACTION_COSTS.campCraft };
    expect(() => applyAction(noCamp, smelt)).toThrow('Not a legal action');

    const withCamp = campField({ stockpile });
    expect(craftable(withCamp)).toEqual([
      'support',
      'fuel',
      ...CAMP_RECIPES.map((recipe) => recipe.id),
    ]);

    // A camp that is decommissioned or destroyed takes its recipes with it.
    const gone = act(withCamp, { type: 'decommissionCamp', x: 3, y: 3 }).state;
    expect(craftable(gone)).toEqual(['support', 'fuel']);
    destroyCampsAt(withCamp, { x: 3, y: 3, z: 0 }, 'lava', []);
    expect(craftable(withCamp)).toEqual(['support', 'fuel']);
  });

  it('are not offered without their inputs', () => {
    expect(craftable(campField({ stockpile: { rawIronOre: 2 } }))).toEqual([]);
    expect(craftable(campField({ stockpile: { rawIronOre: 2, coal: 1 } }))).toEqual([
      'fuel',
      'ironIngot',
    ]);
  });

  // One test for each recipe in the table: inputs out, output in, 1 AP.
  for (const recipe of CAMP_RECIPES) {
    it(`${recipe.id}: takes its inputs and gives its output, for 1 AP`, () => {
      const stockpile: Record<string, number> = {};
      for (const input of recipe.inputs) {
        stockpile[input.item] = input.count;
      }
      const state = campField({ stockpile, ap: 5 });
      const { state: after, events } = act(state, { type: 'craft', recipe: recipe.id });
      expect(after.ap).toBe(5 - ACTION_COSTS.campCraft);

      const output = recipe.output;
      if (output.kind !== 'item') {
        throw new Error('every camp recipe makes an item');
      }
      const expected: Record<string, number> = {};
      for (const input of recipe.inputs) {
        expected[input.item] = 0;
      }
      expected[output.item] = output.count;
      expect(after.stockpile).toEqual(expected);
      expect(events).toEqual([
        { type: 'crafted', recipe: recipe.id },
        { type: 'itemGained', item: output.item, count: output.count },
      ]);
    });
  }

  it('smelting: 2 raw ore and 1 coal make 2 ingots', () => {
    const state = campField({ stockpile: { rawCopperOre: 5, coal: 3 } });
    const { state: after } = act(state, { type: 'craft', recipe: 'copperIngot' });
    expect(after.stockpile).toEqual({ rawCopperOre: 3, coal: 2, copperIngot: 2 });
  });

  it('a crafted camp kit founds the next camp', () => {
    const state = buildState({
      layers: [layer('#', 8, 5), layer('#', 8, 5)],
      stockpile: { ironIngot: 4, timber: 4, copperIngot: 2 },
      camps: [{ pos: { x: 1, y: 2, z: 0 }, foundedShift: 1 }],
    });
    expect(findActions(state, { type: 'foundCamp' })).toEqual([]);
    const crafted = act(state, { type: 'craft', recipe: 'campKit' }).state;
    const founded = act(crafted, { type: 'foundCamp', x: 5, y: 2 }).state;
    expect(founded.camps).toHaveLength(2);
    expect(founded.stockpile.campKit).toBe(0);
  });
});

describe('camp upkeep (design doc 4: 1 fuel per active camp every 8 shifts)', () => {
  /** End `count` shifts and return the fuel after each. */
  function fuelOverShifts(start: GameState, count: number): number[] {
    const fuel: number[] = [];
    let state = start;
    for (let i = 0; i < count; i += 1) {
      state = endShift(state).state;
      fuel.push(state.fuel);
    }
    return fuel;
  }

  it('burns 1 extra fuel at the end of every 8th shift, counting the founding shift as the first', () => {
    expect(SHIFT.fuelPerShift).toBe(1);
    // Founded in shift 1: the extra fuel goes at the end of shifts 8 and 16.
    const state = campField({ fuel: 20, shift: 1 });
    expect(fuelOverShifts(state, 9)).toEqual([19, 18, 17, 16, 15, 14, 13, 11, 10]);

    // Founded in shift 6 (the action records the shift): shifts 13 and 21.
    let later = field({ fuel: 20, shift: 6 });
    later = act(later, { type: 'foundCamp', x: 3, y: 3 }).state;
    expect(fuelOverShifts(later, 8)).toEqual([19, 18, 17, 16, 15, 14, 13, 11]);
  });

  it('counts each camp from its own founding shift', () => {
    const state = buildState({
      layers: [layer('#', 9, 3), layer('#', 9, 3)],
      fuel: 20,
      shift: 3,
      camps: [
        { pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }, // due at the end of shifts 8, 16
        { pos: { x: 7, y: 1, z: 0 }, foundedShift: 3 }, // due at the end of shifts 10, 18
      ],
    });
    // Ends of shifts 3 to 10: 2 at the end of shift 8 and of shift 10.
    expect(fuelOverShifts(state, 8)).toEqual([19, 18, 17, 16, 15, 13, 12, 10]);
  });

  it('two camps due in the same shift burn 2', () => {
    const state = buildState({
      layers: [layer('#', 9, 3), layer('#', 9, 3)],
      fuel: 20,
      shift: 8,
      camps: [
        { pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 },
        { pos: { x: 7, y: 1, z: 0 }, foundedShift: 1 },
      ],
    });
    expect(fuelOverShifts(state, 1)).toEqual([17]);
  });

  it('the end-shift preview says what the camps will burn', () => {
    const due = campField({ fuel: 20, shift: 8 });
    expect(previewCubePhase(due).upkeep).toEqual({
      fuelConsumed: 2,
      campFuelConsumed: 1,
      fuelAfter: 18,
      runEnds: null,
    });
    const notDue = campField({ fuel: 20, shift: 3 });
    expect(previewCubePhase(notDue).upkeep).toEqual({
      fuelConsumed: 1,
      campFuelConsumed: 0,
      fuelAfter: 19,
      runEnds: null,
    });
  });

  it('takes no more fuel than there is; the run then ends by the usual zero-fuel rule', () => {
    const state = campField({ fuel: 1, shift: 8 });
    expect(previewCubePhase(state).upkeep).toEqual({
      fuelConsumed: 1,
      campFuelConsumed: 0,
      fuelAfter: 0,
      runEnds: null,
    });
    const atZero = endShift(state).state;
    expect(atZero.fuel).toBe(0);
    expect(atZero.status).toEqual({ kind: 'active' }); // one last shift
    const ended = endShift(atZero).state;
    expect(ended.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'outOfFuel' });
  });

  it('a decommissioned camp burns nothing', () => {
    let state = campField({ fuel: 20, shift: 8 });
    state = act(state, { type: 'decommissionCamp', x: 3, y: 3 }).state;
    expect(fuelOverShifts(state, 1)).toEqual([19]);
  });
});

describe('nothing hidden decides a camp action', () => {
  it('founding, the discount and the refusals are the same whatever lies under the tops', () => {
    // Two fields that differ only below their top blocks: plain stone under
    // one, an ore body and a cavern under the other.
    const top = layer('#');
    top[1] = '#.#####'; // one square 1 level down, so the field is not all flat
    const plain = field({ layers: [top, layer('#'), layer('#'), layer('#')] });
    const rich = field({ layers: [top, layer('i'), layer('.'), layer('H')] });
    expect(findActions(rich, { type: 'foundCamp' })).toEqual(
      findActions(plain, { type: 'foundCamp' }),
    );
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        expect(foundCampCheck(rich, x, y)).toEqual(foundCampCheck(plain, x, y));
      }
    }
    const plainCamp = act(plain, { type: 'foundCamp', x: 4, y: 4 }).state;
    const richCamp = act(rich, { type: 'foundCamp', x: 4, y: 4 }).state;
    plainCamp.ap = 5;
    richCamp.ap = 5;
    expect(findActions(richCamp, { type: 'mine' })).toEqual(
      findActions(plainCamp, { type: 'mine' }),
    );
  });
});

describe('the list of camp sites and the check for one centre agree', () => {
  it('on generated cubes, before and after some digging and cutting', () => {
    // `foundCampSites` rules most centres out with a quick test of its own;
    // this pins that it never disagrees with `foundCampCheck`.
    for (const seed of [3, 11, 24]) {
      let state = createRun(seed, 'none', 'standard');
      for (let round = 0; round < 3; round += 1) {
        const offered = new Set(foundable(state));
        for (let y = 0; y < state.size.y; y += 1) {
          for (let x = 0; x < state.size.x; x += 1) {
            expect(offered.has(`${x},${y}`)).toBe(foundCampCheck(state, x, y).allowed);
          }
        }
        // Change the map a little: take the first few mines and cuts on offer.
        const changes = legalActions(state).filter(
          (action) => action.type === 'mine' || action.type === 'cutTree',
        );
        for (const action of changes.slice(round * 7, round * 7 + 2)) {
          state = applyAction({ ...state, ap: 5 }, { ...action }).state;
        }
      }
    }
  }, 30000); // three generated cubes, checked square by square: slow on the CI machine
});
