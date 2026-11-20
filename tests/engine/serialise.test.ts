import { describe, expect, it } from 'vitest';
import { createRun, deserialise, hashState, serialise, workedSquares } from '../../src/engine';
import { STRUCTURES } from '../../src/data';
import type { ArmedCharge, Camp, GameState } from '../../src/engine';
import { hashString } from '../../src/engine/hash';
import { nextUint32 } from '../../src/engine/rng';
import {
  STATE_VERSION,
  addItem,
  cloneState,
  crackTimerAt,
  gasAt,
  isLavaSource,
  lavaAt,
  setCrackTimer,
  setLava,
  stockpileEntries,
  structureAt,
  waterAt,
} from '../../src/engine/state';
import { buildState } from './helpers';

/** A small state with something in every part of it. */
function busyState(): GameState {
  const state = buildState({
    layers: [
      ['#d#', 't.c', '###'],
      ['HiH', 'uxH', 'HHH'],
    ],
    health: 7,
    ap: 3,
    fuel: 11,
    shift: 9,
    stockpile: { timber: 2, vent: 5, coal: 0 },
    supports: [{ x: 1, y: 1, z: 0 }],
    seed: 4242,
    // Every field the M2 skeleton added (issue #50), each with something in it.
    worked: [{ x: 2, y: 1 }],
    water: [{ x: 0, y: 2, z: 0 }],
    lava: [{ x: 1, y: 2, z: 1 }],
    lavaSources: [{ x: 2, y: 2, z: 1 }],
    gas: [{ pos: { x: 2, y: 1, z: 0 }, units: 4 }],
    cracks: [
      { pos: { x: 0, y: 0, z: 0 }, timer: 0 },
      { pos: { x: 2, y: 0, z: 0 }, timer: 2 },
    ],
    structures: [{ pos: { x: 2, y: 2, z: 0 }, structure: 'explosive' }],
    // Given out of order: the engine keeps both lists sorted.
    armed: [
      { pos: { x: 1, y: 0, z: 1 }, kind: 'unstableOre' },
      { pos: { x: 2, y: 2, z: 0 }, kind: 'explosive' },
    ],
    camps: [
      { pos: { x: 1, y: 1, z: 1 }, foundedShift: 7 },
      { pos: { x: 1, y: 1, z: 0 }, foundedShift: 3 },
    ],
  });
  state.crew.restingAt = { x: 1, y: 1 };
  state.revealed[0] = 1;
  state.revealed[4] = 1;
  nextUint32(state.rng); // so the RNG is no longer at its seed
  return state;
}

/** Save to a JSON string and load back, as a real save file would. */
function throughJson(state: GameState): GameState {
  return deserialise(JSON.parse(JSON.stringify(serialise(state))));
}

