// Hazards PR 4 (docs/plans/hazards.md, section 4): dragons and the sword.
// The owner: "Wandering dragons can eat your sheep and apples and set fire to
// things. They don't go away until you get a sword and drive them away."
import { describe, expect, it } from 'vitest';
import { FRONTIER_DRAGON, FRONTIER_MARKET, FRONTIER_RECIPES } from '../../src/data/frontier';
import { frontierAct, previewTap } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { nightOfDragons } from '../../src/engine/frontier/dragons';
import { APPLE_TREE, GRASS } from '../../src/engine/frontier/state';
import type { Feature, FrontierAnimal } from '../../src/engine/frontier/state';
import { createRng } from '../../src/engine/rng';
import { MID, SIDE, world } from './frontierHelpers';

/** `state` with a dragon on (x, y). */
function withDragon(state: FrontierState, x: number, y: number): FrontierState {
  return {
    ...state,
    hazards: {
      ...state.hazards,
      dragons: [{ id: 1, x, y, dx: 1, dy: 0, restTaps: 1 }],
      nextDragonId: 2,
    },
  };
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

describe('a dragon at night (hazards plan, section 4)', () => {
  it('flies FRONTIER_DRAGON.steps squares in a straight line, so it is seen to move', () => {
    // Owner, on the hazards build: "Dragon doesn't seem to move."
    const lands = new Set<string>();
    for (let seed = 1; seed <= 100; seed += 1) {
      const w = withDragon(world(), MID, MID);
      const night = nightOfDragons(w, createRng(seed));
      const d = night.state.hazards.dragons[0];
      if (d === undefined) throw new Error('the dragon is still there');
      const dx = d.x - MID;
      const dy = d.y - MID;
      // Away from the edge it always lands its full flight away, in a straight line.
      expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(FRONTIER_DRAGON.steps);
      expect(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)).toBe(true);
      lands.add(`${dx},${dy}`);
    }
    expect(lands.size).toBe(8); // all 8 directions come up
  });

  it('bounces off the edge of the map', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const night = nightOfDragons(withDragon(world(), 0, 0), createRng(seed));
      const d = night.state.hazards.dragons[0];
      if (d === undefined) throw new Error('the dragon is still there');
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(Math.max(d.x, d.y)).toBeLessThanOrEqual(FRONTIER_DRAGON.steps);
    }
  });

  it('eats one animal beside where it lands, the lowest id first', () => {
    // Animals on every square round the start, so it always lands by some.
    const animals: FrontierAnimal[] = [];
    let id = 1;
    for (let y = MID - 6; y <= MID - 2; y += 1) {
      for (let x = MID - 6; x <= MID + 6; x += 1) animals.push({ id: id++, x, y });
    }
    for (let seed = 1; seed <= 50; seed += 1) {
      const w = withDragon(world({ animals }), MID, MID - 4);
      const night = nightOfDragons(w, createRng(seed));
      const d = night.state.hazards.dragons[0];
      if (d === undefined) throw new Error('the dragon is still there');
      const eaten = animals.filter((a) => !night.state.animals.some((b) => b.id === a.id));
      const reachable = animals.filter((a) => near(a, d));
      expect(night.animalsEaten).toBe(reachable.length > 0 ? 1 : 0);
      if (reachable.length > 0) {
        expect(eaten).toEqual([reachable.sort((a, b) => a.id - b.id)[0]]);
      }
    }
  });

  it("eats one from a pen when it lands on a camp's ground with no animal beside it", () => {
    const base = world();
    const camp = base.camps[0];
    if (camp === undefined) throw new Error('the test world has a camp');
    let ateFromPen = false;
    for (let seed = 1; seed <= 200 && !ateFromPen; seed += 1) {
      // A flight's length west of the camp: flying east, it lands on it.
      const w = withDragon(
        { ...base, camps: [{ ...camp, level: 2, pen: true, penned: 3, breedIn: 2 }] },
        MID - FRONTIER_DRAGON.steps,
        MID,
      );
      const night = nightOfDragons(w, createRng(seed));
      const d = night.state.hazards.dragons[0];
      if (d === undefined) throw new Error('the dragon is still there');
      const onCamp = Math.abs(d.x - MID) <= 1 && Math.abs(d.y - MID) <= 1;
      expect(night.state.camps[0]?.penned).toBe(onCamp ? 2 : 3);
      if (onCamp) ateFromPen = true;
    }
    expect(ateFromPen).toBe(true);
  });

  it('eats every apple on the apple trees round where it lands; they come back as if picked', () => {
    const features: { x: number; y: number; feature: Feature; apples: number }[] = [];
    for (let y = MID - 8; y <= MID - 2; y += 1) {
      for (let x = MID - 6; x <= MID + 6; x += 1) {
        features.push({ x, y, feature: APPLE_TREE, apples: 3 });
      }
    }
    let ate = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const w = withDragon(world({ features }), MID, MID - 5);
      const night = nightOfDragons(w, createRng(seed));
      const d = night.state.hazards.dragons[0];
      if (d === undefined) throw new Error('the dragon is still there');
      let expected = 0;
      for (const f of features) {
        const i = f.x + SIDE * f.y;
        expect(night.state.apples[i]).toBe(near(f, d) ? 0 : 3);
        if (near(f, d)) {
          expect(night.state.regrowIn[i]).toBeGreaterThan(0);
          expected += 3;
        }
      }
      expect(night.applesEaten).toBe(expected);
      ate += night.applesEaten;
    }
    expect(ate).toBeGreaterThan(0);
  });

  it('sometimes sets fire to something that can burn beside it, never further', () => {
    const w = withDragon(world({ everywhere: GRASS }), MID + 6, MID + 6);
    let set = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const night = nightOfDragons(w, createRng(seed));
      const d = night.state.hazards.dragons[0];
      if (d === undefined) throw new Error('the dragon is still there');
      for (const f of night.fires) expect(near(f, d)).toBe(true);
      set += night.fires.length;
    }
    // About FRONTIER_DRAGON.fireChance of the nights.
    expect(set / 200).toBeGreaterThan(FRONTIER_DRAGON.fireChance - 0.1);
    expect(set / 200).toBeLessThan(FRONTIER_DRAGON.fireChance + 0.1);
  });

  it(`comes only from shift ${FRONTIER_DRAGON.fromShift}, at the edge, at most ${FRONTIER_DRAGON.most} at a time`, () => {
    let came = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const early = nightOfDragons(
        { ...world(), shift: FRONTIER_DRAGON.fromShift - 1 },
        createRng(seed),
      );
      expect(early.came).toBe(false);
      const late = nightOfDragons(
        { ...world(), shift: FRONTIER_DRAGON.fromShift },
        createRng(seed),
      );
      if (late.came) {
        came += 1;
        const d = late.state.hazards.dragons[0];
        if (d === undefined) throw new Error('it came');
        expect(d.x === 0 || d.y === 0 || d.x === SIDE - 1 || d.y === SIDE - 1).toBe(true);
      }
      const full = nightOfDragons(
        { ...withDragon(world(), MID, MID), shift: FRONTIER_DRAGON.fromShift },
        createRng(seed),
      );
      expect(full.came).toBe(false);
    }
    expect(came / 300).toBeGreaterThan(FRONTIER_DRAGON.chance - 0.05);
    expect(came / 300).toBeLessThan(FRONTIER_DRAGON.chance + 0.05);
  });

  it('is part of End shift, and the report says what it did', () => {
    const w = withDragon(world({ inventory: { wood: 9 } }), MID + 5, MID);
    const out = frontierAct(w, { kind: 'endShift' });
    expect(out.report).not.toBe(null);
    expect(out.state.hazards.dragons).toHaveLength(1);
  });
});

