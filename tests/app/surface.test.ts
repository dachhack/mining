// UI lab 2 (issue #121): the surface (grass, trees, apple trees), roaming
// animals, clay, and the new costs, without a browser.
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import type { ItemStack } from '../../src/data';
import { LAB_CAMP_LEVELS, LAB_NEW_CAMP_COST, LAB_SURFACE } from '../../src/data/labCamps';
import { depthAt, hashState } from '../../src/engine';
import {
  advanceWorld,
  bareSurface,
  campRadius,
  campTap,
  campWorldFromState,
  canAfford,
  footprintOf,
  newCampWorld,
  newlyCovered,
  placeCamp,
  placeRefusal,
  sightMap,
  upgradeCamp,
  upgradeCostFrom,
  upgradeRefusal,
} from '../../src/app/lab/campWorld';
import type { CampWorld } from '../../src/app/lab/campWorld';
import {
  APPLE_TREE,
  GRASS,
  TREE,
  advanceSurface,
  cellIndex,
  generateSurface,
} from '../../src/app/lab/surface';
import type { Feature, Surface } from '../../src/app/lab/surface';
import { buildState } from '../engine/helpers';

const SIDE = 15;
const MID = 7;

/** A SIDE x SIDE cube, 3 layers: dirt over stone over stone. */
function cube() {
  const rows = (char: string) => new Array<string>(SIDE).fill(char.repeat(SIDE));
  return buildState({ layers: [rows('d'), rows('#'), rows('#')] });
}

/** A world on `cube()` with its camp in the middle and a surface made by `edit`. */
function world(
  edit: (surface: Surface, state: ReturnType<typeof cube>) => Surface = (s) => s,
): CampWorld {
  const state = cube();
  return campWorldFromState(1, state, MID, MID, edit(bareSurface(state), state));
}

/** `surface` with `feature` on square (x, y) (and a full apple tree's apples). */
function withFeature(surface: Surface, x: number, y: number, feature: Feature): Surface {
  const features = [...surface.features];
  const apples = [...surface.apples];
  features[x + SIDE * y] = feature;
  apples[x + SIDE * y] = feature === APPLE_TREE ? LAB_SURFACE.applesPerTree : 0;
  return { ...surface, features, apples };
}

/** `w` holding `counts` instead of what it held. */
function holding(w: CampWorld, counts: Record<string, number>): CampWorld {
  return { ...w, lab: { ...w.lab, counts: new Map(Object.entries(counts)) } };
}

const AT = { x: MID + 2, y: MID }; // a lit square just outside the camp's 3 x 3

