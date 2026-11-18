import type { GenerationData, VeinDef } from './types';

// Every number cube generation uses. All of it is [Default]: tune it here.
//
// Design doc 3.1 (depth bands) and 3.3 (veins), with the readings of decision
// note 0005 items 3 and 4:
// - Upper band: dirt and stone, with coal and timber-root.
// - Middle band: "hard stone" is read as a mix of stone and hard rock, with
//   more hard rock deeper; iron and copper ore.
// - Deep band: mostly hard rock; crystal.
// Caverns, pockets and unstable ore (M2) are in FEATURE_GENERATION, further
// down this file. Not generated until M4: relics and keystones.
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

// ---------------------------------------------------------------------------
// Caverns, pockets and unstable ore (M2-2, issue #52)
// ---------------------------------------------------------------------------
//
// Design doc 3.1 ("hazards introduced") and 3.3, decision note 0014 item 19,
// decision note 0017. Used by src/engine/generation/features.ts, which runs
// after the rock and the veins above are in place.
//
// The types are here, beside the numbers, and not in types.ts, because
// decision note 0015 gives the generation task this file only.

/**
 * The kinds of generated feature. Each is a connected group of open cells:
 * - cavern: empty;
 * - waterPocket: every cell holds water;
 * - gasPocket: every cell holds gas (`HAZARDS.gas.pocketUnitsPerCell` units);
 * - lavaPocket: every cell holds lava; a pocket of more than
 *   `HAZARDS.lava.sourcePocketCellsOver` cells is made of sources.
 */
export type FeatureKind = 'cavern' | 'waterPocket' | 'gasPocket' | 'lavaPocket';

/** One kind of feature in one depth band, and how many and how large. */
export interface FeatureDef {
  kind: FeatureKind;
  /** How many to place for each 1000 cells of the band (rounded; may come to none in a tiny cube). */
  per1000Cells: number;
  /** The fewest cells in one feature. A feature that cannot reach it is not placed. */
  minSize: number;
  /** The most cells in one feature. */
  maxSize: number;
}

/** The features of one depth band. */
export interface BandFeaturesDef {
  /** The id of a depth band in `WORLD.depthBands`. */
  bandId: string;
  /** Unstable ore, in veins like any other ore (`block` is 'unstableOre'). Placed first. */
  unstableOre: VeinDef[];
  /** Placed in this order, after the unstable ore. */
  features: FeatureDef[];
}

export interface FeatureGenerationData {
  bands: BandFeaturesDef[];
  /**
   * How many starting cells to try for one feature before giving up on it. A
   * start fails when the feature cannot reach its smallest size there without
   * leaving a block unsupported, a span too wide or a shaft too long.
   */
  featurePlacementTries: number;
  /**
   * Block ids: the plain rock a feature or unstable ore may take the place
   * of. Ore is never removed, so a vein beside a cavern shows in its wall.
   */
  replaceableBlocks: string[];
  /**
   * The widest straight run of open or gas-filled cells allowed under a roof
   * (0014 item 19: "stone 5 cells, hard rock 7, none under dirt"). The run's
   * limit is that of its weakest roof block. `byRoofBlock` is keyed by block
   * id; any other block has the limit `otherwise`.
   */
  openSpanLimit: {
    byRoofBlock: Record<string, number>;
    otherwise: number;
  };
}

// All [Default]. Which band gets which feature is design doc 3.1, read as
// "in the band the table names it for" (decision note 0017). The sizes and
// densities are assumed; the survey in 0017 says what they come to.
export const FEATURE_GENERATION: FeatureGenerationData = {
  bands: [
    {
      bandId: 'upper',
      unstableOre: [],
      features: [
        // "Small voids": about 8 in the band.
        { kind: 'cavern', per1000Cells: 1, minSize: 2, maxSize: 5 },
      ],
    },
    {
      bandId: 'middle',
      unstableOre: [],
      features: [
        // "Caverns": about 6 in the band.
        { kind: 'cavern', per1000Cells: 0.5, minSize: 8, maxSize: 20 },
        // About 7 of each pocket in the band.
        { kind: 'waterPocket', per1000Cells: 0.6, minSize: 4, maxSize: 12 },
        { kind: 'gasPocket', per1000Cells: 0.6, minSize: 3, maxSize: 8 },
      ],
    },
    {
      bandId: 'deep',
      // About 37 veins, 0.6% of the band.
      unstableOre: [{ block: 'unstableOre', veinsPer1000Cells: 3, minSize: 1, maxSize: 3 }],
      features: [
        // "Large caverns": about 5 in the band.
        { kind: 'cavern', per1000Cells: 0.4, minSize: 20, maxSize: 48 },
        // About 7 in the band. Those of more than 8 cells are sources
        // (HAZARDS.lava.sourcePocketCellsOver): about half of them.
        { kind: 'lavaPocket', per1000Cells: 0.6, minSize: 4, maxSize: 14 },
      ],
    },
  ],
  featurePlacementTries: 30,
  replaceableBlocks: ['dirt', 'stone', 'hardRock'],
  openSpanLimit: {
    byRoofBlock: { dirt: 0, hardRock: 7 },
    otherwise: 5,
  },
};

