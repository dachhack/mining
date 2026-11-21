// UI lab 2 (issue #118): fog, camps and upgrades, without a browser.
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import type { BlockId, ItemStack } from '../../src/data';
import { LAB_CAMP_LEVELS, LAB_NEW_CAMP_COST } from '../../src/data/labCamps';
import { depthAt, hashState, topBlockAt } from '../../src/engine';
import {
  MAX_CAMP_LEVEL,
  applyCampStep,
  blocksMinedAt,
  campRadius,
  campTap,
  campWorldFromState,
  canAfford,
  coverLevelAt,
  inCircle,
  levelNeededFor,
  newCampWorld,
  newlyCovered,
  demolishCamp,
  demolishRefusal,
  footprintOf,
  isLevelPatch,
  placeCamp,
  placeRefusal,
  replayCampSteps,
  sightAt,
  sightMap,
  startSquare,
  upgradeCamp,
  upgradeCostFrom,
  upgradeRefusal,
} from '../../src/app/lab/campWorld';
import type { CampStep, CampWorld } from '../../src/app/lab/campWorld';
import { buildState } from '../engine/helpers';

/** The side of the square test cube: wide enough for a level-2 ring, and then some. */
const SIDE = 25;
const MID = Math.floor(SIDE / 2);
/**
 * How far east of the first camp a second camp is placed in these tests: its
 * whole 3 x 3 footprint is then inside the first camp's ring, and its ring
 * covers the first camp's footprint.
 */
const NEXT = campRadius(1) - 1;

/**
 * A SIDE x SIDE cube, 3 layers deep: the top layer is `top` everywhere
 * (one character of BLOCK_CHARS in tests/engine/helpers.ts), except the
 * squares listed in `special`; the layers under it are stone.
 */
function cube(top: string, special: { x: number; y: number; char: string }[] = []) {
  const topRows: string[] = [];
  for (let y = 0; y < SIDE; y += 1) {
    let row = '';
    for (let x = 0; x < SIDE; x += 1) {
      row += special.find((s) => s.x === x && s.y === y)?.char ?? top;
    }
    topRows.push(row);
  }
  const stone = new Array<string>(SIDE).fill('#'.repeat(SIDE));
  return buildState({ layers: [topRows, stone, stone] });
}

/** A world on `cube(...)` with its first camp in the middle. */
function world(top = 'd', special: { x: number; y: number; char: string }[] = []): CampWorld {
  return campWorldFromState(1, cube(top, special), MID, MID);
}

/** `w` holding `counts` (item -> count) instead of what it held. */
function holding(w: CampWorld, counts: Record<string, number>): CampWorld {
  return { ...w, lab: { ...w.lab, counts: new Map(Object.entries(counts)) } };
}

/** Enough of everything for any camp or upgrade in the data. */
function rich(w: CampWorld): CampWorld {
  const counts: Record<string, number> = {};
  const add = (stacks: ItemStack[]): void => {
    for (const s of stacks) counts[s.item] = (counts[s.item] ?? 0) + s.count * 10;
  };
  add(LAB_NEW_CAMP_COST);
  for (const level of LAB_CAMP_LEVELS) add(level.upgradeCost);
  return holding(w, counts);
}

/** How many squares are 'shown'. */
function shownCount(w: CampWorld): number {
  return sightMap(w).filter((s) => s === 'shown').length;
}

/** How many squares a circle of `radius` covers, counted with `inCircle`. */
function circleSize(radius: number): number {
  let n = 0;
  for (let dy = -radius - 1; dy <= radius + 1; dy += 1) {
    for (let dx = -radius - 1; dx <= radius + 1; dx += 1) {
      if (inCircle(0, 0, radius, dx, dy)) n += 1;
    }
  }
  return n;
}

