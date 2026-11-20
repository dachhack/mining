// Underground spaces from generation: caverns, and water, lava and gas
// pockets (design doc v0.2 sections 3.3 and 3.6; issue #95, task T7).

import { describe, expect, it } from 'vitest';
import { BLOCKS, GENERATION, HAZARDS, WORLD } from '../../src/data';
import type { CubeSize, SpaceKind, Vec3 } from '../../src/data';
import { createRun, depthAt, endShift, hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { bandLayersForDepth } from '../../src/engine/generation/bands';
import { generateCube } from '../../src/engine/generation/cube';
import { generateSpaces } from '../../src/engine/generation/spaces';
import {
  blankState,
  cellIndex,
  cellPosition,
  gasAt,
  inGrid,
  isLavaSource,
  lavaAt,
  waterAt,
} from '../../src/engine/state';

const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);

const FACES: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/** A cube with its rock, veins and spaces, and no surface: what generation makes underground. */
function cubeWithSpaces(size: CubeSize, seed: number): GameState {
  const state = blankState(size, seed);
  state.blocks = generateCube(state.size, state.rng);
  generateSpaces(state);
  return state;
}

/** One space found in a cube: its cells and what kind it is. */
interface FoundSpace {
  kind: SpaceKind;
  cells: Vec3[];
}

/** What kind of space the open cell `pos` belongs to, from what it holds. */
function kindOfCell(state: GameState, pos: Vec3): SpaceKind {
  if (waterAt(state, pos) > 0) return 'water';
  if (lavaAt(state, pos) > 0) return 'lava';
  if (gasAt(state, pos) > 0) return 'gas';
  return 'cavern';
}

/** Every space in the cube: the 6-connected groups of open cells. A plain flood fill. */
function findSpaces(state: GameState): FoundSpace[] {
  const spaces: FoundSpace[] = [];
  const seen = new Uint8Array(state.blocks.length);
  for (let index = 0; index < state.blocks.length; index += 1) {
    if (state.blocks[index] !== BLOCKS.air.code || seen[index] === 1) {
      continue;
    }
    seen[index] = 1;
    const cells = [cellPosition(state.size, index)];
    for (let next = 0; next < cells.length; next += 1) {
      const cell = cells[next] as Vec3;
      for (const face of FACES) {
        const near = { x: cell.x + face.x, y: cell.y + face.y, z: cell.z + face.z };
        if (!inGrid(state.size, near)) continue;
        const nearIndex = cellIndex(state.size, near);
        if (state.blocks[nearIndex] === BLOCKS.air.code && seen[nearIndex] === 0) {
          seen[nearIndex] = 1;
          cells.push(near);
        }
      }
    }
    spaces.push({ kind: kindOfCell(state, cells[0] as Vec3), cells });
  }
  return spaces;
}

/** The id of the depth band layer `z` of the full-size cube is in. */
function bandOf(z: number): string {
  const band = bandLayersForDepth(WORLD.size.z).find((entry) => entry.layers.includes(z));
  if (band === undefined) throw new Error(`no band for layer ${z}`);
  return band.bandId;
}