describe('serialise and deserialise', () => {
  it('round-trips a small state to the same hash and the same contents', () => {
    const state = busyState();
    const loaded = throughJson(state);
    expect(hashState(loaded)).toBe(hashState(state));
    // Everything except the zero-count stockpile entry, which is dropped.
    expect(loaded.stockpile).toEqual({ timber: 2, vent: 5 });
    expect({ ...loaded, stockpile: {}, camps: [] }).toEqual({
      ...state,
      stockpile: {},
      camps: [],
    });
    // Camps come back sorted by position.
    expect(loaded.camps).toEqual([
      { pos: { x: 1, y: 1, z: 0 }, foundedShift: 3 },
      { pos: { x: 1, y: 1, z: 1 }, foundedShift: 7 },
    ]);
  });

  it('a save holds the stockpile, and nothing of carrying (issue #92)', () => {
    const saved = serialise(busyState());
    expect(saved.stockpile).toEqual({ timber: 2, vent: 5 });
    const fields = Object.keys(saved);
    expect(fields).not.toContain('inventory');
    expect(fields).not.toContain('looseItems');
    for (const camp of saved.camps) {
      expect(Object.keys(camp)).toEqual(['pos', 'foundedShift']);
    }
  });

  it('round-trips every field the M2 skeleton added', () => {
    const loaded = throughJson(busyState());
    expect(workedSquares(loaded)).toEqual([{ x: 2, y: 1 }]);
    expect(loaded.crew.restingAt).toEqual({ x: 1, y: 1 });
    expect(waterAt(loaded, { x: 0, y: 2, z: 0 })).toBe(1);
    expect(lavaAt(loaded, { x: 1, y: 2, z: 1 })).toBe(1);
    expect(isLavaSource(loaded, { x: 1, y: 2, z: 1 })).toBe(false);
    expect(lavaAt(loaded, { x: 2, y: 2, z: 1 })).toBe(1);
    expect(isLavaSource(loaded, { x: 2, y: 2, z: 1 })).toBe(true);
    expect(gasAt(loaded, { x: 2, y: 1, z: 0 })).toBe(4);
    // A stored timer of 0 is a crack; it must not come back as "no crack".
    expect(crackTimerAt(loaded, { x: 0, y: 0, z: 0 })).toBe(0);
    expect(crackTimerAt(loaded, { x: 2, y: 0, z: 0 })).toBe(2);
    expect(crackTimerAt(loaded, { x: 1, y: 0, z: 0 })).toBeNull();
    expect(structureAt(loaded, { x: 2, y: 2, z: 0 })).toBe(STRUCTURES.explosive.code);
    expect(loaded.armed).toEqual([
      { pos: { x: 2, y: 2, z: 0 }, kind: 'explosive' },
      { pos: { x: 1, y: 0, z: 1 }, kind: 'unstableOre' },
    ]);
    for (const array of [loaded.water, loaded.lava, loaded.lavaSource, loaded.cracks]) {
      expect(array).toBeInstanceOf(Uint8Array);
      expect(array.length).toBe(18);
    }
  });

  it('round-trips a full-size new run to the same hash', () => {
    const state = createRun(123, 'none', 'standard');
    expect(hashState(throughJson(state))).toBe(hashState(state));
  });

  it('round-trips an ended run', () => {
    const state = busyState();
    state.status = { kind: 'ended', outcome: 'lost', cause: 'outOfFuel' };
    const loaded = throughJson(state);
    expect(loaded.status).toEqual({ kind: 'ended', outcome: 'lost', cause: 'outOfFuel' });
    expect(hashState(loaded)).toBe(hashState(state));
  });

  it('gives typed arrays back, not plain lists', () => {
    const loaded = throughJson(busyState());
    expect(loaded.blocks).toBeInstanceOf(Uint8Array);
    expect(loaded.structures).toBeInstanceOf(Uint8Array);
    expect(loaded.blocks.length).toBe(18);
  });

  it('does not change the state it serialises', () => {
    const state = busyState();
    const copy = cloneState(state);
    serialise(state);
    expect(state).toEqual(copy);
  });

  it('refuses a save from another version or with the wrong number of cells', () => {
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 999 })).toThrow('version 999');
    expect(() => deserialise({ ...saved, blocks: [2, 17] })).toThrow('"blocks"');
    expect(() => deserialise({ ...saved, gas: [0, 19] })).toThrow('"gas"');
    expect(() => deserialise({ ...saved, water: [0, 17] })).toThrow('"water"');
    expect(() => deserialise({ ...saved, lava: [0, 19] })).toThrow('"lava"');
    expect(() => deserialise({ ...saved, lavaSource: [0, 17] })).toThrow('"lavaSource"');
    expect(() => deserialise({ ...saved, cracks: [0, 19] })).toThrow('"cracks"');
    expect(() => deserialise({ ...saved, tracesSeen: [1, 17] })).toThrow('"tracesSeen"');
    expect(() => deserialise({ ...saved, size: { x: 3, y: 3, z: 3 } })).toThrow('damaged');
    expect(() =>
      deserialise({ ...saved, armed: [{ pos: { x: 0, y: 0, z: 5 }, kind: 'explosive' }] }),
    ).toThrow('bad armed charge');
    expect(() =>
      deserialise({
        ...saved,
        camps: [{ pos: { x: 0, y: 0, z: -1 }, foundedShift: 1 }],
      }),
    ).toThrow('a camp is at (0, 0, -1)');
    // A status this build does not know. The cast gets it past the type checker.
    const badStatus = { kind: 'paused' } as unknown as typeof saved.status;
    expect(() => deserialise({ ...saved, status: badStatus })).toThrow('unknown run status');
  });

  it('refuses a save from before the M2 skeleton with a clear error', () => {
    // State version 3 was the last M1 shape (decision note 0012).
    expect(STATE_VERSION).toBe(12);
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 3 })).toThrow(
      'Saved state has version 3; this build reads version 12',
    );
  });

  it('refuses a save from before the surface forest with a clear error (issue #70)', () => {
    // State version 4 was the M2 skeleton's shape, with no surface arrays.
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 4 })).toThrow(
      'Saved state has version 4; this build reads version 12',
    );
  });

  it('refuses a save from before ladders were removed with a clear error (issue #80)', () => {
    // State version 5 could hold a ladder (structure code 1, item 'ladder').
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 5 })).toThrow(
      'Saved state has version 5; this build reads version 12',
    );
  });

  it('refuses a save from before light was removed with a clear error (issue #89)', () => {
    // State version 7 held `lampOil`, and could hold a torch or a safety lamp.
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 7 })).toThrow(
      'Saved state has version 7; this build reads version 12',
    );
  });

  it('refuses a save from before mining by square with a clear error (issue #86)', () => {
    // State version 6 held the miner's position, and its revealed cells
    // followed the light rule.
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 6 })).toThrow(
      'Saved state has version 6; this build reads version 12',
    );
  });

  it('refuses a save from before crew health with a clear error (issue #90)', () => {
    // State version 8 held `avatar` (health and air) and no worked squares.
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 8 })).toThrow(
      'Saved state has version 8; this build reads version 12',
    );
  });

  it('refuses a save from before carrying was removed with a clear error (issue #92)', () => {
    // State version 9 held `inventory` and `looseItems`, and a `stash` in
    // each camp.
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 9 })).toThrow(
      'Saved state has version 9; this build reads version 12',
    );
  });

  it('refuses a save from before camps with a clear error (issue #100)', () => {
    // State version 11 held the flag `crew.resting`, not `crew.restingAt`.
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 11 })).toThrow(
      'Saved state has version 11; this build reads version 12',
    );
  });
});

