// The heightmap helpers (issue #84; design doc v0.2 sections 3.1 and 4.2):
// a square's depth, its top block, and the level rule.
//
// Most tests draw the ground as a "depth map": one string per row (y = 0
// first, north at the top), one digit per square, saying how many blocks have
// been removed from that square. For example a pit with one terrace:
//
//   const state = groundWithDepths(['000', '011', '012']);

import { describe, expect, it } from 'vitest';
import { BLOCKS, CONTRACT_IDS, DEFAULT_LOADOUT_ID } from '../../src/data';
import {
  createRng,
  createRun,
  depthAt,
  hashState,
  isOpen,
  isSquare,
  mayMine,
  nextInt,
  topBlockAt,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setBlock } from '../../src/engine/state';
import { buildState } from './helpers';

/** How many layers the hand-made cubes below have. */
const TEST_LAYERS = 6;

/**
 * A solid stone cube `TEST_LAYERS` deep, dug from the top to the depths drawn
 * in `rows` (see the top of this file).
 */
function groundWithDepths(rows: string[]): GameState {
  const layers: string[][] = [];
  for (let z = 0; z < TEST_LAYERS; z += 1) {
    const layer: string[] = [];
    for (const row of rows) {
      let text = '';
      for (const char of row) {
        const depth = Number(char);
        // A cell above the square's depth has been dug out; the rest is stone.
        text += z < depth ? '.' : '#';
      }
      layer.push(text);
    }
    layers.push(layer);
  }
  return buildState({ layers });
}

/** Remove the top block of a square, as a mine will (task T2). Test-only. */
function removeTopBlock(state: GameState, x: number, y: number): void {
  const z = depthAt(state, x, y);
  setBlock(state, { x, y, z }, BLOCKS.air.code);
}

/** The depth of every square, drawn the way `groundWithDepths` reads it. */
function depthRows(state: GameState): string[] {
  const rows: string[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    let text = '';
    for (let x = 0; x < state.size.x; x += 1) {
      text += String(depthAt(state, x, y));
    }
    rows.push(text);
  }
  return rows;
}

/**
 * The largest difference in depth between any two squares that share a side.
 * 0 on flat ground.
 */
function largestStep(state: GameState): number {
  let largest = 0;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const here = depthAt(state, x, y);
      // Looking east and south from every square covers each pair once.
      if (x + 1 < state.size.x) {
        largest = Math.max(largest, Math.abs(here - depthAt(state, x + 1, y)));
      }
      if (y + 1 < state.size.y) {
        largest = Math.max(largest, Math.abs(here - depthAt(state, x, y + 1)));
      }
    }
  }
  return largest;
}

