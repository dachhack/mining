// Pit walls slump (design doc v0.2 section 6.1; owner questions 81 and 82;
// issue #94): slide paths, unstable squares, cracks and their countdowns, the
// slump, cascades, supports, and what a slump does to the crew.
//
// Every test draws a small pit from above with `terrainLayers`: a row of
// digits is a row of squares and each digit is a depth.

import { describe, expect, it } from 'vitest';
import { BLOCKS, CREW, HAZARDS, STRUCTURES, SURFACE } from '../../src/data';
import {
  applyAction,
  createRng,
  depthAt,
  endShift,
  fallOf,
  footOf,
  hashState,
  isWorked,
  knownSquare,
  legalActions,
  nextInt,
  previewCubePhase,
  slidePath,
  slumpCheck,
  structureOnSquare,
  supportCheck,
  surfaceKindAt,
  unstableAfterMine,
  unstableSquares,
} from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { contentsOn } from '../../src/engine/breach';
import { blockAt, crackTimerAt, setBlock, setWater, waterAt } from '../../src/engine/state';
import { act, buildState, depthText, findActions, terrainLayers } from './helpers';
import type { BuildStateOptions } from './helpers';

/** A pit drawn from above. `materials` defaults to stone everywhere. */
function pit(
  depths: string[],
  materials?: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
): GameState {
  return buildState({ layers: terrainLayers(depths, materials), ...options });
}

/** End the shift `count` times, collecting every event. */
function endShifts(state: GameState, count: number): { state: GameState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = endShift(current);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

/** The number a crack shows on the top block of square (x, y), or `null` for no crack. */
function shownCrack(state: GameState, x: number, y: number): number | null {
  const top = knownSquare(state, x, y).top;
  return top === null || top.crackTimer === null ? null : top.crackTimer + 1;
}

/** The events of one type. `Extract<...>` picks that member of the `GameEvent` union. */
function eventsOf<T extends GameEvent['type']>(
  events: GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event) => event.type === type) as Extract<GameEvent, { type: T }>[];
}

describe('the slide path (design doc 6.1)', () => {
  it('a square with no deeper neighbour is its own foot: no path, no fall', () => {
    const state = pit(['000', '000', '000']);
    expect(slidePath(state, 1, 1)).toEqual([]);
    expect(footOf(state, 1, 1)).toEqual({ x: 1, y: 1 });
    expect(fallOf(state, 1, 1)).toBe(0);
  });

  it('goes down a staircase to the foot, and the fall is how much deeper the foot is', () => {
    const state = pit(['0123']);
    expect(slidePath(state, 0, 0)).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(footOf(state, 0, 0)).toEqual({ x: 3, y: 0 });
    expect(fallOf(state, 0, 0)).toBe(3);
    expect(fallOf(state, 2, 0)).toBe(1);
    expect(fallOf(state, 3, 0)).toBe(0);
  });

  it('steps to the LOWEST neighbour, not the first one that is deeper', () => {
    // From the middle: north is 1 down, south is 2 down.
    const state = pit(['010', '000', '020']);
    expect(slidePath(state, 1, 1)).toEqual([{ x: 1, y: 2 }]);
    expect(fallOf(state, 1, 1)).toBe(2);
  });

  it('breaks a tie north, east, south, west', () => {
    // All four neighbours of the middle are 1 down: north wins.
    expect(slidePath(pit(['010', '101', '010']), 1, 1)).toEqual([{ x: 1, y: 0 }]);
    // East, south and west: east wins.
    expect(slidePath(pit(['000', '101', '010']), 1, 1)).toEqual([{ x: 2, y: 1 }]);
    // South and west: south wins.
    expect(slidePath(pit(['000', '100', '010']), 1, 1)).toEqual([{ x: 1, y: 2 }]);
  });

  it('ends at the first square with no deeper neighbour, whatever lies beyond it', () => {
    // 0 1 1 3: the path from x=0 reaches x=1, whose lowest neighbour (x=2) is
    // level with it, so x=1 is the foot. The hole at x=3 is not reached.
    const state = pit(['0113']);
    expect(footOf(state, 0, 0)).toEqual({ x: 1, y: 0 });
    expect(fallOf(state, 0, 0)).toBe(1);
  });

  it('the sides of the cube are not neighbours, and diagonals do not count', () => {
    // The corner square's only neighbours are level with it; the deep square
    // touches it only by a corner.
    const state = pit(['00', '03']);
    expect(slidePath(state, 0, 0)).toEqual([]);
    expect(() => slidePath(state, 2, 0)).toThrow('not a square');
  });
});

