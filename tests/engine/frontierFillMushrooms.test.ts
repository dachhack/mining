// Filling with dirt, the recipe book's one-is-enough rule, and mushrooms
// (owner, after the 0.17.0 build: "Fill any square with dirt as a move. No
// resource restrictions. Height restrictions still apply. Recipe book can
// hide items where it doesn't help to have a second. ... If a (non-maple)
// tree is standing when rain happens, 3-7 days later a mushroom has a chance
// of emerging. The chance increases for every adjacent space where there is
// another tree. Contracts for mushrooms in the market and mushrooms sell for
// gold.").
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import { FRONTIER_CONTRACTS, FRONTIER_MARKET, FRONTIER_MUSHROOM } from '../../src/data/frontier';
import {
  coverLevelAt,
  fillSquareRefusal,
  frontierAct,
  makeRefusal,
  mushroomChance,
  nightOfMushrooms,
  previewTap,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { depthAt, topBlockAt } from '../../src/engine/heightmap';
import { worldCanFill, worldStock } from '../../src/engine/frontier/stock';
import { APPLE_TREE, MAPLE_TREE, TREE } from '../../src/engine/frontier/state';
import { MID, SIDE, world } from './frontierHelpers';

const at = (x: number, y: number): number => x + SIDE * y;

/** Do `action` and expect it to be done. */
function act(state: FrontierState, action: Parameters<typeof frontierAct>[1]): FrontierState {
  const out = frontierAct(state, action);
  expect(out.done, `${action.kind}: ${out.refusal ?? ''}`).toBe(true);
  return out.state;
}

describe('filling a square with dirt', () => {
  // Square A dug 2 deep, B (east of it) 1 deep, the rest of the cube whole.
  const A = { x: MID + 4, y: MID };
  const B = { x: MID + 5, y: MID };
  const dug = (): FrontierState =>
    world({
      special: [
        { ...A, z: 0, char: '.' },
        { ...A, z: 1, char: '.' },
        { ...B, z: 0, char: '.' },
      ],
    });

  it('puts one block of dirt on a dug square, for 1 tap and nothing else', () => {
    const w = dug();
    const out = frontierAct(w, { kind: 'fillSquare', ...A });
    expect(out.done).toBe(true);
    expect(depthAt(out.state.cube, A.x, A.y)).toBe(1);
    expect(topBlockAt(out.state.cube, A.x, A.y)).toBe(BLOCKS.dirt.code);
    expect(out.state.tapsLeft).toBe(w.tapsLeft - 1);
    expect(out.state.inventory).toEqual(w.inventory);
  });

  it('keeps the level rule: not while a face neighbour is deeper', () => {
    const w = dug();
    // B (1 deep) beside A (2 deep): filled, B would stand 2 above A.
    expect(fillSquareRefusal(w, B.x, B.y)).toBe('neighbourDeeper');
    expect(frontierAct(w, { kind: 'fillSquare', ...B }).refusal).toBe('neighbourDeeper');
    // Fill A first; then B can be filled, and then A again, to the surface.
    const a = act(w, { kind: 'fillSquare', ...A });
    const b = act(a, { kind: 'fillSquare', ...B });
    const top = act(b, { kind: 'fillSquare', ...A });
    expect(depthAt(top.cube, A.x, A.y)).toBe(0);
    expect(depthAt(top.cube, B.x, B.y)).toBe(0);
  });

  it('refuses ground never dug, a camp, water, and squares out of sight', () => {
    const w = dug();
    expect(fillSquareRefusal(w, MID + 3, MID + 3)).toBe('surface');
    expect(fillSquareRefusal(w, 0, 0)).toBe('notShown');
    const wet = { ...w, hazards: { ...w.hazards, flooded: w.hazards.flooded.map(() => true) } };
    expect(fillSquareRefusal(wet, B.x, B.y)).toBe('hazard');
    const out = frontierAct(w, { kind: 'fillSquare', x: MID + 3, y: MID + 3 });
    expect(out.done).toBe(false);
    expect(out.state).toBe(w);
  });
});

describe('the recipe book: one is enough', () => {
  it('will not make a second tool or sword', () => {
    const w = {
      ...world({ inventory: { ironIngot: 20, wood: 20, ironPickaxe: 1, axe: 1, sword: 1 } }),
      camps: world().camps.map((c) => ({ ...c, level: 2, smelter: true })),
    };
    expect(makeRefusal(w, 'iron-pickaxe')).toBe('owned');
    expect(makeRefusal(w, 'axe')).toBe('owned');
    expect(makeRefusal(w, 'sword')).toBe('owned');
    const none = { ...w, inventory: new Map([...w.inventory].filter(([k]) => k !== 'axe')) };
    expect(makeRefusal(none, 'axe')).toBe(null);
  });
});

describe('mushrooms', () => {
  const T = { x: MID - 4, y: MID };

  it('get likelier with every tree beside, up to FRONTIER_MUSHROOM.most', () => {
    const alone = world({ features: [{ ...T, feature: TREE }] });
    expect(mushroomChance(alone, T.x, T.y)).toBeCloseTo(FRONTIER_MUSHROOM.chance);
    const two = world({
      features: [
        { ...T, feature: TREE },
        { x: T.x + 1, y: T.y, feature: TREE },
        { x: T.x - 1, y: T.y + 1, feature: MAPLE_TREE },
      ],
    });
    expect(mushroomChance(two, T.x, T.y)).toBeCloseTo(
      FRONTIER_MUSHROOM.chance + 2 * FRONTIER_MUSHROOM.perTreeBeside,
    );
    const forest = world({ everywhere: TREE });
    expect(mushroomChance(forest, T.x, T.y)).toBeLessThanOrEqual(FRONTIER_MUSHROOM.most);
  });

  it('are set coming only by rain, only under plain trees, in 3 to 7 nights', () => {
    const forest = world({ everywhere: TREE });
    const dry = nightOfMushrooms(forest, false, { s: 5 });
    expect(dry.coming).toBe(0);
    const wet = nightOfMushrooms(forest, true, { s: 5 });
    expect(wet.coming).toBeGreaterThan(0);
    const [low, high] = FRONTIER_MUSHROOM.nights;
    for (const n of wet.state.mushroomIn) {
      if (n >= 0) expect(n >= low && n <= high).toBe(true);
    }
    // Never under a maple.
    const maples = world({ everywhere: MAPLE_TREE });
    expect(nightOfMushrooms(maples, true, { s: 5 }).coming).toBe(0);
    // Nor under an apple tree (owner, after the 0.18.0 build: "Let's omit
    // apple trees from mushroom generation").
    const orchard = world({ everywhere: APPLE_TREE });
    expect(nightOfMushrooms(orchard, true, { s: 5 }).coming).toBe(0);
  });

  it('come up when their nights are counted, and a tap picks one before the tree', () => {
    let w = world({ features: [{ ...T, feature: TREE }] });
    w = { ...w, mushroomIn: w.mushroomIn.map((n, i) => (i === at(T.x, T.y) ? 2 : n)) };
    const one = nightOfMushrooms(w, false, { s: 1 }).state;
    expect(one.mushrooms[at(T.x, T.y)]).toBe(false);
    expect(one.mushroomIn[at(T.x, T.y)]).toBe(1);
    const two = nightOfMushrooms(one, false, { s: 1 });
    expect(two.came).toBe(1);
    expect(two.state.mushrooms[at(T.x, T.y)]).toBe(true);
    expect(previewTap(two.state, T.x, T.y).gain).toEqual([{ item: 'mushroom', count: 1 }]);
    const picked = act(two.state, { kind: 'tap', ...T });
    expect(picked.inventory.get('mushroom')).toBe(1);
    expect(picked.mushrooms[at(T.x, T.y)]).toBe(false);
    expect(picked.features[at(T.x, T.y)]).toBe(TREE); // the tree still stands
  });

  it('do not come up where the ground was dug meanwhile', () => {
    let w = world({ special: [{ ...T, z: 0, char: '.' }] });
    w = { ...w, mushroomIn: w.mushroomIn.map((n, i) => (i === at(T.x, T.y) ? 1 : n)) };
    const night = nightOfMushrooms(w, false, { s: 1 });
    expect(night.came).toBe(0);
    expect(night.state.mushrooms[at(T.x, T.y)]).toBe(false);
  });

  it('need their tree still standing, to grow and to come up', () => {
    // Owner, after the 0.20.0 build: "Mushrooms need uncut trees to grow and appear."
    const sq = at(T.x, T.y);
    // A mushroom coming where the tree was cut: lost, not counted down.
    let felled = world();
    felled = { ...felled, mushroomIn: felled.mushroomIn.map((n, i) => (i === sq ? 3 : n)) };
    const lost = nightOfMushrooms(felled, false, { s: 1 });
    expect(lost.state.mushroomIn[sq]).toBe(-1);
    // One due tonight where the tree was cut: it does not come up.
    let due = world();
    due = { ...due, mushroomIn: due.mushroomIn.map((n, i) => (i === sq ? 1 : n)) };
    const none = nightOfMushrooms(due, false, { s: 1 });
    expect(none.came).toBe(0);
    expect(none.state.mushrooms[sq]).toBe(false);
    // One standing where its tree is gone (burnt): it goes too.
    let bare = world();
    bare = { ...bare, mushrooms: bare.mushrooms.map((m, i) => i === sq || m) };
    expect(nightOfMushrooms(bare, false, { s: 1 }).state.mushrooms[sq]).toBe(false);
    // With the tree standing, it counts down and comes up as before.
    let standing = world({ features: [{ ...T, feature: TREE }] });
    standing = {
      ...standing,
      mushroomIn: standing.mushroomIn.map((n, i) => (i === sq ? 1 : n)),
    };
    expect(nightOfMushrooms(standing, false, { s: 1 }).came).toBe(1);
  });

  it('come up through End shift, which reports them', () => {
    let w = world({
      features: [{ ...T, feature: TREE }],
      inventory: { wood: 99, apple: 99 },
    });
    w = { ...w, mushroomIn: w.mushroomIn.map((n, i) => (i === at(T.x, T.y) ? 1 : n)) };
    const out = frontierAct(w, { kind: 'endShift' });
    expect(out.report?.mushroomsCame).toBe(1);
    expect(out.state.mushrooms[at(T.x, T.y)]).toBe(true);
  });

  it('are reported only where a camp sees them', () => {
    // Owner, after the 0.22.0 build: "Only tell me about a mushroom if it is in range of a camp."
    const far = { x: 1, y: 1 };
    expect(coverLevelAt(world().camps, far.x, far.y)).toBe(0);
    let w = world({
      features: [
        { ...T, feature: TREE },
        { ...far, feature: TREE },
      ],
      inventory: { wood: 99, apple: 99 },
    });
    w = {
      ...w,
      mushroomIn: w.mushroomIn.map((n, i) =>
        i === at(T.x, T.y) || i === at(far.x, far.y) ? 1 : n,
      ),
    };
    const night = nightOfMushrooms(w, false, { s: 1 });
    expect(night.came).toBe(2);
    expect(night.seen).toBe(1);
    const out = frontierAct(w, { kind: 'endShift' });
    expect(out.report?.mushroomsCame).toBe(1);
    expect(out.state.mushrooms[at(far.x, far.y)]).toBe(true); // it came up all the same
  });

  it('sell at the market, and mushroom contracts are offered once the world has enough', () => {
    expect(FRONTIER_MARKET.sellPrices.some((l) => l.item === 'mushroom')).toBe(true);
    const contracts = FRONTIER_CONTRACTS.filter((c) => c.asks.some((a) => a.item === 'mushroom'));
    expect(contracts.length).toBeGreaterThan(0);
    const t1 = contracts.find((c) => c.tier === 1);
    if (t1 === undefined) throw new Error('a tier-1 mushroom contract');
    const none = world();
    expect(worldCanFill(worldStock(none), t1.asks)).toBe(false);
    // Standing and coming both count.
    const some = {
      ...none,
      mushrooms: none.mushrooms.map((_, i) => i < 5),
      mushroomIn: none.mushroomIn.map((_, i) => (i >= 5 && i < 10 ? 3 : -1)),
    };
    expect(worldStock(some).get('mushroom')).toBe(10);
  });
});