describe('the lab 2 data', () => {
  it('has levels whose rings grow, and a free level 1', () => {
    expect(MAX_CAMP_LEVEL).toBeGreaterThanOrEqual(2);
    expect(LAB_CAMP_LEVELS[0]?.upgradeCost).toEqual([]);
    for (let level = 2; level <= MAX_CAMP_LEVEL; level += 1) {
      expect(campRadius(level)).toBeGreaterThan(campRadius(level - 1));
      expect(upgradeCostFrom(level - 1)?.length).toBeGreaterThan(0);
    }
    expect(upgradeCostFrom(MAX_CAMP_LEVEL)).toBeNull();
    expect(LAB_NEW_CAMP_COST.length).toBeGreaterThan(0);
  });

  it('lets some level mine every block that gives something, and names each block once', () => {
    const named: BlockId[] = LAB_CAMP_LEVELS.flatMap((level) => level.addsBlocks);
    expect(new Set(named).size).toBe(named.length);
    for (const id of Object.keys(BLOCKS) as BlockId[]) {
      if (BLOCKS[id].yields.length > 0) {
        expect(levelNeededFor(BLOCKS[id].code), id).not.toBeNull();
      }
    }
    expect(levelNeededFor(BLOCKS.bedrock.code)).toBeNull();
    expect(levelNeededFor(BLOCKS.air.code)).toBeNull();
  });

  it('matches the owner’s starting table: dirt to coal at 1, hard rock at 2, ore at 3', () => {
    for (const id of ['dirt', 'rubble', 'stone', 'coalSeam'] as const) {
      expect(levelNeededFor(BLOCKS[id].code), id).toBe(1);
    }
    expect(levelNeededFor(BLOCKS.hardRock.code)).toBe(2);
    for (const id of ['ironOre', 'copperOre', 'crystal'] as const) {
      expect(levelNeededFor(BLOCKS[id].code), id).toBe(3);
    }
    expect(blocksMinedAt(2)).toEqual([...blocksMinedAt(1), 'hardRock']);
  });
});

describe('fog and sight', () => {
  it('a circle of radius 3 covers 37 squares, round, with no lone points', () => {
    expect(circleSize(3)).toBe(37);
    expect(inCircle(0, 0, 3, 3, 0)).toBe(true);
    expect(inCircle(0, 0, 3, 3, 1)).toBe(true);
    expect(inCircle(0, 0, 3, 2, 2)).toBe(true);
    expect(inCircle(0, 0, 3, 3, 2)).toBe(false);
    expect(inCircle(0, 0, 3, 4, 0)).toBe(false);
  });

  it('shows the first camp’s ring and nothing else', () => {
    const w = world();
    const r = campRadius(1);
    expect(shownCount(w)).toBe(circleSize(r));
    expect(sightAt(w, MID, MID)).toBe('shown');
    expect(sightAt(w, MID + r, MID)).toBe('shown');
    expect(sightAt(w, MID + r + 1, MID)).toBe('fog');
    expect(sightAt(w, 0, 0)).toBe('fog');
    expect(coverLevelAt(w, MID, MID)).toBe(1);
    expect(coverLevelAt(w, 0, 0)).toBe(0);
  });

  it('shows the union of every camp’s ring, at the best level over each square', () => {
    let w = rich(world());
    const r = campRadius(1);
    w = placeCamp(w, MID + NEXT, MID);
    expect(w.camps).toHaveLength(2);
    expect(sightAt(w, MID + NEXT + r, MID)).toBe('shown');
    expect(sightAt(w, MID - r, MID)).toBe('shown');
    // Upgrade the new camp: the overlap is now level 2, the far side of the first ring still 1.
    w = upgradeCamp(w, 2);
    expect(coverLevelAt(w, MID + 1, MID)).toBe(2);
    expect(coverLevelAt(w, MID - r, MID)).toBe(1);
  });

  it('greys squares that only a demolished camp lit', () => {
    const r = campRadius(1);
    let w = placeCamp(rich(world()), MID + NEXT, MID);
    const west = { x: MID - r, y: MID }; // lit by the first camp only
    expect(sightAt(w, west.x, west.y)).toBe('shown');
    w = demolishCamp(w, 1);
    expect(w.camps.map((c) => c.id)).toEqual([2]);
    expect(sightAt(w, west.x, west.y)).toBe('greyed');
    expect(sightAt(w, MID, MID)).toBe('shown'); // the second camp covers the old base
    expect(sightAt(w, 0, 0)).toBe('fog');
  });
});