describe('unstable squares (design doc 6.1)', () => {
  it('tall: dirt slumps at the top of a slope that falls 2, and holds one that falls 1', () => {
    const state = pit(['012'], ['ddd']);
    expect(slumpCheck(state, 0, 0)).toEqual({
      unstable: true,
      reason: 'tall',
      heldBy: null,
      foot: { x: 2, y: 0 },
      fall: 2,
      limit: 1,
    });
    expect(slumpCheck(state, 1, 0).unstable).toBe(false);
    expect(slumpCheck(state, 2, 0).unstable).toBe(false);
  });

  it('tall: the slump limit is the top block own material', () => {
    // A slope that falls 3 from x=0, 2 from x=1 and 1 from x=2.
    const depths = ['0123'];
    // [material, the falls it holds]: unstable only when the fall is more than the limit.
    const cases: [string, number][] = [
      ['d', 1], // dirt
      ['R', 1], // rubble
      ['#', 2], // stone
      ['c', 2], // coal seam
      ['i', 2], // iron ore
      ['H', 3], // hard rock
      ['x', 3], // crystal
    ];
    for (const [material, limit] of cases) {
      const state = pit(depths, [material.repeat(4)]);
      for (let x = 0; x < 4; x += 1) {
        const fall = 3 - x;
        expect(slumpCheck(state, x, 0).unstable, `${material} with a fall of ${fall}`).toBe(
          fall > limit,
        );
      }
    }
  });

  it('tall: only the top block counts, not the material of the slope below it', () => {
    // Stone at the top of a dirt slope that falls 2 holds; dirt on stone does not.
    expect(slumpCheck(pit(['012'], ['#dd']), 0, 0).unstable).toBe(false);
    expect(slumpCheck(pit(['012'], ['d##']), 0, 0).unstable).toBe(true);
  });

  it('steep: 2 or more levels above a neighbour is unstable whatever the material', () => {
    // Hard rock holds a fall of 3, but not as one step of 2.
    const state = pit(['02'], ['HH']);
    const check = slumpCheck(state, 0, 0);
    expect(check.unstable).toBe(true);
    expect(check.reason).toBe('steep');
    expect(check.fall).toBe(2);
    // The low square is not steep: "higher than a neighbour" is what counts.
    expect(slumpCheck(state, 1, 0).unstable).toBe(false);
    // A step of 1 is not steep.
    expect(slumpCheck(pit(['01'], ['HH']), 0, 0).unstable).toBe(false);
  });

  it('a level bench makes a dirt slope stable', () => {
    // Two steps of 1 with a level bench between them: no square falls 2.
    const state = pit(['01122'], ['ddddd']);
    expect(unstableSquares(state)).toEqual([]);
    // Without the bench the top square falls 2.
    expect(unstableSquares(pit(['0122'], ['dddd']))).toEqual([
      { x: 0, y: 0, reason: 'tall', foot: { x: 2, y: 0 }, fall: 2 },
    ]);
  });

  it('a tree holds its square, and the block under it is not read', () => {
    const state = pit(['012'], ['ddd'], { surface: ['T..'] });
    const check = slumpCheck(state, 0, 0);
    expect(check).toMatchObject({ unstable: false, heldBy: 'tree', limit: null });
    // The same answer whatever the tree hides.
    const other = pit(['012'], ['Hdd'], { surface: ['T..'] });
    expect(slumpCheck(other, 0, 0)).toEqual(check);
  });

  it('a support holds its square', () => {
    const state = pit(['012'], ['ddd'], { supports: [{ x: 0, y: 0, z: 0 }] });
    expect(slumpCheck(state, 0, 0)).toMatchObject({ unstable: false, heldBy: 'support' });
    expect(unstableSquares(state)).toEqual([]);
  });

  it('a square with no block left is never unstable', () => {
    // One layer: the dug square shows the bedrock floor.
    const state = buildState({ layers: [['.#']] });
    expect(depthAt(state, 0, 0)).toBe(1);
    expect(slumpCheck(state, 0, 0).unstable).toBe(false);
  });
});

