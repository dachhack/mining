// Camps and the fog of war in the engine (plan A2,
// docs/plans/lab2-becomes-the-game.md): sight, place, upgrade, demolish,
// and which camp level mines which block. Lab 2's own tests
// (tests/app/campWorld.test.ts) check the same rules through Lab 2's screen code.
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import type { ItemStack } from '../../src/data';
import { FRONTIER_CAMP_LEVELS, FRONTIER_NEW_CAMP_COST } from '../../src/data/frontier';
import {
  MAX_CAMP_LEVEL,
  blocksMinedAt,
  campAt,
  campRadius,
  coverLevelAt,
  createFrontier,
  demolishFrontierCamp,
  demolishRefusal,
  footprintOf,
  inCircle,
  isLevelPatch,
  levelNeededFor,
  newlyCovered,
  placeFrontierCamp,
  placeRefusal,
  sightAt,
  sightMap,
  upgradeCostFrom,
  upgradeFrontierCamp,
  upgradeRefusal,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { FRONTIER_STATE_VERSION, GRASS, NO_FEATURE } from '../../src/engine/frontier/state';
import { seenWith } from '../../src/engine/frontier/camps';
import { buildState } from './helpers';

/** The side of the square test cube: wide enough for a level-2 ring, and then some. */
const SIDE = 25;
const MID = Math.floor(SIDE / 2);
/** A second camp this far east of the first stands inside its ring, and its ring covers the first's 3 x 3. */
const NEXT = campRadius(1) - 1;

/**
 * A frontier world on a hand-made SIDE x SIDE cube, 3 layers deep: dirt on
 * top except the squares in `special` (characters of BLOCK_CHARS in
 * tests/engine/helpers.ts), stone under it; grass everywhere; one level-1
 * camp in the middle; holding `inventory`.
 */
function world(
  inventory: Record<string, number> = {},
  special: { x: number; y: number; char: string }[] = [],
): FrontierState {
  const top: string[] = [];
  for (let y = 0; y < SIDE; y += 1) {
    let row = '';
    for (let x = 0; x < SIDE; x += 1) {
      row += special.find((s) => s.x === x && s.y === y)?.char ?? 'd';
    }
    top.push(row);
  }
  const stone = new Array<string>(SIDE).fill('#'.repeat(SIDE));
  const cube = buildState({ layers: [top, stone, stone] });
  const camps = [{ id: 1, x: MID, y: MID, level: 1 }];
  return {
    version: FRONTIER_STATE_VERSION,
    seed: 1,
    cube,
    features: new Array<typeof GRASS>(SIDE * SIDE).fill(GRASS),
    apples: new Array<number>(SIDE * SIDE).fill(0),
    animals: [],
    nextAnimalId: 1,
    rng: { s: 1 },
    camps,
    nextCampId: 2,
    seen: seenWith(new Array<boolean>(SIDE * SIDE).fill(false), camps, SIDE, SIDE),
    inventory: new Map(Object.entries(inventory)),
  };
}

/** Enough of everything for any camp or upgrade in the data. */
function rich(): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (stacks: ItemStack[]): void => {
    for (const s of stacks) counts[s.item] = (counts[s.item] ?? 0) + s.count * 10;
  };
  add(FRONTIER_NEW_CAMP_COST);
  for (const level of FRONTIER_CAMP_LEVELS) add(level.upgradeCost);
  return counts;
}

describe('camp levels (plan A2)', () => {
  it('lets each level mine what the levels below it mine, and more', () => {
    expect(levelNeededFor(BLOCKS.dirt.code)).toBe(1);
    expect(levelNeededFor(BLOCKS.clay.code)).toBe(1);
    expect(levelNeededFor(BLOCKS.hardRock.code)).toBe(2);
    expect(levelNeededFor(BLOCKS.ironOre.code)).toBe(3);
    expect(levelNeededFor(BLOCKS.bedrock.code)).toBeNull();
    for (let level = 2; level <= MAX_CAMP_LEVEL; level += 1) {
      expect(blocksMinedAt(level)).toEqual(expect.arrayContaining(blocksMinedAt(level - 1)));
      expect(campRadius(level)).toBeGreaterThan(campRadius(level - 1));
    }
    expect(upgradeCostFrom(MAX_CAMP_LEVEL)).toBeNull();
  });
});