describe('underground spaces (design doc 3.6; issue #95)', () => {
  const cubes = SEEDS.map((seed) => cubeWithSpaces(WORLD.size, seed));
  const spacesByCube = cubes.map(findSpaces);

  it('the same seed gives the same spaces; the generator is advanced', () => {
    const again = cubeWithSpaces(WORLD.size, 7);
    expect(hashState(again)).toBe(hashState(cubes[6] as GameState));
    const rockOnly = blankState(WORLD.size, 7);
    rockOnly.blocks = generateCube(rockOnly.size, rockOnly.rng);
    expect(again.rng.s).not.toBe(rockOnly.rng.s);
  });

  it('every kind appears in every band that lists it, on every seed', () => {
    for (const [index, spaces] of spacesByCube.entries()) {
      for (const bandDef of GENERATION.bands) {
        for (const def of bandDef.spaces) {
          const found = spaces.filter(
            (space) =>
              space.kind === def.kind && bandOf((space.cells[0] as Vec3).z) === bandDef.bandId,
          );
          expect(
            found.length,
            `seed ${SEEDS[index]}: ${def.kind} in band ${bandDef.bandId}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('a space is in one band, of a kind that band lists, and within its size range', () => {
    for (const [index, spaces] of spacesByCube.entries()) {
      for (const space of spaces) {
        const bandId = bandOf((space.cells[0] as Vec3).z);
        const where = `seed ${SEEDS[index]}: ${space.kind} at layer ${(space.cells[0] as Vec3).z}`;
        for (const cell of space.cells) {
          expect(bandOf(cell.z), where).toBe(bandId);
        }
        const bandDef = GENERATION.bands.find((entry) => entry.bandId === bandId);
        const def = bandDef?.spaces.find((entry) => entry.kind === space.kind);
        expect(def, where).toBeDefined();
        if (def !== undefined) {
          // Spaces never touch, so a group is exactly one space.
          expect(space.cells.length, where).toBeGreaterThanOrEqual(def.minSize);
          expect(space.cells.length, where).toBeLessThanOrEqual(def.maxSize);
        }
      }
    }
  });

  it('follows the depth bands of design doc 3.3', () => {
    // Spelled out here, not read from the data, to pin the design doc's table:
    // upper: small caverns; middle: water, gas, caverns; deep: lava, large caverns.
    const allowed: Record<string, SpaceKind[]> = {
      upper: ['cavern'],
      middle: ['water', 'gas', 'cavern'],
      deep: ['lava', 'cavern'],
    };
    for (const spaces of spacesByCube) {
      for (const space of spaces) {
        expect(allowed[bandOf((space.cells[0] as Vec3).z)]).toContain(space.kind);
      }
    }
  });

  it('spaces are sealed: no two touch, so each pocket is full of one thing and a cavern is empty', () => {
    // `findSpaces` joins open cells that touch. If two spaces touched they
    // would be found as one: a mix of contents here, or a group over its
    // size range in the test above.
    for (const [index, spaces] of spacesByCube.entries()) {
      const state = cubes[index] as GameState;
      for (const space of spaces) {
        for (const cell of space.cells) {
          const water = waterAt(state, cell);
          const lava = lavaAt(state, cell);
          const gas = gasAt(state, cell);
          expect(water).toBe(space.kind === 'water' ? HAZARDS.water.unitsPerCell : 0);
          expect(lava).toBe(space.kind === 'lava' ? HAZARDS.lava.unitsPerCell : 0);
          expect(gas).toBe(space.kind === 'gas' ? HAZARDS.gas.pocketUnitsPerCell : 0);
          // Whether a pocket pours is decided when it is broken into.
          expect(isLavaSource(state, cell)).toBe(false);
        }
      }
    }
  });

  it('nothing is stored in solid rock', () => {
    for (const state of cubes.slice(0, 10)) {
      for (let index = 0; index < state.blocks.length; index += 1) {
        if (state.blocks[index] !== BLOCKS.air.code) {
          expect(
            (state.water[index] ?? 0) + (state.lava[index] ?? 0) + (state.gas[index] ?? 0),
          ).toBe(0);
        }
      }
    }
  });

  it('the surface is flat: no space reaches layer 0, so every square starts at depth 0', () => {
    for (const state of cubes) {
      const topLayer = state.blocks.subarray(0, state.size.x * state.size.y);
      expect(topLayer.includes(BLOCKS.air.code)).toBe(false);
    }
    const run = createRun(3, 'none', 'standard');
    for (let y = 0; y < run.size.y; y += 1) {
      for (let x = 0; x < run.size.x; x += 1) {
        expect(depthAt(run, x, y)).toBe(0);
      }
    }
  });

  it('spaces replace plain rock only: every ore block is where generateCube put it', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const rockOnly = blankState(WORLD.size, seed);
      rockOnly.blocks = generateCube(rockOnly.size, rockOnly.rng);
      const withSpaces = cubes[seed - 1] as GameState;
      const plainRock = [BLOCKS.dirt.code, BLOCKS.stone.code, BLOCKS.hardRock.code];
      for (let index = 0; index < rockOnly.blocks.length; index += 1) {
        const before = rockOnly.blocks[index] as number;
        const after = withSpaces.blocks[index] as number;
        if (before !== after) {
          expect(after).toBe(BLOCKS.air.code);
          expect(plainRock).toContain(before);
        }
      }
    }
  });

  it('about this many spaces and open cells in a cube (the survey of decision note 0030)', () => {
    // 103 spaces are asked for since the depth survey (owner, issue #108:
    // candidate C): 6 small caverns; 39 water pockets, 29 gas pockets and 5
    // caverns in the middle band; 16 lava pockets and 8 large caverns. In
    // these cubes every one finds room.
    let spaces = 0;
    let cells = 0;
    for (const found of spacesByCube) {
      spaces += found.length;
      for (const space of found) cells += space.cells.length;
    }
    const meanSpaces = spaces / cubes.length;
    const meanCells = cells / cubes.length;
    expect(meanSpaces).toBeGreaterThan(95);
    expect(meanSpaces).toBeLessThanOrEqual(103);
    // About 2% of the 32,768 cells.
    expect(meanCells).toBeGreaterThan(550);
    expect(meanCells).toBeLessThan(900);
  });

  it('some lava pockets are big enough to be sources, and some are not', () => {
    let big = 0;
    let small = 0;
    for (const spaces of spacesByCube) {
      for (const space of spaces) {
        if (space.kind !== 'lava') continue;
        if (space.cells.length > HAZARDS.lava.sourcePocketCellsOver) big += 1;
        else small += 1;
      }
    }
    expect(big).toBeGreaterThan(0);
    expect(small).toBeGreaterThan(0);
  });

  it('works on small cubes of any shape, and keeps layer 0 solid there too', () => {
    const sizes: CubeSize[] = [
      { x: 8, y: 8, z: 8 },
      { x: 12, y: 6, z: 10 },
      { x: 5, y: 9, z: 16 },
      { x: 3, y: 3, z: 1 },
      { x: 4, y: 4, z: 2 },
    ];
    for (const size of sizes) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const state = cubeWithSpaces(size, seed);
        const topLayer = state.blocks.subarray(0, size.x * size.y);
        expect(topLayer.includes(BLOCKS.air.code)).toBe(false);
        for (const space of findSpaces(state)) {
          expect(space.cells.every((cell) => cell.z >= 1)).toBe(true);
        }
      }
    }
  });
});

describe('a fresh cube is at rest (decision note 0025: it is flat, so nothing moves)', () => {
  it('ending shifts on an untouched cube changes no block and moves no pocket', () => {
    for (const seed of [1, 2, 3]) {
      let state = createRun(seed, 'none', 'standard');
      const blocks = Array.from(state.blocks);
      const water = Array.from(state.water);
      const lava = Array.from(state.lava);
      const gas = Array.from(state.gas);
      for (let shift = 0; shift < 5; shift += 1) {
        const result = endShift(state);
        state = result.state;
        const kinds = result.events.map((event) => event.type);
        expect(kinds).not.toContain('damageTaken');
        expect(kinds).not.toContain('spaceCollapsed');
      }
      expect(Array.from(state.blocks)).toEqual(blocks);
      expect(Array.from(state.water)).toEqual(water);
      expect(Array.from(state.lava)).toEqual(lava);
      expect(Array.from(state.gas)).toEqual(gas);
    }
  });
});
