// The arithmetic of the depth survey (tools/survey.ts): what a pit of each
// depth costs on paper. The measured part of the survey is whole runs, which
// `npm run sim -- --survey depth` plays; see docs/surveys/depth-survey.md.

import { afterEach, describe, expect, it } from 'vitest';
import {
  BLOCKS,
  CAMPS,
  GAME_DATA,
  GENERATION,
  LOADOUTS,
  SHIFT,
  WORLD,
  validateData,
} from '../../src/data';
import { meanMineCostOfLayer, pitAp, pitBlocks, pitProfile } from '../../tools/survey';
import { WHAT_IFS, findWhatIf } from '../../tools/whatIf';

describe('what a pit costs on paper', () => {
  it('the steepest pit matches the table in design doc section 12', () => {
    // Depth, then blocks for a pit in the middle, against a side, in a corner.
    const docTable = [
      [8, 344, 204, 120],
      [12, 1156, 650, 364],
      [20, 5252, 2840, 1540],
    ];
    for (const [depth, middle, side, corner] of docTable as [number, number, number, number][]) {
      expect(pitBlocks(depth, 'middle', null)).toBe(middle);
      expect(pitBlocks(depth, 'side', null)).toBe(side);
      expect(pitBlocks(depth, 'corner', null)).toBe(corner);
    }
  });

  it('a wall of 1-level steps has no bench; dirt needs one after every step, stone after every second', () => {
    // Entry k is the depth of the squares k steps from the bottom square.
    expect(pitProfile(4, null)).toEqual([4, 3, 2, 1]);
    expect(pitProfile(4, 1)).toEqual([4, 3, 3, 2, 2, 1, 1]);
    expect(pitProfile(4, 2)).toEqual([4, 3, 2, 2, 1]);
    // Hard rock holds a fall of 3. The wall of a pit 4 deep climbs 3 levels,
    // and then the ground round it would stand at the top of a fall of 4: so
    // the last ring is one more bench.
    expect(pitProfile(4, 3)).toEqual([4, 3, 2, 1, 1]);
    expect(pitProfile(5, 3)).toEqual([5, 4, 3, 2, 2, 1]);
  });

  it('benches make the pit wider, so it costs more blocks', () => {
    for (const depth of [4, 8, 12]) {
      const steep = pitBlocks(depth, 'corner', null);
      const stone = pitBlocks(depth, 'corner', BLOCKS.stone.slumpLimit);
      const dirt = pitBlocks(depth, 'corner', BLOCKS.dirt.slumpLimit);
      expect(stone).toBeGreaterThan(steep);
      expect(dirt).toBeGreaterThan(stone);
    }
    // In a corner, ring k has k + 1 squares: 1x4 + 2x3 + 3x3 + 4x2 + 5x2 + 6x1 + 7x1.
    expect(pitBlocks(4, 'corner', 1)).toBe(4 + 6 + 9 + 8 + 10 + 6 + 7);
  });

  it('the mean cost of a layer follows the rock weights of its band', () => {
    // Layer 0 is 70% dirt (1 AP) and 30% stone (2 AP).
    expect(meanMineCostOfLayer(0)).toBeCloseTo(0.7 * 1 + 0.3 * 2, 10);
    // Layer 3, the last of the upper band, is 10% dirt and 90% stone.
    expect(meanMineCostOfLayer(3)).toBeCloseTo(0.1 * 1 + 0.9 * 2, 10);
    // Layer 31, the last of all, is 5% stone and 95% hard rock (3 AP).
    expect(meanMineCostOfLayer(31)).toBeCloseTo(0.05 * 2 + 0.95 * 3, 10);
    // A pit 1 deep is one block of layer 0.
    expect(pitAp(1, 'corner', null)).toBeCloseTo(meanMineCostOfLayer(0), 10);
  });
});

