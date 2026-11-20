import type { WorldData } from './types';

// Design doc 3 (cube), 3.3 (depth bands) and decision note 0005 items 1-2.
// The bands were brought shallower after the depth survey (owner, issue #108,
// candidate C; decision note 0039): the middle band began at layer 8 and the
// deep band at 20, and no run reached either.
export const WORLD: WorldData = {
  size: { x: 32, y: 32, z: 32 },
  surfaceZ: -1,
  depthBands: [
    { id: 'upper', firstLayer: 0, lastLayer: 3 },
    { id: 'middle', firstLayer: 4, lastLayer: 11 },
    { id: 'deep', firstLayer: 12, lastLayer: 31 },
  ],
};
