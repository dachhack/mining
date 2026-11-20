// Breaking into an underground space (design doc v0.2 section 6.2; question
// 80; issue #95, task T9): scenario tests on small hand-built cubes, then the
// same rule on generated cubes (issue #88 item 2).

import { describe, expect, it } from 'vitest';
import { BLOCKS, HAZARDS, SHIFT } from '../../src/data';
import type { Vec3 } from '../../src/data';
import {
  applyAction,
  blockAt,
  createRun,
  depthAt,
  hasTree,
  isRevealed,
  knownSquare,
  legalActions,
  mineCheck,
} from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { collapseSpaceUnder, contentsOn } from '../../src/engine/breach';
import { cellPosition, gasAt, isLavaSource, lavaAt, waterAt } from '../../src/engine/state';
import { act, buildState, layerText } from './helpers';

/** The largest difference in depth between two squares that share a side. */
function steepestStep(state: GameState): number {
  let steepest = 0;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const depth = depthAt(state, x, y);
      if (x + 1 < state.size.x) {
        steepest = Math.max(steepest, Math.abs(depth - depthAt(state, x + 1, y)));
      }
      if (y + 1 < state.size.y) {
        steepest = Math.max(steepest, Math.abs(depth - depthAt(state, x, y + 1)));
      }
    }
  }
  return steepest;
}

/** The one `spaceCollapsed` event in a list; fails the test if there is not exactly one. */
function collapseEvent(events: GameEvent[]) {
  const found = events.filter((event) => event.type === 'spaceCollapsed');
  expect(found).toHaveLength(1);
  const event = found[0];
  if (event === undefined || event.type !== 'spaceCollapsed') {
    throw new Error('no spaceCollapsed event');
  }
  return event;
}

/** `count` cells in a row along x, starting at `from`. */
function row(from: Vec3, count: number): Vec3[] {
  const cells: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    cells.push({ x: from.x + i, y: from.y, z: from.z });
  }
  return cells;
}

