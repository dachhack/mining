// The new game's world, generated in the engine (plan A1,
// docs/plans/lab2-becomes-the-game.md).
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_SURFACE,
} from '../../src/data/frontier';
import { ENGINE_VERSION, blockAt, createFrontier, hashState } from '../../src/engine';
import { inCircle } from '../../src/engine/frontier/camps';
import { APPLE_TREE, GRASS, NO_FEATURE, TREE } from '../../src/engine/frontier/state';
import type { FrontierState } from '../../src/engine/frontier/state';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

/** The cube's code at (x, y, z). */
function code(world: FrontierState, x: number, y: number, z: number): number {
  return blockAt(world.cube, { x, y, z });
}

describe('the frontier world (plan A1)', () => {
  it('is version 0.22.0 of the engine: a long press digs the 3 x 3 for anyone', () => {
    expect(ENGINE_VERSION).toBe('0.27.0');
  });

  it('is the same world every time for the same seed', () => {
    for (const seed of [1, 7, 42]) {
      const a = createFrontier(seed);
      const b = createFrontier(seed);
      expect(hashState(a.cube)).toBe(hashState(b.cube));
      expect(a.features).toEqual(b.features);
      expect(a.apples).toEqual(b.apples);
      expect(a.animals).toEqual(b.animals);
      expect(a.camps).toEqual(b.camps);
      expect(a.rng).toEqual(b.rng);
    }
  });

  it('differs between seeds', () => {
    expect(createFrontier(1).features).not.toEqual(createFrontier(2).features);
  });

  it('has no timber-root anywhere', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const world = createFrontier(seed);
      expect(world.cube.blocks.includes(BLOCKS.timberRoot.code)).toBe(false);
    }
  });

  it('grows plants only on dirt, and puts the right apples on apple trees', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const world = createFrontier(seed);
      const width = world.cube.size.x;
      world.features.forEach((feature, i) => {
        const x = i % width;
        const y = Math.floor(i / width);
        if (feature !== NO_FEATURE) {
          expect(code(world, x, y, 0)).toBe(BLOCKS.dirt.code);
        }
        expect(world.apples[i]).toBe(feature === APPLE_TREE ? FRONTIER_SURFACE.applesPerTree : 0);
      });
    }
  });

  it('puts clay only in the layers just under the ground, and some in every world', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const world = createFrontier(seed);
      const { x: X, y: Y, z: Z } = world.cube.size;
      let count = 0;
      for (let z = 0; z < Z; z += 1) {
        for (let y = 0; y < Y; y += 1) {
          for (let x = 0; x < X; x += 1) {
            if (code(world, x, y, z) === BLOCKS.clay.code) {
              count += 1;
              expect(z).toBeGreaterThanOrEqual(FRONTIER_SURFACE.clayFirstLayer);
              expect(z).toBeLessThanOrEqual(FRONTIER_SURFACE.clayLastLayer);
            }
          }
        }
      }
      expect(count).toBeGreaterThan(0);
    }
  });

  it('starts with one free level-1 camp on a clear 3 x 3, and lights its circle', () => {
    const world = createFrontier(7);
    expect(world.camps).toHaveLength(1);
    expect(world.nextCampId).toBe(2);
    const camp = world.camps[0];
    if (camp === undefined) throw new Error('no camp');
    expect(camp.level).toBe(1);
    const width = world.cube.size.x;
    const radius = FRONTIER_CAMP_LEVELS[0]?.radius ?? 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        expect(world.features[camp.x + dx + width * (camp.y + dy)]).toBe(NO_FEATURE);
        expect(world.animals.some((a) => a.x === camp.x + dx && a.y === camp.y + dy)).toBe(false);
      }
    }
    world.seen.forEach((lit, i) => {
      expect(lit).toBe(inCircle(camp.x, camp.y, radius, i % width, Math.floor(i / width)));
    });
  });

  it('puts the animals on open ground, the first inside the camp’s ring', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const world = createFrontier(seed);
      const width = world.cube.size.x;
      const camp = world.camps[0];
      if (camp === undefined) throw new Error('no camp');
      expect(world.animals).toHaveLength(FRONTIER_SURFACE.animals);
      expect(world.nextAnimalId).toBe(world.animals.length + 1);
      for (const animal of world.animals) {
        const feature = world.features[animal.x + width * animal.y];
        expect(feature === TREE || feature === APPLE_TREE).toBe(false);
      }
      const first = world.animals[0];
      if (first === undefined) throw new Error('no animal');
      expect(inCircle(camp.x, camp.y, FRONTIER_CAMP_LEVELS[0]?.radius ?? 0, first.x, first.y)).toBe(
        true,
      );
    }
  });

  it('gives the first camp a ring that pays for the next camp, on 200 seeds', () => {
    for (const seed of SEEDS) {
      const world = createFrontier(seed);
      const width = world.cube.size.x;
      const camp = world.camps[0];
      if (camp === undefined) throw new Error('no camp');
      const radius = FRONTIER_CAMP_LEVELS[0]?.radius ?? 0;
      let wood = 0;
      let grass = 0;
      world.features.forEach((feature, i) => {
        const x = i % width;
        const y = Math.floor(i / width);
        if (!inCircle(camp.x, camp.y, radius, x, y)) return;
        if (feature === TREE || feature === APPLE_TREE) wood += FRONTIER_SURFACE.woodPerTree;
        if (feature === GRASS) grass += FRONTIER_SURFACE.grassPerTuft;
      });
      const got = new Map([
        ['wood', wood],
        ['grass', grass],
      ]);
      for (const stack of FRONTIER_NEW_CAMP_COST) {
        expect(got.get(stack.item) ?? 0, `seed ${seed}: ${stack.item}`).toBeGreaterThanOrEqual(
          stack.count,
        );
      }
    }
  }, 60_000); // 200 whole worlds: about 2 s alone, but over 5 s on CI with every suite running at once
});