describe('cracks and the slump (design doc 6.1)', () => {
  it('an unstable square cracks at the end of the shift, with a countdown of 2', () => {
    const state = pit(['012'], ['ddd']);
    expect(shownCrack(state, 0, 0)).toBeNull();
    const { state: after, events } = endShift(state);
    expect(HAZARDS.slump.crackCountdown).toBe(2);
    expect(shownCrack(after, 0, 0)).toBe(2);
    expect(eventsOf(events, 'blockCracked')).toEqual([
      { type: 'blockCracked', pos: { x: 0, y: 0, z: 0 }, block: BLOCKS.dirt.code, timer: 1 },
    ]);
    // The stable squares do not crack.
    expect(shownCrack(after, 1, 0)).toBeNull();
    expect(shownCrack(after, 2, 0)).toBeNull();
  });

  it('falls at the end of the shift after next: 2, then 1, then the slump', () => {
    // Iron ore at the top of a slope that falls 3 (ore holds 2).
    // Shift 1 ends: the crack appears, showing 2.
    const one = endShift(pit(['0123'], ['i###']));
    expect(shownCrack(one.state, 0, 0)).toBe(2);
    // Shift 2 ends: nothing falls; the countdown shows 1.
    const two = endShift(one.state);
    expect(eventsOf(two.events, 'blockFell')).toEqual([]);
    expect(shownCrack(two.state, 0, 0)).toBe(1);
    expect(depthText(two.state)).toEqual(['0123']);
    // Shift 3 ends: the block slides to the foot and lands there as rubble.
    const three = endShift(two.state);
    expect(eventsOf(three.events, 'blockFell')).toEqual([
      {
        type: 'blockFell',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 0, z: 2 },
        block: BLOCKS.ironOre.code,
        rubble: true,
      },
    ]);
    // The square went down 1 and the foot came up 1.
    expect(depthText(three.state)).toEqual(['1122']);
    // The ore is lost: rubble lies on the foot, and nothing was gained.
    expect(blockAt(three.state, { x: 3, y: 0, z: 2 })).toBe(BLOCKS.rubble.code);
    expect(three.state.stockpile).toEqual({});
    // No crack is left anywhere, and the pit is at rest.
    expect(shownCrack(three.state, 0, 0)).toBeNull();
    expect(unstableSquares(three.state)).toEqual([]);
    expect(eventsOf(endShift(three.state).events, 'blockCracked')).toEqual([]);
  });

  it('the countdown stops while the square is stable, and goes on from where it stopped', () => {
    // A crack showing 2 on a square that is stable: it does not count down.
    const stable = pit(['011'], ['ddd'], { cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 1 }] });
    const waited = endShifts(stable, 3).state;
    expect(shownCrack(waited, 0, 0)).toBe(2);
    expect(depthText(waited)).toEqual(['011']);
    // The player digs the slope deeper: the square is unstable again. Its
    // countdown goes on from 2: 1 at the end of this shift, then it falls.
    const dug = act(waited, { type: 'mine', x: 2, y: 0 }).state;
    expect(slumpCheck(dug, 0, 0).unstable).toBe(true);
    const one = endShift(dug);
    expect(shownCrack(one.state, 0, 0)).toBe(1);
    const two = endShift(one.state);
    expect(eventsOf(two.events, 'blockFell')).toHaveLength(1);
    expect(depthText(two.state)).toEqual(['111']);
  });

  it('a block that is due stays put if its square is stable when its turn comes', () => {
    // The crack shows 1, but the square is stable: nothing falls.
    const state = pit(['011'], ['ddd'], { cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }] });
    const { state: after, events } = endShift(state);
    expect(eventsOf(events, 'blockFell')).toEqual([]);
    expect(shownCrack(after, 0, 0)).toBe(1);
  });

  it('mining a cracked block takes the crack away with it', () => {
    const cracked = endShift(pit(['012'], ['ddd'])).state;
    expect(shownCrack(cracked, 0, 0)).toBe(2);
    const mined = act(cracked, { type: 'mine', x: 0, y: 0 }).state;
    expect(shownCrack(mined, 0, 0)).toBeNull();
    // The square is one lower and stable now, so nothing cracks or falls.
    const later = endShifts(mined, 3);
    expect(eventsOf(later.events, 'blockFell')).toEqual([]);
    expect(depthText(later.state)).toEqual(['112']);
  });

  it('a steep step left by a hazard slumps, even in hard rock', () => {
    const { state, events } = endShifts(pit(['03'], ['HH']), 3);
    expect(eventsOf(events, 'blockFell')).toEqual([
      {
        type: 'blockFell',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 1, y: 0, z: 2 },
        block: BLOCKS.hardRock.code,
        rubble: true,
      },
    ]);
    expect(depthText(state)).toEqual(['12']);
  });

  it('the slide path is worked out at the moment of the slump', () => {
    // When the crack appears the foot is the square beside the wall (x=1).
    // Then the player digs x=2 a level deeper: the block slides on into it.
    const cracked = endShifts(pit(['022'], ['ddd']), 2).state;
    expect(shownCrack(cracked, 0, 0)).toBe(1);
    expect(footOf(cracked, 0, 0)).toEqual({ x: 1, y: 0 });
    const dug = act(cracked, { type: 'mine', x: 2, y: 0 }).state;
    const { events } = endShift(dug);
    expect(eventsOf(events, 'blockFell')[0]?.to).toEqual({ x: 2, y: 0, z: 2 });
  });

  it('a stump on a square that slumps is gone for good, as when it is mined', () => {
    const state = pit(['02'], ['dd'], {
      surface: ['s.'],
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
    });
    const after = endShift(state).state;
    expect(depthText(after)).toEqual(['11']);
    expect(surfaceKindAt(after, { x: 0, y: 0, z: -1 })).toBe(SURFACE.kinds.meadow.code);
  });

  it('a block that slumps off the roof of an underground space collapses it, as a mine does', () => {
    // x=0 is a hole 3 deep. Under the top blocks of x=1 and x=2 is a pocket
    // of two water cells (z=1). The block on x=1 is due and slides into the hole.
    const state = buildState({
      layers: [['.dd'], ['...'], ['.##'], ['###']],
      water: [
        { x: 1, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
      ],
      cracks: [{ pos: { x: 1, y: 0, z: 0 }, timer: 0 }],
    });
    expect(depthText(state)).toEqual(['300']);
    const { state: after, events } = endShift(state);
    expect(eventsOf(events, 'blockFell')).toHaveLength(1);
    expect(eventsOf(events, 'spaceCollapsed')).toEqual([
      {
        type: 'spaceCollapsed',
        pos: { x: 1, y: 0, z: 1 },
        water: 2,
        lava: 0,
        gas: 0,
        lavaSource: false,
      },
    ]);
    // The whole space is rubble, the square went down exactly 1, and the
    // water stands on it.
    expect(blockAt(after, { x: 1, y: 0, z: 1 })).toBe(BLOCKS.rubble.code);
    expect(blockAt(after, { x: 2, y: 0, z: 1 })).toBe(BLOCKS.rubble.code);
    expect(depthText(after)).toEqual(['210']);
    expect(contentsOn(after, 1, 0).water).toBe(2);
  });

  it('a space opened from the side stays sealed (owner question 102)', () => {
    // x=0 stands at ground level over a water pocket (the open cell at z=1).
    // x=1, one level down, is steep above the hole at x=2 and is due. When its
    // block goes, the pocket has open air beside it, but its roof is whole.
    const state = buildState({
      layers: [['d..'], ['.d.'], ['##.'], ['###']],
      water: [{ x: 0, y: 0, z: 1 }],
      cracks: [{ pos: { x: 1, y: 0, z: 1 }, timer: 0 }],
    });
    expect(depthText(state)).toEqual(['013']);
    const { state: after, events } = endShift(state);
    expect(eventsOf(events, 'blockFell').map((event) => event.from)).toEqual([
      { x: 1, y: 0, z: 1 },
    ]);
    expect(depthText(after)).toEqual(['022']);
    // Nothing collapsed and nothing poured out: the pocket is as it was.
    expect(eventsOf(events, 'spaceCollapsed')).toEqual([]);
    expect(blockAt(after, { x: 0, y: 0, z: 1 })).toBe(BLOCKS.air.code);
    expect(waterAt(after, { x: 0, y: 0, z: 1 })).toBe(1);
    expect(contentsOn(after, 0, 0).water).toBe(0);
    expect(contentsOn(after, 1, 0).water).toBe(0);
  });

  it('water, lava and gas on the square a block lands on rise with the rubble', () => {
    // On the foot (x=1, depth 2) stand 3 water, 1 lava (a source) and 4 gas,
    // in the cell the rubble lands in.
    const state = pit(['02'], ['dd'], {
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
      gas: [{ pos: { x: 1, y: 0, z: 1 }, units: 4 }],
      lavaSources: [{ x: 1, y: 0, z: 1 }],
    });
    setWater(state, { x: 1, y: 0, z: 1 }, 3);
    const before = contentsOn(state, 1, 0);
    expect(before).toEqual({ water: 3, lava: 1, lavaSource: true, gas: 4 });
    const after = endShift(state).state;
    expect(depthText(after)).toEqual(['11']);
    // Nothing is buried: the same contents stand on the square, one level up.
    expect(contentsOn(after, 1, 0)).toEqual(before);
    // The cell the rubble is in holds none.
    expect(waterAt(after, { x: 1, y: 0, z: 1 })).toBe(0);
  });
});

