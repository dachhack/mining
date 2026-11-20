// The phone map and camps (design doc v0.2 sections 8 and 11; issue #100):
// the camp tool, the squares that stop a camp being founded, the camp mark
// and the mark for cheaper mining.

import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { NO_MARKS, tapOutcome } from '../../src/app/map/targets';
import { buildTile } from '../../src/app/map/tiles';
import { buildState } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** `count` rows of `width` copies of `char`: one layer of a hand-built cube. */
function layer(char: string, width = 7, count = 7): string[] {
  return Array.from({ length: count }, () => char.repeat(width));
}

/** A flat 7 x 7 field of stone with one camp kit in the stockpile. */
function field(options: Partial<BuildStateOptions> = {}): GameState {
  return buildState({
    layers: [layer('#'), layer('#')],
    stockpile: { campKit: 1 },
    ...options,
  });
}

/** The field with a camp standing in the middle. */
function campField(options: Partial<BuildStateOptions> = {}): GameState {
  return field({
    stockpile: {},
    camps: [{ pos: { x: 3, y: 3, z: 0 }, foundedShift: 1 }],
    ...options,
  });
}

describe('the camp tool', () => {
  it('a tap founds a camp round the tapped square', () => {
    const state = field({ ap: 4 });
    const outcome = tapOutcome(state, 3, 3, 'camp');
    expect(outcome).toEqual({
      entry: { type: 'foundCamp', x: 3, y: 3, ap: 4 },
      lines: [],
      marks: NO_MARKS,
      needsConfirm: false,
    });
  });

  it('a refused tap says why and marks the squares in the way', () => {
    const surface = layer('.');
    surface[2] = '..T.T..';
    const state = field({ surface });
    const before = hashState(state);
    const outcome = tapOutcome(state, 3, 3, 'camp');
    expect(outcome.entry).toBeNull();
    expect(outcome.lines[1]).toContain('has a tree on x2 y2 and x4 y2');
    expect(outcome.marks).toEqual({
      selected: { x: 3, y: 3 },
      tooHigh: [],
      unstable: [],
      blocked: [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
      ],
      blast: [],
      range: [],
    });
    expect(hashState(state)).toBe(before);
  });

  it('a patch that is not flat marks the squares off the level', () => {
    const top = layer('#');
    top[4] = '###.###';
    const state = field({ layers: [top, layer('#')] });
    const outcome = tapOutcome(state, 3, 3, 'camp');
    expect(outcome.lines[1]).toContain('A camp needs a flat patch');
    expect(outcome.marks.blocked).toEqual([{ x: 3, y: 4 }]);
    // The level rule's marks are for a mine, not for a camp.
    expect(outcome.marks.tooHigh).toEqual([]);
  });

  it('with no kit says so and marks only the tapped square', () => {
    const outcome = tapOutcome(field({ stockpile: {} }), 3, 3, 'camp');
    expect(outcome.entry).toBeNull();
    expect(outcome.lines[1]).toContain('You have no camp kit');
    expect(outcome.marks.blocked).toEqual([]);
  });
});

describe('tiles', () => {
  it("a camp's 9 squares carry the camp mark, and no other square does", () => {
    const state = campField();
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const inCamp = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        expect(buildTile(state, x, y).camp).toBe(inCamp);
      }
    }
  });

  it('squares where mining is cheaper carry the mark; camp squares and trees do not', () => {
    // A 12 x 3 strip with a camp at its west end and a tree on (4, 1).
    const surface = ['............', '....T.......', '............'];
    const state = buildState({
      layers: [layer('#', 12, 3), layer('#', 12, 3)],
      surface,
      camps: [{ pos: { x: 1, y: 1, z: 0 }, foundedShift: 1 }],
    });
    expect(buildTile(state, 1, 1)).toMatchObject({ camp: true, cheaper: false });
    expect(buildTile(state, 3, 1)).toMatchObject({ camp: false, cheaper: true });
    expect(buildTile(state, 4, 1)).toMatchObject({ camp: false, cheaper: false }); // the tree
    expect(buildTile(state, 6, 1).cheaper).toBe(true); // 4 steps
    expect(buildTile(state, 7, 1).cheaper).toBe(false); // 5 steps
  });

  it('with no camp nothing is marked', () => {
    const tile = buildTile(field(), 3, 3);
    expect(tile.camp).toBe(false);
    expect(tile.cheaper).toBe(false);
  });
});

describe('a tap on a camp square with the dig tool', () => {
  it('is refused: the camp must be decommissioned first', () => {
    const outcome = tapOutcome(campField(), 3, 3);
    expect(outcome.entry).toBeNull();
    expect(outcome.lines[1]).toContain('A camp stands on x3 y3');
    expect(outcome.marks.selected).toEqual({ x: 3, y: 3 });
  });
});