describe('hashState', () => {
  it('is 16 hex digits and the same every time', () => {
    const state = busyState();
    expect(hashState(state)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashState(state)).toBe(hashState(busyState()));
  });

  it('changes when any part of the state changes', () => {
    const base = busyState();
    const baseHash = hashState(base);

    // Each entry changes one thing on a fresh copy.
    const changes: Record<string, (state: GameState) => void> = {
      block: (s) => (s.blocks[0] = 0),
      // Cell 9 is (0, 0, 1): under a top block, so not revealed in `base`.
      revealed: (s) => (s.revealed[9] = 1),
      water: (s) => (s.water[0] = 1),
      lava: (s) => (s.lava[0] = 1),
      'lava source': (s) => setLava(s, { x: 1, y: 2, z: 1 }, 1, true),
      gas: (s) => (s.gas[0] = 1),
      'a new crack': (s) => setCrackTimer(s, { x: 1, y: 0, z: 0 }, 0),
      'a crack timer': (s) => setCrackTimer(s, { x: 2, y: 0, z: 0 }, 1),
      structure: (s) => (s.structures[0] = 1),
      // Cell 9 again: traces are already seen on the top blocks near the ore.
      'traces seen': (s) => (s.tracesSeen[9] = 1),
      'a surface cell': (s) => (s.surface[0] = 1),
      "a stump's age": (s) => (s.stumpAge[1] = 3),
      rng: (s) => nextUint32(s.rng),
      seed: (s) => (s.seed += 1),
      health: (s) => (s.crew.health -= 1),
      'a worked square': (s) => (s.worked[0] = 1),
      resting: (s) => (s.crew.restingAt = null),
      'the camp rested at': (s) => (s.crew.restingAt = { x: 2, y: 1 }),
      'an armed charge gone': (s) => s.armed.pop(),
      'an armed charge of another kind': (s) => {
        (s.armed[0] as ArmedCharge).kind = 'unstableOre';
      },
      'a camp gone': (s) => s.camps.pop(),
      'a camp position': (s) => ((s.camps[0] as Camp).pos.x = 0),
      'a camp founding shift': (s) => ((s.camps[0] as Camp).foundedShift += 1),
      ap: (s) => (s.ap -= 1),
      fuel: (s) => (s.fuel -= 1),
      shift: (s) => (s.shift += 1),
      stockpile: (s) => (s.stockpile['timber'] = 3),
      status: (s) => (s.status = { kind: 'ended', outcome: 'salvage', cause: 'mineClosed' }),
    };
    const hashes = new Set<string>([baseHash]);
    for (const [name, change] of Object.entries(changes)) {
      const changed = cloneState(base);
      change(changed);
      const hash = hashState(changed);
      expect(hash, `changing ${name} must change the hash`).not.toBe(baseHash);
      hashes.add(hash);
    }
    // And no two of those changes collide with each other.
    expect(hashes.size).toBe(Object.keys(changes).length + 1);
  });

  it('ignores differences that mean nothing', () => {
    const base = busyState();

    // The order items were added to the stockpile.
    const reordered = cloneState(base);
    reordered.stockpile = { vent: 5, timber: 2 };
    expect(hashState(reordered)).toBe(hashState(base));

    // A stockpile entry with a count of 0.
    const withZero = cloneState(base);
    withZero.stockpile['stone'] = 0;
    expect(hashState(withZero)).toBe(hashState(base));

    // The order of the armed charges and of the camps.
    const m2 = cloneState(base);
    m2.armed.reverse();
    m2.camps.reverse();
    expect(hashState(m2)).toBe(hashState(base));
  });

  it('gives a state and its saved-and-loaded copy the same order to walk', () => {
    // Built so that the live order is not the sorted order.
    const state = buildState({ layers: [['....'], ['####']] });
    addItem(state, 'timber', 1);
    addItem(state, 'coal', 2);
    addItem(state, 'vent', 3);
    expect(Object.keys(state.stockpile)).toEqual(['timber', 'coal', 'vent']);

    const loaded = throughJson(state);
    expect(hashState(loaded)).toBe(hashState(state));
    expect(stockpileEntries(loaded)).toEqual(stockpileEntries(state));
  });

  it('tells a cube from the same blocks in another shape', () => {
    const wide = buildState({ layers: [['##.#']] });
    const tall = buildState({ layers: [['#'], ['#'], ['.'], ['#']] });
    expect(hashState(wide)).not.toBe(hashState(tall));
  });

  it('gives a fixed, known value (the same in Node and in a browser)', () => {
    // These pin the hash function itself. If they change, every golden-run
    // hash changes with them, and the PR must say so.
    expect(hashString('')).toBe('488bdcb81aee8d83');
    expect(hashString('mining')).toBe('e4e23f054f732601');
    expect(hashString('mining')).not.toBe(hashString('minign'));
  });
});