describe('breaking into a cavern (design doc 6.2)', () => {
  // A cavern shaped like an L, seen from the side (one row, y = 0):
  //        x  0 1 2 3
  //   z=0     # # # #
  //   z=1     # . # #
  //   z=2     # . . #
  //   z=3     # # # #
  function cavernCube(): GameState {
    return buildState({ layers: [['####'], ['#.##'], ['#..#'], ['####']], ap: 100 });
  }

  it('the whole cavern becomes rubble at once, and the square drops exactly 1', () => {
    const { state: after, events } = act(cavernCube(), { type: 'mine', x: 1, y: 0 });
    expect(depthAt(after, 1, 0)).toBe(1);
    expect(layerText(after, 0)).toEqual(['#.##']);
    expect(layerText(after, 1)).toEqual(['#R##']);
    // The cell under the square beside it too: the whole space, not one column.
    expect(layerText(after, 2)).toEqual(['#RR#']);
    expect(layerText(after, 3)).toEqual(['####']);
    expect(steepestStep(after)).toBe(1);
    expect(events).toEqual([
      { type: 'blockMined', pos: { x: 1, y: 0, z: 0 }, block: BLOCKS.stone.code },
      { type: 'itemGained', item: 'stone', count: 1 },
      {
        type: 'spaceCollapsed',
        pos: { x: 1, y: 0, z: 1 },
        water: 0,
        lava: 0,
        gas: 0,
        lavaSource: false,
      },
      { type: 'blockRevealed', pos: { x: 1, y: 0, z: 1 }, block: BLOCKS.rubble.code },
    ]);
  });

  it('only the new top is shown: the rest of the rubble stays hidden', () => {
    const after = act(cavernCube(), { type: 'mine', x: 1, y: 0 }).state;
    expect(isRevealed(after, { x: 1, y: 0, z: 1 })).toBe(true);
    expect(isRevealed(after, { x: 1, y: 0, z: 2 })).toBe(false);
    expect(isRevealed(after, { x: 2, y: 0, z: 2 })).toBe(false);
    expect(knownSquare(after, 2, 0).depth).toBe(0);
    expect(knownSquare(after, 2, 0).top?.block).toBe(BLOCKS.stone.code);
  });

  it('a cavern releases nothing, and its event does not say how big it was', () => {
    const small = buildState({ layers: [['###'], ['#.#'], ['###'], ['###']] });
    const large = buildState({ layers: [['###'], ['...'], ['...'], ['###']] });
    const smallEvents = act(small, { type: 'mine', x: 1, y: 0 }).events;
    const largeEvents = act(large, { type: 'mine', x: 1, y: 0 }).events;
    expect(largeEvents).toEqual(smallEvents);
    expect(contentsOn(act(large, { type: 'mine', x: 1, y: 0 }).state, 1, 0)).toEqual({
      water: 0,
      lava: 0,
      lavaSource: false,
      gas: 0,
    });
  });

  it('rubble is cheap to dig and gives nothing', () => {
    let state = act(cavernCube(), { type: 'mine', x: 1, y: 0 }).state;
    for (const x of [0, 2]) {
      state = act(state, { type: 'mine', x, y: 0 }).state;
    }
    const { state: after, events } = act(state, { type: 'mine', x: 1, y: 0 });
    expect(state.ap - after.ap).toBe(BLOCKS.rubble.mineCost);
    expect(events.map((event) => event.type)).toEqual(['blockMined', 'blockRevealed']);
  });

  it('a space that is not directly under the mined block is left alone', () => {
    // Stone, stone, open, stone: the first mine does not reach the space.
    const state = buildState({ layers: [['#'], ['#'], ['.'], ['#']], ap: 100 });
    const first = act(state, { type: 'mine', x: 0, y: 0 });
    expect(first.events.map((event) => event.type)).not.toContain('spaceCollapsed');
    expect(blockAt(first.state, { x: 0, y: 0, z: 2 })).toBe(BLOCKS.air.code);
    // The second mine takes its roof.
    const second = act(first.state, { type: 'mine', x: 0, y: 0 });
    expect(collapseEvent(second.events).pos).toEqual({ x: 0, y: 0, z: 2 });
    expect(depthAt(second.state, 0, 0)).toBe(2);
  });

  it('a space beside the mined column, but not under it, is left alone', () => {
    //        x  0 1
    //   z=0     # #
    //   z=1     # .      the cavern is under square 1, not under square 0
    //   z=2     # #
    const state = buildState({ layers: [['##'], ['#.'], ['##']], ap: 100 });
    const { state: after, events } = act(state, { type: 'mine', x: 0, y: 0 });
    expect(events.map((event) => event.type)).not.toContain('spaceCollapsed');
    expect(layerText(after, 1)).toEqual(['#.']);
  });

  it('a space that reaches the bottom of the cube fills to the bottom', () => {
    const state = buildState({ layers: [['#'], ['.'], ['.']] });
    const after = act(state, { type: 'mine', x: 0, y: 0 }).state;
    expect(layerText(after, 1)).toEqual(['R']);
    expect(layerText(after, 2)).toEqual(['R']);
    expect(depthAt(after, 0, 0)).toBe(1);
  });

  it('two spaces that do not touch: only the one under the mine collapses', () => {
    //        x  0 1 2 3 4
    //   z=1     # . # . #
    const state = buildState({ layers: [['#####'], ['#.#.#'], ['#####']], ap: 100 });
    const after = act(state, { type: 'mine', x: 1, y: 0 }).state;
    expect(layerText(after, 1)).toEqual(['#R#.#']);
  });

  it('the pit itself is not part of a space: open cells above a top block are left open', () => {
    // Square 0 is already dug 2 deep; a cavern lies under square 1 at z = 2,
    // beside the open cell of square 0 at z = 1... which is pit, not cavern.
    //        x  0 1
    //   z=0     . #
    //   z=1     . #
    //   z=2     # .
    //   z=3     # #
    // (Hazards can leave such a step; the level rule would not.)
    const state = buildState({ layers: [['.#'], ['.#'], ['#.'], ['##']], ap: 100 });
    const events: GameEvent[] = [];
    // Take square 1's two blocks away as a hazard would, then collapse.
    state.blocks[1] = BLOCKS.air.code;
    state.blocks[3] = BLOCKS.air.code;
    expect(collapseSpaceUnder(state, { x: 1, y: 0, z: 1 }, events)).toBe(true);
    expect(layerText(state, 0)).toEqual(['..']);
    expect(layerText(state, 1)).toEqual(['..']);
    expect(layerText(state, 2)).toEqual(['#R']);
  });

  it('collapseSpaceUnder does nothing over solid rock or at the bottom of the cube', () => {
    const state = buildState({ layers: [['.'], ['#']] });
    const events: GameEvent[] = [];
    expect(collapseSpaceUnder(state, { x: 0, y: 0, z: 0 }, events)).toBe(false);
    expect(collapseSpaceUnder(state, { x: 0, y: 0, z: 1 }, events)).toBe(false);
    expect(events).toEqual([]);
    expect(layerText(state, 1)).toEqual(['#']);
  });
});

