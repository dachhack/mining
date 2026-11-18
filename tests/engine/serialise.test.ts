import { describe, expect, it } from 'vitest';
import { createRun, deserialise, hashState, serialise } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { hashString } from '../../src/engine/hash';
import { nextUint32 } from '../../src/engine/rng';
import { addItem, addLooseItems, cloneState, inventoryEntries } from '../../src/engine/state';
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
  });
  state.revealed[0] = 1;
  state.revealed[4] = 1;
  state.fluid[3] = 2;
  state.gas[5] = 1;
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
    expect({ ...loaded, inventory: {}, looseItems: [] }).toEqual({
      ...state,
      inventory: {},
      looseItems: [],
    });
    // Loose items come back in canonical order: by z, then y, then x.
    expect(loaded.looseItems).toEqual([
      { pos: { x: 0, y: 0, z: -1 }, item: 'coal', count: 1 },
      { pos: { x: 1, y: 1, z: 0 }, item: 'stone', count: 2 },
    ]);
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
    expect(() => deserialise({ ...saved, tracesSeen: [1, 17] })).toThrow('"tracesSeen"');
    expect(() => deserialise({ ...saved, size: { x: 3, y: 3, z: 3 } })).toThrow('damaged');
    expect(() =>
      deserialise({ ...saved, avatar: { pos: { x: 9, y: 0, z: 0 }, health: 5 } }),
    ).toThrow('the avatar is at (9, 0, 0)');
    // A status this build does not know. The cast gets it past the type checker.
    const badStatus = { kind: 'paused' } as unknown as typeof saved.status;
    expect(() => deserialise({ ...saved, status: badStatus })).toThrow('unknown run status');
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
      fluid: (s) => (s.fluid[0] = 1),
      gas: (s) => (s.gas[0] = 1),
      structure: (s) => (s.structures[0] = 1),
      'traces seen': (s) => (s.tracesSeen[0] = 1),
      rng: (s) => nextUint32(s.rng),
      seed: (s) => (s.seed += 1),
      'avatar position': (s) => (s.avatar.pos.x = 0),
      health: (s) => (s.avatar.health -= 1),
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
