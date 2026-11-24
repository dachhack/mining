// Hazards PR 2 (docs/plans/hazards.md, section 2): water and the pump. The
// owner: "You can hit water starting at level 3. It fills the area and you
// need to purchase a pump to remove it by clicking it and waiting." (Depth 4:
// question 181.)
import { describe, expect, it } from 'vitest';
import { FRONTIER_PUMP, FRONTIER_WATER } from '../../src/data/frontier';
import { frontierAct, placeRefusal, previewTap } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { depthAt } from '../../src/engine/heightmap';
import { waterAt } from '../../src/engine/state';
import type { Vec3 } from '../../src/data';
import { buildState } from './helpers';
import { MID, SIDE, world } from './frontierHelpers';

/** The pit's middle square: north of the camp, inside its ring. */
const PX = MID;
const PY = MID - 6;

/**
 * A world whose cube is all dirt, 7 layers deep, with a terraced pit north
 * of the camp: the 3 x 3 round (PX, PY) dug `floor` deep, a ring 1 shallower
 * round it, and so on up to the surface. `extra` squares are dug 1 deeper
 * than the floor. `water` cells hold water.
 */
function pitWorld(
  floor: number,
  water: Vec3[],
  extra: { x: number; y: number }[] = [],
  inventory: Record<string, number> = {},
): FrontierState {
  const depthOf = (x: number, y: number): number => {
    if (extra.some((e) => e.x === x && e.y === y)) return floor + 1;
    const ring = Math.max(Math.abs(x - PX), Math.abs(y - PY));
    return Math.max(0, floor - Math.max(0, ring - 1));
  };
  const waterAt = (x: number, y: number, z: number): boolean =>
    water.some((c) => c.x === x && c.y === y && c.z === z);
  const layers: string[][] = [];
  for (let z = 0; z < 7; z += 1) {
    const rows: string[] = [];
    for (let y = 0; y < SIDE; y += 1) {
      let row = '';
      for (let x = 0; x < SIDE; x += 1) {
        row += z < depthOf(x, y) || waterAt(x, y, z) ? '.' : 'd';
      }
      rows.push(row);
    }
    layers.push(rows);
  }
  const base = world({ inventory: { wood: 50, grass: 50, ...inventory } });
  return { ...base, cube: buildState({ layers, water }) };
}

/** Tap (x, y) and expect it to be done. */
function tap(state: FrontierState, x: number, y: number): FrontierState {
  const out = frontierAct(state, { kind: 'tap', x, y });
  expect(out.done, `tap ${x},${y}: ${out.refusal ?? ''}`).toBe(true);
  return out.state;
}

const flooded = (state: FrontierState): string[] =>
  state.hazards.flooded.flatMap((wet, i) => (wet ? [`${i % SIDE},${Math.floor(i / SIDE)}`] : []));

describe('hitting water (hazards plan, section 2)', () => {
  it('floods the square, and the dug squares joined to it as deep or deeper, from depth 4', () => {
    expect(FRONTIER_WATER.fromDepth).toBe(4);
    // The floor at depth 3; (PX+1, PY) dug to 4 already; water under the middle.
    const w = pitWorld(3, [{ x: PX, y: PY, z: 4 }], [{ x: PX + 1, y: PY }]);
    const out = frontierAct(w, { kind: 'tap', x: PX, y: PY });
    expect(out.done).toBe(true);
    expect(depthAt(out.state.cube, PX, PY)).toBe(4);
    expect(out.tap?.flooded).toEqual([
      { x: PX, y: PY },
      { x: PX + 1, y: PY },
    ]);
    expect(flooded(out.state)).toEqual([`${PX},${PY}`, `${PX + 1},${PY}`]);
    // The water is kept as the flood, not in the cube.
    expect(waterAt(out.state.cube, { x: PX, y: PY, z: 3 })).toBe(0);
  });

  it('does not flood higher up: a pocket opened above depth 4 just collapses', () => {
    const w = pitWorld(2, [{ x: PX, y: PY, z: 3 }]);
    const after = tap(w, PX, PY);
    expect(depthAt(after.cube, PX, PY)).toBe(3);
    expect(flooded(after)).toEqual([]);
  });

  it('floods at most FRONTIER_WATER.maxSquares squares, nearest first', () => {
    // A wide floor at depth 4 round the hole: many squares the water could reach.
    const extra: { x: number; y: number }[] = [];
    for (let y = PY - 1; y <= PY + 1; y += 1) {
      for (let x = PX - 1; x <= PX + 1; x += 1) if (x !== PX || y !== PY) extra.push({ x, y });
    }
    const w = pitWorld(3, [{ x: PX, y: PY, z: 4 }], extra);
    const after = tap(w, PX, PY);
    expect(flooded(after).length).toBeLessThanOrEqual(FRONTIER_WATER.maxSquares);
    expect(after.hazards.flooded[PX + SIDE * PY]).toBe(true);
  });

  it('leaves a flooded square unminable, and no camp may stand on it', () => {
    const w = pitWorld(3, [{ x: PX, y: PY, z: 4 }]);
    const after = tap(w, PX, PY);
    const again = frontierAct(after, { kind: 'tap', x: PX, y: PY });
    expect(again.done).toBe(false);
    expect(again.refusal).toBe('flooded');
    expect(again.state).toBe(after);
    expect(previewTap(after, PX, PY).kind).toBe('flooded');
    const marked = {
      ...after,
      hazards: { ...after.hazards, flooded: after.hazards.flooded.map(() => true) },
    };
    expect(placeRefusal({ ...marked, inventory: new Map([['wood', 99]]) }, MID - 7, MID)).toBe(
      'flooded',
    );
  });
});