describe('breaking into a pocket: the contents come out onto the mined square', () => {
  // A pocket of 3 cells under squares 1, 2 and 3 (one row, y = 0):
  //        x  0 1 2 3 4
  //   z=0     # # # # #
  //   z=1     # . . . #
  //   z=2     # # # # #
  const LAYERS = [['#####'], ['#...#'], ['#####']];
  const POCKET = row({ x: 1, y: 0, z: 1 }, 3);

  it('water: 1 unit for each cell, all on the mined square', () => {
    const state = buildState({ layers: LAYERS, water: POCKET, ap: 100 });
    const { state: after, events } = act(state, { type: 'mine', x: 2, y: 0 });
    expect(collapseEvent(events)).toEqual({
      type: 'spaceCollapsed',
      pos: { x: 2, y: 0, z: 1 },
      water: 3 * HAZARDS.water.unitsPerCell,
      lava: 0,
      gas: 0,
      lavaSource: false,
    });
    expect(layerText(after, 1)).toEqual(['#RRR#']);
    // It stands in the open cell above the new top block...
    expect(waterAt(after, { x: 2, y: 0, z: 0 })).toBe(3);
    // ...and nothing is left inside the rubble.
    for (const cell of POCKET) {
      expect(waterAt(after, cell)).toBe(0);
    }
    expect(contentsOn(after, 2, 0)).toEqual({ water: 3, lava: 0, lavaSource: false, gas: 0 });
    // The player sees it on that square, and on no other.
    expect(knownSquare(after, 2, 0).contents.water).toBe(3);
    expect(knownSquare(after, 1, 0).contents.water).toBe(0);
    expect(knownSquare(after, 3, 0).contents.water).toBe(0);
    expect(steepestStep(after)).toBe(1);
  });

  it('gas: the units of every cell (4 each)', () => {
    const state = buildState({
      layers: LAYERS,
      gas: POCKET.map((pos) => ({ pos, units: HAZARDS.gas.pocketUnitsPerCell })),
      ap: 100,
    });
    const { state: after, events } = act(state, { type: 'mine', x: 1, y: 0 });
    expect(collapseEvent(events).gas).toBe(3 * HAZARDS.gas.pocketUnitsPerCell);
    expect(gasAt(after, { x: 1, y: 0, z: 0 })).toBe(12);
    expect(contentsOn(after, 1, 0).gas).toBe(12);
    for (const cell of POCKET) {
      expect(gasAt(after, cell)).toBe(0);
    }
  });

  it('lava from a small pocket: 1 unit for each cell, and no source', () => {
    const state = buildState({ layers: LAYERS, lava: POCKET, ap: 100 });
    const { state: after, events } = act(state, { type: 'mine', x: 3, y: 0 });
    const event = collapseEvent(events);
    expect(event.lava).toBe(3);
    expect(event.lavaSource).toBe(false);
    expect(lavaAt(after, { x: 3, y: 0, z: 0 })).toBe(3);
    expect(isLavaSource(after, { x: 3, y: 0, z: 0 })).toBe(false);
    expect(contentsOn(after, 3, 0)).toEqual({ water: 0, lava: 3, lavaSource: false, gas: 0 });
  });

  it('lava from a pocket of more than 8 cells: the mined square becomes a source', () => {
    const limit = HAZARDS.lava.sourcePocketCellsOver;
    // One pocket of exactly `limit` cells and one of `limit + 1`, each in a
    // row under a strip of stone.
    for (const cells of [limit, limit + 1]) {
      const width = cells + 2;
      const stone = '#'.repeat(width);
      const pocketRow = `#${'.'.repeat(cells)}#`;
      const state = buildState({
        layers: [[stone], [pocketRow], [stone]],
        lava: row({ x: 1, y: 0, z: 1 }, cells),
        ap: 100,
      });
      const { state: after, events } = act(state, { type: 'mine', x: 1, y: 0 });
      const event = collapseEvent(events);
      expect(event.lava).toBe(cells);
      expect(event.lavaSource, `${cells} cells`).toBe(cells > limit);
      expect(isLavaSource(after, { x: 1, y: 0, z: 0 })).toBe(cells > limit);
      expect(knownSquare(after, 1, 0).contents.lavaSource).toBe(cells > limit);
    }
  });

  it('mining the square again leaves what stands on it on the square', () => {
    let state = buildState({ layers: [...LAYERS, ['#####']], water: POCKET, ap: 100 });
    state = act(state, { type: 'mine', x: 2, y: 0 }).state;
    for (const x of [1, 3]) {
      state = act(state, { type: 'mine', x, y: 0 }).state;
    }
    // Nothing flows yet (task T10): mining is not refused and costs no more.
    const before = state.ap;
    state = act(state, { type: 'mine', x: 2, y: 0 }).state;
    expect(before - state.ap).toBe(BLOCKS.rubble.mineCost);
    expect(depthAt(state, 2, 0)).toBe(2);
    expect(contentsOn(state, 2, 0).water).toBe(3);
  });

  it('what a pocket held is not told by anything but the amounts', () => {
    // Two cubes with a 3-unit water pocket of different shapes under the same
    // square: the player gets the same events and sees the same squares.
    const flat = buildState({ layers: [['###'], ['...'], ['###'], ['###']] });
    const deep = buildState({ layers: [['###'], ['#.#'], ['#.#'], ['#.#']] });
    for (const pos of row({ x: 0, y: 0, z: 1 }, 3)) {
      flat.water[pos.x + 3 * pos.z] = 1;
    }
    for (const z of [1, 2, 3]) {
      deep.water[1 + 3 * z] = 1;
    }
    const afterFlat = act(flat, { type: 'mine', x: 1, y: 0 });
    const afterDeep = act(deep, { type: 'mine', x: 1, y: 0 });
    expect(afterDeep.events).toEqual(afterFlat.events);
    for (let x = 0; x < 3; x += 1) {
      // The tells differ on purpose: see tells.test.ts.
      const seenFlat = { ...knownSquare(afterFlat.state, x, 0), tells: null };
      const seenDeep = { ...knownSquare(afterDeep.state, x, 0), tells: null };
      expect(seenDeep).toEqual(seenFlat);
    }
  });
});