describe('the surface', () => {
  it('a tap cuts grass for 1 grass; the next tap mines the block under it', () => {
    let w = world((s) => withFeature(s, AT.x, AT.y, GRASS));
    const cut = campTap(w, AT.x, AT.y);
    expect(cut.kind).toBe('harvested');
    expect(cut.harvest?.kind).toBe('grass');
    expect(cut.world.lab.counts.get('grass')).toBe(LAB_SURFACE.grassPerTuft);
    expect(depthAt(cut.world.lab.state, AT.x, AT.y)).toBe(0); // only the grass went
    w = cut.world;
    const mine = campTap(w, AT.x, AT.y);
    expect(mine.kind).toBe('mined');
    expect(depthAt(mine.world.lab.state, AT.x, AT.y)).toBe(1);
  });

  it('a tap fells a tree for 2 wood, and only then can the ground be dug', () => {
    const w = world((s) => withFeature(s, AT.x, AT.y, TREE));
    const before = hashState(w.lab.state);
    const fell = campTap(w, AT.x, AT.y);
    expect(fell.kind).toBe('harvested');
    expect(fell.harvest?.kind).toBe('felled');
    expect(fell.world.lab.counts.get('wood')).toBe(LAB_SURFACE.woodPerTree);
    expect(hashState(fell.world.lab.state)).toBe(before); // the cube is untouched
    expect(campTap(fell.world, AT.x, AT.y).kind).toBe('mined');
  });

  it('an apple tree gives its apples one a tap, regrows them, and is felled once empty', () => {
    let w = world((s) => withFeature(s, AT.x, AT.y, APPLE_TREE));
    for (let i = 0; i < LAB_SURFACE.applesPerTree; i += 1) {
      const pick = campTap(w, AT.x, AT.y);
      expect(pick.harvest?.kind).toBe('apple');
      w = pick.world;
    }
    expect(w.lab.counts.get('apple')).toBe(LAB_SURFACE.applesPerTree);
    expect(w.surface.apples[AT.x + SIDE * AT.y]).toBe(0);
    // Just before the regrowth time it is still bare; at it, it is full again.
    const almost = advanceWorld(w, LAB_SURFACE.appleRegrowMs - 1);
    expect(almost.surface.apples[AT.x + SIDE * AT.y]).toBe(0);
    const regrown = advanceWorld(w, LAB_SURFACE.appleRegrowMs);
    expect(regrown.surface.apples[AT.x + SIDE * AT.y]).toBe(LAB_SURFACE.applesPerTree);
    // While empty, a tap fells it for wood.
    const fell = campTap(w, AT.x, AT.y);
    expect(fell.harvest?.kind).toBe('felled');
    expect(fell.world.lab.counts.get('wood')).toBe(LAB_SURFACE.woodPerTree);
    expect(fell.world.surface.features[AT.x + SIDE * AT.y]).toBe(0);
  });

  it('features obey the fog: nothing outside a ring can be taken', () => {
    const fog = { x: 0, y: 0 };
    const w = world((s) => withFeature(s, fog.x, fog.y, TREE));
    const tap = campTap(w, fog.x, fog.y);
    expect(tap.kind).toBe('fog');
    expect(tap.world).toBe(w);
  });

  it('a new camp is built over whatever grows on its 3 x 3, which gives nothing', () => {
    const at = { x: MID + campRadius(1) - 1, y: MID };
    let w = world((s) => withFeature(s, at.x, at.y, TREE));
    w = holding(w, { wood: 99, grass: 99 });
    const placed = placeCamp(w, at.x, at.y);
    expect(placed.camps).toHaveLength(2);
    expect(placed.surface.features[at.x + SIDE * at.y]).toBe(0);
    expect(placed.lab.counts.get('wood')).toBe(99 - 5);
  });
});

describe('clay', () => {
  it('a clay cell gives clay, not what the game block under it gives', () => {
    const P = { x: MID + 3, y: MID }; // two squares clear of the camp, so all four neighbours can be dug
    const w = world((s, state) => ({
      ...s,
      clay: new Set([cellIndex(state, P.x, P.y, 0), cellIndex(state, P.x, P.y, 1)]),
    }));
    // Layer 0 is dirt in the cube (it gives nothing in the game); here it is clay.
    const first = campTap(w, P.x, P.y);
    expect(first.kind).toBe('mined');
    expect(first.tap?.result.yields).toEqual([{ item: 'clay', count: LAB_SURFACE.clayPerBlock }]);
    expect(first.world.lab.counts.get('clay')).toBe(LAB_SURFACE.clayPerBlock);
    // Layer 1 is stone in the cube; here it is clay too, and gives no stone.
    let next = first.world;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      next = campTap(next, P.x + dx, P.y + dy).world;
    }
    const second = campTap(next, P.x, P.y);
    expect(second.kind).toBe('mined');
    expect(second.world.lab.counts.get('clay')).toBe(2 * LAB_SURFACE.clayPerBlock);
    expect(second.world.lab.counts.get('stone') ?? 0).toBe(0);
  });

  it('generation puts clay only in the layers just under the surface, only in dirt or stone', () => {
    const w = newCampWorld(110);
    const state = w.lab.state;
    expect(w.surface.clay.size).toBeGreaterThan(0);
    for (const index of w.surface.clay) {
      const z = Math.floor(index / (state.size.x * state.size.y));
      expect(z).toBeGreaterThanOrEqual(LAB_SURFACE.clayFirstLayer);
      expect(z).toBeLessThanOrEqual(LAB_SURFACE.clayLastLayer);
    }
  });
});

