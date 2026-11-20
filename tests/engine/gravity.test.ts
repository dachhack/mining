// Scenario tests for gravity (design doc 5.2; decision note 0005 item 17;
// owner, issue #80, decision note 0024).
//
// Loose items fall straight down until they rest on rock. `settle` is the
// function the dispatcher calls after every action and after the cube phase;
// these tests call it on hand-built states. Nothing leaves loose items since
// issue #86 (decision note 0026); the rule stays until task T4 removes them.

import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { settle } from '../../src/engine/gravity';
import { buildState } from './helpers';

/** Run `settle` on `state` (changing it) and return the events. */
function runSettle(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  settle(state, events);
  return events;
}

describe('loose items falling', () => {
  it('fall straight down to the first solid block', () => {
    const state = buildState({
      layers: [['#.'], ['#.'], ['#.'], ['##']],
      looseItems: [{ pos: { x: 1, y: 0, z: 0 }, item: 'coal', count: 3 }],
    });
    const events = runSettle(state);
    expect(state.looseItems).toEqual([{ pos: { x: 1, y: 0, z: 2 }, item: 'coal', count: 3 }]);
    expect(events).toEqual([
      {
        type: 'itemFell',
        from: { x: 1, y: 0, z: 0 },
        to: { x: 1, y: 0, z: 2 },
        item: 'coal',
        count: 3,
      },
    ]);
  });

  it('fall from the surface into an open shaft', () => {
    const state = buildState({
      layers: [['#.'], ['##']],
      looseItems: [{ pos: { x: 1, y: 0, z: -1 }, item: 'stone', count: 1 }],
    });
    runSettle(state);
    expect(state.looseItems).toEqual([{ pos: { x: 1, y: 0, z: 0 }, item: 'stone', count: 1 }]);
  });

  it('join a pile of the same item where they land', () => {
    const state = buildState({
      layers: [['#.'], ['#.'], ['#.'], ['##']],
      looseItems: [
        { pos: { x: 1, y: 0, z: 0 }, item: 'coal', count: 2 },
        { pos: { x: 1, y: 0, z: 0 }, item: 'stone', count: 1 },
        { pos: { x: 1, y: 0, z: 2 }, item: 'coal', count: 1 },
      ],
    });
    const events = runSettle(state);
    expect(state.looseItems).toEqual([
      { pos: { x: 1, y: 0, z: 2 }, item: 'coal', count: 3 },
      { pos: { x: 1, y: 0, z: 2 }, item: 'stone', count: 1 },
    ]);
    expect(events.map((event) => event.type)).toEqual(['itemFell', 'itemFell']);
  });
});

describe('settle with nothing to do', () => {
  it('changes nothing and emits nothing', () => {
    const state = buildState({
      layers: [['#.'], ['##']],
      looseItems: [
        { pos: { x: 1, y: 0, z: 0 }, item: 'coal', count: 1 },
        { pos: { x: 0, y: 0, z: -1 }, item: 'stone', count: 1 },
      ],
    });
    const before = hashState(state);
    expect(runSettle(state)).toEqual([]);
    expect(hashState(state)).toBe(before);
  });
});