// ---------------------------------------------------------------------------
// Generated cubes (issue #88 item 2)
// ---------------------------------------------------------------------------

/** What one underground cell holds, for the checks below. */
function cellKind(state: GameState, pos: Vec3): 'cavern' | 'water' | 'lava' | 'gas' {
  if (waterAt(state, pos) > 0) return 'water';
  if (lavaAt(state, pos) > 0) return 'lava';
  if (gasAt(state, pos) > 0) return 'gas';
  return 'cavern';
}

/** The open underground cells of a cube, top layer first. */
function openCells(state: GameState): Vec3[] {
  const cells: Vec3[] = [];
  for (let index = 0; index < state.blocks.length; index += 1) {
    if (state.blocks[index] === BLOCKS.air.code) {
      const pos = cellPosition(state.size, index);
      if (pos.z > depthAt(state, pos.x, pos.y)) {
        cells.push(pos);
      }
    }
  }
  return cells;
}

/**
 * A player who digs straight for one square, as the level rule allows: to
 * mine a square, first bring every higher neighbour down to its level. Every
 * action goes through `applyAction`, with the AP topped up before each (the
 * test is about the terrain, not the shifts).
 */
class Digger {
  state: GameState;
  /** The events of the most recent mine (not of the mines that made room for it). */
  lastMineEvents: GameEvent[] = [];
  mines = 0;
  /** Called after every mine, with the state it led to. */
  afterMine: (state: GameState, events: GameEvent[]) => void = () => undefined;