describe('roaming animals', () => {
  it('move the same way for a seed, however often the clock is read', () => {
    const start = newCampWorld(110);
    // One jump to 30 s, against many small steps to the same time.
    const once = advanceWorld(start, 30_000);
    let often = start;
    for (let t = 0; t <= 30_000; t += 250) {
      often = advanceWorld(often, t);
    }
    expect(often.surface.animals).toEqual(once.surface.animals);
    expect(once.surface.animals.map((a) => [a.x, a.y])).not.toEqual(
      start.surface.animals.map((a) => [a.x, a.y]),
    );
    // And a world made again from the seed does the same.
    expect(advanceWorld(newCampWorld(110), 30_000).surface.animals).toEqual(once.surface.animals);
  });

  it('never step into a pit or onto a tree, and never share a square', () => {
    // A world whose middle row is dug 1 down, with a tree; one animal starts beside them.
    const state = cube();
    let w = campWorldFromState(1, state, MID, 2, {
      ...withFeature(bareSurface(state), 4, 9, TREE),
      animals: [
        { id: 1, x: 3, y: 9, nextStepAt: 2_000 },
        { id: 2, x: 5, y: 10, nextStepAt: 2_000 },
      ],
      nextAnimalId: 3,
      rng: 12345,
    });
    // Dig a pit at (3, 10) and (2, 9): taps need a lit square, so light the whole map first.
    w = { ...w, camps: [{ id: 1, x: MID, y: MID, level: 3 }] };
    for (const [x, y] of [
      [3, 10],
      [2, 9],
    ] as const) {
      w = campTap(w, x, y).world;
    }
    for (let t = 0; t <= 600_000; t += 7_000) {
      w = advanceWorld(w, t);
      for (const a of w.surface.animals) {
        expect(depthAt(w.lab.state, a.x, a.y), `animal ${a.id} at ${a.x},${a.y}`).toBe(0);
        expect(w.surface.features[a.x + SIDE * a.y]).not.toBe(TREE);
      }
      const squares = new Set(w.surface.animals.map((a) => `${a.x},${a.y}`));
      expect(squares.size).toBe(w.surface.animals.length);
    }
  });

  it('are caught with a tap inside a ring, and new ones walk in at the edge', () => {
    const state = cube();
    const animal = { id: 1, x: AT.x, y: AT.y, nextStepAt: 1_000_000 };
    const w = campWorldFromState(1, state, MID, MID, {
      ...bareSurface(state),
      animals: [animal],
      nextAnimalId: 2,
      nextSpawnAt: LAB_SURFACE.animalRespawnMs,
    });
    const caught = campTap(w, AT.x, AT.y);
    expect(caught.kind).toBe('harvested');
    expect(caught.harvest?.kind).toBe('caught');
    expect(caught.world.lab.counts.get('animal')).toBe(1);
    expect(caught.world.surface.animals).toEqual([]);
    expect(depthAt(caught.world.lab.state, AT.x, AT.y)).toBe(0); // the ground is untouched
    // A minute later, a new animal has walked in at the edge of the map.
    const later = advanceSurface(caught.world.surface, state, LAB_SURFACE.animalRespawnMs);
    expect(later.animals).toHaveLength(1);
    const [fresh] = later.animals;
    const onEdge =
      fresh !== undefined &&
      (fresh.x === 0 || fresh.y === 0 || fresh.x === SIDE - 1 || fresh.y === SIDE - 1);
    expect(onEdge).toBe(true);
  });

  it('an animal in the fog cannot be caught', () => {
    const state = cube();
    const w = campWorldFromState(1, state, MID, MID, {
      ...bareSurface(state),
      animals: [{ id: 1, x: 0, y: 0, nextStepAt: 1_000_000 }],
    });
    expect(campTap(w, 0, 0).kind).toBe('fog');
  });

  it('generation scatters the starting animals on open ground, off the first camp', () => {
    const w = newCampWorld(7);
    expect(w.surface.animals).toHaveLength(LAB_SURFACE.animals);
    const camp = w.camps[0] ?? { x: -9, y: -9 };
    for (const a of w.surface.animals) {
      expect(w.surface.features[a.x + w.lab.state.size.x * a.y]).not.toBe(TREE);
      expect(Math.abs(a.x - camp.x) <= 1 && Math.abs(a.y - camp.y) <= 1).toBe(false);
    }
  });
});

describe('the new costs (issue #121)', () => {
  it('a new camp costs wood and grass; level 2 clay, stone and an animal; level 3 adds apples', () => {
    const items = (cost: ItemStack[]) => cost.map((s) => s.item).sort();
    expect(items(LAB_NEW_CAMP_COST)).toEqual(['grass', 'wood']);
    expect(items(upgradeCostFrom(1) ?? [])).toEqual(['animal', 'clay', 'stone']);
    expect(items(upgradeCostFrom(2) ?? [])).toEqual(['animal', 'apple', 'clay', 'stone']);
  });

  it('stone alone no longer pays for a camp or an upgrade', () => {
    const w = holding(world(), { stone: 999 });
    expect(placeRefusal(w, MID + campRadius(1) - 1, MID)).toBe('cost');
    expect(upgradeRefusal(w, 1)).toBe('cost');
    const paid = holding(world(), { clay: 10, stone: 15, animal: 1 });
    expect(upgradeRefusal(paid, 1)).toBeNull();
    expect(upgradeCamp(paid, 1).lab.counts.size).toBe(0);
  });
});