describe('the sword (hazards plan, section 4)', () => {
  it('drives a dragon off with one tap, and is kept', () => {
    const w = withDragon(world({ inventory: { sword: 1 } }), MID + 4, MID);
    expect(previewTap(w, MID + 4, MID).kind).toBe('dragon');
    const out = frontierAct(w, { kind: 'tap', x: MID + 4, y: MID });
    expect(out.done).toBe(true);
    expect(out.state.hazards.dragons).toEqual([]);
    expect(out.state.inventory.get('sword')).toBe(1);
    expect(out.state.tapsLeft).toBe(w.tapsLeft - 1);
  });

  it('without one, a tap on a dragon does nothing and costs nothing', () => {
    const w = withDragon(world(), MID + 4, MID);
    const out = frontierAct(w, { kind: 'tap', x: MID + 4, y: MID });
    expect(out.done).toBe(false);
    expect(out.refusal).toBe('needsSword');
    expect(out.state).toBe(w);
  });

  it('is made at a smelter from 3 iron ingots and 2 wood, or bought from a level-3 camp', () => {
    const recipe = FRONTIER_RECIPES.find((r) => r.id === 'sword');
    expect(recipe?.needsSmelter).toBe(true);
    expect(recipe?.inputs).toEqual([
      { item: 'ironIngot', count: 3 },
      { item: 'wood', count: 2 },
    ]);
    const lot = FRONTIER_MARKET.buyPrices.find((l) => l.item === 'sword');
    expect(lot).toMatchObject({ coins: 60, fromLevel: 3 });
  });
});