  constructor(state: GameState) {
    this.state = state;
  }

  private take(type: 'mine' | 'cutTree', x: number, y: number): GameEvent[] {
    this.state.ap = SHIFT.apPerShift;
    const action = legalActions(this.state).find(
      (legal) => legal.type === type && legal.x === x && legal.y === y,
    );
    if (action === undefined) {
      throw new Error(`${type} ${x},${y} is not legal`);
    }
    const result = applyAction(this.state, action);
    this.state = result.state;
    return result.events;
  }

  /** Mine square (x, y) once, digging its higher neighbours down first. */
  mineOnce(x: number, y: number): void {
    if (hasTree(this.state, { x, y, z: -1 })) {
      this.take('cutTree', x, y);
    }
    // Each pass brings one neighbour one level down, so this ends.
    for (;;) {
      const higher = mineCheck(this.state, x, y).higherNeighbours[0];
      if (higher === undefined) break;
      this.mineOnce(higher.x, higher.y);
    }
    const events = this.take('mine', x, y);
    this.mines += 1;
    this.lastMineEvents = events;
    this.afterMine(this.state, events);
  }

  /** Dig square (x, y) down until its top block is in layer `z`. */
  digTo(x: number, y: number, z: number): void {
    while (depthAt(this.state, x, y) < z) {
      this.mineOnce(x, y);
    }
  }
}

