// Cube generation: design doc 3.1 (depth bands) and 3.3 (veins), decision
// note 0005 items 3 and 4.

import { describe, expect, it } from 'vitest';
import { BLOCKS, GENERATION, WORLD, blockDefByCode } from '../../src/data';
import type { BlockId, CubeSize } from '../../src/data';
import { createRun, hashState } from '../../src/engine';
import { bandLayersForDepth } from '../../src/engine/generation/bands';
import { generateCube } from '../../src/engine/generation/cube';
import { createRng } from '../../src/engine/rng';
import { cellCount, cellIndex, inGrid } from '../../src/engine/state';

const SEEDS = [0, 1, 2, 7, 12345, 4294967295];
const FULL_SIZE: CubeSize = WORLD.size;
// Small cubes, including ones that are not the same length on every side.
const SMALL_SIZES: CubeSize[] = [
  { x: 8, y: 8, z: 8 },
  { x: 12, y: 6, z: 10 },
  { x: 5, y: 9, z: 16 },
];

const NEIGHBOUR_OFFSETS = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

function generate(size: CubeSize, seed: number): Uint8Array {
  return generateCube(size, createRng(seed));
}

/** The code of a block named in the generation data. */
function codeOf(blockId: string): number {
  return BLOCKS[blockId as BlockId].code;
}

/** The generation entry for a band; fails the test if there is none. */
function bandDef(bandId: string) {
  const def = GENERATION.bands.find((entry) => entry.bandId === bandId);
  if (def === undefined) {
    throw new Error(`Test setup: no generation entry for band "${bandId}"`);
  }
  return def;
}