describe('the what-if trials', () => {
  // Each trial changes the data in memory. Keep a copy of what the trials
  // touch and put it back after every test, so that no other test in this
  // file sees a changed game. (Vitest gives every test file its own copy of
  // the modules, so other files are safe in any case.)
  const bandsBefore = JSON.stringify(WORLD.depthBands);
  const fuelBefore = LOADOUTS.standard.fuel;
  const apBefore = SHIFT.apPerShift;
  const limitsBefore = Object.entries(BLOCKS).map(([id, def]) => ({ id, limit: def.slumpLimit }));
  const pocketsBefore = GENERATION.bands.map((band) =>
    band.spaces.map((space) => space.spacesPer1000Cells),
  );
  const veinsBefore = GENERATION.bands.map((band) =>
    band.veins.map((vein) => vein.veinsPer1000Cells),
  );
  const campBefore = { ...CAMPS }; // a copy of the camp numbers
  afterEach(() => {
    Object.assign(CAMPS, campBefore);
    GENERATION.bands.forEach((band, bandIndex) => {
      band.veins.forEach((vein, veinIndex) => {
        vein.veinsPer1000Cells = veinsBefore[bandIndex]?.[veinIndex] ?? 0;
      });
    });
    GENERATION.bands.forEach((band, bandIndex) => {
      band.spaces.forEach((space, spaceIndex) => {
        space.spacesPer1000Cells = pocketsBefore[bandIndex]?.[spaceIndex] ?? 0;
      });
    });
    const bands = JSON.parse(bandsBefore) as typeof WORLD.depthBands;
    WORLD.depthBands.forEach((band, index) => {
      Object.assign(band, bands[index]);
    });
    LOADOUTS.standard.fuel = fuelBefore;
    SHIFT.apPerShift = apBefore;
    const table: Record<string, { slumpLimit: number | null }> = BLOCKS;
    for (const entry of limitsBefore) {
      (table[entry.id] as { slumpLimit: number | null }).slumpLimit = entry.limit;
    }
  });

  it('every trial leaves data that passes the data check', () => {
    for (const whatIf of WHAT_IFS) {
      whatIf.apply();
      expect(validateData(GAME_DATA), whatIf.id).toEqual([]);
    }
  });

  it('each changes the numbers it says it changes', () => {
    findWhatIf('bands-6').apply();
    expect(WORLD.depthBands.map((band) => [band.firstLayer, band.lastLayer])).toEqual([
      [0, 5],
      [6, 15],
      [16, 31],
    ]);
    findWhatIf('fuel-48-ap-8').apply();
    expect([LOADOUTS.standard.fuel, SHIFT.apPerShift]).toEqual([48, 8]);
    findWhatIf('slump-dirt-2').apply();
    expect([BLOCKS.dirt.slumpLimit, BLOCKS.rubble.slumpLimit, BLOCKS.stone.slumpLimit]).toEqual([
      2, 2, 2,
    ]);
    expect(() => findWhatIf('free-lunch')).toThrow(/Unknown what-if/);
  });

  it('a custom trial sets exactly the numbers its id lists', () => {
    const custom = findWhatIf('set:middle=3,deep=11,fuel=48,pockets=6,ore=3,campSteps=8');
    expect(custom.middleBandStart).toBe(3);
    const waterBefore = GENERATION.bands[1]?.spaces[0]?.spacesPer1000Cells ?? 0;
    const ironBefore = GENERATION.bands[1]?.veins[0]?.veinsPer1000Cells ?? 0;
    custom.apply();
    expect(WORLD.depthBands.map((band) => band.firstLayer)).toEqual([0, 3, 11]);
    expect(LOADOUTS.standard.fuel).toBe(48);
    expect(GENERATION.bands[1]?.spaces[0]?.spacesPer1000Cells).toBeCloseTo(waterBefore * 6, 10);
    expect(GENERATION.bands[1]?.veins[0]?.veinsPer1000Cells).toBeCloseTo(ironBefore * 3, 10);
    expect(CAMPS.mineDiscountSteps).toBe(8);
    // What the id does not list keeps its value.
    expect(SHIFT.apPerShift).toBe(apBefore);
    expect(CAMPS.upkeepEveryShifts).toBe(campBefore.upkeepEveryShifts);
    expect(validateData(GAME_DATA)).toEqual([]);
    // A setting it does not know, or half a pair of bands, is refused.
    expect(() => findWhatIf('set:gravity=2')).toThrow(/Cannot read/);
    expect(() => findWhatIf('set:middle=4')).toThrow(/both middle and deep/);
  });

  it('none is applied unless asked for: the data here is the game as it is', () => {
    expect(JSON.stringify(WORLD.depthBands)).toBe(bandsBefore);
    expect(LOADOUTS.standard.fuel).toBe(fuelBefore);
  });
});
