import type { WorldData } from './types';

// Design doc 3 (cube), 3.1 (depth bands) and decision note 0005 items 1-2.
export const WORLD: WorldData = {
  size: { x: 32, y: 32, z: 32 },
  surfaceZ: -1,
  startPosition: { x: 16, y: 16, z: -1 },
  depthBands: [
    { id: 'upper', firstLayer: 0, lastLayer: 7 },
    { id: 'middle', firstLayer: 8, lastLayer: 19 },
    { id: 'deep', firstLayer: 20, lastLayer: 31 },
  ],
};
