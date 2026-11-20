import { describe, expect, it } from 'vitest';
import { CONTRACT_IDS, CREW, LOADOUTS, SHIFT, WORLD } from '../../src/data';
import {
  createRun,
  hashState,
  legalActions,
  previewCubePhase,
  workedSquares,
} from '../../src/engine';
import { cellCount } from '../../src/engine/state';

describe('createRun', () => {
  it('has a crew and no avatar: health, resting, and no air (issue #90)', () => {
    const state = createRun(1, 'none', 'standard');
    expect(state.crew).toEqual({ health: CREW.startHealth, resting: false });
    expect(Object.keys(state)).not.toContain('avatar');
  });

  it('starts with no worked square', () => {
    const state = createRun(1, 'none', 'standard');
    expect(state.worked).toHaveLength(WORLD.size.x * WORLD.size.y);
    expect(workedSquares(state)).toEqual([]);
  });

  it('gives the starting kit of the loadout', () => {
    const state = createRun(1, 'none', 'standard');
    const loadout = LOADOUTS.standard;
    expect(state.fuel).toBe(loadout.fuel);
    const expectedStockpile: Record<string, number> = {};
    for (const stack of loadout.items) {
      expectedStockpile[stack.item] = stack.count;
    }
    expect(state.stockpile).toEqual(expectedStockpile);
    expect(state.loadoutId).toBe('standard');
    expect(state.contractId).toBe('none');
  });

  it('matches decision note 0005 item 22 (the standard kit) and item 2 (the start)', () => {
    // The one test that states the numbers themselves, so that an accidental
    // edit of the data shows up. A deliberate change updates this test.
    const state = createRun(1, 'none', 'standard');
    expect(state.fuel).toBe(24);
    // No lamp oil since issue #89.
    expect('lampOil' in state).toBe(false);
    // No carrying since issue #92: the kit is in the stockpile.
    expect('inventory' in state).toBe(false);
    expect('looseItems' in state).toBe(false);
    // No ladders since issue #80.
    expect(state.stockpile).toEqual({ timber: 2 });
    expect(state.crew.health).toBe(10);
    expect(state.ap).toBe(5);
    expect(state.size).toEqual({ x: 32, y: 32, z: 32 });
  });

  it('starts a full-health crew on the first shift with a full shift of AP', () => {
    const state = createRun(1, 'none', 'standard');
    expect(state.crew.health).toBe(CREW.startHealth);
    expect(state.ap).toBe(SHIFT.apPerShift);
    expect(state.shift).toBe(SHIFT.firstShiftNumber);
    expect(state.status).toEqual({ kind: 'active' });
  });

  it('builds a cube of the size in the data, with a solid top layer', () => {
    const state = createRun(1, 'none', 'standard');
    expect(state.size).toEqual(WORLD.size);
    expect(state.size).not.toBe(WORLD.size);
    const cells = cellCount(WORLD.size);
    for (const array of [
      state.blocks,
      state.revealed,
      state.water,
      state.lava,
      state.lavaSource,
      state.gas,
      state.cracks,
      state.structures,
      state.tracesSeen,
    ]) {
      expect(array).toBeInstanceOf(Uint8Array);
      expect(array.length).toBe(cells);
    }
    // The surface is flat: caverns and pockets lie below layer 0 (issue #95).
    const topLayer = state.blocks.subarray(0, WORLD.size.x * WORLD.size.y);
    expect(topLayer.every((code) => code !== 0)).toBe(true);
  });

  it('gives the same state for the same seed', () => {
    expect(hashState(createRun(77, 'none', 'standard'))).toBe(
      hashState(createRun(77, 'none', 'standard')),
    );
  });

  it('gives a different state for a different seed', () => {
    const a = createRun(77, 'none', 'standard');
    const b = createRun(78, 'none', 'standard');
    expect(a.seed).toBe(77);
    expect(b.seed).toBe(78);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('rejects a bad seed, an unknown contract and an unknown loadout', () => {
    expect(() => createRun(-1, 'none', 'standard')).toThrow('Seed');
    expect(() => createRun(1.5, 'none', 'standard')).toThrow('Seed');
    expect(() => createRun(2 ** 32, 'none', 'standard')).toThrow('Seed');
    expect(() => createRun(1, 'deep-relic', 'standard')).toThrow('Unknown contract id');
    expect(() => createRun(1, 'none', 'surveyor')).toThrow('Unknown loadout id');
    // A name every JavaScript object inherits must not pass for a loadout.
    expect(() => createRun(1, 'none', 'toString')).toThrow('Unknown loadout id');
    expect(CONTRACT_IDS).toContain('none');
  });

  it('does not change its input when read: legalActions and previewCubePhase leave the state alone', () => {
    const state = createRun(5, 'none', 'standard');
    const before = hashState(state);
    legalActions(state);
    previewCubePhase(state);
    expect(hashState(state)).toBe(before);
  });
});
