// Unit tests for the pure parts of the phone preview's top-down map (issue
// #86): the tiles (src/app/map/tiles.ts), what a tap does
// (src/app/map/targets.ts) and the camera (src/app/map/camera.ts). No browser
// is needed: the canvas code (mapView.ts) only draws what these give it, and
// is covered by the e2e tests.

import { describe, expect, it } from 'vitest';

import { BLOCKS, SHIFT, SURFACE } from '../../src/data';
import { applyAction, createRun, depthAt, hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { blankState, setBlock } from '../../src/engine/state';
import { updateReveal } from '../../src/engine/reveal';
import { setSurfaceKind } from '../../src/engine/surface/state';
import { updateMineralTraces } from '../../src/engine/tells';
import {
  VIEW_CELLS,
  cellAt,
  centredOnMiddle,
  clampCamera,
  panned,
  wholeMap,
  zoomRange,
  zoomedAbout,
} from '../../src/app/map/camera';
import { PREVIEW_MAP } from '../../src/app/map/palette';
import { NO_MARKS, squareSummary, tapOutcome } from '../../src/app/map/targets';
import { buildTile, buildTiles, depthBrightness } from '../../src/app/map/tiles';

/**
 * A small hand-built cube: `layers[z][y]` is a row of block characters ('#'
 * stone, 'd' dirt, 'c' coal, 'i' iron ore, 'H' hard rock, '.' open), and
 * `trees` lists the squares with a tree. The tops are revealed as the engine
 * does after every step.
 */
function cube(layers: string[][], trees: [number, number][] = [], ap = 100): GameState {
  const codes: Record<string, number> = {
    '#': BLOCKS.stone.code,
    d: BLOCKS.dirt.code,
    c: BLOCKS.coalSeam.code,
    i: BLOCKS.ironOre.code,
    H: BLOCKS.hardRock.code,
    '.': BLOCKS.air.code,
  };
  const first = layers[0] ?? [];
  const state = blankState({ x: (first[0] ?? '').length, y: first.length, z: layers.length }, 1);
  layers.forEach((rows, z) => {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        setBlock(state, { x, y, z }, codes[row.charAt(x)] ?? BLOCKS.stone.code);
      }
    });
  });
  for (const [x, y] of trees) {
    setSurfaceKind(state, { x, y, z: -1 }, SURFACE.kinds.tree.code);
  }
  state.ap = ap;
  state.fuel = 10;
  state.crew.health = 10;
  state.shift = SHIFT.firstShiftNumber;
  updateReveal(state, []);
  updateMineralTraces(state, []);
  return state;
}

/** Take the action a tap on (x, y) stands for; throws if the tap is refused. */
function tapAndTake(state: GameState, x: number, y: number): GameState {
  const outcome = tapOutcome(state, x, y);
  if (outcome.entry === null) {
    throw new Error(`refused: ${outcome.lines.join(' ')}`);
  }
  return applyAction(state, outcome.entry).state;
}

/** Every tile of the map, as one string. */
function allTiles(state: GameState): string {
  const size = Math.max(state.size.x, state.size.y);
  return JSON.stringify(buildTiles(state, { x0: 0, y0: 0, size }));
}

const NO_HIGHER = { north: false, east: false, south: false, west: false };

describe('tiles', () => {
  it('a square at ground level shows its top block and its surface kind', () => {
    const state = cube([['#c'], ['##']]);
    expect(buildTile(state, 1, 0)).toEqual({
      x: 1,
      y: 0,
      depth: 0,
      kind: 'block',
      block: 'coalSeam',
      traced: false,
      structure: null,
      surface: 'meadow',
      higher: NO_HIGHER,
    });
  });

  it('a tree hides its ground: the tile says nothing of the block', () => {
    const state = cube([['#c'], ['##']], [[1, 0]]);
    expect(buildTile(state, 1, 0)).toMatchObject({ kind: 'hidden', block: null, surface: 'tree' });
  });

  it('a cut tree leaves a stump over the block, now shown', () => {
    const state = tapAndTake(cube([['#c'], ['##']], [[1, 0]]), 1, 0);
    expect(buildTile(state, 1, 0)).toMatchObject({
      kind: 'block',
      block: 'coalSeam',
      surface: 'stump',
    });
  });

  it('a dug square shows its new top block, its depth, and which sides are higher', () => {
    const state = tapAndTake(cube([['###'], ['dHd'], ['###']]), 1, 0);
    expect(buildTile(state, 1, 0)).toMatchObject({
      depth: 1,
      kind: 'block',
      block: 'hardRock',
      surface: null,
      higher: { north: false, east: true, south: false, west: true },
    });
    // The neighbours are not lower than anything.
    expect(buildTile(state, 0, 0).higher).toEqual(NO_HIGHER);
  });

  it('a square with no block left shows the floor', () => {
    const state = tapAndTake(cube([['##']]), 0, 0);
    expect(buildTile(state, 0, 0)).toMatchObject({ depth: 1, kind: 'floor', block: null });
  });

  it('marks mineral traces on a top block near ore', () => {
    const state = cube([['###'], ['#i#'], ['###']]);
    expect(buildTile(state, 1, 0).traced).toBe(true);
  });

  it('a window past the edge of the map leaves out what is not a square', () => {
    const state = cube([['##', '##']]);
    const rows = buildTiles(state, { x0: 1, y0: 1, size: 3 });
    expect(rows.map((row) => row.map((tile) => `${tile.x},${tile.y}`))).toEqual([['1,1'], [], []]);
  });

  it('does not change the state', () => {
    const state = createRun(7, 'none', 'standard');
    const before = hashState(state);
    allTiles(state);
    expect(hashState(state)).toBe(before);
  });
});

