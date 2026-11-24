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
import { AT, MID, SIDE, world } from './frontierHelpers';

/** `state` with a dragon on (x, y). */
function withDragon(state: FrontierState, x: number, y: number): FrontierState {
  return {
    ...state,
    hazards: { ...state.hazards, dragons: [{ id: 1, x, y, dx: 1, dy: 0 }], nextDragonId: 2 },
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

describe('a dragon in the day (owner: "Let\'s make the dragon fly every time you mine")', () => {
  it('flies a square along its heading each time a block is mined, and not otherwise', () => {
    const w = {
      ...withDragon(world({ features: [{ x: AT.x, y: AT.y + 1, feature: GRASS }] }), 3, 3),
    };
    const mined = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y });
    expect(mined.tap?.kind).toBe('mined');
    expect(mined.state.hazards.dragons[0]).toMatchObject({
      x: 3 + FRONTIER_DRAGON.stepsPerMine,
      y: 3,
    });
    // Cutting grass is not mining: the dragon stays.
    const cut = frontierAct(mined.state, { kind: 'tap', x: AT.x, y: AT.y + 1 });
    expect(cut.tap?.kind).toBe('harvested');
    expect(cut.state.hazards.dragons[0]).toMatchObject({
      x: 3 + FRONTIER_DRAGON.stepsPerMine,
      y: 3,
    });
  });

  it('bounces off the edge: its heading turns back', () => {
    const w = withDragon(world(), SIDE - 1, 3);
    const mined = frontierAct(w, { kind: 'tap', x: AT.x, y: AT.y });
    expect(mined.state.hazards.dragons[0]).toMatchObject({ x: SIDE - 2, y: 3, dx: -1, dy: 0 });
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
    }
  });
});
