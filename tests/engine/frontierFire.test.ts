// Hazards PR 3 (docs/plans/hazards.md, section 3): gas, blasts and fire. The
// owner: "Pockets of gas can explode starting at level 4. This blows away
// blocks and starts fires on combustable squares. You need to put out each
// fire with a click."
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../src/data';
import { FRONTIER_GAS } from '../../src/data/frontier';
import { frontierAct, previewTap } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { burnFires, stripCamp, withFires } from '../../src/engine/frontier/fire';
import { GRASS, NO_FEATURE, TREE } from '../../src/engine/frontier/state';
import type { Feature } from '../../src/engine/frontier/state';
import { depthAt } from '../../src/engine/heightmap';
import { createRng, nextFloat } from '../../src/engine/rng';
import { gasAt } from '../../src/engine/state';
import { buildState } from './helpers';
import { MID, SIDE, world } from './frontierHelpers';

/** The pit's middle square: north of the camp, inside its ring. */
const PX = MID;
const PY = MID - 6;

/** A generator whose first roll is below `chance` (`below`), or not. */
function rngWhose(below: boolean, chance: number): { s: number } {
  for (let seed = 1; ; seed += 1) {
    const probe = createRng(seed);
    if (nextFloat(probe) < chance === below) return createRng(seed);
  }
}

/**
 * A world whose cube is all dirt, 7 layers deep, with a pit north of the
 * camp: the 5 x 5 round (PX, PY) dug `floor` deep, a gas pocket in the layer
 * under the middle, and rings 1 shallower out to the surface. `features` grow on given squares.
 */
function gasWorld(
  explodes: boolean,
  features: { x: number; y: number; feature: Feature }[] = [],
  floor = 3,
): FrontierState {
  const depthOf = (x: number, y: number): number => {
    const ring = Math.max(Math.abs(x - PX), Math.abs(y - PY));
    return Math.max(0, floor - Math.max(0, ring - 2));
  };
  const gasCell: Vec3 = { x: PX, y: PY, z: floor + 1 };
  const layers: string[][] = [];
  for (let z = 0; z < 7; z += 1) {
    const rows: string[] = [];
    for (let y = 0; y < SIDE; y += 1) {
      let row = '';
      for (let x = 0; x < SIDE; x += 1) {
        const open = z < depthOf(x, y) || (x === gasCell.x && y === gasCell.y && z === gasCell.z);
        row += open ? '.' : 'd';
      }
      rows.push(row);
    }
    layers.push(rows);
  }
  const base = world({ inventory: { wood: 50, grass: 50 }, features });
  return {
    ...base,
    cube: buildState({ layers, gas: [{ pos: gasCell, units: 4 }] }),
    rng: rngWhose(explodes, FRONTIER_GAS.explodeChance),
  };
}

const burning = (state: FrontierState): string[] =>
  state.hazards.fires.flatMap((f, i) => (f ? [`${i % SIDE},${Math.floor(i / SIDE)}`] : []));

