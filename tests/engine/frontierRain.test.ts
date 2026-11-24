// Hazards PR 1 (docs/plans/hazards.md, section 1): rain. The owner: "Rain
// overnight washes clay and soil into low areas and covers them."
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import { FRONTIER_RAIN } from '../../src/data/frontier';
import { depthAt } from '../../src/engine/heightmap';
import { endFrontierShift } from '../../src/engine/frontier/shift';
import { lowSpots, rainfall } from '../../src/engine/frontier/rain';
import { createRng, nextFloat } from '../../src/engine/rng';
import type { RngState } from '../../src/engine/rng';
import { blockAt } from '../../src/engine/state';
import type { FrontierState } from '../../src/engine';
import { world } from './frontierHelpers';

/**
 * A world with a pit far from the camp: the 3 x 3 around (4, 4) dug 1 deep,
 * its middle (4, 4) dug 2 deep, with a coal block left at the bottom of the
 * middle so a test can see it is buried, not lost.
 */
function pit(): FrontierState {
  const special: { x: number; y: number; z?: number; char: string }[] = [];
  for (let y = 3; y <= 5; y += 1) {
    for (let x = 3; x <= 5; x += 1) special.push({ x, y, z: 0, char: '.' });
  }
  special.push({ x: 4, y: 4, z: 1, char: '.' });
  special.push({ x: 4, y: 4, z: 2, char: 'c' });
  return world({ special, inventory: { wood: 50, grass: 50 } });
}

/** A generator whose first roll makes it rain, and whose later rolls fill every low spot. */
function rainyRng(): RngState {
  for (let seed = 1; ; seed += 1) {
    const probe = createRng(seed);
    const rolls = [nextFloat(probe), nextFloat(probe), nextFloat(probe)];
    if ((rolls[0] ?? 1) < FRONTIER_RAIN.chance && (rolls[1] ?? 1) < FRONTIER_RAIN.fillChance) {
      return createRng(seed);
    }
  }
}

describe('rain fills low spots (hazards plan, section 1)', () => {
  it('finds the low spots: dug squares lower than a neighbour, with no neighbour lower', () => {
    const w = pit();
    // The middle of the pit, and the rim's corners: the middle is not beside
    // a corner (only diagonally). The rim's edge squares have the deeper
    // middle beside them.
    expect(lowSpots(w.cube)).toEqual([
      { x: 3, y: 3 },
      { x: 5, y: 3 },
      { x: 4, y: 4 },
      { x: 3, y: 5 },
      { x: 5, y: 5 },
    ]);
    // A flat floor dug 1 deep: every square of it is lower than the ground
    // around it only on its outside; the inner one has no shallower neighbour.
    const flat = world({
      special: [3, 4, 5].flatMap((y) => [3, 4, 5].map((x) => ({ x, y, z: 0, char: '.' }))),
    });
    const spots = lowSpots(flat.cube);
    expect(spots).toHaveLength(8);
    expect(spots).not.toContainEqual({ x: 4, y: 4 });
    // Ground never dug has none.
    expect(lowSpots(world().cube)).toEqual([]);
  });

  it('puts 1 block of dirt or clay back on a low spot, burying what was on top', () => {
    const w = pit();
    const onlyMiddle = (x: number, y: number): boolean => !(x === 4 && y === 4);
    const rain = rainfall(w.cube, w.camps, rainyRng(), onlyMiddle);
    expect(rain.rained).toBe(true);
    expect(rain.filled).toEqual([{ x: 4, y: 4 }]);
    expect(depthAt(rain.cube, 4, 4)).toBe(1);
    const top = blockAt(rain.cube, { x: 4, y: 4, z: 1 });
    expect([BLOCKS.dirt.code, BLOCKS.clay.code]).toContain(top);
    // The coal is still there, under the new block.
    expect(blockAt(rain.cube, { x: 4, y: 4, z: 2 })).toBe(BLOCKS.coalSeam.code);
    // The cube it was given is unchanged.
    expect(depthAt(w.cube, 4, 4)).toBe(2);
  });

  it('gives the same cube back when it does not rain', () => {
    const w = pit();
    for (let seed = 1; seed < 50; seed += 1) {
      const probe = createRng(seed);
      if (nextFloat(probe) >= FRONTIER_RAIN.chance) {
        const rain = rainfall(w.cube, w.camps, createRng(seed));
        expect(rain.rained).toBe(false);
        expect(rain.cube).toBe(w.cube);
        return;
      }
    }
    throw new Error('no dry seed found');
  });

  it("never fills a camp's ground, or a square it is told not to", () => {
    const w = pit();
    const first = w.camps[0];
    if (first === undefined) throw new Error('the test world has a camp');
    const camp = { ...first, id: 2, x: 4, y: 4 };
    const filled = rainfall(w.cube, [...w.camps, camp], rainyRng()).filled;
    expect(filled.some((s) => Math.abs(s.x - 4) <= 1 && Math.abs(s.y - 4) <= 1)).toBe(false);
    expect(rainfall(w.cube, w.camps, rainyRng(), () => true).filled).toEqual([]);
  });

  it('rains on about the share of nights the data says, and fills about its share of low spots', () => {
    const w = pit();
    let rained = 0;
    let filled = 0;
    const nights = 2000;
    for (let seed = 1; seed <= nights; seed += 1) {
      const rain = rainfall(w.cube, w.camps, createRng(seed * 7919));
      if (rain.rained) rained += 1;
      filled += rain.filled.length;
    }
    expect(rained / nights).toBeGreaterThan(FRONTIER_RAIN.chance - 0.04);
    expect(rained / nights).toBeLessThan(FRONTIER_RAIN.chance + 0.04);
    expect(filled / rained / lowSpots(w.cube).length).toBeGreaterThan(
      FRONTIER_RAIN.fillChance - 0.08,
    );
    expect(filled / rained / lowSpots(w.cube).length).toBeLessThan(FRONTIER_RAIN.fillChance + 0.08);
  });

  it('falls at End shift, says so in the report, and keeps the level rule', () => {
    // Play nights until one rains on the pit.
    let state = pit();
    for (let night = 0; night < 60; night += 1) {
      const out = endFrontierShift(state);
      const report = out.report;
      if (report === null) throw new Error('End shift reports');
      if (report.rainFilled > 0) {
        expect(report.rained).toBe(true);
        // Each filled square is 1 shallower; the level rule holds everywhere.
        for (const s of lowSpots(state.cube)) {
          const d = depthAt(out.state.cube, s.x, s.y);
          expect([depthAt(state.cube, s.x, s.y), depthAt(state.cube, s.x, s.y) - 1]).toContain(d);
        }
        for (let y = 0; y < 8; y += 1) {
          for (let x = 0; x < 8; x += 1) {
            const d = depthAt(out.state.cube, x, y);
            expect(Math.abs(d - depthAt(out.state.cube, x + 1, y))).toBeLessThanOrEqual(1);
            expect(Math.abs(d - depthAt(out.state.cube, x, y + 1))).toBeLessThanOrEqual(1);
          }
        }
        // Dug count is not given back.
        expect(out.state.mined).toBe(state.mined);
        return;
      }
      if (!report.rained) expect(out.state.cube).toBe(state.cube);
      state = { ...out.state, health: 10 };
    }
    throw new Error('no rain in 60 nights');
  });
});
