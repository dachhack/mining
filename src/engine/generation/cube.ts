// Cube generation (design doc 3, 3.1, 3.3; decision note 0005 items 3 and 4).
//
// Three passes, all driven only by the seeded generator:
// 1. Rock. Every cell becomes one of its band's plain rocks, picked by weight.
// 2. Veins. Band by band and ore by ore, groups of connected ore blocks
//    replace some of that rock.
// 3. Coal near the surface (owner, 2026-11-22, question 140; decision note
//    0052): no coal on the top layer, and at least a minimum in layer 1.
//
// Underground spaces (caverns and pockets) are opened afterwards, by
// `generateSpaces` in spaces.ts.
//
// Every number used here is in src/data/generation.ts.

import { BLOCKS, GENERATION, WORLD } from '../../data';
import type { BandGenerationDef, CubeSize, RockWeight, Vec3, VeinDef } from '../../data';
import { cellCount, cellIndex, cellPosition, inGrid } from '../state';
import { nextFloat, nextInt } from '../rng';
import type { RngState } from '../rng';
import { bandLayersForDepth } from './bands';

// The six face neighbours of a cell. The order is fixed, because the order in
// which a vein looks at its neighbours decides which random number goes where.
export const NEIGHBOUR_OFFSETS: readonly Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/** The code stored in the cube for the block with this id. Throws on an unknown id. */
export function blockCode(blockId: string): number {
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
export function bandDefFor(bandId: string): BandGenerationDef {
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
 * Try to grow one connected group of cells from the cell `startIndex`, and
 * store `code` in each: an ore for a vein, open space for a cavern or pocket.
 *
 * The group spreads one cell at a time into a random cell next to it, so it
 * is always one 6-connected group. It only takes cells for which
 * `canReplace[cell]` is 1, and sets that to 0 for each cell it takes.
 *
 * Returns the cells of the group (as `cellIndex` numbers, in the order they
 * were taken) if it reached `minSize`. If it could not (it was boxed in),
 * every cell it changed is put back and the result is `null`.
 */
export function growGroup(
  blocks: Uint8Array,
  canReplace: Uint8Array,
  size: CubeSize,
  startIndex: number,
  code: number,
  minSize: number,
  targetSize: number,
  rng: RngState,
): number[] | null {
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
    blocks[cell] = code;
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
    return changedCells;
  }
  for (let i = 0; i < changedCells.length; i += 1) {
    const cell = changedCells[i] as number;
    blocks[cell] = blocksBefore[i] as number;
    canReplace[cell] = 1;
  }
  return null;
}

/**
 * Try to grow one vein of `oreCode` from the cell `startIndex` (see
 * `growGroup`). `canReplace` marks the plain rock of the vein's own band, so
 * a vein never leaves its band and never eats another vein.
 *
 * Exported only so that a test can grow a single vein.
 *
 * Returns true if the vein reached `minSize`; otherwise nothing is changed
 * and the result is false.
 */
export function growVein(
  blocks: Uint8Array,
  canReplace: Uint8Array,
  size: CubeSize,
  startIndex: number,
  oreCode: number,
  minSize: number,
  targetSize: number,
  rng: RngState,
): boolean {
  const cells = growGroup(blocks, canReplace, size, startIndex, oreCode, minSize, targetSize, rng);
  return cells !== null;
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
  // At least one vein is attempted, so that an ore a band lists normally
  // appears even in a small cube. It is not a promise: a vein that finds no
  // room is left out (see the end of the loop below).
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
 * Pass 3: coal near the surface (owner, 2026-11-22: "No coal at surface in
 * the real game, but make sure there is some coal at the first level after
 * the surface"). Every number is in `GENERATION.surfaceCoal`.
 *
 * - Every coal cell in layer 0 becomes `surfaceBecomes` (stone). No random
 *   number is drawn for this.
 * - Then, if layer 1 holds fewer coal cells than the minimum, more coal
 *   veins are grown in layer 1's plain rock until it holds at least that
 *   many. Each is the size of a normal coal vein, and stays in layer 1. If
 *   layer 1 already holds enough, no random number is drawn, so the rest of
 *   the cube, and everything generated after it, is as it would have been.
 *
 * The minimum is written for the full-size 32 x 32 cube; a smaller cube
 * needs the same share of its layer, rounded up. In a cube so shallow that
 * layer 1 lies in a band without coal veins (only test cubes), there is no
 * top-up.
 *
 * This runs before the underground spaces are opened. A space replaces plain
 * rock only, never ore, and never reaches layer 0, so the coal placed here
 * stays.
 */
export function placeSurfaceCoal(
  blocks: Uint8Array,
  size: CubeSize,
  bands: { bandId: string; layers: number[] }[],
  rng: RngState,
): void {
  const rule = GENERATION.surfaceCoal;
  const coal = blockCode(rule.block);
  const surfaceBecomes = blockCode(rule.surfaceBecomes);
  const cellsPerLayer = size.x * size.y;

  // Layer 0: no coal. Its cells are the first x * y entries of the cube.
  for (let cell = 0; cell < cellsPerLayer; cell += 1) {
    if (blocks[cell] === coal) {
      blocks[cell] = surfaceBecomes;
    }
  }

  // Layer 1: at least the minimum. Find the band that holds it, and that
  // band's coal vein.
  const layerOneBand = bands.find((band) => band.layers.includes(1));
  if (layerOneBand === undefined) {
    return; // A cube one layer deep has no layer 1.
  }
  const bandDef = bandDefFor(layerOneBand.bandId);
  const vein = bandDef.veins.find((entry) => entry.block === rule.block);
  if (vein === undefined) {
    return; // Only in a very shallow test cube.
  }
  const fullSizeCellsPerLayer = WORLD.size.x * WORLD.size.y;
  const needed = Math.ceil((rule.firstLayerMinimum * cellsPerLayer) / fullSizeCellsPerLayer);

  // Layer 1's cells run from `cellsPerLayer` to `2 * cellsPerLayer - 1`.
  const firstCell = cellsPerLayer;
  let have = 0;
  for (let cell = firstCell; cell < firstCell + cellsPerLayer; cell += 1) {
    if (blocks[cell] === coal) {
      have += 1;
    }
  }
  if (have >= needed) {
    return;
  }

  // Only layer 1's plain rock may become coal, so a new vein stays in the
  // layer and never eats another vein.
  const rockCodes = bandDef.rock.map((rock) => blockCode(rock.block));
  const canReplace = new Uint8Array(blocks.length);
  for (let cell = firstCell; cell < firstCell + cellsPerLayer; cell += 1) {
    if (rockCodes.includes(blocks[cell] as number)) {
      canReplace[cell] = 1;
    }
  }
  while (have < needed) {
    const targetSize = vein.minSize + nextInt(rng, vein.maxSize - vein.minSize + 1);
    let grown: number[] | null = null;
    for (let attempt = 0; attempt < GENERATION.veinPlacementTries && grown === null; attempt += 1) {
      const startIndex = firstCell + nextInt(rng, cellsPerLayer);
      if (canReplace[startIndex] === 1) {
        grown = growGroup(
          blocks,
          canReplace,
          size,
          startIndex,
          coal,
          vein.minSize,
          targetSize,
          rng,
        );
      }
    }
    if (grown === null) {
      // Every try failed: layer 1 has no room left. Not seen on any seed tested.
      return;
    }
    have += grown.length;
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
 *   ore, crystal and unstable ore in the depth bands of design doc 3.3 (0005
 *   items 3 and 4): each block appears only in the bands that list it in
 *   src/data/generation.ts. It generates no open space: `generateSpaces`
 *   (spaces.ts) opens the caverns and pockets afterwards.
 * - Ore is in veins (design doc 3.3): each vein is a 6-connected group of at
 *   least the ore's `minSize` blocks, all in one band. Two veins of the same
 *   ore may touch and so look like one larger vein. The one exception is
 *   coal that reached layer 0: it is stone there (pass 3), so what is left
 *   of that vein below may be smaller than `minSize`.
 * - Layer 0 holds no coal, and layer 1 holds at least the minimum of
 *   `GENERATION.surfaceCoal` (see `placeSurfaceCoal`).
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

  // Pass 3: no coal on the top layer, and at least a minimum in layer 1.
  placeSurfaceCoal(blocks, size, bands, rng);

  return blocks;
}
