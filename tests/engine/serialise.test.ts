import { describe, expect, it } from 'vitest';
import { createRun, deserialise, hashState, serialise } from '../../src/engine';
import { STRUCTURES } from '../../src/data';
import type { ArmedCharge, Camp, GameState } from '../../src/engine';
import { hashString } from '../../src/engine/hash';
import { nextUint32 } from '../../src/engine/rng';
import {
  STATE_VERSION,
  addItem,
  addLooseItems,
  cloneState,
  inventoryEntries,
  crackTimerAt,
  gasAt,
  isLavaSource,
  lavaAt,
  setCrackTimer,
  setLava,
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
    avatar: { x: 1, y: 1, z: 0 },
    health: 7,
    ap: 3,
    fuel: 11,
    lampOil: 4,
    shift: 9,
    inventory: { timber: 2, ladder: 5, coal: 0 },
    looseItems: [
      { pos: { x: 1, y: 1, z: 0 }, item: 'stone', count: 2 },
      { pos: { x: 0, y: 0, z: -1 }, item: 'coal', count: 1 },
    ],
    ladders: [{ x: 1, y: 1, z: 0 }],
    seed: 4242,
    // Every field the M2 skeleton added (issue #50), each with something in it.
    air: 6,
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
      { pos: { x: 1, y: 1, z: 1 }, foundedShift: 7, stash: { stone: 3, coal: 1, timber: 0 } },
      { pos: { x: 1, y: 1, z: 0 }, foundedShift: 3, stash: {} },
    ],
  });
  state.avatar.resting = true;
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
    // Everything except the zero-count inventory entry, which is dropped.
    expect(loaded.inventory).toEqual({ ladder: 5, timber: 2 });
    expect({ ...loaded, inventory: {}, looseItems: [], camps: [] }).toEqual({
      ...state,
      inventory: {},
      looseItems: [],
      camps: [],
    });
    // Camps come back sorted by position, each stash without its zero counts.
    expect(loaded.camps).toEqual([
      { pos: { x: 1, y: 1, z: 0 }, foundedShift: 3, stash: {} },
      { pos: { x: 1, y: 1, z: 1 }, foundedShift: 7, stash: { coal: 1, stone: 3 } },
    ]);
    // Loose items come back in canonical order: by z, then y, then x.
    expect(loaded.looseItems).toEqual([
      { pos: { x: 0, y: 0, z: -1 }, item: 'coal', count: 1 },
      { pos: { x: 1, y: 1, z: 0 }, item: 'stone', count: 2 },
    ]);
  });

  it('round-trips every field the M2 skeleton added', () => {
    const loaded = throughJson(busyState());
    expect(loaded.avatar.air).toBe(6);
    expect(loaded.avatar.resting).toBe(true);
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

  it('deserialise merges two piles of the same item in the same cell', () => {
    // A save written by hand, or by an older build, may list a cell's pile in
    // parts. The loaded state must hold one pile, as the engine keeps them.
    const saved = serialise(busyState());
    saved.looseItems = [
      { pos: { x: 1, y: 1, z: 0 }, item: 'stone', count: 2 },
      { pos: { x: 0, y: 0, z: 0 }, item: 'coal', count: 1 },
      { pos: { x: 1, y: 1, z: 0 }, item: 'stone', count: 3 },
    ];
    const loaded = deserialise(JSON.parse(JSON.stringify(saved)));
    expect(loaded.looseItems).toEqual([
      { pos: { x: 0, y: 0, z: 0 }, item: 'coal', count: 1 },
      { pos: { x: 1, y: 1, z: 0 }, item: 'stone', count: 5 },
    ]);
  });

  it('round-trips a full-size new run to the same hash', () => {
    const state = createRun(123, 'none', 'standard');
    expect(hashState(throughJson(state))).toBe(hashState(state));
  });

  it('round-trips an ended run', () => {
    const state = busyState();
    state.status = { kind: 'ended', outcome: 'death', cause: 'fell' };
    const loaded = throughJson(state);
    expect(loaded.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'fell' });
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
      deserialise({ ...saved, avatar: { ...saved.avatar, pos: { x: 9, y: 0, z: 0 } } }),
    ).toThrow('the avatar is at (9, 0, 0)');
    expect(() =>
      deserialise({ ...saved, armed: [{ pos: { x: 0, y: 0, z: 5 }, kind: 'explosive' }] }),
    ).toThrow('bad armed charge');
    expect(() =>
      deserialise({
        ...saved,
        camps: [{ pos: { x: 0, y: 0, z: -1 }, foundedShift: 1, stash: {} }],
      }),
    ).toThrow('a camp is at (0, 0, -1)');
    // A status this build does not know. The cast gets it past the type checker.
    const badStatus = { kind: 'paused' } as unknown as typeof saved.status;
    expect(() => deserialise({ ...saved, status: badStatus })).toThrow('unknown run status');
  });

  it('refuses a save from before the M2 skeleton with a clear error', () => {
    // State version 3 was the last M1 shape (decision note 0012).
    expect(STATE_VERSION).toBe(4);
    const saved = serialise(busyState());
    expect(() => deserialise({ ...saved, version: 3 })).toThrow(
      'Saved state has version 3; this build reads version 4',
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
      revealed: (s) => (s.revealed[1] = 1),
      water: (s) => (s.water[0] = 1),
      lava: (s) => (s.lava[0] = 1),
      'lava source': (s) => setLava(s, { x: 1, y: 2, z: 1 }, 1, true),
      gas: (s) => (s.gas[0] = 1),
      'a new crack': (s) => setCrackTimer(s, { x: 1, y: 0, z: 0 }, 0),
      'a crack timer': (s) => setCrackTimer(s, { x: 2, y: 0, z: 0 }, 1),
      structure: (s) => (s.structures[0] = 1),
      'traces seen': (s) => (s.tracesSeen[0] = 1),
      rng: (s) => nextUint32(s.rng),
      seed: (s) => (s.seed += 1),
      'avatar position': (s) => (s.avatar.pos.x = 0),
      health: (s) => (s.avatar.health -= 1),
      air: (s) => (s.avatar.air -= 1),
      resting: (s) => (s.avatar.resting = false),
      'an armed charge gone': (s) => s.armed.pop(),
      'an armed charge of another kind': (s) => {
        (s.armed[0] as ArmedCharge).kind = 'unstableOre';
      },
      'a camp gone': (s) => s.camps.pop(),
      'a camp position': (s) => ((s.camps[0] as Camp).pos.x = 0),
      'a camp founding shift': (s) => ((s.camps[0] as Camp).foundedShift += 1),
      'a camp stash': (s) => ((s.camps[1] as Camp).stash['coal'] = 2),
      ap: (s) => (s.ap -= 1),
      fuel: (s) => (s.fuel -= 1),
      'lamp oil': (s) => (s.lampOil -= 1),
      shift: (s) => (s.shift += 1),
      inventory: (s) => (s.inventory['timber'] = 3),
      'loose items': (s) => s.looseItems.pop(),
      status: (s) => (s.status = { kind: 'ended', outcome: 'salvage', cause: 'left' }),
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

    // The order items were added to the inventory.
    const reordered = cloneState(base);
    reordered.inventory = { ladder: 5, timber: 2 };
    expect(hashState(reordered)).toBe(hashState(base));

    // The order of the loose-items list.
    const shuffled = cloneState(base);
    shuffled.looseItems.reverse();
    expect(hashState(shuffled)).toBe(hashState(base));

    // The order of the armed charges and of the camps, the order items were
    // put into a stash, and a stash entry with a count of 0.
    const m2 = cloneState(base);
    m2.armed.reverse();
    m2.camps.reverse();
    for (const camp of m2.camps) {
      if (camp.foundedShift === 7) {
        camp.stash = { timber: 0, coal: 1, ladder: 0, stone: 3 };
      }
    }
    expect(hashState(m2)).toBe(hashState(base));
  });

  it('treats piles of one item in one cell as their total, however they were added', () => {
    const cell = { x: 1, y: 1, z: 0 };
    const withPiles = (counts: number[]): GameState => {
      const state = busyState();
      // Written straight into the list, behind the helpers' back.
      state.looseItems = counts.map((count) => ({ pos: { ...cell }, item: 'coal', count }));
      return state;
    };
    const three = hashState(withPiles([3]));
    expect(hashState(withPiles([1, 2]))).toBe(three);
    expect(hashState(withPiles([2, 1]))).toBe(three);
    expect(hashState(withPiles([1, 1, 1, 0]))).toBe(three);
    expect(hashState(withPiles([4]))).not.toBe(three);
  });

  it('gives a state and its saved-and-loaded copy the same order to walk', () => {
    // Built so that the live order is not the sorted order.
    const state = buildState({ layers: [['....'], ['####']], avatar: { x: 0, y: 0, z: 0 } });
    addItem(state, 'timber', 1);
    addItem(state, 'coal', 2);
    addItem(state, 'ladder', 3);
    addLooseItems(state, { x: 3, y: 0, z: 0 }, 'stone', 1);
    addLooseItems(state, { x: 1, y: 0, z: 0 }, 'stone', 1);
    addLooseItems(state, { x: 1, y: 0, z: 0 }, 'coal', 1);
    expect(Object.keys(state.inventory)).toEqual(['timber', 'coal', 'ladder']);

    const loaded = throughJson(state);
    expect(hashState(loaded)).toBe(hashState(state));
    expect(inventoryEntries(loaded)).toEqual(inventoryEntries(state));
    expect(loaded.looseItems).toEqual(state.looseItems);
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
