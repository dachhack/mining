// Underground spaces: caverns, and water, lava and gas pockets (design doc
// v0.2 sections 3.3 and 3.6; issue #95, task T7; decision note 0030).
//
// `generateSpaces` runs once, in `createRun`, right after `generateCube`, and
// draws from the same seeded generator. Band by band and kind by kind, it
// opens groups of connected cells in the band's plain rock and fills the
// pockets. Every number is in `GENERATION` (src/data/generation.ts) and
// `HAZARDS` (src/data/hazards.ts).
//
// What is true of every space it makes:
// - It is one 6-connected group of open cells, all in one depth band.
// - It replaces plain rock only (the band's `rock` blocks), never ore, so the
//   veins stay as `generateCube` made them.
// - It never reaches layer 0. So every square of a fresh cube is at depth 0:
//   the surface is flat, and every space has a roof.
// - It is sealed: each of its cells has, on all six sides, either rock or
//   another cell of the same space. Two spaces never touch.
// - A cavern is empty. Every cell of a water pocket holds water, of a lava
//   pocket lava, of a gas pocket gas.
//
// Nothing here is seen by the player: a space lies under the top blocks. The
// tells in tells.ts are what the player gets (design doc 3.7), and breach.ts
// is what happens when a mine opens one (design doc 6.2).

import { GENERATION, HAZARDS } from '../../data';
import type { SpaceDef, SpaceKind } from '../../data';
import { nextInt } from '../rng';
import { cellCount, cellIndex, cellPosition, inGrid, setGas, setLava, setWater } from '../state';
import type { GameState } from '../state';
import { bandLayersForDepth } from './bands';
import { NEIGHBOUR_OFFSETS, bandDefFor, blockCode, growGroup } from './cube';

/** The highest layer a space may reach. Layer 0 is always solid (see above). */
const FIRST_SPACE_LAYER = 1;

/** Fill one cell of a new space with what its kind holds. A cavern holds nothing. */
function fillCell(state: GameState, cell: number, kind: SpaceKind): void {
  const pos = cellPosition(state.size, cell);
  if (kind === 'water') {
    setWater(state, pos, HAZARDS.water.unitsPerCell);
  } else if (kind === 'lava') {
    // Not marked as a source: whether a pocket keeps pouring is decided when
    // it is broken into, from its size (breach.ts).
    setLava(state, pos, HAZARDS.lava.unitsPerCell);
  } else if (kind === 'gas') {
    setGas(state, pos, HAZARDS.gas.pocketUnitsPerCell);
  }
}

/**
 * Place all the spaces of one kind in one band. `layers` are the band's
 * layers, top first. `canOpen[cell]` is 1 for each cell a space may still
 * take; it is updated as spaces are placed.
 */
function placeSpaces(
  state: GameState,
  canOpen: Uint8Array,
  layers: number[],
  space: SpaceDef,
): void {
  const size = state.size;
  const open = blockCode('air');
  const cellsInBand = size.x * size.y * layers.length;
  // At least one is attempted, as for veins; one that finds no room is left out.
  const count = Math.max(1, Math.round((space.spacesPer1000Cells * cellsInBand) / 1000));

  for (let n = 0; n < count; n += 1) {
    const targetSize = space.minSize + nextInt(state.rng, space.maxSize - space.minSize + 1);
    for (let attempt = 0; attempt < GENERATION.spacePlacementTries; attempt += 1) {
      const start = {
        x: nextInt(state.rng, size.x),
        y: nextInt(state.rng, size.y),
        z: layers[nextInt(state.rng, layers.length)] as number,
      };
      const startIndex = cellIndex(size, start);
      if (canOpen[startIndex] !== 1) {
        continue;
      }
      const cells = growGroup(
        state.blocks,
        canOpen,
        size,
        startIndex,
        open,
        space.minSize,
        targetSize,
        state.rng,
      );
      if (cells === null) {
        continue;
      }
      for (const cell of cells) {
        fillCell(state, cell, space.kind);
        // Sealed: no later space may take a cell next to this one.
        const pos = cellPosition(size, cell);
        for (const offset of NEIGHBOUR_OFFSETS) {
          const neighbour = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
          if (inGrid(size, neighbour)) {
            canOpen[cellIndex(size, neighbour)] = 0;
          }
        }
      }
      break;
    }
    // If every try failed (the band is tiny or full), this space is left out.
  }
}

/**
 * Open the caverns and pockets of a new cube (see the top of this file).
 *
 * Changes `state.blocks`, `state.water`, `state.lava`, `state.gas` and
 * `state.rng` in place. The same cube and the same generator always give the
 * same spaces. Works for any cube size; a band too small for a space simply
 * gets none.
 */
export function generateSpaces(state: GameState): void {
  const size = state.size;
  const bands = bandLayersForDepth(size.z);
  // 1 for a cell beside a space placed in an earlier band: the bands lie on
  // top of each other, so a space at the top of one band must not touch a
  // space at the bottom of the band above.
  const besideEarlierSpace = new Uint8Array(cellCount(size));
  const canOpen = new Uint8Array(cellCount(size));

  for (const band of bands) {
    const bandDef = bandDefFor(band.bandId);
    if (band.layers.length === 0 || bandDef.spaces.length === 0) {
      continue;
    }
    const rockCodes = bandDef.rock.map((rock) => blockCode(rock.block));

    // The cells a space of this band may take: the band's plain rock, below
    // layer 0, not beside a space of an earlier band.
    canOpen.fill(0);
    for (const z of band.layers) {
      if (z < FIRST_SPACE_LAYER) {
        continue;
      }
      for (let y = 0; y < size.y; y += 1) {
        for (let x = 0; x < size.x; x += 1) {
          const index = cellIndex(size, { x, y, z });
          const isPlainRock = rockCodes.includes(state.blocks[index] as number);
          if (isPlainRock && besideEarlierSpace[index] === 0) {
            canOpen[index] = 1;
          }
        }
      }
    }
    // A band's layers can include layer 0 or 1 only in a very shallow cube;
    // `placeSpaces` picks its starting cells from all of the band's layers
    // and skips the ones `canOpen` rules out.
    for (const space of bandDef.spaces) {
      placeSpaces(state, canOpen, band.layers, space);
    }

    // Remember this band's spaces and the cells beside them for the bands below.
    for (const z of band.layers) {
      for (let y = 0; y < size.y; y += 1) {
        for (let x = 0; x < size.x; x += 1) {
          const pos = { x, y, z };
          if (state.blocks[cellIndex(size, pos)] !== blockCode('air')) {
            continue;
          }
          for (const offset of NEIGHBOUR_OFFSETS) {
            const neighbour = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
            if (inGrid(size, neighbour)) {
              besideEarlierSpace[cellIndex(size, neighbour)] = 1;
            }
          }
        }
      }
    }
  }
}