describe('taps', () => {
  it('mines a lit square and adds its yield', () => {
    const w = world('#');
    const tap = campTap(w, MID + 2, MID);
    expect(tap.kind).toBe('mined');
    expect(depthAt(tap.world.lab.state, MID + 2, MID)).toBe(1);
    expect(tap.world.lab.counts.get('stone')).toBe(1);
    expect(tap.world.camps).toBe(w.camps);
  });

  it('refuses a tap in fog and changes nothing', () => {
    const w = world('#');
    const before = hashState(w.lab.state);
    const tap = campTap(w, 0, 0);
    expect(tap.kind).toBe('fog');
    expect(tap.world).toBe(w);
    expect(hashState(w.lab.state)).toBe(before);
    expect(w.lab.mined).toBe(0);
    expect(w.lab.counts.size).toBe(0);
  });

  it('refuses a tap on a greyed square and changes nothing', () => {
    const r = campRadius(1);
    const w = demolishCamp(placeCamp(rich(world()), MID + NEXT, MID), 1);
    const tap = campTap(w, MID - r, MID);
    expect(tap.kind).toBe('greyed');
    expect(tap.world).toBe(w);
  });

  it('says "too steep" before "too hard", so an upgrade never breaks a promise', () => {
    // Hard rock 1 level down at `pit`, under open space: its four neighbours
    // are higher, so the level rule refuses it whatever the camp's level.
    const pit = { x: MID + 3, y: MID };
    const rows = (char: string, at: string): string[] => {
      const out: string[] = [];
      for (let y = 0; y < SIDE; y += 1) {
        let row = '';
        for (let x = 0; x < SIDE; x += 1) row += x === pit.x && y === pit.y ? at : char;
        out.push(row);
      }
      return out;
    };
    const state = buildState({ layers: [rows('d', '.'), rows('#', 'H'), rows('#', '#')] });
    let w = campWorldFromState(1, state, MID, MID);
    const steep = campTap(w, pit.x, pit.y);
    expect(steep.kind).toBe('refused');
    expect(steep.tap?.result.refusal).toBe('neighbourHigher');
    expect(steep.tap?.result.higherNeighbours).toHaveLength(4);
    expect(steep.world).toBe(w);
    // Dig its four neighbours level with it: now it is only too hard.
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      w = campTap(w, pit.x + dx, pit.y + dy).world;
    }
    const hard = campTap(w, pit.x, pit.y);
    expect(hard.kind).toBe('tooHard');
    expect(hard.needs).toBe(2);
  });

  it('never mines the square a camp stands on', () => {
    const w = world();
    const tap = campTap(w, MID, MID);
    expect(tap.kind).toBe('camp');
    expect(tap.world).toBe(w);
  });

  it('refuses a block too hard for the camps over it, saying which level can', () => {
    const square = { x: MID + 2, y: MID }; // just outside the first camp's 3 x 3
    const w = rich(world('d', [{ ...square, char: 'H' }]));
    const tap = campTap(w, square.x, square.y);
    expect(tap.kind).toBe('tooHard');
    expect(tap.needs).toBe(2);
    expect(tap.world).toBe(w);
    // A level-2 camp over it can mine it.
    const upgraded = upgradeCamp(w, 1);
    const after = campTap(upgraded, square.x, square.y);
    expect(after.kind).toBe('mined');
    expect(topBlockAt(after.world.lab.state, square.x, square.y)).toBe(BLOCKS.stone.code);
  });

  it('uses the best camp over a square: a level-2 ring lets a level-1 ring’s hard rock be mined', () => {
    // Hard rock between the first camp and a second one placed NEXT to the east.
    const square = { x: MID + 2, y: MID }; // just outside the first camp's 3 x 3
    let w = rich(world('d', [{ ...square, char: 'H' }]));
    w = placeCamp(w, MID + NEXT, MID);
    expect(campTap(w, square.x, square.y).kind).toBe('tooHard');
    w = upgradeCamp(w, 2);
    expect(campTap(w, square.x, square.y).kind).toBe('mined');
  });

  it('passes the level rule’s refusal through, unchanged', () => {
    let w = world('#');
    w = campTap(w, MID + 2, MID).world;
    const tap = campTap(w, MID + 2, MID); // now 1 down with higher neighbours
    expect(tap.kind).toBe('refused');
    expect(tap.tap?.result.refusal).toBe('neighbourHigher');
    expect(tap.world).toBe(w);
  });
});