describe('a dragon in the day (owner, after the 0.25.0 build: "Let\'s make dragons more dangerous")', () => {
  // "They fly to trees, grass, or animals and set them on fire or eat them on
  // every 1-3 taps. 1 of 20 attacks will be your camp." Asked: the nearest
  // to it; a camp attack sets the camp on fire and takes an upgrade at once.
  /** `state` with its dragon about to attack (1 tap of rest left) on (x, y), and generator seed `s`. */
  const ready = (state: FrontierState, x: number, y: number, s = 1): FrontierState => {
    const w = withDragon(state, x, y);
    return { ...w, rng: { s } };
  };

  it('rests 1 to 3 taps, and attacks 1 time in 20 a camp', () => {
    expect(FRONTIER_DRAGON.restTaps).toEqual([1, 3]);
    expect(FRONTIER_DRAGON.campChance).toBe(1 / 20);
  });

  it('flies to the nearest grass or tree and sets it on fire, after any tap', () => {
    const grass = { x: 6, y: 3 };
    const base = world({
      inventory: { grass: 9 },
      features: [
        { ...grass, feature: GRASS },
        { x: 3, y: 12, feature: GRASS },
      ],
    });
    let burns = 0;
    let camps = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      // Making hay is a tap too: not only mining.
      const out = frontierAct(ready(base, 3, 3, seed), { kind: 'make', recipe: 'hay' });
      expect(out.done).toBe(true);
      const attack = out.attacks?.[0];
      if (attack === undefined) throw new Error('the dragon attacked');
      if (attack.kind === 'camp') {
        camps += 1;
        continue;
      }
      burns += 1;
      expect(attack).toMatchObject({ kind: 'burn', ...grass });
      expect(out.state.hazards.fires[grass.x + SIDE * grass.y]).toBe(true);
      expect(out.state.hazards.dragons[0]).toMatchObject(grass);
      const rest = out.state.hazards.dragons[0]?.restTaps ?? 0;
      expect(rest).toBeGreaterThanOrEqual(1);
      expect(rest).toBeLessThanOrEqual(3);
    }
    // About 1 in 20 goes for a camp.
    expect(camps).toBeGreaterThan(400 * 0.02);
    expect(camps).toBeLessThan(400 * 0.1);
    expect(burns + camps).toBe(400);
  });

  it('eats the nearest animal, if one is nearer than any grass or tree', () => {
    const animal: FrontierAnimal = { id: 7, x: 4, y: 4 };
    const base = {
      ...world({ inventory: { grass: 9 }, features: [{ x: 9, y: 3, feature: GRASS }] }),
      animals: [animal],
    };
    for (let seed = 1; seed <= 40; seed += 1) {
      const out = frontierAct(ready(base, 3, 3, seed), { kind: 'make', recipe: 'hay' });
      const attack = out.attacks?.[0];
      if (attack?.kind === 'camp') continue;
      expect(attack).toMatchObject({ kind: 'eat', x: 4, y: 4 });
      expect(out.state.animals).toEqual([]);
    }
  });

  it('on a camp attack sets the camp on fire and takes an upgrade at once', () => {
    const base = {
      ...world({ inventory: { grass: 9 } }),
      camps: world().camps.map((c) => ({ ...c, level: 2 })),
    };
    let seen = false;
    for (let seed = 1; seed <= 400 && !seen; seed += 1) {
      const out = frontierAct(ready(base, 3, 3, seed), { kind: 'make', recipe: 'hay' });
      const attack = out.attacks?.[0];
      if (attack?.kind !== 'camp') continue;
      seen = true;
      expect(attack).toMatchObject({ campId: 1, x: MID, y: MID, upgradesLost: 1 });
      expect(out.state.camps[0]?.level).toBe(1);
      expect(out.state.hazards.fires[MID + SIDE * MID]).toBe(true);
      expect(out.state.hazards.dragons[0]).toMatchObject({ x: MID, y: MID });
    }
    expect(seen).toBe(true);
  });

  it('counts down 1 a tap, and not on what costs no tap', () => {
    const base = world({ inventory: { grass: 9 } });
    const waiting = {
      ...withDragon(base, 3, 3),
      hazards: {
        ...withDragon(base, 3, 3).hazards,
        dragons: [{ id: 1, x: 3, y: 3, dx: 1, dy: 0, restTaps: 3 }],
      },
    };
    const once = frontierAct(waiting, { kind: 'make', recipe: 'hay' });
    expect(once.attacks ?? []).toEqual([]);
    expect(once.state.hazards.dragons[0]?.restTaps).toBe(2);
    // Dropping nothing, or a refused action: no tap, no count.
    const refused = frontierAct(once.state, { kind: 'make', recipe: 'nothing' });
    expect(refused.done).toBe(false);
  });

  it('comes in at the edge heading across the map', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const night = nightOfDragons(
        { ...world(), shift: FRONTIER_DRAGON.fromShift },
        createRng(seed),
      );
      const d = night.state.hazards.dragons[0];
      if (!night.came || d === undefined) continue;
      if (d.x === 0) expect(d.dx).toBe(1);
      if (d.x === SIDE - 1) expect(d.dx).toBe(-1);
      if (d.y === 0) expect(d.dy).toBe(1);
      if (d.y === SIDE - 1) expect(d.dy).toBe(-1);
      expect(d.dx !== 0 || d.dy !== 0).toBe(true);
      expect(d.restTaps).toBeGreaterThanOrEqual(1);
      expect(d.restTaps).toBeLessThanOrEqual(3);
    }
  });
});
