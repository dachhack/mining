// Work camps (owner, after the 0.20.0 build): the lumberjack camp, the farm
// camp and the hermit camp, and their hired workers; and quicker saplings.
import { describe, expect, it } from 'vitest';
import {
  FRONTIER_SAPLINGS,
  FRONTIER_SHIFT,
  FRONTIER_SURFACE,
  FRONTIER_WORK_CAMPS,
} from '../../src/data/frontier';
import {
  buildRefusal,
  campReach,
  frontierAct,
  hireRefusal,
  inReach,
  nightOfWorkers,
  placeRefusal,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { APPLE_TREE, MAPLE_TREE, TREE } from '../../src/engine/frontier/state';
import { MID, SIDE, world } from './frontierHelpers';

/** Do `action` and expect it to be done. */
function act(state: FrontierState, action: Parameters<typeof frontierAct>[1]): FrontierState {
  const out = frontierAct(state, action);
  expect(out.done, `${action.kind}: ${out.refusal ?? ''}`).toBe(true);
  return out.state;
}

const RICH = { wood: 200, stone: 100, clay: 100, coin: 2000, syrup: 50, apple: 50 };
const SAW = { x: MID + 3, y: MID };
/** A lumberjack camp's top-left square, touching the saw house. */
const LUMBER = { x: MID + 4, y: MID };
const at = (x: number, y: number): number => x + SIDE * y;

/** The `k`th building of `state`; throws if there is none. */
function camp(state: FrontierState, k: number): FrontierState['buildings'][number] {
  const b = state.buildings[k];
  if (b === undefined) throw new Error(`no building ${k}`);
  return b;
}

describe('saplings grow quicker', () => {
  it('a tree in 5 shifts, an apple or maple tree in 8', () => {
    expect(FRONTIER_SAPLINGS.saplingGrowShifts).toBe(5);
    expect(FRONTIER_SAPLINGS.appleSaplingGrowShifts).toBe(8);
    expect(FRONTIER_SAPLINGS.mapleSaplingGrowShifts).toBe(8);
  });
});

describe('work camps', () => {
  it('are 2 x 2: the whole of it must be free, and a camp cannot stand on one', () => {
    const w = world({ inventory: RICH });
    const farm = act(w, { kind: 'build', building: 'farmCamp', x: MID - 5, y: MID });
    expect(farm.buildings).toEqual([
      { kind: 'farmCamp', x: MID - 5, y: MID, workers: 0, horses: 0 },
    ]);
    // Any square of it is taken.
    expect(buildRefusal(farm, 'sawHouse', MID - 4, MID + 1)).toBe('occupied');
    expect(buildRefusal(farm, 'farmCamp', MID - 6, MID - 1)).toBe('occupied');
    expect(placeRefusal({ ...farm, inventory: new Map([['wood', 99]]) }, MID - 6, MID + 1)).toBe(
      'occupied',
    );
    // A tap on any square of it mines nothing.
    expect(frontierAct(farm, { kind: 'tap', x: MID - 4, y: MID + 1 }).refusal).toBe('building');
  });

  it('a lumberjack camp must touch a saw house', () => {
    const w = world({ inventory: RICH });
    expect(buildRefusal(w, 'lumberCamp', LUMBER.x, LUMBER.y)).toBe('sawHouse');
    const saw = act(w, { kind: 'build', building: 'sawHouse', ...SAW });
    expect(buildRefusal(saw, 'lumberCamp', LUMBER.x, LUMBER.y)).toBe(null);
    expect(buildRefusal(saw, 'lumberCamp', LUMBER.x + 2, LUMBER.y)).toBe('sawHouse');
  });

  it('hire workers for coins and a tap; each adds 3 to the reach; past 3 lumberjacks each needs a horse', () => {
    let w = act(world({ inventory: RICH }), { kind: 'build', building: 'sawHouse', ...SAW });
    w = act(w, { kind: 'build', building: 'lumberCamp', ...LUMBER });
    const def = FRONTIER_WORK_CAMPS.lumberCamp;
    for (let n = 1; n <= 3; n += 1) {
      const before = w;
      w = act(w, { kind: 'hire', ...LUMBER, who: 'worker' });
      expect(w.tapsLeft).toBe(before.tapsLeft - 1);
      expect(w.inventory.get('coin')).toBe((before.inventory.get('coin') ?? 0) - def.hire);
      expect(campReach(camp(w, 1))).toBe(3 * n);
    }
    expect(hireRefusal(w, LUMBER.x, LUMBER.y, 'worker')).toBe('horse');
    w = act(w, { kind: 'hire', ...LUMBER, who: 'horse' });
    expect(hireRefusal(w, LUMBER.x, LUMBER.y, 'horse')).toBe('full'); // one per lumberjack past 3
    w = act(w, { kind: 'hire', ...LUMBER, who: 'worker' });
    expect(campReach(camp(w, 1))).toBe(12);
    // Farm and hermit camps have no horses, and hold 3.
    const farm = act(
      act(world({ inventory: RICH }), { kind: 'build', building: 'farmCamp', x: MID - 5, y: MID }),
      {
        kind: 'hire',
        x: MID - 5,
        y: MID,
        who: 'worker',
      },
    );
    expect(hireRefusal(farm, MID - 5, MID, 'horse')).toBe('noHorses');
    expect(hireRefusal(world(), MID, MID, 'worker')).toBe('none');
  });

  it('lumberjacks fell one plain tree each a night, nearest first, leaving stumps', () => {
    const trees = [
      { x: LUMBER.x + 3, y: LUMBER.y, feature: TREE },
      { x: LUMBER.x, y: LUMBER.y + 3, feature: TREE },
      { x: LUMBER.x + 2, y: LUMBER.y + 2, feature: APPLE_TREE, apples: 3 },
    ] as const;
    let w = act(world({ inventory: RICH, features: [...trees] }), {
      kind: 'build',
      building: 'sawHouse',
      ...SAW,
    });
    w = act(w, { kind: 'build', building: 'lumberCamp', ...LUMBER });
    w = act(w, { kind: 'hire', ...LUMBER, who: 'worker' });
    const night = nightOfWorkers({ ...w, shift: 1 }, { s: 1 });
    expect(night.trees).toBe(1);
    // A felled tree's wood, with the saw house beside it.
    expect(night.wood).toBe(FRONTIER_SURFACE.woodPerTree + 1);
    expect(night.state.stumps.filter((s) => s === TREE)).toHaveLength(1);
    // Never an apple tree.
    expect(night.state.features[at(LUMBER.x + 2, LUMBER.y + 2)]).toBe(APPLE_TREE);
  });

  it('farmers harvest every ripe crop in reach; gatherers every apple, sap and mushroom in reach', () => {
    const F = { x: MID - 5, y: MID };
    let w = act(world({ inventory: RICH }), { kind: 'build', building: 'farmCamp', ...F });
    w = act(w, { kind: 'hire', ...F, who: 'worker' });
    const near = [at(F.x - 1, F.y), at(F.x, F.y + 2), at(F.x + 1, F.y - 2)];
    const far = at(F.x - 6, F.y);
    const sown = {
      ...w,
      crops: w.crops.map((k, i) => (near.includes(i) || i === far ? 3 : k)),
      cropIn: w.cropIn.map((k, i) => (near.includes(i) || i === far ? 0 : k)),
    };
    const night = nightOfWorkers({ ...sown, shift: 1 }, { s: 1 });
    expect(night.crops).toBe(3);
    expect(night.state.crops[far]).toBe(3); // out of reach: 3 squares for 1 farmer
    expect(night.state.inventory.get('carrot')).toBe(9);

    const H = { x: MID - 5, y: MID - 4 };
    let h = act(
      world({
        inventory: RICH,
        features: [
          { x: H.x - 1, y: H.y, feature: APPLE_TREE, apples: 3 },
          { x: H.x + 2, y: H.y, feature: MAPLE_TREE, apples: 2 },
          { x: H.x, y: H.y - 1, feature: TREE },
        ],
      }),
      { kind: 'build', building: 'hermitCamp', ...H },
    );
    h = act(h, { kind: 'hire', ...H, who: 'worker' });
    h = { ...h, mushrooms: h.mushrooms.map((m, i) => m || i === at(H.x, H.y - 1)) };
    const picked = nightOfWorkers({ ...h, shift: 1 }, { s: 1 });
    expect(picked.gathered).toBe(3 + 2 + 1);
    expect(picked.state.inventory.get('apple')).toBe(RICH.apple + 3);
    expect(picked.state.inventory.get('sap')).toBe(2);
    expect(picked.state.inventory.get('mushroom')).toBe(1);
    expect(picked.state.apples[at(H.x - 1, H.y)]).toBe(0);
    expect(picked.state.regrowIn[at(H.x - 1, H.y)]).toBe(FRONTIER_SHIFT.appleRegrowShifts);
  });

  it('eat when the crew eats, lumberjacks and horses syrup too, and skip the night if not fed', () => {
    let w = act(
      world({ inventory: RICH, features: [{ x: LUMBER.x + 3, y: LUMBER.y, feature: TREE }] }),
      {
        kind: 'build',
        building: 'sawHouse',
        ...SAW,
      },
    );
    w = act(w, { kind: 'build', building: 'lumberCamp', ...LUMBER });
    w = act(w, { kind: 'hire', ...LUMBER, who: 'worker' });
    const fed = nightOfWorkers({ ...w, shift: 2 }, { s: 1 });
    expect(fed.trees).toBe(1);
    expect(fed.state.inventory.get('syrup')).toBe(RICH.syrup - 1);
    expect(fed.state.inventory.get('apple')).toBe(RICH.apple - 1);
    const noSyrup = {
      ...w,
      shift: 2,
      inventory: new Map([...w.inventory].filter(([k]) => k !== 'syrup')),
    };
    const hungry = nightOfWorkers(noSyrup, { s: 1 });
    expect(hungry.idle).toBe(1);
    expect(hungry.trees).toBe(0);
    expect(hungry.state.inventory.get('apple')).toBe(RICH.apple); // nothing paid
    // On a night the crew does not eat, no upkeep, and they work.
    expect(nightOfWorkers({ ...noSyrup, shift: 1 }, { s: 1 }).trees).toBe(1);
  });

  it('only work within reach', () => {
    let w = act(world({ inventory: RICH }), {
      kind: 'build',
      building: 'farmCamp',
      x: MID - 5,
      y: MID,
    });
    expect(inReach(camp(w, 0), MID - 6, MID)).toBe(false); // no workers: no reach
    w = act(w, { kind: 'hire', x: MID - 5, y: MID, who: 'worker' });
    expect(inReach(camp(w, 0), MID - 6, MID)).toBe(true);
  });
});
