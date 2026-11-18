// Which depth band each layer of a cube belongs to.
//
// The depth bands in the data (design doc 3.1) are written for the full-size
// cube: layers 0-7, 8-19 and 20-31 of 32. A cube with a different number of
// layers (the small cubes tests use) gets the same bands in the same
// proportions: layer `z` of a cube `depth` layers deep is treated like layer
// `floor(z * 32 / depth)` of the full-size cube. For the full-size cube that
// is the layer itself, so the bands are exactly the ones in the data.

import { WORLD } from '../../data';

/** The layers of one cube that belong to one depth band. */
export interface BandLayers {
  /** The band's id in `WORLD.depthBands`. */
  bandId: string;
  /** The band's layers (`z` values), top first. Empty if the cube is too shallow to have any. */
  layers: number[];
}

/**
 * The depth bands of a cube `depth` layers deep, top band first. Every layer
 * from 0 to `depth - 1` is in exactly one band.
 */
export function bandLayersForDepth(depth: number): BandLayers[] {
  const result: BandLayers[] = [];
  for (const band of WORLD.depthBands) {
    result.push({ bandId: band.id, layers: [] });
  }
  for (let z = 0; z < depth; z += 1) {
    const fullSizeLayer = Math.floor((z * WORLD.size.z) / depth);
    const bandIndex = WORLD.depthBands.findIndex(
      (band) => fullSizeLayer >= band.firstLayer && fullSizeLayer <= band.lastLayer,
    );
    const entry = result[bandIndex];
    if (entry === undefined) {
      // The data validator checks that the bands cover every layer.
      throw new Error(`No depth band covers layer ${fullSizeLayer}`);
    }
    entry.layers.push(z);
  }
  return result;
}
