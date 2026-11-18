import type { GenerationData } from './types';

// Every number cube generation uses. All of it is [Default]: tune it here.
//
// Design doc 3.1 (depth bands) and 3.3 (veins), with the readings of decision
// note 0005 items 3 and 4:
// - Upper band: dirt and stone, with coal and timber-root.
// - Middle band: "hard stone" is read as a mix of stone and hard rock, with
//   more hard rock deeper; iron and copper ore.
// - Deep band: mostly hard rock; crystal.
// Not generated until later milestones: unstable ore, caverns, fluid and gas
// pockets (M2), relics and keystones (M4).
//
// How the numbers are used (src/engine/generation/cube.ts):
// - Rock. Each cell first becomes one of the band's `rock` blocks, picked by
//   weight. The weights slide evenly from `weightAtTop` in the band's first
//   layer to `weightAtBottom` in its last. Only the ratio matters; they are
//   written here as percentages.
// - Veins. For each ore the band gets `veinsPer1000Cells` veins for every
//   1000 cells in it (rounded, and never fewer than one). Each vein is a
//   6-connected group of `minSize` to `maxSize` blocks that stays inside its
//   band. So an ore fills about veinsPer1000Cells * average size / 10 percent
//   of its band: the figures in the comments below.
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
    },
    {
      bandId: 'middle',
      rock: [
        { block: 'stone', weightAtTop: 80, weightAtBottom: 30 },
        { block: 'hardRock', weightAtTop: 20, weightAtBottom: 70 },
      ],
      veins: [
        // About 2.4% of the band.
        { block: 'ironOre', veinsPer1000Cells: 4, minSize: 3, maxSize: 9 },
        // About 1.8% of the band.
        { block: 'copperOre', veinsPer1000Cells: 3, minSize: 4, maxSize: 8 },
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
      ],
    },
  ],
  veinPlacementTries: 20,
};