describe('placing camps', () => {
  it('places a camp on a lit square, pays for it, and lights its ring', () => {
    const w = rich(world());
    const before = new Map(w.lab.counts);
    const fresh = newlyCovered(w, MID + NEXT, MID);
    expect(fresh.length).toBeGreaterThan(0);
    const next = placeCamp(w, MID + NEXT, MID);
    expect(next.camps.map((c) => [c.x, c.y, c.level])).toEqual([
      [MID, MID, 1],
      [MID + NEXT, MID, 1],
    ]);
    expect(shownCount(next)).toBe(shownCount(w) + fresh.length);
    for (const stack of LAB_NEW_CAMP_COST) {
      expect(next.lab.counts.get(stack.item) ?? 0).toBe(
        (before.get(stack.item) ?? 0) - stack.count,
      );
    }
    // The world it came from is untouched.
    expect(w.camps).toHaveLength(1);
    expect(w.lab.counts).toEqual(before);
  });

  it('refuses a square outside every ring, a camp square, and a cost it cannot pay', () => {
    const r = campRadius(1);
    const w = rich(world());
    expect(placeRefusal(w, MID + r + 1, MID)).toBe('notShown');
    expect(placeCamp(w, MID + r + 1, MID)).toBe(w);
    expect(placeRefusal(w, MID, MID)).toBe('occupied');
    expect(placeCamp(w, MID, MID)).toBe(w);
    // A footprint that only overlaps the first camp's 3 x 3 is refused too.
    expect(placeRefusal(w, MID + 2, MID)).toBe('occupied');
    const poor = holding(world(), {});
    expect(placeRefusal(poor, MID + NEXT, MID)).toBe('cost');
    expect(placeCamp(poor, MID + NEXT, MID)).toBe(poor);
  });

  it('can afford exactly the cost, and not one short of it', () => {
    const exact: Record<string, number> = {};
    for (const s of LAB_NEW_CAMP_COST) exact[s.item] = s.count;
    const w = holding(world(), exact);
    expect(canAfford(w.lab.counts, LAB_NEW_CAMP_COST)).toBe(true);
    const placed = placeCamp(w, MID + NEXT, MID);
    expect(placed.camps).toHaveLength(2);
    expect(placed.lab.counts.size).toBe(0); // only items above 0 are kept
    const [first] = LAB_NEW_CAMP_COST;
    if (first !== undefined) {
      const short = holding(world(), { ...exact, [first.item]: first.count - 1 });
      expect(placeRefusal(short, MID + NEXT, MID)).toBe('cost');
    }
  });
});

