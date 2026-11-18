// Scenario tests for picking up and dropping loose items (design doc 4.1;
// decision note 0005 items 17 and 18; owner question 30).

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, AVATAR, ITEMS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import {
  carriedWeight,
  carryCapacity,
  countItem,
  deserialise,
  hashState,
  legalActions,
  looseItemsAt,
  serialise,
} from '../../src/engine';
import type { Action, GameState } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { act, buildState, findActions } from './helpers';

// A plus-shaped room one cell high, cut into the top layer, on a solid floor.
// The avatar stands in the middle, at (2, 2, 0).
const ROOM: string[][] = [
  ['#####', '##.##', '#...#', '##.##', '#####'],
  ['#####', '#####', '#####', '#####', '#####'],
];
const MIDDLE: Vec3 = { x: 2, y: 2, z: 0 };
const NORTH: Vec3 = { x: 2, y: 1, z: 0 };
const EAST: Vec3 = { x: 3, y: 2, z: 0 };

describe('pick up', () => {
  it('takes a whole pile from the avatar’s cell or a face neighbour, for 0 AP', () => {
    expect(ACTION_COSTS.pickUp).toBe(0);
    const state = buildState({
      layers: ROOM,
      avatar: MIDDLE,
      ap: 0,
      revealAll: true, // so the events below are the pick-up's alone
      looseItems: [
        { pos: MIDDLE, item: 'coal', count: 2 },
        { pos: EAST, item: 'timber', count: 3 },
      ],
    });
    expect(findActions(state, { type: 'pickUp' })).toEqual([
      { type: 'pickUp', from: MIDDLE, item: 'coal', count: 2, ap: 0 },
      { type: 'pickUp', from: EAST, item: 'timber', count: 3, ap: 0 },
    ]);

    const { state: after, events } = act(state, { type: 'pickUp', from: EAST });
    expect(countItem(after, 'timber')).toBe(3);
    expect(looseItemsAt(after, EAST)).toEqual([]);
    expect(looseItemsAt(after, MIDDLE)).toEqual([{ item: 'coal', count: 2 }]);
    expect(events).toEqual([{ type: 'itemPickedUp', from: EAST, item: 'timber', count: 3 }]);
    expect(after.ap).toBe(0);
  });

  it('does not reach a cell that only touches at a corner, or one 2 away', () => {
    // A 3 x 3 room, so the corner cell is open and can hold items.
    const state = buildState({
      layers: [
        ['#####', '#...#', '#...#', '#...#', '#####'],
        ['#####', '#####', '#####', '#####', '#####'],
      ],
      avatar: { x: 1, y: 2, z: 0 },
      looseItems: [
        { pos: { x: 2, y: 1, z: 0 }, item: 'coal', count: 1 }, // diagonal
        { pos: { x: 3, y: 2, z: 0 }, item: 'coal', count: 1 }, // 2 east
      ],
    });
    expect(findActions(state, { type: 'pickUp' })).toEqual([]);
  });

  it('takes only as many as fit, and none when not even one fits', () => {
    // Room for exactly 3 more coal (weight 1 each).
    expect(ITEMS.coal.weight).toBe(1);
    const state = buildState({
      layers: ROOM,
      avatar: MIDDLE,
      inventory: { coal: AVATAR.carryCapacity - 3 },
      looseItems: [{ pos: NORTH, item: 'coal', count: 5 }],
    });
    expect(findActions(state, { type: 'pickUp' })).toEqual([
      { type: 'pickUp', from: NORTH, item: 'coal', count: 3, ap: 0 },
    ]);
    const { state: after } = act(state, { type: 'pickUp' });
    expect(carriedWeight(after)).toBe(carryCapacity());
    expect(looseItemsAt(after, NORTH)).toEqual([{ item: 'coal', count: 2 }]);
    // Full: the rest of the pile cannot be picked up.
    expect(findActions(after, { type: 'pickUp' })).toEqual([]);
  });

  it('always fits an item that weighs nothing', () => {
    expect(ITEMS.ladder.weight).toBe(0);
    const state = buildState({
      layers: ROOM,
      avatar: MIDDLE,
      inventory: { coal: AVATAR.carryCapacity },
      looseItems: [{ pos: MIDDLE, item: 'ladder', count: 4 }],
    });
    const { state: after } = act(state, { type: 'pickUp', item: 'ladder', count: 4 });
    expect(countItem(after, 'ladder')).toBe(4);
  });
});

