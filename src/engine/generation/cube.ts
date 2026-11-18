// Cube generation (design doc 3, 3.1, 3.3; decision note 0005 items 3 and 4).
//
// Two passes, both driven only by the seeded generator:
// 1. Rock. Every cell becomes one of its band's plain rocks, picked by weight.
// 2. Veins. Band by band and ore by ore, groups of connected ore blocks
//    replace some of that rock.
//
// Every number used here is in src/data/generation.ts.

import { BLOCKS, GENERATION } from '../../data';
import type { BandGenerationDef, CubeSize, RockWeight, Vec3, VeinDef } from '../../data';
import { cellCount, cellIndex, cellPosition, inGrid } from '../state';
import { nextFloat, nextInt } from '../rng';
import type { RngState } from '../rng';
import { bandLayersForDepth } from './bands';

// The six face neighbours of a cell. The order is fixed, because the order in
// which a vein looks at its neighbours decides which random number goes where.
const NEIGHBOUR_OFFSETS: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/** The code stored in the cube for the block with this id. Throws on an unknown id. */
function blockCode(blockId: string): number {
  // `Record<string, ...>` lets the table be indexed by any string; the result
  // is then "a block or undefined", which the check below narrows.
  const table: Record<string, { code: number }> = BLOCKS;
  const def = Object.hasOwn(table, blockId) ? table[blockId] : undefined;
  if (def === undefined) {
    throw new Error(`Generation data names an unknown block: ${blockId}`);
  }
  return def.code;
}

/** The generation entry for a band. Throws if the data has none. */
function bandDefFor(bandId: string): BandGenerationDef {
  const bandDef = GENERATION.bands.find((entry) => entry.bandId === bandId);
  if (bandDef === undefined) {
    throw new Error(`Generation data has no entry for depth band: ${bandId}`);
  }
  return bandDef;
}

/**
 * Pick one of a band's rocks for a cell.
 *
 * `depthInBand` is 0 in the band's first layer and 1 in its last; each rock's
 * weight slides evenly from `weightAtTop` to `weightAtBottom` between them.
 * Uses exactly one random number.
 */
function pickRock(rocks: RockWeight[], depthInBand: number, rng: RngState): number {
  const weights = rocks.map(
    (rock) => rock.weightAtTop + (rock.weightAtBottom - rock.weightAtTop) * depthInBand,
  );
  let total = 0;
  for (const weight of weights) {
    total += weight;
  }
  // Like Python's `random.choices(rocks, weights)`: walk along the weights
  // until the roll falls inside one.
  let roll = nextFloat(rng) * total;
  let chosen = rocks[rocks.length - 1];
  for (let i = 0; i < rocks.length; i += 1) {
    const weight = weights[i] as number;
    if (roll < weight) {
      chosen = rocks[i];
      break;
    }
    roll -= weight;
  }
  if (chosen === undefined) {
    throw new Error('Generation data lists no rock for a depth band');
  }
  return blockCode(chosen.block);
}

/**
 * Try to grow one vein of `oreCode` from the cell `startIndex`.
 *
 * The vein spreads one block at a time into a random cell next to it, so it
 * is always one 6-connected group. It only replaces cells for which
 * `canReplace[cell]` is 1 (plain rock of its own band), so it never leaves
 * its band and never eats another vein.
 *
 * Returns true if the vein reached `minSize`. If it could not (it was boxed
 * in), every cell it changed is put back and the result is false.
 */
function growVein(
  blocks: Uint8Array,
  canReplace: Uint8Array,
  size: CubeSize,
  startIndex: number,
  oreCode: number,
  minSize: number,
  targetSize: number,
  rng: RngState,
): boolean {
  // What each changed cell held before, so a failed vein can be undone.
  const changedCells: number[] = [];
  const blocksBefore: number[] = [];
  // Cells next to the vein that it may spread into. A cell can be listed more
  // than once (once per vein block it touches); a stale entry is skipped when
  // it is drawn.
  const frontier: number[] = [startIndex];

  while (changedCells.length < targetSize && frontier.length > 0) {
    // Take a random entry out of the frontier. Moving the last entry into the
    // gap ("swap-remove") avoids shifting the whole list.
    const pick = nextInt(rng, frontier.length);
    const cell = frontier[pick] as number;
    frontier[pick] = frontier[frontier.length - 1] as number;
    frontier.pop();
    if (canReplace[cell] !== 1) {
      continue;
    }

    changedCells.push(cell);
    blocksBefore.push(blocks[cell] as number);
    blocks[cell] = oreCode;
    canReplace[cell] = 0;

    const pos = cellPosition(size, cell);
    for (const offset of NEIGHBOUR_OFFSETS) {
      const neighbour = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
      if (inGrid(size, neighbour)) {
        const neighbourIndex = cellIndex(size, neighbour);
        if (canReplace[neighbourIndex] === 1) {
          frontier.push(neighbourIndex);
        }
      }
    }
  }

  if (changedCells.length >= minSize) {
    return true;
  }
  for (let i = 0; i < changedCells.length; i += 1) {
    const cell = changedCells[i] as number;
    blocks[cell] = blocksBefore[i] as number;
    canReplace[cell] = 1;
  }
  return false;
}

