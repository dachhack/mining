// The phone map and the camp-made tools (design doc v0.2 sections 7.2 and
// 11; owner question 93; issue #104): the pump, seal, scan and look tools,
// the ranges they mark, the pump mark, and the marks for what a scan showed
// under a top. As everywhere on the map, nothing that was not scanned shows.

import { describe, expect, it } from 'vitest';
import { applyAction, hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setGasOn, setWaterOn } from '../../src/engine/standing';
import { belowMarksOf, belowMarksText } from '../../src/app/below';
import { NO_MARKS, lookOutcome, pumpRange, tapOutcome, ventRange } from '../../src/app/map/targets';
import { buildTile, buildTiles } from '../../src/app/map/tiles';
import { buildState, terrainLayers } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** A stone pit drawn from above (see `terrainLayers`). */
function pit(depths: string[], options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({ layers: terrainLayers(depths), shift: 3, ...options });
}

/**
 * A 5 x 5 surface. Under (2, 2): iron ore, then a 1-cell water pocket. Under
 * (1, 2): an empty cavern cell. Everything else is stone.
 */
function prospect(options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  const stone = ['#####', '#####', '#####', '#####', '#####'];
  return buildState({
    layers: [
      stone,
      ['#####', '#####', '#.i##', '#####', '#####'],
      ['#####', '#####', '##.##', '#####', '#####'],
      stone,
      stone,
    ],
    water: [{ x: 2, y: 2, z: 2 }],
    stockpile: { scannerCharge: 1 },
    ...options,
  });
}

/** Tap a square twice with a tool and apply what the second tap stands for. */
function tapTwice(state: GameState, x: number, y: number, tool: 'pump' | 'scan'): GameState {
  const entry = tapOutcome(state, x, y, tool, true).entry;
  if (entry === null) {
    throw new Error('the tap was refused');
  }
  return applyAction(state, entry).state;
}

describe('the pump tool', () => {
  it('the first tap shows the range and takes nothing; the second places the pump', () => {
    const state = pit(['22222', '22222', '22222'], { stockpile: { pump: 1 } });
    const before = hashState(state);
    const first = tapOutcome(state, 0, 1, 'pump');
    expect(first.entry).toBeNull();
    expect(first.needsConfirm).toBe(true);
    expect(first.marks.selected).toEqual({ x: 0, y: 1 });
    // Within 2 steps of (0, 1) on a map 5 wide and 3 high: 7 squares.
    expect(first.marks.range).toEqual(pumpRange(state, 0, 1));
    expect(first.marks.range).toHaveLength(7);
    expect(first.marks.range).toContainEqual({ x: 2, y: 1 });
    expect(first.marks.range).not.toContainEqual({ x: 3, y: 1 });
    expect(first.lines[1]).toBe(
      'A pump here takes up to 3 water a shift from the 7 marked squares (within 2 steps). ' +
        'Tap the square again to place it.',
    );
    expect(hashState(state)).toBe(before);

    const second = tapOutcome(state, 0, 1, 'pump', true);
    expect(second).toEqual({
      entry: { type: 'placePump', x: 0, y: 1, ap: 1 },
      lines: [],
      marks: NO_MARKS,
      needsConfirm: false,
    });
  });

  it('a refused tap says why at once, with no range', () => {
    const state = pit(['222'], { stockpile: { pump: 1 }, supports: [{ x: 1, y: 0, z: 2 }] });
    const outcome = tapOutcome(state, 1, 0, 'pump');
    expect(outcome.entry).toBeNull();
    expect(outcome.needsConfirm).toBe(false);
    expect(outcome.lines[1]).toContain('Something is already placed on x1 y0');
    expect(outcome.marks.range).toEqual([]);
  });

  it('a placed pump has its own mark, and looking at it marks its range', () => {
    const state = pit(['222'], { structures: [{ pos: { x: 1, y: 0, z: 2 }, structure: 'pump' }] });
    expect(buildTile(state, 1, 0).structure).toBe('pump');
    expect(buildTile(state, 0, 0).structure).toBeNull();
    const looked = lookOutcome(state, 1, 0);
    expect(looked.lines[1]).toContain('A pump stands here');
    expect(looked.marks.range).toEqual(pumpRange(state, 1, 0));
  });
});