describe('the map does not leak (design doc 3.4)', () => {
  it('two cubes that differ only below the tops and under never-cut trees give the same tiles', () => {
    // The same tops; everything else differs: other blocks under them, an
    // open space, and another block under the tree at (2, 0). (No ore among
    // the differences: ore near a top shows traces, which is a tell.)
    const one = cube([['##d'], ['###'], ['###']], [[2, 0]]);
    const two = cube([['##c'], ['cH.'], ['d.H']], [[2, 0]]);
    expect(hashState(two)).not.toBe(hashState(one));
    expect(allTiles(two)).toBe(allTiles(one));
    // The same taps are offered or refused, with the same words.
    for (let x = 0; x < 3; x += 1) {
      expect(tapOutcome(two, x, 0)).toEqual(tapOutcome(one, x, 0));
      expect(squareSummary(two, x, 0)).toBe(squareSummary(one, x, 0));
    }
  });

  it('on a real cube, changing every block below the tops changes no tile', () => {
    const state = createRun(7, 'none', 'standard');
    const other: GameState = structuredClone(state);
    for (let y = 0; y < other.size.y; y += 1) {
      for (let x = 0; x < other.size.x; x += 1) {
        for (let z = depthAt(state, x, y) + 1; z < other.size.z; z += 1) {
          setBlock(other, { x, y, z }, z % 2 === 0 ? BLOCKS.hardRock.code : BLOCKS.air.code);
        }
      }
    }
    expect(hashState(other)).not.toBe(hashState(state));
    expect(allTiles(other)).toBe(allTiles(state));
  });
});

describe('depth shading', () => {
  it('is full brightness at ground level, and darker with every level down', () => {
    expect(depthBrightness(0)).toBe(1);
    for (let depth = 1; depth <= 32; depth += 1) {
      expect(depthBrightness(depth)).toBeLessThanOrEqual(depthBrightness(depth - 1));
    }
    // The first levels, where most of a run is played, each differ clearly.
    for (let depth = 1; depth <= 5; depth += 1) {
      expect(depthBrightness(depth)).toBeLessThan(depthBrightness(depth - 1) - 0.05);
    }
  });

  it('never goes black: the block can still be told at the bottom', () => {
    expect(depthBrightness(32)).toBe(PREVIEW_MAP.depthMinBrightness);
    expect(PREVIEW_MAP.depthMinBrightness).toBeGreaterThan(0.15);
  });
});