describe('depthAt and topBlockAt', () => {
  it('reads depth 0 everywhere on a fresh hand-made cube', () => {
    const state = groundWithDepths(['000', '000', '000']);
    expect(depthRows(state)).toEqual(['000', '000', '000']);
  });

  it('reads depth 0 everywhere on a freshly generated cube', () => {
    const state = createRun(7, CONTRACT_IDS[0] as string, DEFAULT_LOADOUT_ID);
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        expect(depthAt(state, x, y)).toBe(0);
        // The top block is the layer-0 block, tree or no tree.
        expect(topBlockAt(state, x, y)).toBe(state.blocks[x + state.size.x * y]);
      }
    }
  });

  it('counts the blocks removed from the top of a square', () => {
    const state = groundWithDepths(['000', '000', '000']);
    removeTopBlock(state, 1, 1);
    expect(depthAt(state, 1, 1)).toBe(1);
    removeTopBlock(state, 1, 1);
    removeTopBlock(state, 1, 1);
    expect(depthAt(state, 1, 1)).toBe(3);
    // Only that square changed.
    expect(depthRows(state)).toEqual(['000', '030', '000']);
  });

  it('answers the block in layer z = depth as the top block', () => {
    const state = buildState({
      layers: [
        ['d#', '.c'], // z = 0
        ['#i', 'H#'], // z = 1
      ],
    });
    expect(topBlockAt(state, 0, 0)).toBe(BLOCKS.dirt.code);
    expect(topBlockAt(state, 1, 0)).toBe(BLOCKS.stone.code);
    expect(topBlockAt(state, 1, 1)).toBe(BLOCKS.coalSeam.code);
    // (0, 1) has lost its layer-0 block, so its top is the layer-1 block.
    expect(depthAt(state, 0, 1)).toBe(1);
    expect(topBlockAt(state, 0, 1)).toBe(BLOCKS.hardRock.code);

    removeTopBlock(state, 1, 0);
    expect(topBlockAt(state, 1, 0)).toBe(BLOCKS.ironOre.code);
  });

  it('puts a fully mined square at the bottom, showing bedrock', () => {
    const state = buildState({
      layers: [
        ['.#'], // z = 0
        ['.#'], // z = 1
      ],
    });
    expect(depthAt(state, 0, 0)).toBe(2); // the cube is 2 layers deep
    expect(topBlockAt(state, 0, 0)).toBe(BLOCKS.bedrock.code);
  });

  it('takes the first solid block from the top; open cells under it do not count', () => {
    // Column (0, 0) has a cavern cell at z = 1 under a solid roof.
    const state = buildState({
      layers: [
        ['d#'], // z = 0
        ['.#'], // z = 1: the cavern
        ['c#'], // z = 2
      ],
    });
    expect(depthAt(state, 0, 0)).toBe(0);
    expect(topBlockAt(state, 0, 0)).toBe(BLOCKS.dirt.code);

    // With the roof gone, the square drops past the cavern to the next solid block.
    removeTopBlock(state, 0, 0);
    expect(depthAt(state, 0, 0)).toBe(2);
    expect(topBlockAt(state, 0, 0)).toBe(BLOCKS.coalSeam.code);
  });

  it('does not look at the surface: under a tree the top block is still the layer-0 block', () => {
    const state = buildState({ layers: [['c#']], surface: ['T.'] });
    expect(depthAt(state, 0, 0)).toBe(0);
    expect(topBlockAt(state, 0, 0)).toBe(BLOCKS.coalSeam.code);
  });

  it('throws for a position that is not a square', () => {
    const state = groundWithDepths(['00', '00']);
    expect(isSquare(state, 1, 1)).toBe(true);
    expect(isSquare(state, 2, 0)).toBe(false);
    expect(isSquare(state, 0, -1)).toBe(false);
    expect(isSquare(state, 0.5, 0)).toBe(false);
    expect(() => depthAt(state, 2, 0)).toThrow('not a square');
    expect(() => topBlockAt(state, 0, -1)).toThrow('not a square');
    expect(() => mayMine(state, -1, 0)).toThrow('not a square');
  });
});