describe('the vent tool (issue #107)', () => {
  it('the first tap shows the range and how much of it is gassy; the second places the vent', () => {
    const state = pit(['22222', '22222', '22222'], { stockpile: { vent: 1 } });
    setGasOn(state, 2, 1, 2);
    setGasOn(state, 4, 1, 1); // 3 steps from (1, 1): out of reach
    const first = tapOutcome(state, 1, 1, 'vent');
    expect(first.entry).toBeNull();
    expect(first.needsConfirm).toBe(true);
    expect(first.marks.range).toEqual(ventRange(state, 1, 1));
    expect(first.marks.range).toContainEqual({ x: 3, y: 1 });
    expect(first.marks.range).not.toContainEqual({ x: 4, y: 1 });
    expect(first.lines[1]).toBe(
      `A vent here clears all the gas on the ${first.marks.range.length} marked squares (within 2 steps) ` +
        'each time a shift ends; 1 of them has gas on now. Tap the square again to place it.',
    );
    expect(tapOutcome(state, 1, 1, 'vent', true)).toEqual({
      entry: { type: 'placeVent', x: 1, y: 1, ap: 1 },
      lines: [],
      marks: NO_MARKS,
      needsConfirm: false,
    });
  });

  it('a placed vent has its own mark; the squares it will clear carry an arrow', () => {
    const state = pit(['22222'], {
      structures: [{ pos: { x: 0, y: 0, z: 2 }, structure: 'vent' }],
    });
    // 1 unit on x 2 (in reach) and 1 on x 4 (4 steps away): neither spreads.
    setGasOn(state, 2, 0, 1);
    setGasOn(state, 4, 0, 1);
    expect(buildTile(state, 0, 0).structure).toBe('vent');
    expect(buildTile(state, 2, 0)).toMatchObject({ gas: 1, vented: true });
    expect(buildTile(state, 4, 0)).toMatchObject({ gas: 1, vented: false });
    expect(buildTile(state, 1, 0).vented).toBe(false); // no gas there to clear
    // Looking at the vent marks its range.
    const looked = lookOutcome(state, 0, 0);
    expect(looked.lines[1]).toContain('A vent stands here');
    expect(looked.marks.range).toEqual(ventRange(state, 0, 0));
  });

  it('gas that would spread onto a square the vent clears is marked as vented, not as coming', () => {
    // 9 units on x 4 give 4 to x 3, which is 2 steps from the vent on x 1.
    const state = pit(['22222'], {
      structures: [{ pos: { x: 1, y: 0, z: 2 }, structure: 'vent' }],
    });
    setGasOn(state, 4, 0, 9);
    expect(buildTile(state, 3, 0)).toMatchObject({ gas: 0, gasComing: false, vented: true });
    // Without the vent the same square is marked "gas coming".
    const open = pit(['22222']);
    setGasOn(open, 4, 0, 9);
    expect(buildTile(open, 3, 0)).toMatchObject({ gasComing: true, vented: false });
  });
});

describe('the seal tool', () => {
  it('a tap seals a dug square at once', () => {
    const state = pit(['121'], { stockpile: { sealant: 1 } });
    setWaterOn(state, 1, 0, 1);
    expect(tapOutcome(state, 1, 0, 'seal')).toEqual({
      entry: { type: 'seal', x: 1, y: 0, ap: 1 },
      lines: [],
      marks: NO_MARKS,
      needsConfirm: false,
    });
  });

  it('a refused tap says why and marks the deeper squares', () => {
    const state = pit(['112'], { stockpile: { sealant: 1 } });
    const outcome = tapOutcome(state, 1, 0, 'seal');
    expect(outcome.entry).toBeNull();
    expect(outcome.lines[1]).toContain('would leave it 2 levels above x2 y0 (depth 2)');
    expect(outcome.marks.selected).toEqual({ x: 1, y: 0 });
    expect(outcome.marks.blocked).toEqual([{ x: 2, y: 0 }]);
  });
});

describe('a risky seal (issue #107)', () => {
  it('is not taken at the first tap: it warns and marks the square; the second tap takes it', () => {
    const state = pit(['2234'], { stockpile: { sealant: 1 } });
    const first = tapOutcome(state, 0, 0, 'seal');
    expect(first.entry).toBeNull();
    expect(first.needsConfirm).toBe(true);
    expect(first.marks.unstable).toEqual([{ x: 0, y: 0 }]);
    expect(first.lines[1]).toContain('Sealing x0 y0 would make x0 y0 itself');
    expect(first.lines[2]).toBe('Tap the square again to seal it all the same.');
    expect(tapOutcome(state, 0, 0, 'seal', true).entry).toEqual({
      type: 'seal',
      x: 0,
      y: 0,
      ap: 1,
    });
  });
});