/**
 * Check FEATURE_GENERATION-shaped data. Returns a list of problems, empty if
 * there are none, like `validateData` in validate.ts. It is separate from
 * that function only because validate.ts is not one of this task's files
 * (decision note 0015); `tests/engine/featureData.test.ts` runs it.
 *
 * `bandIds` are the ids of the world's depth bands, and `blocks` the block table.
 */
export function validateFeatureGeneration(
  data: FeatureGenerationData,
  bandIds: string[],
  blocks: Record<string, { solid: boolean; mineCost: number | null }>,
): string[] {
  const problems: string[] = [];
  function isWholeAtLeast(value: number, least: number): boolean {
    return Number.isInteger(value) && value >= least;
  }
  function isDiggable(blockId: string): boolean {
    const block = Object.hasOwn(blocks, blockId) ? blocks[blockId] : undefined;
    return block !== undefined && block.solid && block.mineCost !== null;
  }

  if (!isWholeAtLeast(data.featurePlacementTries, 1)) {
    problems.push('featurePlacementTries must be a whole number of at least 1');
  }
  if (data.replaceableBlocks.length === 0) {
    problems.push('replaceableBlocks must list at least one block');
  }
  for (const blockId of data.replaceableBlocks) {
    if (!isDiggable(blockId)) {
      problems.push(`replaceableBlocks names "${blockId}", which is not a solid, mineable block`);
    }
  }
  for (const limit of [data.openSpanLimit.otherwise, ...Object.values(data.openSpanLimit.byRoofBlock)]) {
    if (!isWholeAtLeast(limit, 0)) {
      problems.push(`openSpanLimit: every limit must be a whole number of at least 0, but one is ${limit}`);
    }
  }
  for (const blockId of Object.keys(data.openSpanLimit.byRoofBlock)) {
    if (!Object.hasOwn(blocks, blockId)) {
      problems.push(`openSpanLimit names an unknown block "${blockId}"`);
    }
  }

  const seenBands = new Set<string>();
  for (const band of data.bands) {
    const where = `features for band "${band.bandId}"`;
    if (!bandIds.includes(band.bandId)) {
      problems.push(`${where}: there is no depth band with that id`);
    }
    if (seenBands.has(band.bandId)) {
      problems.push(`${where}: the band is listed more than once`);
    }
    seenBands.add(band.bandId);
    const sized: { what: string; density: number; minSize: number; maxSize: number }[] = [];
    for (const vein of band.unstableOre) {
      if (!isDiggable(vein.block)) {
        problems.push(`${where}: unstable ore names "${vein.block}", which is not a solid, mineable block`);
      }
      sized.push({
        what: `vein of "${vein.block}"`,
        density: vein.veinsPer1000Cells,
        minSize: vein.minSize,
        maxSize: vein.maxSize,
      });
    }
    for (const feature of band.features) {
      sized.push({
        what: feature.kind,
        density: feature.per1000Cells,
        minSize: feature.minSize,
        maxSize: feature.maxSize,
      });
    }
    for (const entry of sized) {
      // `!(x > 0)` rather than `x <= 0`, so that NaN is caught as well.
      if (!Number.isFinite(entry.density) || !(entry.density > 0)) {
        problems.push(`${where}: ${entry.what}: the density must be more than 0`);
      }
      if (!isWholeAtLeast(entry.minSize, 1) || !isWholeAtLeast(entry.maxSize, entry.minSize)) {
        problems.push(`${where}: ${entry.what}: sizes must be whole, minSize at least 1 and maxSize at least minSize`);
      }
    }
  }
  return problems;
}
