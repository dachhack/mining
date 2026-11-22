// Plan A1: the engine's new world (createFrontier) is the world Lab 2 opens
// (newCampWorld) on the same seed, so moving the rules into the engine
// changes nothing the owner has played.
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import { createFrontier } from '../../src/engine';
import { newCampWorld } from '../../src/app/lab/campWorld';

describe('the engine world matches Lab 2 (plan A1)', () => {
  it('has the same surface, animals, camp, sight and clay on 50 seeds', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const engine = createFrontier(seed);
      const lab = newCampWorld(seed);
      expect(engine.features, `seed ${seed}`).toEqual(lab.surface.features);
      expect(engine.apples, `seed ${seed}`).toEqual(lab.surface.apples);
      expect(engine.animals, `seed ${seed}`).toEqual(
        lab.surface.animals.map((a) => ({ id: a.id, x: a.x, y: a.y })),
      );
      expect(engine.nextAnimalId).toBe(lab.surface.nextAnimalId);
      expect(engine.rng.s).toBe(lab.surface.rng);
      expect(engine.camps).toEqual(
        lab.camps.map((c) => ({ id: c.id, x: c.x, y: c.y, level: c.level })),
      );
      expect(engine.nextCampId).toBe(lab.nextCampId);
      expect(engine.seen).toEqual(lab.seen);
      // Every cell: clay in the engine exactly where Lab 2 paints clay, and
      // otherwise the same block as Lab 2's cube.
      const labBlocks = lab.lab.state.blocks;
      let different = 0;
      for (let i = 0; i < labBlocks.length; i += 1) {
        const want = lab.surface.clay.has(i) ? BLOCKS.clay.code : labBlocks[i];
        if (engine.cube.blocks[i] !== want) different += 1;
      }
      expect(different, `seed ${seed}: cells that differ`).toBe(0);
    }
  }, 60_000); // 50 seeds, each generated twice over (Lab 2 and the engine)
});
