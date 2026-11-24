// UI lab 2 (issue #121): the surface (grass, trees, apple trees), roaming
// animals, clay, and the new costs, without a browser.
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import type { ItemStack } from '../../src/data';
import { FRONTIER_MARKET, FRONTIER_SHIFT } from '../../src/data/frontier';
import { LAB_CAMP_LEVELS, LAB_NEW_CAMP_COST, LAB_SURFACE } from '../../src/data/labCamps';
import { blockAt, depthAt, hashState } from '../../src/engine';
import { newLabWorld } from '../../src/app/lab/labWorld';
import {
  bareSurface,
  endShift,
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
import { APPLE_TREE, NO_FEATURE, GRASS, TREE, cellIndex } from '../../src/app/lab/surface';
import type { Feature, Surface } from '../../src/app/lab/surface';
import { buildState } from '../engine/helpers';

const SIDE = 25; // wide enough for a level-1 ring (radius 9) and a camp at its edge
const MID = Math.floor(SIDE / 2);

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

  it('an apple tree gives its apples one a tap, regrows them some shifts later, and is felled once empty', () => {
    let w = holding(
      world((s) => withFeature(s, AT.x, AT.y, APPLE_TREE)),
      { wood: 99 },
    );
    for (let i = 0; i < LAB_SURFACE.applesPerTree; i += 1) {
      const pick = campTap(w, AT.x, AT.y);
      expect(pick.harvest?.kind).toBe('apple');
      w = pick.world;
    }
    expect(w.lab.counts.get('apple')).toBe(LAB_SURFACE.applesPerTree);
    expect(w.surface.apples[AT.x + SIDE * AT.y]).toBe(0);
    // One shift before the regrowth it is still bare; at the end of that shift, it is full again.
    let later = w;
    for (let i = 1; i < FRONTIER_SHIFT.appleRegrowShifts; i += 1) later = endShift(later).world;
    expect(later.surface.apples[AT.x + SIDE * AT.y]).toBe(0);
    later = endShift(later).world;
    expect(later.surface.apples[AT.x + SIDE * AT.y]).toBe(LAB_SURFACE.applesPerTree);
    // While empty, a tap fells it for wood.
    const fell = campTap(w, AT.x, AT.y);
    expect(fell.harvest?.kind).toBe('felled');
    expect(fell.world.lab.counts.get('wood')).toBe(99 + LAB_SURFACE.woodPerTree);
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
    const woodCost = LAB_NEW_CAMP_COST.find((stack) => stack.item === 'wood')?.count ?? 0;
    expect(placed.lab.counts.get('wood')).toBe(99 - woodCost);
  });
});