/** Place all the veins of one ore in one band. `layers` are the band's layers, top first. */
function placeVeins(
  blocks: Uint8Array,
  canReplace: Uint8Array,
  size: CubeSize,
  layers: number[],
  vein: VeinDef,
  rng: RngState,
): void {
  const oreCode = blockCode(vein.block);
  const cellsInBand = size.x * size.y * layers.length;
  // At least one vein, so that every ore a band lists appears even in a small cube.
  const veinCount = Math.max(1, Math.round((vein.veinsPer1000Cells * cellsInBand) / 1000));

  for (let n = 0; n < veinCount; n += 1) {
    const targetSize = vein.minSize + nextInt(rng, vein.maxSize - vein.minSize + 1);
    for (let attempt = 0; attempt < GENERATION.veinPlacementTries; attempt += 1) {
      const start = {
        x: nextInt(rng, size.x),
        y: nextInt(rng, size.y),
        z: layers[nextInt(rng, layers.length)] as number,
      };
      const startIndex = cellIndex(size, start);
      if (
        canReplace[startIndex] === 1 &&
        growVein(blocks, canReplace, size, startIndex, oreCode, vein.minSize, targetSize, rng)
      ) {
        break;
      }
    }
    // If every try failed (the band is tiny or full), this vein is left out.
  }
}

/**
 * Generate the blocks of a new cube.
 *
 * Contract:
 * - Returns a new array of `size.x * size.y * size.z` block codes, laid out as
 *   `cellIndex` in state.ts describes.
 * - All randomness comes from `rng`, which it advances. The same `size` and
 *   the same starting `rng` always give the same cube.
 * - It works for any size, including the small cubes tests use. A cube that
 *   is not 32 layers deep gets the depth bands in proportion (see bands.ts).
 * - It generates dirt, stone, hard rock, coal, timber-root, iron ore, copper
 *   ore and crystal in the depth bands of design doc 3.1 (0005 items 3 and 4):
 *   each block appears only in the bands that list it in
 *   src/data/generation.ts. It generates no open space.
 * - Ore is in veins (design doc 3.3): each vein is a 6-connected group of at
 *   least the ore's `minSize` blocks, all in one band. Two veins of the same
 *   ore may touch and so look like one larger vein.
 */
export function generateCube(size: CubeSize, rng: RngState): Uint8Array {
  const blocks = new Uint8Array(cellCount(size));
  const bands = bandLayersForDepth(size.z);

  // Pass 1: rock. Cells are visited in a fixed order (top layer first, then
  // row by row), one random number each.
  for (const band of bands) {
    const bandDef = bandDefFor(band.bandId);
    const lastStep = band.layers.length - 1;
    band.layers.forEach((z, step) => {
      const depthInBand = lastStep === 0 ? 0 : step / lastStep;
      for (let y = 0; y < size.y; y += 1) {
        for (let x = 0; x < size.x; x += 1) {
          blocks[cellIndex(size, { x, y, z })] = pickRock(bandDef.rock, depthInBand, rng);
        }
      }
    });
  }

  // Pass 2: veins, in the order the data lists the bands' ores.
  // `canReplace` marks the cells the band being worked on may turn into ore.
  const canReplace = new Uint8Array(blocks.length);
  for (const band of bands) {
    if (band.layers.length === 0) {
      continue;
    }
    canReplace.fill(0);
    for (const z of band.layers) {
      for (let y = 0; y < size.y; y += 1) {
        for (let x = 0; x < size.x; x += 1) {
          canReplace[cellIndex(size, { x, y, z })] = 1;
        }
      }
    }
    for (const vein of bandDefFor(band.bandId).veins) {
      placeVeins(blocks, canReplace, size, band.layers, vein, rng);
    }
  }

  return blocks;
}