describe('a tap', () => {
  it('mines an open square, at the cost of its top block', () => {
    const state = cube([['d#'], ['##']]);
    expect(tapOutcome(state, 0, 0)).toEqual({
      entry: { type: 'mine', x: 0, y: 0, ap: BLOCKS.dirt.mineCost },
      lines: [],
      marks: NO_MARKS,
    });
  });

  it('cuts the tree on a square that has one', () => {
    const state = cube([['d#'], ['##']], [[1, 0]]);
    expect(tapOutcome(state, 1, 0).entry).toEqual({
      type: 'cutTree',
      x: 1,
      y: 0,
      ap: SURFACE.cutTree.ap,
    });
  });

  it('refused by the level rule: says why and marks the neighbours that are too high', () => {
    // The middle of a 3 x 3 cube, dug once; then two neighbours dug level.
    let state = cube([
      ['###', '###', '###'],
      ['###', '###', '###'],
    ]);
    state = tapAndTake(state, 1, 1);
    state = tapAndTake(state, 1, 0); // north
    state = tapAndTake(state, 0, 1); // west
    const before = hashState(state);
    const outcome = tapOutcome(state, 1, 1);
    expect(outcome.entry).toBeNull();
    expect(outcome.marks).toEqual({
      selected: { x: 1, y: 1 },
      tooHigh: [
        { x: 2, y: 1 }, // east
        { x: 1, y: 2 }, // south
      ],
    });
    expect(outcome.lines[0]).toBe('x1 y1, depth 1: Stone, gives 1 Stone.');
    expect(outcome.lines[1]).toContain('The level rule');
    expect(outcome.lines[1]).toContain('x2 y1 (east, depth 0)');
    expect(outcome.lines[1]).toContain('x1 y2 (south, depth 0)');
    // A refused tap changes nothing.
    expect(hashState(state)).toBe(before);
  });

  it('refused for want of AP: says so, marks the square and no neighbour', () => {
    const state = cube([['##'], ['##']], [], 1);
    const outcome = tapOutcome(state, 0, 0);
    expect(outcome.entry).toBeNull();
    expect(outcome.lines[1]).toContain('costs 2 AP and you have 1 left');
    expect(outcome.marks).toEqual({ selected: { x: 0, y: 0 }, tooHigh: [] });
  });

  it('a tree with too little AP is refused as a cut, with no neighbour marked', () => {
    const state = cube([['##'], ['##']], [[0, 0]], 1);
    const outcome = tapOutcome(state, 0, 0);
    expect(outcome.entry).toBeNull();
    expect(outcome.lines[0]).toBe('x0 y0, ground level: a tree.');
    expect(outcome.lines[1]).toContain('Cutting the tree');
    expect(outcome.marks.tooHigh).toEqual([]);
  });

  it('a square with no block left is refused', () => {
    const state = tapAndTake(cube([['##']]), 0, 0);
    const outcome = tapOutcome(state, 0, 0);
    expect(outcome.entry).toBeNull();
    expect(outcome.lines.join(' ')).toContain('no block left');
  });

  it('once the run is over, or off the map, nothing is marked', () => {
    const state = cube([['##']]);
    expect(tapOutcome(state, 5, 5).marks).toEqual(NO_MARKS);
    state.status = { kind: 'ended', outcome: 'salvage', cause: 'mineClosed' };
    const outcome = tapOutcome(state, 0, 0);
    expect(outcome).toEqual({ entry: null, lines: ['The run has ended.'], marks: NO_MARKS });
  });

  it('every action a tap gives is one the engine takes, all over a real map', () => {
    const state = createRun(7, 'none', 'standard');
    for (let y = 0; y < state.size.y; y += 4) {
      for (let x = 0; x < state.size.x; x += 4) {
        const outcome = tapOutcome(state, x, y);
        // A fresh map is flat and the shift is full: nothing is refused.
        expect(outcome.entry, `(${x}, ${y})`).not.toBeNull();
        if (outcome.entry !== null) {
          const entry = outcome.entry;
          expect(() => applyAction(state, entry)).not.toThrow();
        }
      }
    }
  });
});

describe('the square summary', () => {
  it('names the square, its depth and its top block', () => {
    const state = tapAndTake(cube([['d#'], ['c#']]), 0, 0);
    expect(squareSummary(state, 0, 0)).toBe('x0 y0, depth 1: Coal seam, gives 1 Coal');
    expect(squareSummary(state, 1, 0)).toBe('x1 y0, ground level: Stone, gives 1 Stone');
  });
});

describe('the camera', () => {
  const size = { x: 32, y: 32 };

  it('starts on the middle of the map, with squares big enough to tap on a phone', () => {
    const camera = centredOnMiddle(size);
    expect(camera).toEqual({
      x: (32 - VIEW_CELLS) / 2,
      y: (32 - VIEW_CELLS) / 2,
      cells: VIEW_CELLS,
    });
    // On a map 366 px wide (a 390 px phone less the page's margins).
    expect(366 / camera.cells).toBeGreaterThanOrEqual(24);
  });

  it('the whole map fits at the widest zoom', () => {
    expect(wholeMap(size)).toEqual({ x: 0, y: 0, cells: 32 });
    expect(zoomRange(size).max).toBe(32);
  });

  it('a drag pans, and never leaves the map', () => {
    const start = centredOnMiddle(size);
    const moved = panned(start, -52, 26, 26, size);
    expect(moved).toEqual({ x: start.x + 2, y: start.y - 1, cells: start.cells });
    expect(panned(start, 99999, 99999, 26, size)).toMatchObject({ x: 0, y: 0 });
    expect(panned(start, -99999, -99999, 26, size)).toMatchObject({
      x: 32 - VIEW_CELLS,
      y: 32 - VIEW_CELLS,
    });
  });

  it('a zoom keeps the point under the fingers, and stays inside the range', () => {
    const start = centredOnMiddle(size);
    const zoomed = zoomedAbout(start, 8, 183, 183, 183, 183, 366, size);
    expect(zoomed.cells).toBe(8);
    // The middle of the window is still the middle of the map.
    expect(zoomed.x + zoomed.cells / 2).toBeCloseTo(16);
    expect(zoomedAbout(start, 1, 0, 0, 0, 0, 366, size).cells).toBe(zoomRange(size).min);
    expect(zoomedAbout(start, 999, 0, 0, 0, 0, 366, size).cells).toBe(32);
  });

  it('finds the square under a point, and keeps a camera inside the map', () => {
    const camera = { x: 9, y: 9, cells: 14 };
    expect(cellAt(camera, 0, 0, 26)).toEqual({ x: 9, y: 9 });
    expect(cellAt(camera, 27, 60, 26)).toEqual({ x: 10, y: 11 });
    expect(clampCamera({ x: -3, y: 40, cells: 14 }, size)).toEqual({ x: 0, y: 18, cells: 14 });
  });
});