describe('mayMine: the level rule', () => {
  it('allows every square of flat ground', () => {
    const state = groundWithDepths(['000', '000', '000']);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        expect(mayMine(state, x, y)).toEqual({
          allowed: true,
          refusal: null,
          higherNeighbours: [],
        });
      }
    }
  });

  it('refuses to deepen a one-square hole, and names all four neighbours', () => {
    const state = groundWithDepths(['000', '010', '000']);
    expect(mayMine(state, 1, 1)).toEqual({
      allowed: false,
      refusal: 'neighbourHigher',
      // Always in the order north, east, south, west.
      higherNeighbours: [
        { direction: 'north', x: 1, y: 0, depth: 0 },
        { direction: 'east', x: 2, y: 1, depth: 0 },
        { direction: 'south', x: 1, y: 2, depth: 0 },
        { direction: 'west', x: 0, y: 1, depth: 0 },
      ],
    });
    // The squares round the hole are higher than it, so they may be mined.
    expect(mayMine(state, 1, 0).allowed).toBe(true);
    expect(mayMine(state, 0, 0).allowed).toBe(true);
  });

  it('names only the neighbours that are higher', () => {
    // (1, 1) is at depth 2. North is level with it, east is deeper, south and
    // west are higher.
    const state = groundWithDepths(['121', '123', '111']);
    const result = mayMine(state, 1, 1);
    expect(result.allowed).toBe(false);
    expect(result.refusal).toBe('neighbourHigher');
    expect(result.higherNeighbours).toEqual([
      { direction: 'south', x: 1, y: 2, depth: 1 },
      { direction: 'west', x: 0, y: 1, depth: 1 },
    ]);
  });

  it('works through a terraced pit one ring at a time', () => {
    // A pit 2 deep in the middle of 5 x 5 ground, with a ring at depth 1.
    const state = groundWithDepths(['00000', '01110', '01210', '01110', '00000']);

    // The bottom is lower than its ring: it must wait.
    expect(mayMine(state, 2, 2).allowed).toBe(false);
    // A ring square beside the bottom has ground-level neighbours: refused.
    const ring = mayMine(state, 2, 1);
    expect(ring.allowed).toBe(false);
    expect(ring.higherNeighbours).toEqual([{ direction: 'north', x: 2, y: 0, depth: 0 }]);
    // Ground level may always be mined.
    expect(mayMine(state, 0, 0).allowed).toBe(true);
    expect(mayMine(state, 2, 0).allowed).toBe(true);

    // Widen: take the whole outer ring down to depth 1.
    for (let i = 0; i < 5; i += 1) {
      removeTopBlock(state, i, 0);
      removeTopBlock(state, i, 4);
    }
    for (let i = 1; i < 4; i += 1) {
      removeTopBlock(state, 0, i);
      removeTopBlock(state, 4, i);
    }
    expect(depthRows(state)).toEqual(['11111', '11111', '11211', '11111', '11111']);

    // Now the old ring may go down, and once it has, so may the bottom.
    expect(mayMine(state, 2, 2).allowed).toBe(false);
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [3, 1],
      [1, 2],
      [3, 2],
      [1, 3],
      [2, 3],
      [3, 3],
    ] as const) {
      expect(mayMine(state, x, y).allowed).toBe(true);
      removeTopBlock(state, x, y);
    }
    expect(depthRows(state)).toEqual(['11111', '12221', '12221', '12221', '11111']);
    expect(mayMine(state, 2, 2).allowed).toBe(true);
    removeTopBlock(state, 2, 2);
    expect(largestStep(state)).toBe(1);
  });

  it('ignores diagonal squares', () => {
    // (1, 1) is level with its four face neighbours and lower than all four
    // diagonal squares.
    const state = groundWithDepths(['010', '111', '010']);
    expect(mayMine(state, 1, 1).allowed).toBe(true);
  });

  it('does not count the side walls: a corner has 2 neighbours and an edge has 3', () => {
    // The corner (0, 0) and its two neighbours are at depth 1.
    const corner = groundWithDepths(['110', '100', '000']);
    expect(mayMine(corner, 0, 0).allowed).toBe(true);
    removeTopBlock(corner, 0, 0);
    // Now it is lower than both neighbours; only those two are named.
    expect(mayMine(corner, 0, 0).higherNeighbours).toEqual([
      { direction: 'east', x: 1, y: 0, depth: 1 },
      { direction: 'south', x: 0, y: 1, depth: 1 },
    ]);

    // The edge square (1, 0) and its three neighbours are at depth 1.
    const edge = groundWithDepths(['111', '010', '000']);
    expect(mayMine(edge, 1, 0).allowed).toBe(true);
    removeTopBlock(edge, 1, 0);
    expect(mayMine(edge, 1, 0).higherNeighbours).toEqual([
      { direction: 'east', x: 2, y: 0, depth: 1 },
      { direction: 'south', x: 1, y: 1, depth: 1 },
      { direction: 'west', x: 0, y: 0, depth: 1 },
    ]);
  });

  it('lets a single column be mined to the bottom when it has no neighbours', () => {
    const state = buildState({ layers: [['#'], ['#'], ['#']] });
    for (let depth = 0; depth < 3; depth += 1) {
      expect(mayMine(state, 0, 0).allowed).toBe(true);
      removeTopBlock(state, 0, 0);
    }
    expect(mayMine(state, 0, 0)).toEqual({
      allowed: false,
      refusal: 'bottom',
      higherNeighbours: [],
    });
  });

  it('may mine a square whose neighbours are all deeper (a pillar left by a hazard)', () => {
    const state = groundWithDepths(['222', '202', '222']);
    expect(mayMine(state, 1, 1).allowed).toBe(true);
  });

  it('does not change the state', () => {
    const state = groundWithDepths(['000', '011', '012']);
    const before = hashState(state);
    depthAt(state, 2, 2);
    topBlockAt(state, 2, 2);
    mayMine(state, 2, 2);
    mayMine(state, 0, 0);
    expect(hashState(state)).toBe(before);
  });
});

