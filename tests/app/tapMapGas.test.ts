// The phone map and gas, charges and blasts (design doc v0.2 sections 6.5,
// 6.6 and 11; issue #103): a tile carries the gas standing on its square,
// whether gas will spread onto it, a placed explosive or armed unstable ore,
// and whether it will be in an explosion when the shift ends. The explosive
// tool shows the blast at the first tap and places at the second.

import { describe, expect, it } from 'vitest';
import { BLOCKS, HAZARDS, STRUCTURES } from '../../src/data';
import { applyAction, depthAt, endShift, hashState } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { setGasOn, setLavaOn } from '../../src/engine/standing';
import { armCharge, setBlock, setGas, setStructure } from '../../src/engine/state';
import { NO_MARKS, tapOutcome } from '../../src/app/map/targets';
import { buildTile, buildTiles, comingFlows } from '../../src/app/map/tiles';
import { act, buildState, terrainLayers } from '../engine/helpers';
import type { BuildStateOptions } from '../engine/helpers';

/** A pit drawn from above (see `terrainLayers`): stone unless `materials` says otherwise. */
function pit(
  depths: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
  materials?: string[],
  layerCount?: number,
): GameState {
  return buildState({
    layers: terrainLayers(depths, materials, layerCount),
    fuel: 10,
    shift: 3, // a shift in which lava does not flow
    ...options,
  });
}

/** Put a placed, armed explosive on the square (x, y), as the action does. */
function plant(state: GameState, x: number, y: number): void {
  const top = { x, y, z: depthAt(state, x, y) };
  setStructure(state, top, STRUCTURES.explosive.code);
  armCharge(state, top, 'explosive');
}

/** The "x,y" of every tile of a one-row map for which `pick` is true. */
function squaresWhere(state: GameState, pick: (x: number) => boolean): string[] {
  const out: string[] = [];
  for (let x = 0; x < state.size.x; x += 1) {
    if (pick(x)) {
      out.push(`${x},0`);
    }
  }
  return out;
}

describe('tiles and gas', () => {
  it('carry the gas standing on their squares', () => {
    const state = pit(['212']);
    setGasOn(state, 0, 0, 7);
    expect(buildTile(state, 0, 0)).toMatchObject({ gas: 7, gasComing: false });
    expect(buildTile(state, 1, 0)).toMatchObject({ gas: 0, gasComing: false });
  });

  it('mark the squares gas will spread onto when the shift ends', () => {
    const state = pit(['1112']);
    setGasOn(state, 0, 0, 8);
    expect(squaresWhere(state, (x) => buildTile(state, x, 0).gasComing)).toEqual(['1,0']);
    // The mark was right: that is where the gas is after the shift.
    const after = endShift(state).state;
    expect(buildTile(after, 1, 0).gas).toBe(4);
    expect(squaresWhere(after, (x) => buildTile(after, x, 0).gasComing)).toEqual(['2,0']);
  });

  it('mark only squares that have no gas yet: settled gas that swaps units is not news', () => {
    // 3 and 0 become 2 and 1, and then 1 and 2, and so on for ever.
    let state = pit(['11']);
    setGasOn(state, 0, 0, 3);
    expect(buildTile(state, 1, 0).gasComing).toBe(true);
    state = endShift(state).state;
    for (let n = 0; n < 4; n += 1) {
      expect(comingFlows(state).gas.size).toBeGreaterThan(0); // units do still move
      expect(buildTile(state, 0, 0).gasComing).toBe(false);
      expect(buildTile(state, 1, 0).gasComing).toBe(false);
      state = endShift(state).state;
    }
  });

  it('mark the squares whose gas will burn as a blast', () => {
    const state = pit(['11112']);
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 1, 0, 1);
    setGasOn(state, 2, 0, 1);
    setGasOn(state, 4, 0, 3); // not connected, and not beside the lava
    expect(squaresWhere(state, (x) => buildTile(state, x, 0).blast)).toEqual(['1,0', '2,0']);
  });
});