describe('the scan tool and what a scan shows', () => {
  it('the first tap marks the 3 x 3 patch; the second scans', () => {
    const state = prospect();
    const first = tapOutcome(state, 2, 2, 'scan');
    expect(first.entry).toBeNull();
    expect(first.needsConfirm).toBe(true);
    expect(first.marks.range).toHaveLength(9);
    expect(first.marks.range[0]).toEqual({ x: 1, y: 1 });
    expect(first.lines[1]).toBe(
      'A scan here shows the 3 blocks under the top block of each of the 9 marked squares. ' +
        'Tap the square again to scan.',
    );
    // In a corner the patch is smaller, and the line says so.
    expect(tapOutcome(state, 0, 0, 'scan').marks.range).toHaveLength(4);
    expect(tapOutcome(state, 2, 2, 'scan', true).entry).toEqual({
      type: 'scan',
      x: 2,
      y: 2,
      ap: 2,
    });
  });

  it('before a scan no tile has a mark; after it the scanned squares have theirs', () => {
    const state = prospect();
    for (const row of buildTiles(state, { x0: 0, y0: 0, size: 5 })) {
      for (const tile of row) {
        expect(tile.below).toEqual({ any: false, ore: false, pocket: false, cavern: false });
      }
    }
    const scanned = tapTwice(state, 2, 2, 'scan');
    // Ore and a pocket under the middle; a cavern under its west neighbour.
    expect(buildTile(scanned, 2, 2).below).toEqual({
      any: true,
      ore: true,
      pocket: true,
      cavern: false,
    });
    expect(buildTile(scanned, 1, 2).below).toEqual({
      any: true,
      ore: false,
      pocket: false,
      cavern: true,
    });
    // Scanned, plain rock.
    expect(buildTile(scanned, 3, 3).below).toEqual({
      any: true,
      ore: false,
      pocket: false,
      cavern: false,
    });
    // Outside the patch: still nothing.
    expect(buildTile(scanned, 0, 0).below.any).toBe(false);
    // The top view itself does not change: only the top level is shown.
    expect(buildTile(scanned, 2, 2).block).toBe('stone');
    expect(buildTile(scanned, 2, 2).depth).toBe(0);
  });

  it('the marks are worded the same for the play tool and the phone', () => {
    const scanned = tapTwice(prospect(), 2, 2, 'scan');
    expect(belowMarksText(buildTile(scanned, 2, 2).below)).toBe('ore, a pocket');
    expect(belowMarksText(buildTile(scanned, 1, 2).below)).toBe('a cavern');
    expect(belowMarksText(buildTile(scanned, 3, 3).below)).toBe('plain rock');
    expect(belowMarksOf).toBeTypeOf('function');
  });

  it('holding a square lists its known blocks; before a scan there are none', () => {
    const state = prospect();
    const before = lookOutcome(state, 2, 2);
    expect(before.entry).toBeNull();
    expect(before.marks.selected).toEqual({ x: 2, y: 2 });
    expect(before.lines).toEqual([
      'x2 y2, ground level: Stone, mineral traces, gives 1 Stone.',
      'Nothing is known under the top block: only a scan shows what is below.',
    ]);
    const scanned = tapTwice(state, 2, 2, 'scan');
    expect(lookOutcome(scanned, 2, 2).lines).toEqual([
      'x2 y2, ground level: Stone, mineral traces, gives 1 Stone.',
      'Known under the top block:',
      'depth 1: Iron ore, damp (gives 1 Raw iron ore)',
      'depth 2: open space: 1 water (a pocket)',
      'depth 3: Stone, mineral traces, damp',
    ]);
    // The look tool is the same thing as a hold, and takes nothing.
    expect(tapOutcome(scanned, 2, 2, 'look')).toEqual(lookOutcome(scanned, 2, 2));
    expect(tapOutcome(scanned, 2, 2, 'look', true).entry).toBeNull();
  });
});

describe('nothing hidden is drawn', () => {
  it('what lies under the tops changes no tile and no look until it is scanned', () => {
    const plain = buildState({
      layers: [['###'], ['###'], ['###'], ['###'], ['###']],
      stockpile: { scannerCharge: 1 },
    });
    // Hard rock, dirt and a cavern under the tops (no ore: ore gives traces).
    const other = buildState({
      layers: [['###'], ['H#d'], ['#.#'], ['###'], ['dd#']],
      stockpile: { scannerCharge: 1 },
    });
    const window = { x0: 0, y0: 0, size: 3 };
    expect(buildTiles(other, window)).toEqual(buildTiles(plain, window));
    expect(lookOutcome(other, 1, 0)).toEqual(lookOutcome(plain, 1, 0));
    expect(tapOutcome(other, 1, 0, 'scan')).toEqual(tapOutcome(plain, 1, 0, 'scan'));
    // The scan is what tells them apart.
    const scannedPlain = tapTwice(plain, 1, 0, 'scan');
    const scannedOther = tapTwice(other, 1, 0, 'scan');
    expect(buildTiles(scannedOther, window)).not.toEqual(buildTiles(scannedPlain, window));
    // And what lies below the scan's 3 blocks still shows nowhere.
    const deepOnly = buildState({
      layers: [['###'], ['###'], ['###'], ['###'], ['dd#']],
      stockpile: { scannerCharge: 1 },
    });
    const scannedDeep = tapTwice(deepOnly, 1, 0, 'scan');
    expect(buildTiles(scannedDeep, window)).toEqual(buildTiles(scannedPlain, window));
    expect(lookOutcome(scannedDeep, 0, 0)).toEqual(lookOutcome(scannedPlain, 0, 0));
  });
});
