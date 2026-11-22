// Coal near the surface (owner, 2026-11-22, question 140; decision note 0052):
// "No coal at surface in the real game, but make sure there is some coal at
// the first level after the surface."

import { describe, expect, it } from 'vitest';
import { BLOCKS, GAME_DATA, GENERATION, WORLD, validateData } from '../../src/data';
import type { CubeSize, GameData } from '../../src/data';
import { createRun } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { bandLayersForDepth } from '../../src/engine/generation/bands';
import { generateCube, placeSurfaceCoal } from '../../src/engine/generation/cube';
import { createRng } from '../../src/engine/rng';
import { cellIndex } from '../../src/engine/state';

const COAL = BLOCKS.coalSeam.code;
const STONE = BLOCKS.stone.code;
const MINIMUM = GENERATION.surfaceCoal.firstLayerMinimum;

/** How many coal cells layer `z` of a cube of `size` holds. */
function coalInLayer(blocks: Uint8Array, size: CubeSize, z: number): number {
  let count = 0;
  for (let y = 0; y < size.y; y += 1) {
    for (let x = 0; x < size.x; x += 1) {
      if (blocks[cellIndex(size, { x, y, z })] === COAL) {
        count += 1;
      }
    }
  }
  return count;
}

describe('coal near the surface, over many seeds (question 140)', () => {
  // 500 full runs: the cube as the player gets it, after the underground
  // spaces and the surface have been made.
  const runs: GameState[] = [];
  for (let seed = 1; seed <= 500; seed += 1) {
    runs.push(createRun(seed, 'none', 'standard'));
  }

  it('there is no coal on the top layer', () => {
    runs.forEach((state, index) => {
      expect(coalInLayer(state.blocks, state.size, 0), `seed ${index + 1}`).toBe(0);
    });
  });

  it(`layer 1 holds at least the minimum (${MINIMUM}) of coal`, () => {
    runs.forEach((state, index) => {
      expect(coalInLayer(state.blocks, state.size, 1), `seed ${index + 1}`).toBeGreaterThanOrEqual(
        MINIMUM,
      );
    });
  });

  it('the minimum is a floor, not a target: the median seed holds well over it', () => {
    const counts = runs.map((state) => coalInLayer(state.blocks, state.size, 1));
    counts.sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)] as number;
    expect(median).toBeGreaterThan(1.5 * MINIMUM);
  });
});

describe('placeSurfaceCoal on a hand-built cube', () => {
  // 32 x 32 squares, 16 layers deep: layer 1 is in the upper band, which has
  // coal veins, and the full minimum applies. All stone to start with.
  const size: CubeSize = { x: 32, y: 32, z: 16 };
  const bands = bandLayersForDepth(size.z);
  function stoneCube(): Uint8Array {
    return new Uint8Array(size.x * size.y * size.z).fill(STONE);
  }

  it('turns top-layer coal to stone and leaves deeper coal alone', () => {
    const blocks = stoneCube();
    blocks[cellIndex(size, { x: 3, y: 4, z: 0 })] = COAL;
    blocks[cellIndex(size, { x: 3, y: 4, z: 2 })] = COAL;
    placeSurfaceCoal(blocks, size, bands, createRng(1));
    expect(blocks[cellIndex(size, { x: 3, y: 4, z: 0 })]).toBe(
      BLOCKS[GENERATION.surfaceCoal.surfaceBecomes as 'stone'].code,
    );
    expect(blocks[cellIndex(size, { x: 3, y: 4, z: 2 })]).toBe(COAL);
  });

  it('grows coal in layer 1 until it holds the minimum, and only in layer 1', () => {
    const blocks = stoneCube();
    placeSurfaceCoal(blocks, size, bands, createRng(2));
    expect(coalInLayer(blocks, size, 1)).toBeGreaterThanOrEqual(MINIMUM);
    for (let z = 0; z < size.z; z += 1) {
      if (z !== 1) {
        expect(coalInLayer(blocks, size, z), `layer ${z}`).toBe(0);
      }
    }
  });

  it('draws no random number and adds nothing when layer 1 already holds enough', () => {
    const blocks = stoneCube();
    for (let x = 0; x < MINIMUM; x += 1) {
      blocks[cellIndex(size, { x, y: 0, z: 1 })] = COAL;
    }
    const before = blocks.slice();
    const rng = createRng(3);
    const rngBefore = { ...rng };
    placeSurfaceCoal(blocks, size, bands, rng);
    expect(Array.from(blocks)).toEqual(Array.from(before));
    expect(rng).toEqual(rngBefore);
  });

  it('turns only plain rock into coal, never another ore', () => {
    // The south half of layer 1 is timber-root: the new coal can only go in
    // the north half.
    const blocks = stoneCube();
    for (let y = size.y / 2; y < size.y; y += 1) {
      for (let x = 0; x < size.x; x += 1) {
        blocks[cellIndex(size, { x, y, z: 1 })] = BLOCKS.timberRoot.code;
      }
    }
    placeSurfaceCoal(blocks, size, bands, createRng(4));
    let timberRoot = 0;
    for (let y = size.y / 2; y < size.y; y += 1) {
      for (let x = 0; x < size.x; x += 1) {
        if (blocks[cellIndex(size, { x, y, z: 1 })] === BLOCKS.timberRoot.code) timberRoot += 1;
      }
    }
    expect(timberRoot).toBe((size.x * size.y) / 2);
    expect(coalInLayer(blocks, size, 1)).toBeGreaterThanOrEqual(MINIMUM);
  });

  it('scales the minimum to a smaller cube by its share of the full-size layer', () => {
    const small: CubeSize = { x: 8, y: 8, z: 16 };
    const needed = Math.ceil((MINIMUM * small.x * small.y) / (WORLD.size.x * WORLD.size.y));
    for (let seed = 1; seed <= 50; seed += 1) {
      const blocks = generateCube(small, createRng(seed));
      expect(coalInLayer(blocks, small, 0), `seed ${seed}`).toBe(0);
      expect(coalInLayer(blocks, small, 1), `seed ${seed}`).toBeGreaterThanOrEqual(needed);
    }
  });
});

describe('the surface coal data', () => {
  function problemsAfter(breakIt: (data: GameData) => void): string[] {
    const data = structuredClone(GAME_DATA);
    breakIt(data);
    return validateData(data);
  }

  it('reports a bad minimum, an unknown block, and coal that is not a vein of layer 1', () => {
    expect(
      problemsAfter((data) => {
        data.generation.surfaceCoal.firstLayerMinimum = -1;
      }),
    ).toContain(
      'generation.surfaceCoal.firstLayerMinimum must be a whole number of at least 0, but is -1',
    );
    expect(
      problemsAfter((data) => {
        data.generation.surfaceCoal.surfaceBecomes = 'granite';
      }),
    ).toContain('generation.surfaceCoal.surfaceBecomes names an unknown block "granite"');
    expect(
      problemsAfter((data) => {
        data.generation.surfaceCoal.block = 'ironOre';
      }),
    ).toContain(
      'generation.surfaceCoal.block "ironOre" must be a vein of band "upper", which holds layer 1',
    );
  });
});