/** How many cells of each block code the given layers hold. */
function countBlocks(blocks: Uint8Array, size: CubeSize, layers: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const z of layers) {
    for (let y = 0; y < size.y; y += 1) {
      for (let x = 0; x < size.x; x += 1) {
        const code = blocks[cellIndex(size, { x, y, z })] as number;
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * The sizes of the 6-connected groups of `code` in the cube: one number for
 * each group. A plain flood fill.
 */
function groupSizes(blocks: Uint8Array, size: CubeSize, code: number): number[] {
  const seen = new Uint8Array(blocks.length);
  const sizes: number[] = [];
  for (let z = 0; z < size.z; z += 1) {
    for (let y = 0; y < size.y; y += 1) {
      for (let x = 0; x < size.x; x += 1) {
        const startIndex = cellIndex(size, { x, y, z });
        if (blocks[startIndex] !== code || seen[startIndex] === 1) {
          continue;
        }
        seen[startIndex] = 1;
        const toVisit = [{ x, y, z }];
        let groupSize = 0;
        while (toVisit.length > 0) {
          const pos = toVisit.pop() as { x: number; y: number; z: number };
          groupSize += 1;
          for (const offset of NEIGHBOUR_OFFSETS) {
            const next = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
            if (!inGrid(size, next)) {
              continue;
            }
            const nextIndex = cellIndex(size, next);
            if (blocks[nextIndex] === code && seen[nextIndex] !== 1) {
              seen[nextIndex] = 1;
              toVisit.push(next);
            }
          }
        }
        sizes.push(groupSize);
      }
    }
  }
  return sizes;
}

/** Check every rule that must hold for any generated cube of any size. */
function expectCubeFollowsTheRules(blocks: Uint8Array, size: CubeSize): void {
  expect(blocks).toBeInstanceOf(Uint8Array);
  expect(blocks.length).toBe(cellCount(size));

  // Band rules: a layer holds only the blocks its band lists.
  for (const band of bandLayersForDepth(size.z)) {
    const def = bandDef(band.bandId);
    const allowed = new Set<number>();
    for (const rock of def.rock) {
      allowed.add(codeOf(rock.block));
    }
    for (const vein of def.veins) {
      allowed.add(codeOf(vein.block));
    }
    for (const code of countBlocks(blocks, size, band.layers).keys()) {
      // The message names the block if this fails.
      expect(allowed.has(code), `${blockDefByCode(code).name} in band ${band.bandId}`).toBe(true);
    }
  }

  // Veins: no group of an ore is smaller than that ore's smallest vein.
  for (const def of GENERATION.bands) {
    for (const vein of def.veins) {
      for (const groupSize of groupSizes(blocks, size, codeOf(vein.block))) {
        expect(groupSize, `a group of ${vein.block}`).toBeGreaterThanOrEqual(vein.minSize);
      }
    }
  }
}

describe('generateCube', () => {
  it('gives the same cube for the same seed', () => {
    for (const seed of SEEDS) {
      expect(generate(FULL_SIZE, seed)).toEqual(generate(FULL_SIZE, seed));
    }
    expect(hashState(createRun(7, 'none', 'standard'))).toBe(
      hashState(createRun(7, 'none', 'standard')),
    );
  });

  it('gives different cubes for different seeds', () => {
    const hashes = new Set(SEEDS.map((seed) => hashState(createRun(seed, 'none', 'standard'))));
    expect(hashes.size).toBe(SEEDS.length);
    expect(generate(FULL_SIZE, 1)).not.toEqual(generate(FULL_SIZE, 2));
  });

  it('takes all its randomness from the generator it is given, and advances it', () => {
    const rngA = createRng(99);
    const rngB = createRng(99);
    generateCube(FULL_SIZE, rngA);
    generateCube(FULL_SIZE, rngB);
    expect(rngA.s).toBe(rngB.s);
    expect(rngA.s).not.toBe(99);
  });

  it('keeps every block inside the bands that list it, with ore in veins (32-cube)', () => {
    for (const seed of SEEDS) {
      expectCubeFollowsTheRules(generate(FULL_SIZE, seed), FULL_SIZE);
    }
  });

  it('uses the band layers of the design doc for the full-size cube', () => {
    // Spelled out here, not read from the data, so the test pins design doc 3.1.
    const upper = [BLOCKS.dirt, BLOCKS.stone, BLOCKS.coalSeam, BLOCKS.timberRoot];
    const middle = [BLOCKS.stone, BLOCKS.hardRock, BLOCKS.ironOre, BLOCKS.copperOre];
    const deep = [BLOCKS.stone, BLOCKS.hardRock, BLOCKS.crystal];
    for (const seed of SEEDS) {
      const blocks = generate(FULL_SIZE, seed);
      for (let z = 0; z < FULL_SIZE.z; z += 1) {
        const allowedHere = z <= 7 ? upper : z <= 19 ? middle : deep;
        const allowedCodes = allowedHere.map((def) => def.code);
        for (const code of countBlocks(blocks, FULL_SIZE, [z]).keys()) {
          expect(allowedCodes, `${blockDefByCode(code).name} in layer ${z}`).toContain(code);
        }
      }
    }
  });

  it('never generates open space or the blocks of later milestones', () => {
    const excluded = [
      BLOCKS.air.code,
      BLOCKS.unstableOre.code,
      BLOCKS.relic.code,
      BLOCKS.keystone.code,
      BLOCKS.bedrock.code,
    ];
    for (const size of [FULL_SIZE, ...SMALL_SIZES]) {
      for (const seed of SEEDS) {
        const blocks = generate(size, seed);
        for (const code of excluded) {
          expect(blocks.includes(code), blockDefByCode(code).name).toBe(false);
        }
      }
    }
  });

  it('puts every rock and ore a band lists into that band', () => {
    for (const seed of SEEDS) {
      const blocks = generate(FULL_SIZE, seed);
      for (const band of bandLayersForDepth(FULL_SIZE.z)) {
        const counts = countBlocks(blocks, FULL_SIZE, band.layers);
        const def = bandDef(band.bandId);
        for (const blockId of [...def.rock, ...def.veins].map((entry) => entry.block)) {
          expect(
            counts.get(codeOf(blockId)) ?? 0,
            `${blockId} in band ${band.bandId}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('makes the upper band dirtier at the top and the middle band harder at the bottom', () => {
    // 0005 item 4: "more hard rock deeper". Summed over seeds so that one
    // unlucky layer cannot fail the test.
    let dirtTop = 0;
    let dirtBottom = 0;
    let hardTop = 0;
    let hardBottom = 0;
    for (const seed of SEEDS) {
      const blocks = generate(FULL_SIZE, seed);
      dirtTop += countBlocks(blocks, FULL_SIZE, [0]).get(BLOCKS.dirt.code) ?? 0;
      dirtBottom += countBlocks(blocks, FULL_SIZE, [7]).get(BLOCKS.dirt.code) ?? 0;
      hardTop += countBlocks(blocks, FULL_SIZE, [8]).get(BLOCKS.hardRock.code) ?? 0;
      hardBottom += countBlocks(blocks, FULL_SIZE, [19]).get(BLOCKS.hardRock.code) ?? 0;
    }
    expect(dirtTop).toBeGreaterThan(dirtBottom);
    expect(hardBottom).toBeGreaterThan(hardTop);
  });

  it('makes ore in veins no larger than the data allows, unless two veins touch', () => {
    // Most groups are single veins, so across a cube the typical group must be
    // within the size range. (Two veins of one ore that touch form one bigger
    // group, so the largest group may exceed maxSize.)
    const blocks = generate(FULL_SIZE, 7);
    for (const def of GENERATION.bands) {
      for (const vein of def.veins) {
        const sizes = groupSizes(blocks, FULL_SIZE, codeOf(vein.block));
        const withinRange = sizes.filter((size) => size <= vein.maxSize).length;
        expect(sizes.length).toBeGreaterThan(0);
        expect(withinRange / sizes.length, vein.block).toBeGreaterThan(0.8);
      }
    }
  });

  it('follows the same rules for small cubes of any shape', () => {
    for (const size of SMALL_SIZES) {
      for (const seed of SEEDS) {
        const blocks = generate(size, seed);
        expectCubeFollowsTheRules(blocks, size);
        // Each band lists at least one ore, and gets at least one vein of it.
        for (const band of bandLayersForDepth(size.z)) {
          const counts = countBlocks(blocks, size, band.layers);
          for (const vein of bandDef(band.bandId).veins) {
            expect(
              counts.get(codeOf(vein.block)) ?? 0,
              `${vein.block} in ${band.bandId}`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('copes with cubes too small to hold every band or any vein', () => {
    for (const size of [
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 1, z: 2 },
      { x: 2, y: 1, z: 3 },
      { x: 3, y: 3, z: 1 },
    ]) {
      expectCubeFollowsTheRules(generate(size, 5), size);
    }
  });
});

describe('bandLayersForDepth', () => {
  it('gives exactly the bands in the data for the full-size cube', () => {
    const bands = bandLayersForDepth(WORLD.size.z);
    expect(bands.map((band) => band.bandId)).toEqual(WORLD.depthBands.map((band) => band.id));
    bands.forEach((band, i) => {
      const data = WORLD.depthBands[i];
      expect(band.layers[0]).toBe(data?.firstLayer);
      expect(band.layers[band.layers.length - 1]).toBe(data?.lastLayer);
      expect(band.layers.length).toBe((data?.lastLayer ?? 0) - (data?.firstLayer ?? 0) + 1);
    });
  });

  it('splits a shallower cube in the same proportions, every layer in one band', () => {
    // 8 layers: a quarter of 32, so the bands are 0-1, 2-4 and 5-7.
    expect(bandLayersForDepth(8).map((band) => band.layers)).toEqual([
      [0, 1],
      [2, 3, 4],
      [5, 6, 7],
    ]);
    for (const depth of [1, 2, 3, 5, 10, 16, 31, 33, 64]) {
      const layers = bandLayersForDepth(depth).flatMap((band) => band.layers);
      expect(layers).toEqual(Array.from({ length: depth }, (_, z) => z));
    }
  });
});