describe('tiles, charges and blasts', () => {
  it('show a placed explosive with its own mark, and its blast', () => {
    const state = pit(['000', '000', '000']);
    plant(state, 1, 1);
    const centre = buildTile(state, 1, 1);
    expect(centre.charge).toBe('explosive');
    expect(centre.structure).toBeNull(); // not the plain "other structure" mark
    const blast: string[] = [];
    for (const row of buildTiles(state, { x0: 0, y0: 0, size: 3 })) {
      for (const tile of row) {
        if (tile.blast) blast.push(`${tile.x},${tile.y}`);
        if (tile.x !== 1 || tile.y !== 1) expect(tile.charge).toBeNull();
      }
    }
    expect(blast).toEqual(['1,0', '0,1', '1,1', '2,1', '1,2']);
  });

  it('show armed unstable ore and its blast, from the moment it is armed', () => {
    const state = pit(['000'], {}, ['##U']);
    expect(buildTile(state, 2, 0).charge).toBeNull();
    const after = act(state, { type: 'mine', x: 1, y: 0 }).state;
    expect(buildTile(after, 2, 0)).toMatchObject({ charge: 'armedOre', block: 'unstableOre' });
    expect(squaresWhere(after, (x) => buildTile(after, x, 0).blast)).toEqual(['1,0', '2,0']);
    // After it has gone off nothing is marked.
    const later = endShift(after).state;
    expect(squaresWhere(later, (x) => buildTile(later, x, 0).blast)).toEqual([]);
    expect(buildTile(later, 2, 0).charge).toBeNull();
  });

  it('a tree in a blast is marked too, and stays a tree tile', () => {
    const state = pit(['00'], { surface: ['T.'] });
    plant(state, 1, 0);
    expect(buildTile(state, 0, 0)).toMatchObject({ kind: 'hidden', blast: true, charge: null });
  });

  it('building tiles changes nothing, and a run that has ended has no marks', () => {
    const state = pit(['111']);
    plant(state, 1, 0);
    setGasOn(state, 0, 0, 6);
    const before = hashState(state);
    buildTiles(state, { x0: 0, y0: 0, size: 3 });
    expect(hashState(state)).toBe(before);

    state.status = { kind: 'ended', outcome: 'salvage', cause: 'mineClosed' };
    expect(comingFlows(state).blast.size).toBe(0);
    expect(buildTile(state, 1, 0)).toMatchObject({ blast: false, gasComing: false });
    // What stands on a square, and the charge, are still shown.
    expect(buildTile(state, 0, 0).gas).toBe(6);
    expect(buildTile(state, 1, 0).charge).toBe('explosive');
  });

  it('do not depend on anything below the tops: a pocket, a cavern, ore, a relic', () => {
    function charged(hidden: boolean): GameState {
      const state = pit(['111', '111', '111'], {}, undefined, 6);
      plant(state, 1, 1);
      setGasOn(state, 0, 0, 5);
      if (hidden) {
        // Under the blast: a gas pocket, a cavern, unstable ore and a relic.
        setBlock(state, { x: 1, y: 1, z: 2 }, BLOCKS.air.code);
        setGas(state, { x: 1, y: 1, z: 2 }, HAZARDS.gas.pocketUnitsPerCell);
        setBlock(state, { x: 0, y: 1, z: 3 }, BLOCKS.air.code);
        setBlock(state, { x: 2, y: 1, z: 2 }, BLOCKS.unstableOre.code);
        setBlock(state, { x: 1, y: 0, z: 2 }, BLOCKS.relic.code);
      }
      return state;
    }
    const window = { x0: 0, y0: 0, size: 3 };
    const plain = JSON.stringify(buildTiles(charged(false), window));
    const withHidden = JSON.stringify(buildTiles(charged(true), window));
    // Only the "pitted" tell could differ, and tiles do not carry tells.
    expect(withHidden).toBe(plain);
  });
});

describe('a tap with the explosive tool', () => {
  it('first shows the blast, then places the charge at the second tap', () => {
    const state = pit(['000', '000', '000'], { stockpile: { explosive: 1 } });
    const first = tapOutcome(state, 1, 1, 'explosive');
    expect(first.entry).toBeNull();
    expect(first.needsConfirm).toBe(true);
    expect(first.marks.selected).toEqual({ x: 1, y: 1 });
    expect(first.marks.blast).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
    expect(first.lines.join(' ')).toContain('5 marked squares');

    const second = tapOutcome(state, 1, 1, 'explosive', true);
    expect(second.marks).toEqual(NO_MARKS);
    expect(second.entry).toEqual({ type: 'placeExplosive', x: 1, y: 1, ap: 1 });
    // The engine takes exactly that action.
    if (second.entry === null) throw new Error('no entry');
    const after = applyAction(state, second.entry).state;
    expect(buildTile(after, 1, 1).charge).toBe('explosive');
  });

  it('is refused with the reason: none to place, a tree, lava, too little AP', () => {
    const none = pit(['00']);
    expect(tapOutcome(none, 0, 0, 'explosive').lines[1]).toContain('no explosive');

    const state = pit(['01'], { surface: ['T.'], stockpile: { explosive: 1 } });
    setLavaOn(state, 1, 0, 1, false);
    const onTree = tapOutcome(state, 0, 0, 'explosive', true);
    expect(onTree.entry).toBeNull();
    expect(onTree.needsConfirm).toBe(false);
    expect(onTree.lines[1]).toContain('tree');
    expect(onTree.marks.blast).toEqual([]);
    expect(tapOutcome(state, 1, 0, 'explosive').lines[1]).toContain('Lava');

    const tired = pit(['00'], { stockpile: { explosive: 1 }, ap: 0 });
    expect(tapOutcome(tired, 0, 0, 'explosive', true).lines[1]).toContain('costs 1 AP');
    expect(tapOutcome(state, 9, 9, 'explosive').entry).toBeNull();
  });
});

describe('a tap that would arm unstable ore', () => {
  it('warns, marks the blast, and mines at the second tap', () => {
    const state = pit(['000'], {}, ['##U']);
    const first = tapOutcome(state, 1, 0);
    expect(first.entry).toBeNull();
    expect(first.needsConfirm).toBe(true);
    expect(first.lines.join(' ')).toContain('would ARM the unstable ore on x2 y0');
    expect(first.marks.blast).toEqual([
      { x: 2, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(tapOutcome(state, 1, 0, 'dig', true).entry).toMatchObject({ type: 'mine', x: 1, y: 0 });
  });

  it('does not warn for braced ore, for ore under an uncut tree, or for mining the ore itself', () => {
    const braced = pit(['000'], { supports: [{ x: 2, y: 0, z: 0 }] }, ['##U']);
    expect(tapOutcome(braced, 1, 0).entry).not.toBeNull();
    const unseen = pit(['000'], { surface: ['..T'] }, ['##U']);
    expect(tapOutcome(unseen, 1, 0).entry).not.toBeNull();
    const state = pit(['000'], {}, ['##U']);
    expect(tapOutcome(state, 2, 0).entry).toMatchObject({ type: 'mine', x: 2, y: 0 });
  });
});