describe('the pump (hazards plan, section 2)', () => {
  /** A flood of two squares, (PX, PY) and (PX + 1, PY), and a pump in the store. */
  function floodWithPump(): FrontierState {
    const w = pitWorld(3, [{ x: PX, y: PY, z: 4 }], [{ x: PX + 1, y: PY }], { pump: 1 });
    return tap(w, PX, PY);
  }

  it('is set by a tap on the water, for 1 tap, and picked up by a tap on it', () => {
    const w = floodWithPump();
    expect(previewTap(w, PX + 1, PY).kind).toBe('pump');
    const set = frontierAct(w, { kind: 'tap', x: PX + 1, y: PY });
    expect(set.done).toBe(true);
    expect(set.tap?.pump).toBe('set');
    expect(set.state.tapsLeft).toBe(w.tapsLeft - 1);
    expect(set.state.hazards.pumps).toEqual([{ x: PX + 1, y: PY }]);
    expect(set.state.inventory.has(FRONTIER_PUMP.item)).toBe(false);
    const taken = frontierAct(set.state, { kind: 'tap', x: PX + 1, y: PY });
    expect(taken.tap?.pump).toBe('taken');
    expect(taken.state.hazards.pumps).toEqual([]);
    expect(taken.state.inventory.get(FRONTIER_PUMP.item)).toBe(1);
  });

  it('drains its flood at End shift, its own square last, then comes back', () => {
    const set = tap(floodWithPump(), PX, PY); // the pump on the middle
    // A whole flood in one night (owner, on the hazards build: "Pump takes too long").
    expect(FRONTIER_PUMP.drainPerShift).toBeGreaterThanOrEqual(FRONTIER_WATER.maxSquares);
    const night = frontierAct(set, { kind: 'endShift' });
    expect(night.report?.drained).toBe(2);
    expect(night.report?.pumpsBack).toBe(1);
    expect(flooded(night.state)).toEqual([]);
    expect(night.state.hazards.pumps).toEqual([]);
    expect(night.state.inventory.get(FRONTIER_PUMP.item)).toBe(1);
    // Now the water is gone: a tap on the middle meets the level rule, not water.
    expect(previewTap(night.state, PX, PY).kind).not.toBe('flooded');
  });

  it('keeps pumping over several nights when floods join into more than a night drains', () => {
    const marks = pitWorld(3, [], [], { pump: 1 });
    // A row of flooded squares, 3 more than a night drains, the pump on the west end.
    const n = FRONTIER_PUMP.drainPerShift + 3;
    const x0 = Math.floor((SIDE - n) / 2);
    const wet = new Array<boolean>(SIDE * SIDE).fill(false);
    for (let x = x0; x < x0 + n; x += 1) wet[x + SIDE * PY] = true;
    const w = { ...marks, hazards: { ...marks.hazards, flooded: wet, pumps: [] } };
    const set = tap(w, x0, PY);
    const one = frontierAct(set, { kind: 'endShift' }).state;
    // The farthest went first: what is left is still joined to the pump, its own square last.
    expect(flooded(one)).toEqual([`${x0},${PY}`, `${x0 + 1},${PY}`, `${x0 + 2},${PY}`]);
    expect(one.hazards.pumps).toEqual([{ x: x0, y: PY }]);
    const two = frontierAct({ ...one, health: 10 }, { kind: 'endShift' }).state;
    expect(flooded(two)).toEqual([]);
    expect(two.inventory.get(FRONTIER_PUMP.item)).toBe(1);
  });

  it('is sold at the market from the start', () => {
    const w = { ...world({ inventory: { coin: 100 } }), shift: 10, marketOpen: true };
    const bought = frontierAct(w, { kind: 'buy', item: FRONTIER_PUMP.item, lots: 1 });
    expect(bought.done).toBe(true);
    expect(bought.state.inventory.get(FRONTIER_PUMP.item)).toBe(1);
  });

  it('without one, a tap on the water says so and costs nothing', () => {
    const w = tap(pitWorld(3, [{ x: PX, y: PY, z: 4 }]), PX, PY);
    const out = frontierAct(w, { kind: 'tap', x: PX, y: PY });
    expect(out.refusal).toBe('flooded');
    expect(out.state.tapsLeft).toBe(w.tapsLeft);
  });

  it('goes back to the store when another pump in the same flood drains its square', () => {
    const marks = pitWorld(3, [], [], { pump: 2 });
    // A row 3 longer than a night drains. The first pump, on the west end,
    // drains all but the west 3; the second, 2 squares in, then drains the
    // farthest it can reach: the first pump's square.
    const n = FRONTIER_PUMP.drainPerShift + 3;
    const x0 = Math.floor((SIDE - n) / 2);
    const wet = new Array<boolean>(SIDE * SIDE).fill(false);
    for (let x = x0; x < x0 + n; x += 1) wet[x + SIDE * PY] = true;
    const w = { ...marks, hazards: { ...marks.hazards, flooded: wet, pumps: [] } };
    const two = tap(tap(w, x0, PY), x0 + 2, PY);
    const night = frontierAct(two, { kind: 'endShift' }).state;
    for (const pump of night.hazards.pumps) {
      expect(night.hazards.flooded[pump.x + SIDE * pump.y]).toBe(true);
    }
    const held = night.inventory.get(FRONTIER_PUMP.item) ?? 0;
    expect(held + night.hazards.pumps.length).toBe(2);
  });
});