describe('3 x 3 camps on level ground (owner, question 134)', () => {
  it('a camp stands on 3 x 3 squares, none of which can be mined', () => {
    const w = world('#');
    for (const sq of footprintOf(MID, MID)) {
      expect(campTap(w, sq.x, sq.y).kind).toBe('camp');
    }
    expect(campTap(w, MID + 2, MID).kind).toBe('mined');
  });

  it('refuses a patch that is not level, and takes one dug level all over', () => {
    const at = { x: MID + NEXT, y: MID };
    let w = rich(world('#'));
    expect(isLevelPatch(w.lab, at.x, at.y)).toBe(true);
    // Dig one square of the patch: the nine are no longer at one depth.
    w = campTap(w, at.x, at.y).world;
    expect(isLevelPatch(w.lab, at.x, at.y)).toBe(false);
    expect(placeRefusal(w, at.x, at.y)).toBe('notLevel');
    expect(placeCamp(w, at.x, at.y)).toBe(w);
    // Dig the other eight once each: level again, 1 down, and a camp may stand there.
    for (const sq of footprintOf(at.x, at.y)) {
      if (sq.x !== at.x || sq.y !== at.y) {
        const tap = campTap(w, sq.x, sq.y);
        expect(tap.kind).toBe('mined');
        w = tap.world;
      }
    }
    expect(isLevelPatch(w.lab, at.x, at.y)).toBe(true);
    expect(placeRefusal(w, at.x, at.y)).toBeNull();
    expect(placeCamp(w, at.x, at.y).camps).toHaveLength(2);
  });

  it('refuses a patch partly outside every ring', () => {
    const r = campRadius(1);
    const w = rich(world());
    // The middle square is lit, but the east column of its 3 x 3 is not.
    expect(sightAt(w, MID + r, MID)).toBe('shown');
    expect(placeRefusal(w, MID + r, MID)).toBe('notShown');
  });

  it('demolishes a camp only when other camps cover its whole footprint', () => {
    // On its own, the first camp cannot be demolished.
    const alone = rich(world());
    expect(demolishRefusal(alone, 1)).toBe('notCovered');
    expect(demolishCamp(alone, 1)).toBe(alone);
    // A level-2 first camp and a level-1 camp near the edge of its ring: the
    // big ring covers the small camp's base, but not the other way round.
    let w = upgradeCamp(rich(world()), 1);
    const far = campRadius(2) - 1;
    w = placeCamp(w, MID + far, MID);
    expect(w.camps).toHaveLength(2);
    expect(demolishRefusal(w, 1)).toBe('notCovered');
    expect(demolishCamp(w, 1)).toBe(w);
    expect(demolishRefusal(w, 2)).toBeNull();
    expect(demolishCamp(w, 2).camps.map((c) => c.id)).toEqual([1]);
    expect(demolishRefusal(w, 99)).toBe('missing');
  });

  it('gives nothing back, and the old base can then be mined', () => {
    let w = placeCamp(rich(world('#')), MID + NEXT, MID);
    const counts = new Map(w.lab.counts);
    expect(campTap(w, MID, MID).kind).toBe('camp');
    w = demolishCamp(w, 1);
    expect(w.lab.counts).toEqual(counts);
    // Every square of the old 3 x 3 can be dug now...
    for (const sq of footprintOf(MID, MID)) {
      const tap = campTap(w, sq.x, sq.y);
      expect(tap.kind, `${sq.x},${sq.y}`).toBe('mined');
      w = tap.world;
    }
    // ...and then deeper: the middle goes down again, under where the camp stood.
    const tap = campTap(w, MID, MID);
    expect(tap.kind).toBe('mined');
    expect(depthAt(tap.world.lab.state, MID, MID)).toBe(2);
  });
});

describe('upgrades', () => {
  it('costs what the data says and widens the ring', () => {
    const w = rich(world());
    const cost = upgradeCostFrom(1) ?? [];
    const next = upgradeCamp(w, 1);
    expect(next.camps[0]?.level).toBe(2);
    expect(shownCount(next)).toBe(circleSize(campRadius(2)));
    for (const stack of cost) {
      expect(next.lab.counts.get(stack.item) ?? 0).toBe(
        (w.lab.counts.get(stack.item) ?? 0) - stack.count,
      );
    }
  });

  it('refuses when it cannot be paid, or at the top level', () => {
    const poor = holding(world(), {});
    expect(upgradeRefusal(poor, 1)).toBe('cost');
    expect(upgradeCamp(poor, 1)).toBe(poor);
    let w = rich(world());
    for (let level = 1; level < MAX_CAMP_LEVEL; level += 1) {
      w = upgradeCamp(w, 1);
    }
    expect(w.camps[0]?.level).toBe(MAX_CAMP_LEVEL);
    expect(upgradeRefusal(w, 1)).toBe('top');
    expect(upgradeCamp(w, 1)).toBe(w);
    expect(upgradeRefusal(w, 99)).toBe('missing');
  });
});