describe('cascades (design doc 6.1)', () => {
  it('a slump can make another square unstable, which cracks with its own warning', () => {
    // A steep dirt wall (x=1) is due. Its block lands in the hole beside it.
    const state = pit(['0033'], ['#d##'], { cracks: [{ pos: { x: 1, y: 0, z: 0 }, timer: 0 }] });
    const one = endShift(state);
    // x=1 fell onto x=2: depths 0 1 2 3. Now x=0 (stone) falls 3: unstable.
    expect(depthText(one.state)).toEqual(['0123']);
    expect(shownCrack(one.state, 0, 0)).toBe(2);
    // The rubble on x=2 is at the top of a 1-level step: stable.
    expect(shownCrack(one.state, 2, 0)).toBeNull();
    // x=1's new top block (dirt, fall 2) is unstable too.
    expect(shownCrack(one.state, 1, 0)).toBe(2);
  });

  it('resolves in a fixed order: row by row, each looked at when its turn comes', () => {
    // Two due blocks share one foot (the middle, 2 down). The west one is
    // first in the row; when it has landed the middle is only 1 below the
    // east one, which is stable now and stays.
    const state = pit(['020'], ['ddd'], {
      cracks: [
        { pos: { x: 0, y: 0, z: 0 }, timer: 0 },
        { pos: { x: 2, y: 0, z: 0 }, timer: 0 },
      ],
    });
    const { state: after, events } = endShift(state);
    expect(eventsOf(events, 'blockFell').map((event) => event.from)).toEqual([
      { x: 0, y: 0, z: 0 },
    ]);
    expect(depthText(after)).toEqual(['110']);
    expect(shownCrack(after, 2, 0)).toBe(1);
  });

  it('rubble that lands on a due square does not fall in its place (review of PR #98)', () => {
    // Stone at depths 0 2 2 3, with cracks showing 1 on x=0 and x=1. Both are
    // on the list of due blocks. x=0 is steep and falls onto x=1, burying the
    // cracked block there. When x=1's turn comes, its top block is the fresh
    // rubble, which has no crack: it must stay, and crack with its own
    // warning, although it stands at the top of a slope that falls 2.
    const state = pit(['0223'], ['####'], {
      cracks: [
        { pos: { x: 0, y: 0, z: 0 }, timer: 0 },
        { pos: { x: 1, y: 0, z: 2 }, timer: 0 },
      ],
    });
    const { state: after, events } = endShift(state);
    expect(eventsOf(events, 'blockFell')).toEqual([
      {
        type: 'blockFell',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 1, y: 0, z: 1 },
        block: BLOCKS.stone.code,
        rubble: true,
      },
    ]);
    expect(depthText(after)).toEqual(['1123']);
    // The rubble is unstable, so it cracks now and shows the full countdown.
    expect(blockAt(after, { x: 1, y: 0, z: 1 })).toBe(BLOCKS.rubble.code);
    expect(shownCrack(after, 1, 0)).toBe(HAZARDS.slump.crackCountdown);
  });

  it('is deterministic: the same pit slumps the same way every time', () => {
    const build = (): GameState =>
      pit(
        ['00000', '04440', '04540', '04440', '00000'],
        ['ddddd', 'd###d', 'd###d', 'd###d', 'ddddd'],
        { fuel: 100 },
      );
    const a = endShifts(build(), 12);
    const b = endShifts(build(), 12);
    expect(eventsOf(a.events, 'blockFell').length).toBeGreaterThan(4);
    expect(a.events).toEqual(b.events);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it('property: every slump moves a block down, nothing rises above ground, and it always ends', () => {
    // Random pits with random steps (far steeper than the player could dig)
    // and random materials, left alone until nothing moves. The seeds are
    // fixed, so a failure can be replayed.
    const materials = 'dR#Hxci';
    for (let seed = 1; seed <= 40; seed += 1) {
      const rng = createRng(seed);
      const size = 3 + nextInt(rng, 5); // 3 to 7 squares a side
      const depthRows: string[] = [];
      const materialRows: string[] = [];
      for (let y = 0; y < size; y += 1) {
        let depthRow = '';
        let materialRow = '';
        for (let x = 0; x < size; x += 1) {
          depthRow += String(nextInt(rng, 8));
          materialRow += materials.charAt(nextInt(rng, materials.length));
        }
        depthRows.push(depthRow);
        materialRows.push(materialRow);
      }
      // 9 layers: depths 0 to 7, and at least one block left on every square.
      let state = buildState({
        layers: terrainLayers(depthRows, materialRows, 9),
        fuel: 100000,
      });
      const blocksAtStart = state.blocks.filter((code) => code !== BLOCKS.air.code).length;
      // Each slump moves a block at least 1 layer down, so there cannot be
      // more slumps than (blocks) x (layers); the warning takes a few shifts.
      const maxShifts = 3 * size * size * 9;
      let slumps = 0;
      let quietShifts = 0;
      for (let shift = 0; shift < maxShifts && quietShifts < 4; shift += 1) {
        const before = state;
        const result = endShift(state);
        state = result.state;
        const fell = eventsOf(result.events, 'blockFell');
        const cracked = eventsOf(result.events, 'blockCracked');
        quietShifts = fell.length + cracked.length === 0 ? quietShifts + 1 : 0;
        // No block falls without its warning, and none moves twice in one
        // cube phase: every block that fell was a top block showing a crack
        // at 1 before the shift ended, and each fell from a different square.
        const fellFrom = new Set(fell.map((event) => `${event.from.x},${event.from.y}`));
        expect(fellFrom.size, `seed ${seed}`).toBe(fell.length);
        // No slump starts from a cell that an EARLIER slump of the same phase
        // landed in. (The other order is fine: a block may land in the cell
        // that a block which already fell has left.)
        const landedSoFar = new Set<string>();
        for (const event of fell) {
          const from = `${event.from.x},${event.from.y},${event.from.z}`;
          expect(landedSoFar.has(from), `seed ${seed}`).toBe(false);
          landedSoFar.add(`${event.to.x},${event.to.y},${event.to.z}`);
        }
        for (const event of fell) {
          expect(crackTimerAt(before, event.from), `seed ${seed}`).toBe(0);
          expect(blockAt(before, event.from), `seed ${seed}`).toBe(event.block);
          expect(depthAt(before, event.from.x, event.from.y), `seed ${seed}`).toBe(event.from.z);
        }
        for (const event of fell) {
          slumps += 1;
          // Strictly down: a larger z is a lower layer.
          expect(event.to.z, `seed ${seed}`).toBeGreaterThan(event.from.z);
          // Never above ground level: the block rests inside the cube.
          expect(event.to.z, `seed ${seed}`).toBeGreaterThanOrEqual(1);
        }
      }
      // It ended: nothing is unstable, nothing is cracked and waiting.
      expect(quietShifts, `seed ${seed} never came to rest`).toBe(4);
      expect(unstableSquares(state), `seed ${seed}`).toEqual([]);
      // Blocks are moved, never made or lost.
      const blocksAtEnd = state.blocks.filter((code) => code !== BLOCKS.air.code).length;
      expect(blocksAtEnd, `seed ${seed}`).toBe(blocksAtStart);
      expect(slumps, `seed ${seed}`).toBeLessThanOrEqual(size * size * 9);
    }
  });
});

describe('supports (design doc 4.1 and 6.1; owner question 82)', () => {
  it('placing a support costs 1 AP and 1 support, and puts it on the square', () => {
    const state = pit(['012'], ['ddd'], { stockpile: { support: 2 } });
    const { state: after, events } = act(state, { type: 'placeSupport', x: 0, y: 0 });
    expect(after.ap).toBe(state.ap - 1);
    expect(after.stockpile['support']).toBe(1);
    expect(structureOnSquare(after, 0, 0)).toBe(STRUCTURES.support.code);
    expect(knownSquare(after, 0, 0).top?.structure).toBe(STRUCTURES.support.code);
    expect(events).toContainEqual({
      type: 'structurePlaced',
      pos: { x: 0, y: 0, z: 0 },
      structure: STRUCTURES.support.code,
    });
  });

  it('any square may be named: there is no reach', () => {
    const state = pit(['000', '000', '000'], undefined, { stockpile: { support: 1 } });
    expect(findActions(state, { type: 'placeSupport' })).toHaveLength(9);
  });

  it('is refused without a support, on a tree, on a square with a structure, and at the bottom', () => {
    const none = pit(['00']);
    expect(supportCheck(none, 0, 0)).toEqual({ allowed: false, refusal: 'noSupport', ap: null });
    expect(findActions(none, { type: 'placeSupport' })).toEqual([]);

    const state = buildState({
      layers: [['##.#']],
      surface: ['T...'],
      supports: [{ x: 1, y: 0, z: 0 }],
      stockpile: { support: 3 },
    });
    expect(supportCheck(state, 0, 0).refusal).toBe('tree');
    expect(supportCheck(state, 1, 0).refusal).toBe('occupied');
    expect(supportCheck(state, 2, 0).refusal).toBe('bottom');
    expect(supportCheck(state, 3, 0)).toEqual({ allowed: true, refusal: null, ap: 1 });
    expect(findActions(state, { type: 'placeSupport' })).toEqual([
      { type: 'placeSupport', x: 3, y: 0, ap: 1 },
    ]);
    expect(() => supportCheck(state, 9, 0)).toThrow('not a square');
  });

  it('is not offered when it costs more AP than are left', () => {
    const state = pit(['00'], undefined, { stockpile: { support: 1 }, ap: 0 });
    expect(supportCheck(state, 0, 0).allowed).toBe(true);
    expect(legalActions(state).filter((action) => action.type === 'placeSupport')).toEqual([]);
  });

  it('a supported square does not crack, however long it stands', () => {
    const state = pit(['012'], ['ddd'], { stockpile: { support: 1 } });
    const supported = act(state, { type: 'placeSupport', x: 0, y: 0 }).state;
    const { state: after, events } = endShifts(supported, 5);
    expect(eventsOf(events, 'blockCracked')).toEqual([]);
    expect(eventsOf(events, 'blockFell')).toEqual([]);
    expect(depthText(after)).toEqual(['012']);
  });

  it('a support on a cracked square stops its countdown', () => {
    const cracked = endShifts(pit(['012'], ['ddd'], { stockpile: { support: 1 } }), 2).state;
    expect(shownCrack(cracked, 0, 0)).toBe(1);
    const supported = act(cracked, { type: 'placeSupport', x: 0, y: 0 }).state;
    const { state: after, events } = endShifts(supported, 4);
    expect(eventsOf(events, 'blockFell')).toEqual([]);
    // The crack is still there, stopped at 1.
    expect(shownCrack(after, 0, 0)).toBe(1);
    expect(depthText(after)).toEqual(['012']);
  });

  it('holds its own square only: the square beside it still slumps', () => {
    // Two dirt squares at the top of the same 2-level drop; one is supported.
    const state = pit(['02', '02'], ['dd', 'dd'], { supports: [{ x: 0, y: 0, z: 0 }] });
    const { state: after, events } = endShifts(state, 3);
    expect(eventsOf(events, 'blockFell').map((event) => event.from)).toEqual([
      { x: 0, y: 1, z: 0 },
    ]);
    expect(depthText(after)).toEqual(['02', '11']);
  });

  it('mining the square takes the support with the block: it is lost', () => {
    const state = pit(['00'], ['dd'], { supports: [{ x: 0, y: 0, z: 0 }] });
    const { state: after, events } = act(state, { type: 'mine', x: 0, y: 0 });
    expect(events).toContainEqual({
      type: 'structureDestroyed',
      pos: { x: 0, y: 0, z: 0 },
      structure: STRUCTURES.support.code,
      cause: 'mined',
    });
    // Not on the square's new top block, and not back in the stockpile.
    expect(structureOnSquare(after, 0, 0)).toBe(0);
    expect(after.stockpile['support'] ?? 0).toBe(0);
    // So the square can slump again like any other.
    expect(slumpCheck(after, 0, 0).heldBy).toBeNull();
  });

  it('a support on the foot is buried by the rubble and destroyed', () => {
    const state = pit(['02'], ['dd'], {
      supports: [{ x: 1, y: 0, z: 2 }],
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
    });
    expect(structureOnSquare(state, 1, 0)).toBe(STRUCTURES.support.code);
    const { state: after, events } = endShift(state);
    expect(eventsOf(events, 'structureDestroyed')).toEqual([
      {
        type: 'structureDestroyed',
        pos: { x: 1, y: 0, z: 2 },
        structure: STRUCTURES.support.code,
        cause: 'rockfall',
      },
    ]);
    expect(structureOnSquare(after, 1, 0)).toBe(0);
    expect(after.structures.every((code) => code === 0)).toBe(true);
  });
});

describe('a slump and the crew (design doc 5.2)', () => {
  /** A dirt wall whose block falls from (0, 0) onto (1, 0) at the end of this shift. */
  function dueWall(options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
    return pit(['02', '22'], ['dd', 'dd'], {
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
      ...options,
    });
  }

  it('hurts the crew when a block slumps FROM a worked square', () => {
    const { state, events } = endShift(dueWall({ worked: [{ x: 0, y: 0 }] }));
    expect(eventsOf(events, 'damageTaken')).toEqual([
      { type: 'damageTaken', amount: 3, cause: 'slump', health: CREW.startHealth - 3 },
    ]);
    expect(state.crew.health).toBe(CREW.startHealth - CREW.damage.slump);
  });

  it('hurts the crew when a block comes to rest ON a worked square', () => {
    const { state } = endShift(dueWall({ worked: [{ x: 1, y: 0 }] }));
    expect(state.crew.health).toBe(CREW.startHealth - CREW.damage.slump);
  });

  it('does not hurt the crew when neither square was worked', () => {
    // The crew worked beside the foot, but not on it.
    const { state, events } = endShift(dueWall({ worked: [{ x: 1, y: 1 }] }));
    expect(eventsOf(events, 'blockFell')).toHaveLength(1);
    expect(eventsOf(events, 'damageTaken')).toEqual([]);
    expect(state.crew.health).toBe(CREW.startHealth);
  });

  it('two slumps onto worked squares in one cube phase hurt once: 3, not 6', () => {
    const state = pit(['02', '22', '02'], ['dd', 'dd', 'dd'], {
      cracks: [
        { pos: { x: 0, y: 0, z: 0 }, timer: 0 },
        { pos: { x: 0, y: 2, z: 0 }, timer: 0 },
      ],
      worked: [
        { x: 0, y: 0 },
        { x: 0, y: 2 },
      ],
    });
    const { state: after, events } = endShift(state);
    expect(eventsOf(events, 'blockFell')).toHaveLength(2);
    expect(after.crew.health).toBe(CREW.startHealth - CREW.damage.slump);
  });

  it('buries the crew when its last health goes', () => {
    const { state } = endShift(dueWall({ worked: [{ x: 0, y: 0 }], health: 3 }));
    expect(state.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'buried' });
  });

  it('placing a support marks its square as worked (design doc 5.2)', () => {
    const state = dueWall({ stockpile: { support: 1 } });
    expect(isWorked(state, 1, 0)).toBe(false);
    // The support goes on the foot, where the block will land.
    const placed = act(state, { type: 'placeSupport', x: 1, y: 0 }).state;
    expect(isWorked(placed, 1, 0)).toBe(true);
    // So the slump that comes to rest there hurts the crew (and buries the support).
    const { state: after, events } = endShift(placed);
    expect(eventsOf(events, 'structureDestroyed')).toHaveLength(1);
    expect(after.crew.health).toBe(CREW.startHealth - CREW.damage.slump);
    // The worked squares are forgotten when the shift is over.
    expect(isWorked(after, 1, 0)).toBe(false);
  });

  it('mining a square the same shift a block lands on it hurts the crew', () => {
    // The player mines the foot (legal: its neighbours are not higher than
    // it... they are, so mine the level square beside the wall instead).
    const state = pit(['022', '222'], ['ddd', 'ddd'], {
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
    });
    const mined = act(state, { type: 'mine', x: 2, y: 0 }).state;
    // The block now slides past x=1 into the deeper x=2, a worked square.
    const { state: after, events } = endShift(mined);
    expect(eventsOf(events, 'blockFell')[0]?.to).toEqual({ x: 2, y: 0, z: 2 });
    expect(after.crew.health).toBe(CREW.startHealth - CREW.damage.slump);
  });
});

