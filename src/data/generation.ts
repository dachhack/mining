import type { GenerationData } from './types';

// Every number cube generation uses. All of it is [Default]: tune it here.
//
// Design doc v0.2 sections 3.3 (depth bands) and 3.6 (features), with the
// readings of decision note 0005 items 3 and 4 and decision note 0030:
// - Upper band: dirt and stone, with coal and timber-root; small caverns.
// - Middle band: "hard stone" is read as a mix of stone and hard rock, with
//   more hard rock deeper; iron and copper ore; water pockets, gas pockets,
//   caverns.
// - Deep band: mostly hard rock; crystal and unstable ore; lava pockets and
//   large caverns.
// Not generated until a later milestone: relics and keystones (M4).
//
// How the numbers are used (src/engine/generation/cube.ts and spaces.ts):
// - Rock. Each cell first becomes one of the band's `rock` blocks, picked by
//   weight. The weights slide evenly from `weightAtTop` in the band's first
//   layer to `weightAtBottom` in its last. Only the ratio matters; they are
//   written here as percentages.
// - Veins. For each ore the band gets `veinsPer1000Cells` veins for every
//   1000 cells in it (rounded, and never fewer than one). Each vein is a
//   6-connected group of `minSize` to `maxSize` blocks that stays inside its
//   band. So an ore fills about veinsPer1000Cells * average size / 10 percent
//   of its band: the figures in the comments below.
// - Spaces. For each kind the band gets `spacesPer1000Cells` spaces for every
//   1000 cells in it (rounded, and never fewer than one). Each space is a
//   6-connected group of `minSize` to `maxSize` open cells that stays inside
//   its band, replaces plain rock only (never ore), never reaches layer 0,
//   and is sealed: rock on every side, never touching another space. A
//   cavern is empty. Each cell of a pocket holds the units in hazards.ts
//   (water 1, lava 1, gas 4). The full-size cube has 4,096 cells in the upper
//   band (layers 0-3), 8,192 in the middle band (4-11) and 20,480 in the deep
//   band (12-31); the counts in the comments
//   below are for that cube.
//
// A lava pocket of more than `HAZARDS.lava.sourcePocketCellsOver` (8) cells
// keeps pouring once it is broken into (design doc 6.2), so `maxSize` 12
// against `minSize` 4 makes about four lava pockets in nine a source.
export const GENERATION: GenerationData = {
  bands: [
    {
      bandId: 'upper',
      rock: [
        { block: 'dirt', weightAtTop: 70, weightAtBottom: 10 },
        { block: 'stone', weightAtTop: 30, weightAtBottom: 90 },
      ],
      veins: [
        // About 2.4% of the band.
        { block: 'coalSeam', veinsPer1000Cells: 4, minSize: 3, maxSize: 9 },
        // About 2.1% of the band, in more and smaller groups than coal.
        { block: 'timberRoot', veinsPer1000Cells: 6, minSize: 2, maxSize: 5 },
      ],
      spaces: [
        // "Small caverns": 6 of them, about 0.5% of the band.
        { kind: 'cavern', spacesPer1000Cells: 1.5, minSize: 2, maxSize: 5 },
      ],
    },
    {
      bandId: 'middle',
      rock: [
        { block: 'stone', weightAtTop: 80, weightAtBottom: 30 },
        { block: 'hardRock', weightAtTop: 20, weightAtBottom: 70 },
      ],
      veins: [
        // About 7% of the band: three times the first default (owner, issue
        // #108: candidate C of the depth survey).
        { block: 'ironOre', veinsPer1000Cells: 12, minSize: 3, maxSize: 9 },
        // About 5.4% of the band: three times the first default, as iron.
        { block: 'copperOre', veinsPer1000Cells: 9, minSize: 4, maxSize: 8 },
      ],
      spaces: [
        // 39 water pockets of 3 to 10 units each: six times the first default
        // (owner, issue #108: candidate C of the depth survey).
        { kind: 'water', spacesPer1000Cells: 4.8, minSize: 3, maxSize: 10 },
        // 29 gas pockets of 8 to 24 units each (4 units a cell): six times
        // the first default, as water.
        { kind: 'gas', spacesPer1000Cells: 3.6, minSize: 2, maxSize: 6 },
        // 5 caverns.
        { kind: 'cavern', spacesPer1000Cells: 0.6, minSize: 4, maxSize: 12 },
      ],
    },
    {
      bandId: 'deep',
      rock: [
        { block: 'stone', weightAtTop: 20, weightAtBottom: 5 },
        { block: 'hardRock', weightAtTop: 80, weightAtBottom: 95 },
      ],
      veins: [
        // About 1% of the band.
        { block: 'crystal', veinsPer1000Cells: 3, minSize: 2, maxSize: 5 },
        // About 0.45% of the band, in small groups. Listed last, so adding it
        // did not move any other ore for a given seed.
        { block: 'unstableOre', veinsPer1000Cells: 1.5, minSize: 2, maxSize: 4 },
      ],
      spaces: [
        // 16 lava pockets; those of 9 cells or more are sources.
        { kind: 'lava', spacesPer1000Cells: 0.8, minSize: 4, maxSize: 12 },
        // "Large caverns": 8 of them.
        { kind: 'cavern', spacesPer1000Cells: 0.4, minSize: 10, maxSize: 30 },
      ],
    },
  ],
  veinPlacementTries: 20,
  spacePlacementTries: 20,
};