describe('a new world', () => {
  it('puts the free first camp on an all-dirt 3 x 3 nearest the middle', () => {
    const special = [{ x: MID, y: MID, char: '#' }];
    const state = cube('d', special);
    // The middle is stone, so the camp's 3 x 3 goes just clear of it.
    const start = startSquare(state);
    for (const sq of footprintOf(start.x, start.y)) {
      expect(topBlockAt(state, sq.x, sq.y)).toBe(BLOCKS.dirt.code);
    }
    expect(Math.max(Math.abs(start.x - MID), Math.abs(start.y - MID))).toBe(2);
    expect(Math.abs(start.x - MID) + Math.abs(start.y - MID)).toBe(2);
  });

  it('is the same every time for a seed, with one level-1 camp on dirt', () => {
    const a = newCampWorld(110);
    const b = newCampWorld(110);
    expect(a.camps).toEqual(b.camps);
    expect(a.camps).toHaveLength(1);
    const [camp] = a.camps;
    expect(camp?.level).toBe(1);
    expect(topBlockAt(a.lab.state, camp?.x ?? 0, camp?.y ?? 0)).toBe(BLOCKS.dirt.code);
    expect(shownCount(a)).toBe(circleSize(campRadius(1)));
  });

  it('replays a list of steps to the same world', () => {
    const steps: CampStep[] = [];
    let w = newCampWorld(110);
    const camp = w.camps[0] ?? { x: 0, y: 0 };
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      const step: CampStep = { kind: 'tap', x: camp.x + dx, y: camp.y + dy };
      steps.push(step);
      w = applyCampStep(w, step);
    }
    const again = replayCampSteps(110, steps);
    expect(hashState(again.lab.state)).toBe(hashState(w.lab.state));
    expect(again.lab.counts).toEqual(w.lab.counts);
    expect(again.lab.mined).toBe(w.lab.mined);
  });
});

/**
 * Mine everything the camps of `start` let a player mine, square by square,
 * until nothing more can be: what a player could collect without placing or
 * upgrading anything. Only lit squares are tried.
 */
function mineEverything(start: CampWorld): CampWorld {
  let w = start;
  const width = w.lab.depths.width;
  const lit: number[] = [];
  sightMap(w).forEach((sight, i) => {
    if (sight === 'shown') lit.push(i);
  });
  let mined = true;
  while (mined) {
    mined = false;
    for (const i of lit) {
      const tap = campTap(w, i % width, Math.floor(i / width));
      if (tap.kind === 'mined') {
        w = tap.world;
        mined = true;
      }
    }
  }
  return w;
}

/** `a` and `b` added together, item by item. */
function together(a: ItemStack[], b: ItemStack[]): ItemStack[] {
  const sum = new Map<string, number>();
  for (const s of [...a, ...b]) sum.set(s.item, (sum.get(s.item) ?? 0) + s.count);
  return [...sum].map(([item, count]) => ({ item, count }));
}

describe('the starting ring pays for the next steps (owner, issue #118)', () => {
  // 200 generated worlds take a few seconds, so this test has a longer time limit.
  it('in each of 200 seeds, the first camp’s ring alone holds a second camp and the first upgrade', () => {
    const both = together(LAB_NEW_CAMP_COST, upgradeCostFrom(1) ?? []);
    const short: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const w = mineEverything(newCampWorld(seed));
      if (!canAfford(w.lab.counts, both)) {
        short.push(`seed ${seed}: ${JSON.stringify([...w.lab.counts])}`);
      }
    }
    expect(short).toEqual([]);
  }, 60_000);
});