describe('what the player is told (design doc 6.1 and 11)', () => {
  it('the forecast lists every crack with its countdown and where the block would land', () => {
    const cracked = endShift(pit(['012'], ['ddd'])).state;
    expect(previewCubePhase(cracked).countdowns).toEqual([
      {
        kind: 'slump',
        pos: { x: 0, y: 0, z: 0 },
        inShifts: 2,
        running: true,
        to: { x: 2, y: 0, z: 1 },
      },
    ]);
    // A stopped countdown is listed too, and says so.
    const stopped = pit(['011'], ['ddd'], { cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }] });
    expect(previewCubePhase(stopped).countdowns).toEqual([
      { kind: 'slump', pos: { x: 0, y: 0, z: 0 }, inShifts: 1, running: false, to: null },
    ]);
  });

  /** The slump events of a list: what step (a) of the cube phase emits. */
  function slumpEvents(events: GameEvent[]): GameEvent[] {
    return events.filter((event) => event.type === 'blockFell' || event.type === 'blockCracked');
  }

  it('the forecast says what will slump and crack, and ending the shift then does it', () => {
    const build = (): GameState =>
      pit(['0033', '0123'], ['####', 'dddd'], {
        cracks: [{ pos: { x: 1, y: 0, z: 0 }, timer: 0 }],
      });
    const state = build();
    const forecast = previewCubePhase(state).slumps;
    expect(eventsOf(forecast, 'blockFell')).toHaveLength(1);
    expect(eventsOf(forecast, 'blockCracked').length).toBeGreaterThan(0);
    expect(forecast).toEqual(slumpEvents(endShift(state).events));
    // Asking changes nothing.
    expect(hashState(state)).toBe(hashState(build()));
  });

  it('the forecast takes the block a slump uncovers to be plain rock: the one thing it cannot see', () => {
    // As above, but under the block that slumps lies dirt, not stone. The
    // forecast is the same as for stone; the real cube phase also cracks the
    // dirt, which turns out too weak for the slope it now tops.
    const overStone = pit(['0033'], ['####'], {
      cracks: [{ pos: { x: 1, y: 0, z: 0 }, timer: 0 }],
    });
    const overDirt = pit(['0033'], ['####'], {
      cracks: [{ pos: { x: 1, y: 0, z: 0 }, timer: 0 }],
    });
    setBlock(overDirt, { x: 1, y: 0, z: 1 }, BLOCKS.dirt.code);
    expect(previewCubePhase(overDirt).slumps).toEqual(previewCubePhase(overStone).slumps);
    const real = slumpEvents(endShift(overDirt).events);
    expect(real).toContainEqual({
      type: 'blockCracked',
      pos: { x: 1, y: 0, z: 1 },
      block: BLOCKS.dirt.code,
      timer: 1,
    });
    expect(previewCubePhase(overDirt).slumps).not.toContainEqual(
      expect.objectContaining({ pos: { x: 1, y: 0, z: 1 } }),
    );
  });

  it('names the squares a mine would make unstable', () => {
    // Dirt: 0 1 1. Mining x=2 makes the slope fall 2 from x=0.
    const state = pit(['011'], ['ddd']);
    expect(unstableAfterMine(state, 2, 0)).toEqual([
      { x: 0, y: 0, reason: 'tall', foot: { x: 2, y: 0 }, fall: 2 },
    ]);
    // Mining the top of the slope makes nothing unstable.
    expect(unstableAfterMine(state, 0, 0)).toEqual([]);
    // In stone the same mine is safe: stone holds a fall of 2.
    expect(unstableAfterMine(pit(['011']), 2, 0)).toEqual([]);
    // A supported square or a tree is not named.
    expect(
      unstableAfterMine(pit(['011'], ['ddd'], { supports: [{ x: 0, y: 0, z: 0 }] }), 2, 0),
    ).toEqual([]);
    expect(unstableAfterMine(pit(['011'], ['ddd'], { surface: ['T..'] }), 2, 0)).toEqual([]);
  });

  it('does not name a square that is unstable already', () => {
    const state = pit(['0122'], ['dddd']);
    expect(unstableSquares(state).map((square) => square.x)).toEqual([0]);
    expect(unstableAfterMine(state, 3, 0)).toEqual([
      { x: 1, y: 0, reason: 'tall', foot: { x: 3, y: 0 }, fall: 2 },
    ]);
  });

  it('never names the mined square, whose new top block is not seen yet', () => {
    // A square can be unstable after it is mined only if it was unstable
    // before (it stood 2 above a neighbour). Here hard rock stands 2 above
    // the square beside it, over dirt in one cube and over hard rock in the
    // other. The answer is the same for both: nothing is "made" unstable.
    const depths = ['023'];
    const overDirt = buildState({ layers: terrainLayers(depths, ['H##']) });
    setBlock(overDirt, { x: 0, y: 0, z: 1 }, BLOCKS.dirt.code);
    const overRock = buildState({ layers: terrainLayers(depths, ['H##']) });
    expect(unstableAfterMine(overDirt, 0, 0)).toEqual([]);
    expect(unstableAfterMine(overRock, 0, 0)).toEqual([]);
    // What the mine uncovers decides whether the square is still unstable.
    const mine = { type: 'mine', x: 0, y: 0, ap: 3 } as const;
    expect(slumpCheck(applyAction(overDirt, mine).state, 0, 0).unstable).toBe(true);
    expect(slumpCheck(applyAction(overRock, mine).state, 0, 0).unstable).toBe(false);
  });

  it('a crack is a stored countdown on the top block', () => {
    const cracked = endShift(pit(['012'], ['ddd'])).state;
    expect(crackTimerAt(cracked, { x: 0, y: 0, z: 0 })).toBe(1);
  });
});