describe('sight (plan A2)', () => {
  it('shows the first camp’s circle and leaves the rest in fog', () => {
    const w = world();
    const r = campRadius(1);
    sightMap(w).forEach((sight, i) => {
      const inside = inCircle(MID, MID, r, i % SIDE, Math.floor(i / SIDE));
      expect(sight).toBe(inside ? 'shown' : 'fog');
      expect(sightAt(w, i % SIDE, Math.floor(i / SIDE))).toBe(sight);
    });
  });

  it('lights the same squares on a generated world as it marks seen', () => {
    const w = createFrontier(7);
    sightMap(w).forEach((sight, i) => {
      expect(sight === 'shown').toBe(w.seen[i]);
    });
  });
});

describe('placing a camp (plan A2)', () => {
  it('says why it cannot: fog, another camp, uneven ground, or the cost', () => {
    expect(placeRefusal(world(rich()), 0, 0)).toBe('notShown');
    expect(placeRefusal(world(rich()), MID + 1, MID)).toBe('occupied');
    const pit = world(rich(), [{ x: MID + NEXT, y: MID, char: '.' }]);
    expect(isLevelPatch(pit.cube, MID + NEXT, MID)).toBe(false);
    expect(placeRefusal(pit, MID + NEXT, MID)).toBe('notLevel');
    expect(placeRefusal(world(), MID + NEXT, MID)).toBe('cost');
    expect(placeRefusal(world(rich()), MID + NEXT, MID)).toBeNull();
  });

  it('gives back the very same state when refused', () => {
    const w = world();
    expect(placeFrontierCamp(w, MID + NEXT, MID)).toBe(w);
  });

  it('adds a level-1 camp, pays for it, lights its circle and clears its 3 x 3', () => {
    const before = world(rich());
    const fresh = newlyCovered(before, MID + NEXT, MID);
    expect(fresh.length).toBeGreaterThan(0);
    const after = placeFrontierCamp(before, MID + NEXT, MID);
    expect(after.camps).toHaveLength(2);
    expect(after.camps[1]).toEqual({ id: 2, x: MID + NEXT, y: MID, level: 1 });
    expect(after.nextCampId).toBe(3);
    for (const stack of FRONTIER_NEW_CAMP_COST) {
      expect(after.inventory.get(stack.item)).toBe(
        (before.inventory.get(stack.item) ?? 0) - stack.count,
      );
    }
    for (const i of fresh) {
      expect(before.seen[i]).toBe(false);
      expect(after.seen[i]).toBe(true);
    }
    for (const s of footprintOf(MID + NEXT, MID)) {
      expect(after.features[s.x + SIDE * s.y]).toBe(NO_FEATURE);
      expect(campAt(after.camps, s.x, s.y)?.id).toBe(2);
    }
    // The state it was given is untouched.
    expect(before.camps).toHaveLength(1);
    expect(before.features.every((f) => f === GRASS)).toBe(true);
  });
});

describe('upgrading a camp (plan A2)', () => {
  it('needs the cost, then raises the level, widens the circle and pays', () => {
    expect(upgradeRefusal(world(), 1)).toBe('cost');
    expect(upgradeRefusal(world(rich()), 9)).toBe('missing');
    const before = world(rich());
    const after = upgradeFrontierCamp(before, 1);
    expect(after.camps[0]?.level).toBe(2);
    expect(coverLevelAt(after.camps, MID, MID)).toBe(2);
    expect(after.seen.filter(Boolean).length).toBeGreaterThan(before.seen.filter(Boolean).length);
    for (const stack of upgradeCostFrom(1) ?? []) {
      expect(after.inventory.get(stack.item) ?? 0).toBe(
        (before.inventory.get(stack.item) ?? 0) - stack.count,
      );
    }
  });

  it('stops at the top level', () => {
    let w = world(rich());
    for (let level = 1; level < MAX_CAMP_LEVEL; level += 1) {
      w = upgradeFrontierCamp(w, 1);
    }
    expect(upgradeRefusal(w, 1)).toBe('top');
    expect(upgradeFrontierCamp(w, 1)).toBe(w);
  });
});

describe('demolishing a camp (plan A2)', () => {
  it('needs another camp’s circle over its 3 x 3, then greys what only it lit', () => {
    const one = world(rich());
    expect(demolishRefusal(one, 1)).toBe('notCovered');
    expect(demolishFrontierCamp(one, 1)).toBe(one);
    const two = placeFrontierCamp(one, MID + NEXT, MID);
    expect(demolishRefusal(two, 1)).toBeNull();
    const after = demolishFrontierCamp(two, 1);
    expect(after.camps.map((c) => c.id)).toEqual([2]);
    // A square west of the first camp, lit only by it, is greyed now, not fog.
    const west = MID - campRadius(1);
    expect(sightAt(two, west, MID)).toBe('shown');
    expect(sightAt(after, west, MID)).toBe('greyed');
    expect(sightAt(after, 0, 0)).toBe('fog');
  });
});