describe('clay', () => {
  it('a clay block gives clay, in any layer (clay is a real block now, plan A3)', () => {
    const P = { x: MID + 3, y: MID }; // two squares clear of the camp, so all four neighbours can be dug
    const w = world();
    // The test cube is dirt on stone; make P clay in layers 0 and 1.
    w.lab.state.blocks[cellIndex(w.lab.state, P.x, P.y, 0)] = BLOCKS.clay.code;
    w.lab.state.blocks[cellIndex(w.lab.state, P.x, P.y, 1)] = BLOCKS.clay.code;
    const first = campTap(w, P.x, P.y);
    expect(first.kind).toBe('mined');
    expect(first.tap?.result.yields).toEqual([{ item: 'clay', count: LAB_SURFACE.clayPerBlock }]);
    expect(first.world.lab.counts.get('clay')).toBe(LAB_SURFACE.clayPerBlock);
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

  it('generation puts clay blocks only in the layers just under the surface', () => {
    const w = newCampWorld(110);
    const state = w.lab.state;
    const layer = state.size.x * state.size.y;
    let count = 0;
    state.blocks.forEach((code, index) => {
      if (code !== BLOCKS.clay.code) return;
      count += 1;
      const z = Math.floor(index / layer);
      expect(z).toBeGreaterThanOrEqual(LAB_SURFACE.clayFirstLayer);
      expect(z).toBeLessThanOrEqual(LAB_SURFACE.clayLastLayer);
    });
    expect(count).toBeGreaterThan(0);
  });
});

describe('roaming animals (they move at End shift, plan A4)', () => {
  it('stand still during a shift, then move the same way for a seed when it ends', () => {
    const start = holding(newCampWorld(110), { wood: 99, apple: 99 });
    // Taps do not move them.
    const tapped = campTap(start, (start.camps[0]?.x ?? 0) + 2, start.camps[0]?.y ?? 0).world;
    expect(tapped.surface.animals).toEqual(start.surface.animals);
    let a = start;
    let b = start;
    for (let i = 0; i < 5; i += 1) {
      a = endShift(a).world;
      b = endShift(b).world;
    }
    expect(a.surface.animals).toEqual(b.surface.animals);
    expect(a.surface.animals.map((x) => [x.x, x.y])).not.toEqual(
      start.surface.animals.map((x) => [x.x, x.y]),
    );
  });

  it('never step into a pit or onto a tree, and never share a square', () => {
    // A world whose middle row is dug 1 down, with a tree; two animals start beside them.
    const state = cube();
    let w = campWorldFromState(1, state, MID, 2, {
      ...withFeature(bareSurface(state), 4, 9, TREE),
      animals: [
        { id: 1, x: 3, y: 9 },
        { id: 2, x: 5, y: 10 },
      ],
      nextAnimalId: 3,
      rng: 12345,
    });
    // Dig a pit at (3, 10) and (2, 9): taps need a lit square, so light the whole map first.
    w = {
      ...w,
      camps: [
        {
          id: 1,
          x: MID,
          y: MID,
          level: 3,
          smelter: false,
          lantern: false,
          pen: false,
          penned: 0,
          breedIn: 0,
          deep: false,
          defense: 0,
        },
      ],
    };
    for (const [x, y] of [
      [3, 10],
      [2, 9],
    ] as const) {
      w = campTap(w, x, y).world;
    }
    w = holding(w, { wood: 999, apple: 999 });
    for (let shift = 0; shift < 60; shift += 1) {
      w = endShift(w).world;
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
    const w = campWorldFromState(1, state, MID, MID, {
      ...bareSurface(state),
      animals: [{ id: 1, x: AT.x, y: AT.y }],
      nextAnimalId: 2,
    });
    const caught = campTap(w, AT.x, AT.y);
    expect(caught.kind).toBe('harvested');
    expect(caught.harvest?.kind).toBe('caught');
    expect(caught.world.lab.counts.get('animal')).toBe(1);
    expect(caught.world.surface.animals).toEqual([]);
    expect(depthAt(caught.world.lab.state, AT.x, AT.y)).toBe(0); // the ground is untouched
    // A few shifts later, a new animal has walked in at the edge of the map.
    let later = holding(caught.world, { wood: 99, apple: 99 });
    for (let i = 0; i < FRONTIER_SHIFT.animalEveryShifts; i += 1) later = endShift(later).world;
    expect(later.surface.animals).toHaveLength(1);
    const [fresh] = later.surface.animals;
    const onEdge =
      fresh !== undefined &&
      (fresh.x === 0 || fresh.y === 0 || fresh.x === SIDE - 1 || fresh.y === SIDE - 1);
    expect(onEdge).toBe(true);
  });

  it('an animal in the fog cannot be caught', () => {
    const state = cube();
    const w = campWorldFromState(1, state, MID, MID, {
      ...bareSurface(state),
      animals: [{ id: 1, x: 0, y: 0 }],
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
  it('a new camp costs wood and grass; every upgrade costs wood too (wood is timber); level 3 adds apples', () => {
    const items = (cost: ItemStack[]) => cost.map((s) => s.item).sort();
    expect(items(LAB_NEW_CAMP_COST)).toEqual(['grass', 'wood']);
    // No stone for level 2: a base camp cannot mine it (progression plan section 2.2).
    expect(items(upgradeCostFrom(1) ?? [])).toEqual(['animal', 'clay', 'grass', 'wood']);
    // Hay too since progression PR 4 (plan section 6.3).
    expect(items(upgradeCostFrom(2) ?? [])).toEqual([
      'animal',
      'apple',
      'clay',
      'hay',
      'stone',
      'wood',
    ]);
    // Nothing in Lab 2 costs timber: wood is timber (owner).
    for (const cost of [LAB_NEW_CAMP_COST, upgradeCostFrom(1) ?? [], upgradeCostFrom(2) ?? []]) {
      expect(items(cost)).not.toContain('timber');
    }
    // An upgrade costs more wood than a new camp, and level 3 more than level 2.
    const wood = (cost: ItemStack[]) => cost.find((s) => s.item === 'wood')?.count ?? 0;
    expect(wood(upgradeCostFrom(1) ?? [])).toBeGreaterThan(wood(LAB_NEW_CAMP_COST));
    expect(wood(upgradeCostFrom(2) ?? [])).toBeGreaterThan(wood(upgradeCostFrom(1) ?? []));
  });

  it('stone alone no longer pays for a camp or an upgrade', () => {
    const w = holding(world(), { stone: 999 });
    expect(placeRefusal(w, MID + campRadius(1) - 1, MID)).toBe('cost');
    expect(upgradeRefusal(w, 1)).toBe('cost');
    const paid = holding(
      world(),
      Object.fromEntries((upgradeCostFrom(1) ?? []).map((stack) => [stack.item, stack.count])),
    );
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
      // What a ring holds, not how fast it can be taken: a full shift of taps
      // before every tap, and no upkeep (shifts are measured by the policy runs).
      const tap = campTap({ ...w, turn: { ...w.turn, tapsLeft: FRONTIER_SHIFT.taps } }, x, y);
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

  it('the first ring pays for a second camp even with that camp’s 3 x 3 left undug (15 wood + 15 grass, question 139)', () => {
    const short: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const start = newCampWorld(seed);
      // The farthest-reaching spot for the second camp, one radius east if it
      // is level, else wherever lights the most; only its grass and trees are
      // taken, so it stays level.
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
      const w = takeEverything(start, keep);
      if (best === null || !canAfford(w.lab.counts, LAB_NEW_CAMP_COST)) {
        short.push(`seed ${seed}: ${JSON.stringify([...w.lab.counts])}`);
      }
    }
    expect(short).toEqual([]);
  }, 240_000);

  // A base camp mines only dirt and clay (progression plan section 2.2), so
  // a few seeds' two rings hold a little less clay than level 2 needs. The
  // market sells clay from the first market day (shift 10), and the spare
  // grass pays for it: that counts too.
  it('the first ring and one more camp hold what level 2 costs, with spare grass sold for clay at the market, and an animal comes by', () => {
    const level2 = upgradeCostFrom(1) ?? [];
    const gathered = level2.filter((s) => s.item !== 'animal');
    const price = (lots: typeof FRONTIER_MARKET.sellPrices, item: string) =>
      lots.find((l) => l.item === item) ?? { count: 1, coins: 0 };
    const grassLot = price(FRONTIER_MARKET.sellPrices, 'grass');
    const clayLot = price(FRONTIER_MARKET.buyPrices, 'clay');
    /** True if `counts` pays for level 2 (but its animals), buying missing clay with spare grass. */
    const paysWithMarket = (counts: Map<string, number>): boolean => {
      const need = (item: string) => gathered.find((g) => g.item === item)?.count ?? 0;
      const spareGrass = (counts.get('grass') ?? 0) - need('grass');
      const coins = Math.floor(spareGrass / grassLot.count) * grassLot.coins;
      const clayShort = Math.max(0, need('clay') - (counts.get('clay') ?? 0));
      const others = gathered.filter((g) => g.item !== 'clay');
      return canAfford(counts, others) && clayShort * (clayLot.coins / clayLot.count) <= coins;
    };
    const short: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const start = newCampWorld(seed);
      // An animal walks onto lit ground within 20 shifts.
      let w = holding(start, { wood: 999, apple: 999 });
      let seen = false;
      for (let shift = 0; shift <= 20 && !seen; shift += 1) {
        if (shift > 0) w = endShift(w).world;
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
        const placing = { ...taken, turn: { ...taken.turn, tapsLeft: FRONTIER_SHIFT.taps } };
        taken = takeEverything(placeCamp(placing, best.x, best.y));
      }
      if (!seen || taken.camps.length < 2 || !paysWithMarket(taken.lab.counts)) {
        short.push(
          `seed ${seed}: animal ${seen}, camps ${taken.camps.length}, ${JSON.stringify([...taken.lab.counts])}`,
        );
      }
    }
    expect(short).toEqual([]);
  }, 240_000);
});

describe('the lab data', () => {
  it('clay is a real block now (Lab 2 becomes the game, plan A1), and level 1 mines it and what it replaces', () => {
    expect(Object.keys(BLOCKS)).toContain('clay');
    expect(BLOCKS.clay.yields).toEqual([{ item: 'clay', count: LAB_SURFACE.clayPerBlock }]);
    expect(LAB_CAMP_LEVELS[0]?.addsBlocks).toEqual(expect.arrayContaining(['dirt', 'clay']));
  });

  it('generates the same surface for a seed', () => {
    const a = newCampWorld(42);
    const b = newCampWorld(42);
    expect(a.surface.features).toEqual(b.surface.features);
    expect(a.surface.animals).toEqual(b.surface.animals);
    expect(a.surface.features.length).toBe(a.lab.state.size.x * a.lab.state.size.y);
  });
});

describe('what grows where, and no coal at the surface (owner, after the PR #126 playtest)', () => {
  it('grass, trees and apple trees grow only on dirt, on 50 seeds', () => {
    const dirt = BLOCKS.dirt.code;
    for (let seed = 1; seed <= 50; seed += 1) {
      const w = newCampWorld(seed);
      const size = w.lab.state.size;
      let planted = 0;
      w.surface.features.forEach((feature, i) => {
        if (feature === NO_FEATURE) return;
        planted += 1;
        const block = blockAt(w.lab.state, { x: i % size.x, y: Math.floor(i / size.x), z: 0 });
        expect(block, `seed ${seed}, square ${i}`).toBe(dirt);
      });
      // Still plenty of plants.
      expect(planted).toBeGreaterThan(size.x * size.y * 0.3);
    }
  });

  it('Lab 2 has no coal at the surface; its cube is the game’s, apart from timber-root (dirt) and clay', () => {
    // No coal at the surface is now the game's own rule (question 140), so
    // Lab 2 no longer swaps it; it only turns timber-root into dirt.
    const coal = BLOCKS.coalSeam.code;
    const root = BLOCKS.timberRoot.code;
    const rootBecomes = BLOCKS[LAB_SURFACE.timberRootBecomes].code;
    let rootsSwapped = 0;
    for (let seed = 1; seed <= 50; seed += 1) {
      const game = newLabWorld(seed).state;
      const lab = newCampWorld(seed).lab.state;
      for (let i = 0; i < game.blocks.length; i += 1) {
        const before = game.blocks[i];
        const after = lab.blocks[i];
        if (before === root) {
          // Timber-root becomes dirt, and that dirt may then become clay.
          expect([rootBecomes, BLOCKS.clay.code]).toContain(after);
          rootsSwapped += 1;
        } else if (after === BLOCKS.clay.code) {
          // Clay replaces dirt or stone just under the surface (plan A1).
          expect([BLOCKS.dirt.code, BLOCKS.stone.code]).toContain(before);
        } else if (after !== before) {
          expect.fail(`seed ${seed}, cell ${i}: ${before} became ${after}`);
        }
      }
      // The cube's cells in order, the top layer (z = 0) first: x * y of them.
      const top = Array.from(lab.blocks.subarray(0, lab.size.x * lab.size.y));
      expect(top.includes(coal), `seed ${seed}`).toBe(false);
    }
    // The game's cube does have timber-root, so the swap was tested.
    expect(rootsSwapped).toBeGreaterThan(0);
  });

  it('leaves the game’s own cube alone: a run on the same seed is unchanged', () => {
    const before = hashState(newLabWorld(7).state);
    newCampWorld(7);
    expect(hashState(newLabWorld(7).state)).toBe(before);
  });
});