describe('gas (hazards plan, section 3)', () => {
  it('explodes, from depth 4: blows the top block off the squares round it, for nothing', () => {
    expect(FRONTIER_GAS.fromDepth).toBe(4);
    const w = gasWorld(true);
    const out = frontierAct(w, { kind: 'tap', x: PX, y: PY });
    expect(out.done).toBe(true);
    expect(out.tap?.gas).toBe('exploded');
    // The mined square went down 1, as every mine does.
    expect(depthAt(out.state.cube, PX, PY)).toBe(4);
    // The 3 x 3 round it was at depth 3, on a 5 x 5 floor: each may go to 4.
    expect(out.tap?.blown.length).toBe(8);
    for (const sq of out.tap?.blown ?? []) {
      expect(depthAt(out.state.cube, sq.x, sq.y)).toBe(4);
    }
    // Only the mined block's yield was gained: the blown blocks gave nothing.
    const total = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
    const gained = (out.tap?.gain ?? []).reduce((a, g) => a + g.count, 0);
    expect(total(out.state.inventory)).toBe(total(w.inventory) + gained);
    // The gas is gone from the cube.
    expect(gasAt(out.state.cube, { x: PX, y: PY, z: 3 })).toBe(0);
    // The level rule holds everywhere.
    for (let y = 0; y < SIDE - 1; y += 1) {
      for (let x = 0; x < SIDE - 1; x += 1) {
        const d = depthAt(out.state.cube, x, y);
        expect(Math.abs(d - depthAt(out.state.cube, x + 1, y))).toBeLessThanOrEqual(1);
        expect(Math.abs(d - depthAt(out.state.cube, x, y + 1))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('sometimes vents instead, harmlessly', () => {
    const w = gasWorld(false);
    const out = frontierAct(w, { kind: 'tap', x: PX, y: PY });
    expect(out.tap?.gas).toBe('vented');
    expect(out.tap?.blown).toEqual([]);
    expect(burning(out.state)).toEqual([]);
    expect(depthAt(out.state.cube, PX + 1, PY)).toBe(3);
  });

  it('does not explode higher up: a pocket opened above depth 4 just collapses', () => {
    const w = gasWorld(true, [], 2);
    const out = frontierAct(w, { kind: 'tap', x: PX, y: PY });
    expect(out.tap?.gas).toBe(null);
    expect(out.tap?.blown).toEqual([]);
  });

  it('sets fire to what can burn within FRONTIER_GAS.fireRadius, and nothing further', () => {
    const r = FRONTIER_GAS.fireRadius;
    const w = gasWorld(true, [
      { x: PX + r, y: PY, feature: GRASS },
      { x: PX - r - 1, y: PY, feature: TREE },
    ]);
    const out = frontierAct(w, { kind: 'tap', x: PX, y: PY });
    expect(burning(out.state)).toEqual([`${PX + r},${PY}`]);
    expect(out.tap?.fires).toEqual([{ x: PX + r, y: PY }]);
  });
});

describe('fire (hazards plan, section 3)', () => {
  it('is put out by a tap, for 1 tap, before anything else on the square', () => {
    const w = withFires(world({ features: [{ x: MID + 4, y: MID, feature: GRASS }] }), [
      { x: MID + 4, y: MID },
    ]);
    expect(previewTap(w, MID + 4, MID).kind).toBe('fire');
    const out = frontierAct(w, { kind: 'tap', x: MID + 4, y: MID });
    expect(out.done).toBe(true);
    expect(out.tap?.kind).toBe('fire');
    expect(out.state.tapsLeft).toBe(w.tapsLeft - 1);
    expect(burning(out.state)).toEqual([]);
    // The grass is still there, and was not cut.
    expect(out.state.features[MID + 4 + SIDE * MID]).toBe(GRASS);
    expect(out.state.inventory.get('grass') ?? 0).toBe(w.inventory.get('grass') ?? 0);
  });

  it('left burning, spreads to what can burn beside it, then burns its square out for good', () => {
    // A row of grass; the middle one burns.
    const row = [MID + 3, MID + 4, MID + 5].map((x) => ({ x, y: MID, feature: GRASS as Feature }));
    const w = withFires(world({ features: row }), [{ x: MID + 4, y: MID }]);
    const night = burnFires(w);
    expect(night.burned).toBe(1);
    expect(night.spread).toBe(2);
    expect(burning(night.state)).toEqual([`${MID + 3},${MID}`, `${MID + 5},${MID}`]);
    expect(night.state.features[MID + 4 + SIDE * MID]).toBe(NO_FEATURE);
    // Nothing grows back where it burned: no stump, no waiting grass.
    expect(night.state.stumps[MID + 4 + SIDE * MID]).toBe(NO_FEATURE);
    expect(night.state.grassIn[MID + 4 + SIDE * MID]).toBe(-1);
  });

  it('at End shift: the report says what burned', () => {
    const w = withFires(
      world({ features: [{ x: MID + 4, y: MID, feature: TREE }], inventory: { wood: 9 } }),
      [{ x: MID + 4, y: MID }],
    );
    const out = frontierAct(w, { kind: 'endShift' });
    expect(out.report?.burned).toBe(1);
    expect(out.state.features[MID + 4 + SIDE * MID]).toBe(NO_FEATURE);
    expect(burning(out.state)).toEqual([]);
  });

  it('on a camp, costs it one upgrade a night: the lantern, the pen, the smelter, then a level', () => {
    const base = world({ inventory: { wood: 9 } });
    const camp = base.camps[0];
    if (camp === undefined) throw new Error('the test world has a camp');
    const fitted = { ...camp, level: 3, lantern: true, pen: true, penned: 2, smelter: true };
    const w = withFires({ ...base, camps: [fitted] }, [
      { x: MID, y: MID },
      { x: MID + 1, y: MID },
    ]);
    const night = burnFires(w);
    expect(night.campUpgradesLost).toBe(1); // one a night, however many squares burn
    expect(night.state.camps[0]?.lantern).toBe(false);
    expect(night.state.camps[0]?.pen).toBe(true);
  });

  it('strips upgrades in order, and never takes a deep camp below its level', () => {
    const base = world().camps[0];
    if (base === undefined) throw new Error('the test world has a camp');
    const fitted = { ...base, level: 3, lantern: true, pen: true, penned: 2, smelter: true };
    const all = stripCamp(fitted, 99);
    expect(all.camp).toMatchObject({
      level: 1,
      lantern: false,
      pen: false,
      penned: 0,
      smelter: false,
    });
    expect(all.taken).toBe(5);
    expect(all.animalsLost).toBe(2);
    const deep = stripCamp({ ...fitted, deep: true }, 99);
    expect(deep.camp.level).toBe(3);
    expect(deep.taken).toBe(3);
    expect(stripCamp(fitted, 2).camp).toMatchObject({ lantern: false, pen: false, smelter: true });
  });
});
