// Plans A1 to A4: Lab 2's world is the engine's. A new Lab 2 world, turned
// back into the engine's state, is exactly `createFrontier` on that seed, so
// what Lab 2 shows is what the engine plays.
import { describe, expect, it } from 'vitest';
import { createFrontier, hashFrontier } from '../../src/engine';
import { newCampWorld, toFrontier } from '../../src/app/lab/campWorld';

describe('Lab 2 is the engine’s world (plans A1 to A4)', () => {
  it('a new Lab 2 world is createFrontier’s, on 50 seeds', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      expect(hashFrontier(toFrontier(newCampWorld(seed))), `seed ${seed}`).toBe(
        hashFrontier(createFrontier(seed)),
      );
    }
  }, 60_000); // 50 seeds, each generated twice over
});
