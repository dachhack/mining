// The phone map and pit walls that slump (design doc v0.2 section 11; issue
// #94): the crack mark and its countdown, the support tool, and the second
// tap that confirms a mine which would make squares unstable.

import { describe, expect, it } from 'vitest';
import { endShift, hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { NO_MARKS, tapOutcome } from '../../src/app/map/targets';
import { buildTile } from '../../src/app/map/tiles';
import { buildState, terrainLayers } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** A pit drawn from above (see `terrainLayers`). `materials` defaults to stone. */
function pit(
  depths: string[],
  materials?: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
): GameState {
  return buildState({ layers: terrainLayers(depths, materials), ...options });
}

describe('tiles', () => {
  it('a cracked square carries its countdown; the others carry none', () => {
    const cracked = endShift(pit(['012'], ['ddd'])).state;
    expect(buildTile(cracked, 0, 0).crack).toBe(2);
    expect(buildTile(cracked, 1, 0).crack).toBeNull();
    expect(buildTile(endShift(cracked).state, 0, 0).crack).toBe(1);
  });

  it('says whether the countdown is running or stopped', () => {
    const running = endShift(pit(['012'], ['ddd'])).state;
    expect(buildTile(running, 0, 0)).toMatchObject({ crack: 2, crackRunning: true });
    // The same crack on a square that is stable: stopped.
    const stopped = pit(['011'], ['ddd'], { cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 1 }] });
    expect(buildTile(stopped, 0, 0)).toMatchObject({ crack: 2, crackRunning: false });
    // And on a square a support holds.
    const held = pit(['012'], ['ddd'], {
      cracks: [{ pos: { x: 0, y: 0, z: 0 }, timer: 0 }],
      supports: [{ x: 0, y: 0, z: 0 }],
    });
    expect(buildTile(held, 0, 0)).toMatchObject({ crack: 1, crackRunning: false });
    expect(buildTile(running, 1, 0).crackRunning).toBe(false);
  });

  it('a supported square carries the support mark', () => {
    const state = pit(['012'], ['ddd'], { supports: [{ x: 0, y: 0, z: 0 }] });
    expect(buildTile(state, 0, 0).structure).toBe('support');
    expect(buildTile(state, 1, 0).structure).toBeNull();
  });
});

describe('a tap that would make squares unstable', () => {
  // Dirt at depths 0 1 1: mining x=2 makes the slope fall 2 from x=0.
  const risky = (): GameState => pit(['011'], ['ddd']);

  it('is not taken at the first tap: it warns and marks those squares', () => {
    const state = risky();
    const before = hashState(state);
    const outcome = tapOutcome(state, 2, 0);
    expect(outcome.entry).toBeNull();
    expect(outcome.needsConfirm).toBe(true);
    expect(outcome.marks).toEqual({
      selected: { x: 2, y: 0 },
      tooHigh: [],
      unstable: [{ x: 0, y: 0 }],
      blocked: [],
    });
    expect(outcome.lines[1]).toContain('Mining x2 y0 would make x0 y0');
    expect(outcome.lines[2]).toBe('Tap the square again to mine it all the same.');
    expect(hashState(state)).toBe(before);
  });

  it('is taken at the second tap on the same square', () => {
    const outcome = tapOutcome(risky(), 2, 0, 'dig', true);
    expect(outcome).toEqual({
      entry: { type: 'mine', x: 2, y: 0, ap: 1 },
      lines: [],
      marks: NO_MARKS,
      needsConfirm: false,
    });
  });

  it('a safe mine is taken at the first tap', () => {
    expect(tapOutcome(risky(), 0, 0).entry).toEqual({ type: 'mine', x: 0, y: 0, ap: 1 });
  });

  it('a second tap does not get a refused mine past the rules', () => {
    const outcome = tapOutcome(pit(['01'], ['dd']), 1, 0, 'dig', true);
    expect(outcome.entry).toBeNull();
    expect(outcome.needsConfirm).toBe(false);
    expect(outcome.lines[1]).toContain('The level rule');
  });
});

describe('the support tool', () => {
  it('a tap places a support on the square', () => {
    const state = pit(['012'], ['ddd'], { stockpile: { support: 1 } });
    expect(tapOutcome(state, 0, 0, 'support')).toEqual({
      entry: { type: 'placeSupport', x: 0, y: 0, ap: 1 },
      lines: [],
      marks: NO_MARKS,
      needsConfirm: false,
    });
    // With the tool off the same tap is a mine.
    expect(tapOutcome(state, 0, 0).entry?.type).toBe('mine');
  });

  it('a refused tap says why and marks the square, and no neighbour', () => {
    // x=1 is lower than x=0, which the level rule would mark for a mine.
    const outcome = tapOutcome(pit(['01'], ['dd']), 1, 0, 'support');
    expect(outcome.entry).toBeNull();
    expect(outcome.lines[1]).toBe(
      'You have no support to place: craft one first ("craft-support").',
    );
    expect(outcome.marks).toEqual({
      selected: { x: 1, y: 0 },
      tooHigh: [],
      unstable: [],
      blocked: [],
    });
  });

  it('a tap on a tree is refused: nothing is placed on a tree', () => {
    const state = pit(['00'], ['dd'], { surface: ['T.'], stockpile: { support: 1 } });
    const outcome = tapOutcome(state, 0, 0, 'support');
    expect(outcome.entry).toBeNull();
    expect(outcome.lines[1]).toContain('A tree stands on x0 y0');
  });
});