describe('drop', () => {
  it('offers one unit, or the whole stack, of each carried item for 0 AP', () => {
    expect(ACTION_COSTS.drop).toBe(0);
    const state = buildState({
      layers: ROOM,
      avatar: MIDDLE,
      ap: 0,
      // Written out of order on purpose: the list is by item id whatever the
      // order the items were added in.
      inventory: { timber: 1, coal: 3, stone: 0 },
    });
    expect(findActions(state, { type: 'drop' })).toEqual([
      { type: 'drop', item: 'coal', count: 1, ap: 0 },
      { type: 'drop', item: 'coal', count: 3, ap: 0 },
      { type: 'drop', item: 'timber', count: 1, ap: 0 },
    ]);
  });

  it('puts the items in the avatar’s own cell, joining a pile already there', () => {
    const state = buildState({
      layers: ROOM,
      avatar: MIDDLE,
      revealAll: true, // so the events below are the drop's alone
      inventory: { coal: 3 },
      looseItems: [{ pos: MIDDLE, item: 'coal', count: 1 }],
    });
    const { state: after, events } = act(state, { type: 'drop', item: 'coal', count: 3 });
    expect(countItem(after, 'coal')).toBe(0);
    expect(looseItemsAt(after, MIDDLE)).toEqual([{ item: 'coal', count: 4 }]);
    expect(events).toEqual([{ type: 'itemDropped', pos: MIDDLE, item: 'coal', count: 3 }]);
    // The state the action was applied to is untouched.
    expect(countItem(state, 'coal')).toBe(3);
  });

  it('works on the surface, where loose items may lie (owner question 28)', () => {
    const onSurface: Vec3 = { x: 0, y: 0, z: -1 };
    const state = buildState({ layers: [['##', '##']], avatar: onSurface, inventory: { coal: 1 } });
    const { state: after } = act(state, { type: 'drop', item: 'coal' });
    expect(looseItemsAt(after, onSurface)).toEqual([{ item: 'coal', count: 1 }]);
    const { state: back } = act(after, { type: 'pickUp', item: 'coal' });
    expect(countItem(back, 'coal')).toBe(1);
    expect(back.looseItems).toEqual([]);
  });
});

describe('legalActions after a save and load (0006, canonical order)', () => {
  /** A state in which mining, torch, pick-up and drop actions are all legal. */
  function busyState(): GameState {
    const state = buildState({
      layers: ROOM,
      avatar: MIDDLE,
      // Not in item-id order, and with an empty entry: a save sorts the
      // inventory and drops the empty entry, so the key order changes.
      inventory: { torch: 1, stone: 0, coal: 2, timber: 1 },
      // Not in canonical order either; `buildState` sorts and merges them.
      looseItems: [
        { pos: EAST, item: 'timber', count: 1 },
        { pos: MIDDLE, item: 'stone', count: 1 },
        { pos: EAST, item: 'coal', count: 2 },
        { pos: NORTH, item: 'coal', count: 1 },
        { pos: MIDDLE, item: 'coal', count: 1 },
      ],
    });
    updateReveal(state, []);
    return state;
  }

  function typesOf(actions: Action[]): Set<string> {
    return new Set(actions.map((action) => action.type));
  }

  it('gives the same actions in the same order', () => {
    const state = busyState();
    const reloaded = deserialise(serialise(state));
    // The same again through JSON text, as a real save file would go.
    const reloadedFromText = deserialise(JSON.parse(JSON.stringify(serialise(state))));
    expect(hashState(reloaded)).toBe(hashState(state));

    const actions = legalActions(state);
    for (const type of ['mine', 'placeTorch', 'pickUp', 'drop']) {
      expect(typesOf(actions).has(type)).toBe(true);
    }
    expect(legalActions(reloaded)).toEqual(actions);
    expect(legalActions(reloadedFromText)).toEqual(actions);
  });

  it('still does after an action of each of this task’s kinds', () => {
    let state = busyState();
    const steps: object[] = [
      { type: 'mine', target: { x: 1, y: 1, z: 0 } },
      { type: 'pickUp', from: EAST, item: 'coal' },
      { type: 'drop', item: 'timber', count: 1 },
      { type: 'placeTorch', target: NORTH },
    ];
    for (const step of steps) {
      state = act(state, step).state;
      const reloaded = deserialise(serialise(state));
      expect(hashState(reloaded)).toBe(hashState(state));
      expect(legalActions(reloaded)).toEqual(legalActions(state));
    }
  });
});