/**
 * Take everything the camps of `start` let a player take: cut, pick, fell,
 * catch and mine every lit square until no tap does anything more. Squares
 * in `keep` (the next camp's patch) are only harvested, never dug, so the
 * patch stays level.
 */
function takeEverything(start: CampWorld, keep: { x: number; y: number }[] = []): CampWorld {
  let w = start;
  const width = w.lab.depths.width;
  let changed = true;
  while (changed) {
    changed = false;
    const lit: number[] = [];
    sightMap(w).forEach((sight, i) => {
      if (sight === 'shown') lit.push(i);
    });
    for (const i of lit) {
      const x = i % width;
      const y = Math.floor(i / width);
      const kept = keep.some((k) => k.x === x && k.y === y);
      const tap = campTap(w, x, y);
      if ((tap.kind === 'mined' && !kept) || tap.kind === 'harvested') {
        w = tap.world;
        changed = true;
      }
    }
  }
  return w;
}

describe('the starting ring pays for the next steps (issue #121), in 200 seeds', () => {
  // 200 generated worlds take a while, so these tests have a longer time limit.
  it('the first ring alone holds the wood and grass for a second camp', () => {
    const short: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const w = takeEverything(newCampWorld(seed));
      if (!canAfford(w.lab.counts, LAB_NEW_CAMP_COST)) {
        short.push(`seed ${seed}: ${JSON.stringify([...w.lab.counts])}`);
      }
    }
    expect(short).toEqual([]);
  }, 120_000);

  it('the first ring and one more camp hold the clay and stone for level 2, and an animal comes by', () => {
    const level2 = upgradeCostFrom(1) ?? [];
    const clayAndStone = level2.filter((s) => s.item !== 'animal');
    const short: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const start = newCampWorld(seed);
      // An animal walks onto lit ground within 10 minutes of lab time.
      let w = start;
      let seen = false;
      for (let t = 0; t <= 600_000 && !seen; t += 2_000) {
        w = advanceWorld(w, t);
        const sights = sightMap(w);
        seen = w.surface.animals.some((a) => sights[a.x + w.lab.state.size.x * a.y] === 'shown');
      }
      // The second camp goes where it lights the most new squares; its patch is kept level.
      let best: { x: number; y: number; fresh: number } | null = null;
      for (let y = 0; y < start.lab.state.size.y; y += 1) {
        for (let x = 0; x < start.lab.state.size.x; x += 1) {
          const refusal = placeRefusal(start, x, y);
          if (refusal === null || refusal === 'cost') {
            const fresh = newlyCovered(start, x, y).length;
            if (best === null || fresh > best.fresh) best = { x, y, fresh };
          }
        }
      }
      const keep = best === null ? [] : footprintOf(best.x, best.y);
      let taken = takeEverything(start, keep);
      if (best !== null) {
        taken = takeEverything(placeCamp(taken, best.x, best.y));
      }
      if (!seen || taken.camps.length < 2 || !canAfford(taken.lab.counts, clayAndStone)) {
        short.push(
          `seed ${seed}: animal ${seen}, camps ${taken.camps.length}, ${JSON.stringify([...taken.lab.counts])}`,
        );
      }
    }
    expect(short).toEqual([]);
  }, 240_000);
});

describe('the lab data', () => {
  it('keeps clay out of the game: no block called clay, and level 1 can mine what clay replaces', () => {
    expect(Object.keys(BLOCKS)).not.toContain('clay');
    expect(LAB_CAMP_LEVELS[0]?.addsBlocks).toEqual(expect.arrayContaining(['dirt', 'stone']));
  });

  it('generates the same surface for a seed', () => {
    const a = newCampWorld(42);
    const b = newCampWorld(42);
    expect(a.surface.features).toEqual(b.surface.features);
    expect([...a.surface.clay]).toEqual([...b.surface.clay]);
    expect(a.surface.animals).toEqual(b.surface.animals);
    const state = a.lab.state;
    expect(generateSurface(state, 42).features.length).toBe(state.size.x * state.size.y);
  });
});