describe('breaking into spaces on generated cubes (issue #88 item 2)', () => {
  it.each([2, 9, 23])(
    'seed %i: digging down to a cavern, a water pocket and a gas pocket never breaks the level rule',
    (seed) => {
      const digger = new Digger(createRun(seed, 'none', 'standard'));
      let collapses = 0;
      digger.afterMine = (state, events) => {
        // The level rule ([Decided]) holds after every single mine.
        expect(steepestStep(state)).toBeLessThanOrEqual(1);
        // Every mine takes its square exactly 1 level down, collapse or not.
        const mined = events.find((event) => event.type === 'blockMined');
        if (mined === undefined || mined.type !== 'blockMined') throw new Error('no blockMined');
        expect(depthAt(state, mined.pos.x, mined.pos.y)).toBe(mined.pos.z + 1);
        if (events.some((event) => event.type === 'spaceCollapsed')) {
          collapses += 1;
          expect(blockAt(state, { ...mined.pos, z: mined.pos.z + 1 })).toBe(BLOCKS.rubble.code);
        }
      };

      for (const kind of ['cavern', 'water', 'gas'] as const) {
        // The highest cell of that kind still in the cube (an earlier dig may
        // have collapsed some on its way).
        const target = openCells(digger.state).find(
          (cell) => cellKind(digger.state, cell) === kind,
        );
        if (target === undefined) throw new Error(`seed ${seed} has no ${kind} left`);
        const perCell = {
          cavern: 0,
          water: HAZARDS.water.unitsPerCell,
          gas: HAZARDS.gas.pocketUnitsPerCell,
        }[kind];

        // Dig until the block above the target cell is the top block.
        digger.digTo(target.x, target.y, target.z - 1);
        if (blockAt(digger.state, target) !== BLOCKS.air.code) {
          continue; // a dig on the way already broke into this space from elsewhere
        }
        // The tell is on the top block before the mine that breaks in
        // (design doc 3.7); a cavern has none.
        const tells = knownSquare(digger.state, target.x, target.y).tells;
        expect(tells.dampStone, `${kind}: damp`).toBe(kind === 'water');
        expect(tells.pittedRock, `${kind}: pitted`).toBe(kind === 'gas');
        const before = contentsOn(digger.state, target.x, target.y);
        digger.mineOnce(target.x, target.y);
        const event = collapseEvent(digger.lastMineEvents);
        expect(event.pos).toEqual(target);
        const units = kind === 'water' ? event.water : kind === 'gas' ? event.gas : 0;
        // A whole number of cells came out, and it is all on the mined square.
        expect(event.water + event.gas + event.lava).toBe(units);
        if (perCell > 0) {
          expect(units).toBeGreaterThan(0);
          expect(units % perCell).toBe(0);
        }
        const after = contentsOn(digger.state, target.x, target.y);
        expect(after.water - before.water).toBe(event.water);
        expect(after.gas - before.gas).toBe(event.gas);
      }
      expect(collapses).toBeGreaterThanOrEqual(3);

      // No solid cell holds water, lava or gas: a collapse empties every
      // cell it turns to rubble.
      const state = digger.state;
      for (let index = 0; index < state.blocks.length; index += 1) {
        if (state.blocks[index] !== BLOCKS.air.code) {
          expect(
            (state.water[index] ?? 0) + (state.lava[index] ?? 0) + (state.gas[index] ?? 0),
          ).toBe(0);
        }
      }
    },
    120000,
  );

  it('seed 4: a pit dug all the way down to a lava pocket (deep band) keeps the level rule', () => {
    const digger = new Digger(createRun(4, 'none', 'standard'));
    let steepest = 0;
    digger.afterMine = (state) => {
      steepest = Math.max(steepest, steepestStep(state));
    };
    // The lava cell that is cheapest to reach: the one nearest a corner of
    // the map, where a pit needs the fewest squares.
    const size = digger.state.size;
    const cornerDistance = (cell: Vec3) =>
      Math.min(cell.x, size.x - 1 - cell.x) + Math.min(cell.y, size.y - 1 - cell.y) + cell.z;
    const lavaCells = openCells(digger.state).filter(
      (cell) => cellKind(digger.state, cell) === 'lava',
    );
    lavaCells.sort((a, b) => cornerDistance(a) - cornerDistance(b));
    const nearest = lavaCells[0];
    if (nearest === undefined) throw new Error('seed 4 has no lava');
    // Its pocket's highest cell in the same column is the one a mine opens.
    let target = nearest;
    while (lavaAt(digger.state, { ...target, z: target.z - 1 }) > 0) {
      target = { ...target, z: target.z - 1 };
    }
    // The warm glow shows 2 levels above the lava, and still 1 level above.
    digger.digTo(target.x, target.y, target.z - 2);
    expect(knownSquare(digger.state, target.x, target.y).tells.warmGlow).toBe(true);
    digger.digTo(target.x, target.y, target.z - 1);
    expect(knownSquare(digger.state, target.x, target.y).tells.warmGlow).toBe(true);
    expect(lavaAt(digger.state, target)).toBeGreaterThan(0);
    digger.mineOnce(target.x, target.y);
    const event = collapseEvent(digger.lastMineEvents);
    expect(event.lava).toBeGreaterThanOrEqual(4);
    expect(event.lavaSource).toBe(event.lava > HAZARDS.lava.sourcePocketCellsOver);
    expect(contentsOn(digger.state, target.x, target.y).lava).toBe(event.lava);
    expect(steepest).toBe(1);
    expect(digger.mines).toBeGreaterThan(500);
  }, 240000);
});
