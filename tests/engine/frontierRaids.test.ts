// Hazards PR 5 (docs/plans/hazards.md, section 5): marauders and camp
// defenses. The owner: "Marauders can come and steal things from your camps
// and remove their upgrades and put them back to basic. If the camp has
// defenses though, they can be turned away. The strength of the marauders
// depends on how far you have dug. The damage they do depends on what level
// of defense your targeted camp has."
import { describe, expect, it } from 'vitest';
import { FRONTIER_DEFENSE, FRONTIER_RAID } from '../../src/data/frontier';
import { defenseRefusal, frontierAct, nightOfRaids, raidStrength } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { createRng, nextFloat } from '../../src/engine/rng';
import { SIDE, world } from './frontierHelpers';
import { buildState } from './helpers';

/** A generator whose first roll brings marauders. */
function raidRng(): { s: number } {
  for (let seed = 1; ; seed += 1) {
    if (nextFloat(createRng(seed)) < FRONTIER_RAID.chance) return createRng(seed);
  }
}

/** `state` with its one camp changed by `change`. */
function campWith(
  state: FrontierState,
  change: Partial<FrontierState['camps'][number]>,
): FrontierState {
  return { ...state, camps: state.camps.map((c) => ({ ...c, ...change })) };
}

describe('defenses (hazards plan, section 5)', () => {
  it('are built a level at a time from the data, for 1 tap each', () => {
    const w = campWith(world({ inventory: { wood: 100, stone: 100, ironIngot: 20 } }), {
      level: 2,
    });
    expect(defenseRefusal(campWith(w, { level: 1 }), 1)).toBe('level');
    let state = w;
    FRONTIER_DEFENSE.forEach((level, k) => {
      const out = frontierAct(state, { kind: 'buildDefense', id: 1 });
      expect(out.done, level.name).toBe(true);
      expect(out.state.camps[0]?.defense).toBe(k + 1);
      expect(out.state.tapsLeft).toBe(state.tapsLeft - 1);
      for (const c of level.cost) {
        expect(out.state.inventory.get(c.item) ?? 0).toBe(
          (state.inventory.get(c.item) ?? 0) - c.count,
        );
      }
      state = out.state;
    });
    expect(defenseRefusal(state, 1)).toBe('max');
    expect(defenseRefusal(campWith(world(), { level: 2 }), 1)).toBe('cost');
    expect(defenseRefusal(w, 9)).toBe('none');
  });
});

describe('marauders (hazards plan, section 5)', () => {
  it('come as strong as the deepest square dug says', () => {
    expect(raidStrength(world())).toBe(1);
    // The test cube is 3 layers deep: a square dug 2 deep is still strength 1.
    const dug = world({
      special: [
        { x: 2, y: 2, z: 0, char: '.' },
        { x: 2, y: 2, z: 1, char: '.' },
      ],
    });
    expect(raidStrength(dug)).toBe(1);
    const steps = FRONTIER_RAID.strengthFromDepth;
    expect(steps.map((s) => s.strength)).toEqual([1, 2, 3, 4]);
  });

  it(`do not come before shift ${FRONTIER_RAID.fromShift}`, () => {
    const w = { ...world(), shift: FRONTIER_RAID.fromShift - 1 };
    expect(nightOfRaids(w, raidRng()).raid).toBe(null);
  });

  it('are turned away by a camp with defenses at least their strength', () => {
    const w = campWith({ ...world({ inventory: { wood: 50 } }), shift: 30 }, { defense: 1 });
    const out = nightOfRaids(w, raidRng());
    expect(out.raid?.turnedAway).toBe(true);
    expect(out.state).toBe(w);
  });

  it('otherwise steal a share of each stack (never coins) and tear down upgrades', () => {
    const w = campWith(
      { ...world({ inventory: { wood: 50, stone: 9, coin: 500, pump: 30 } }), shift: 30 },
      { level: 3, smelter: true, lantern: true, pen: true, penned: 2 },
    );
    const out = nightOfRaids(w, raidRng());
    const raid = out.raid;
    if (raid === null) throw new Error('marauders came');
    expect(raid.turnedAway).toBe(false);
    expect(raid.strength).toBe(1);
    // Shortfall 1: 10% of each stack, rounded down; coins are never taken.
    expect(raid.stolen).toEqual([{ item: 'wood', count: 5 }]);
    expect(out.state.inventory.get('wood')).toBe(45);
    expect(out.state.inventory.get('stone')).toBe(9);
    expect(out.state.inventory.get('coin')).toBe(500);
    // Nor tools: a pump stays, however many are held.
    expect(out.state.inventory.get('pump')).toBe(30);
    // Two upgrades for a shortfall of 1: the lantern, then the pen and its animals.
    expect(raid.upgradesLost).toBe(FRONTIER_RAID.upgradesPerShortfall);
    expect(out.state.camps[0]).toMatchObject({
      lantern: false,
      pen: false,
      penned: 0,
      smelter: true,
      level: 3,
    });
    expect(raid.animalsTaken).toBe(2);
  });

  it('take more for a bigger shortfall, and can put a camp back to basic', () => {
    // A cube 9 layers deep with one shaft dug to depth 8: strength 3.
    const layers: string[][] = [];
    for (let z = 0; z < 9; z += 1) {
      const rows: string[] = [];
      for (let y = 0; y < SIDE; y += 1) {
        let row = '';
        for (let x = 0; x < SIDE; x += 1) row += x === 2 && y === 2 && z < 8 ? '.' : 'd';
        rows.push(row);
      }
      layers.push(rows);
    }
    const base = campWith(
      { ...world({ inventory: { wood: 50 } }), shift: 30 },
      { level: 4, smelter: true, lantern: true, pen: true, penned: 1 },
    );
    const deep = { ...base, cube: buildState({ layers }) };
    expect(raidStrength(deep)).toBe(3);
    const out = nightOfRaids(deep, raidRng());
    // Shortfall 3: 30% of each stack; 6 upgrades, which is all of them.
    expect(out.raid?.stolen).toEqual([{ item: 'wood', count: 15 }]);
    expect(out.state.camps[0]).toMatchObject({
      level: 1,
      smelter: false,
      lantern: false,
      pen: false,
      penned: 0,
    });
    // A palisade and a wall make the shortfall 1.
    const walled = nightOfRaids(campWith(deep, { defense: 2 }), raidRng());
    expect(walled.raid?.stolen).toEqual([{ item: 'wood', count: 5 }]);
    expect(walled.state.camps[0]?.level).toBe(4);
  });

  it('are part of End shift, and the report says what they did', () => {
    let state = {
      ...world({ inventory: { wood: 200, apple: 50 } }),
      shift: FRONTIER_RAID.fromShift,
    };
    let seen = false;
    for (let night = 0; night < 80 && !seen; night += 1) {
      const out = frontierAct(state, { kind: 'endShift' });
      if (out.report?.raid !== null && out.report?.raid !== undefined) {
        seen = true;
        expect(out.report.raid.campId).toBe(1);
      }
      state = { ...out.state, health: 10, marketOpen: false };
    }
    expect(seen).toBe(true);
  });
});