describe('property: mining only where mayMine allows', () => {
  // Fixed seeds, so a failure can be replayed. The picks come from the
  // engine's seeded generator, never from Math.random.
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  const SIDE = 7;
  const PICKS = 1500;

  for (const seed of SEEDS) {
    it(`never leaves two face neighbours more than 1 level apart (seed ${seed})`, () => {
      const flatRow = '0'.repeat(SIDE);
      const rows: string[] = [];
      for (let y = 0; y < SIDE; y += 1) {
        rows.push(flatRow);
      }
      const state = groundWithDepths(rows);
      const rng = createRng(seed);
      let mined = 0;

      for (let pick = 0; pick < PICKS; pick += 1) {
        const x = nextInt(rng, SIDE);
        const y = nextInt(rng, SIDE);
        const answer = mayMine(state, x, y);
        if (!answer.allowed) {
          continue;
        }
        const depthBefore = depthAt(state, x, y);
        removeTopBlock(state, x, y);
        mined += 1;
        expect(depthAt(state, x, y)).toBe(depthBefore + 1);
        // The owner's rule: "After mining, at most 1 step."
        if (largestStep(state) > 1) {
          throw new Error(
            `Seed ${seed}, pick ${pick}: mining (${x}, ${y}) left a step of ` +
              `${largestStep(state)}:\n${depthRows(state).join('\n')}`,
          );
        }
      }

      // The run did real work: with this many picks the whole cube is dug out,
      // and every square ends at the bottom, where nothing more may be mined.
      expect(mined).toBe(SIDE * SIDE * TEST_LAYERS);
      for (let y = 0; y < SIDE; y += 1) {
        for (let x = 0; x < SIDE; x += 1) {
          expect(mayMine(state, x, y).refusal).toBe('bottom');
        }
      }
    });
  }

  it('holds on a generated cube too, while no mine breaks into an open space', () => {
    // A generated cube has caverns and pockets. Mining the roof of one drops
    // the square by more than 1 level; design doc 6.2 (task T9) will collapse
    // the space instead. Until then this test stops a square just above any
    // open cell, so only the level rule is being tested.
    const state = createRun(11, CONTRACT_IDS[0] as string, DEFAULT_LOADOUT_ID);
    const rng = createRng(11);
    let mined = 0;
    for (let pick = 0; pick < 4000; pick += 1) {
      const x = nextInt(rng, state.size.x);
      const y = nextInt(rng, state.size.y);
      if (!mayMine(state, x, y).allowed) {
        continue;
      }
      const depth = depthAt(state, x, y);
      // Below the bottom layer `isOpen` answers false: bedrock is solid.
      const openBelow = isOpen(state, { x, y, z: depth + 1 });
      if (openBelow) {
        continue;
      }
      removeTopBlock(state, x, y);
      mined += 1;
    }
    expect(mined).toBeGreaterThan(1000);
    expect(largestStep(state)).toBeLessThanOrEqual(1);
  });
});
