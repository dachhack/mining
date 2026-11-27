// A floor of apple trees (owner, after the 0.23.0 build: "Let's do a floor
// of 10"). Before, 10 tries each placed one only on a free, fertile square,
// so a world had 2 to 9.
import { describe, expect, it } from 'vitest';
import { FRONTIER_SURFACE } from '../../src/data/frontier';
import { createFrontier } from '../../src/engine';
import { APPLE_TREE } from '../../src/engine/frontier/state';

describe('apple trees at the start', () => {
  it('every world has FRONTIER_SURFACE.appleTrees of them, each full of apples, none on the first camp', () => {
    expect(FRONTIER_SURFACE.appleTrees).toBe(10);
    for (let seed = 1; seed <= 200; seed += 1) {
      const s = createFrontier(seed);
      const width = s.cube.size.x;
      const trees = s.features.flatMap((f, i) => (f === APPLE_TREE ? [i] : []));
      expect(trees.length, `seed ${seed}`).toBe(FRONTIER_SURFACE.appleTrees);
      for (const i of trees) {
        expect(s.apples[i], `seed ${seed}`).toBe(FRONTIER_SURFACE.applesPerTree);
        const x = i % width;
        const y = Math.floor(i / width);
        for (const c of s.camps) {
          expect(Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1, `seed ${seed}`).toBe(false);
        }
      }
    }
  });
});
