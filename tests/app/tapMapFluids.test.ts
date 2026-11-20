// The phone map and water and lava (design doc v0.2 sections 6.3, 6.4 and 11;
// issue #99): a tile carries what stands on its square and whether water or
// lava will flow onto it when the shift ends, and a tap on lava is refused
// with the reason.

import { describe, expect, it } from 'vitest';
import { endShift, hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setLavaOn, setWaterOn } from '../../src/engine/standing';
import { squareSummary, tapOutcome } from '../../src/app/map/targets';
import { buildTile, buildTiles, comingFlows } from '../../src/app/map/tiles';
import { buildState, terrainLayers } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** A stone pit drawn from above (see `terrainLayers`). */
function pit(depths: string[], options: Omit<BuildStateOptions, 'layers'> = {}): GameState {
  return buildState({ layers: terrainLayers(depths), fuel: 10, ...options });
}

describe('tiles', () => {
  it('carry the water and lava standing on their squares', () => {
    const state = pit(['222']);
    setWaterOn(state, 0, 0, 2);
    setLavaOn(state, 2, 0, 1, true);
    expect(buildTile(state, 0, 0)).toMatchObject({ water: 2, lava: 0, lavaSource: false });
    expect(buildTile(state, 1, 0)).toMatchObject({ water: 0, lava: 0, lavaSource: false });
    expect(buildTile(state, 2, 0)).toMatchObject({ water: 0, lava: 1, lavaSource: true });
  });

  it('mark the squares water will flow onto when the shift ends', () => {
    const state = pit(['123'], { shift: 1 });
    setWaterOn(state, 0, 0, 1);
    expect(buildTile(state, 0, 0).waterComing).toBe(false);
    expect(buildTile(state, 1, 0).waterComing).toBe(true);
    expect(buildTile(state, 2, 0).waterComing).toBe(false);
    // The mark was right: that is where the water is after the shift.
    const after = endShift(state).state;
    expect(buildTile(after, 1, 0).water).toBe(1);
    expect(buildTile(after, 2, 0).waterComing).toBe(true);
  });

  it('mark where lava will flow only in a shift in which it flows', () => {
    const state = pit(['12'], { shift: 1 });
    setLavaOn(state, 0, 0, 1, false);
    expect(buildTile(state, 1, 0).lavaComing).toBe(false);
    state.shift = 2;
    expect(buildTile(state, 1, 0).lavaComing).toBe(true);
    expect(buildTile(state, 1, 0).waterComing).toBe(false);
  });

  it('building tiles changes nothing, and a run that has ended has no marks', () => {
    const state = pit(['12']);
    setWaterOn(state, 0, 0, 1);
    const before = hashState(state);
    buildTiles(state, { x0: 0, y0: 0, size: 2 });
    expect(hashState(state)).toBe(before);

    state.status = { kind: 'ended', outcome: 'salvage', cause: 'mineClosed' };
    expect(comingFlows(state).water.size).toBe(0);
    expect(buildTile(state, 1, 0).waterComing).toBe(false);
    // What stands on a square is still shown.
    expect(buildTile(state, 0, 0).water).toBe(1);
  });

  it('do not depend on a pocket the player has not seen', () => {
    const layers = [['...'], ['###'], ['###'], ['###'], ['#.#'], ['###']];
    const dry = buildState({ layers, fuel: 10 });
    const wet = buildState({ layers, fuel: 10, water: [{ x: 1, y: 0, z: 4 }] });
    const window = { x0: 0, y0: 0, size: 3 };
    expect(JSON.stringify(buildTiles(wet, window))).toBe(JSON.stringify(buildTiles(dry, window)));
  });
});

describe('a tap', () => {
  it('on a square with lava is refused with the reason, and the square is marked', () => {
    const state = pit(['11', '11']);
    setLavaOn(state, 0, 0, 1, false);
    const outcome = tapOutcome(state, 0, 0);
    expect(outcome.entry).toBeNull();
    expect(outcome.lines[0]).toBe('x0 y0, depth 1: Stone, gives 1 Stone; on it: 1 lava.');
    expect(outcome.lines[1]).toContain('Lava stands on x0 y0');
    expect(outcome.marks.selected).toEqual({ x: 0, y: 0 });
  });

  it('on a flooded square mines it for 1 AP more', () => {
    const state = pit(['11', '11']);
    setWaterOn(state, 0, 0, 1);
    expect(tapOutcome(state, 0, 0).entry).toEqual({ type: 'mine', x: 0, y: 0, ap: 3 });
    expect(squareSummary(state, 0, 0)).toBe('x0 y0, depth 1: Stone, gives 1 Stone; on it: 1 water');
  });
});
