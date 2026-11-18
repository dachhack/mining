// Mining the block the avatar stands on, above a void (0005 item 7): the one
// way a fall of 3 or more can happen.
//
// The fall itself is gravity's job (M1 task 3, `settle` in gravity.ts). What
// mining owes is that `settle` is called after the block is gone and before
// reveal. This test checks that hand-over and nothing about the fall, so it
// passes with the stub `settle` and with the real one.
//
// To watch the call, the test wraps `settle`:
// - `vi.mock(path, factory)` replaces a module, for this test file only.
// - `importOriginal()` gives the real module, so the wrapper can still call
//   the real `settle`. (Python readers: `unittest.mock.patch(..., wraps=...)`.)

import { describe, expect, it, vi } from 'vitest';
import { BLOCKS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { isOpen } from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import * as gravity from '../../src/engine/gravity';
import { updateReveal } from '../../src/engine/reveal';
import { act, buildState } from './helpers';

/** What the wrapper saw each time `settle` was called. */
interface SettleCall {
  floorWasOpen: boolean;
  eventTypes: string[];
}
const settleCalls: SettleCall[] = [];
const FLOOR: Vec3 = { x: 1, y: 1, z: 1 };

vi.mock('../../src/engine/gravity', async (importOriginal) => {
  const real = await importOriginal<typeof gravity>();
  return {
    ...real,
    settle: (state: GameState, events: GameEvent[]): void => {
      settleCalls.push({
        floorWasOpen: isOpen(state, FLOOR),
        eventTypes: events.map((event) => event.type),
      });
      real.settle(state, events);
    },
  };
});

describe('mining the floor above a void', () => {
  it('hands over to gravity after the block is gone, then reveals', () => {
    // A shaft down the middle of a 3 x 3 column: the avatar stands in a pit
    // at z = 0 on a single block (z = 1), with 3 open cells under it.
    const solid = ['###', '###', '###'];
    const open = ['###', '#.#', '###'];
    const state = buildState({
      layers: [open, solid, open, open, open, solid],
      avatar: { x: 1, y: 1, z: 0 },
    });
    updateReveal(state, []);
    settleCalls.length = 0;

    const { state: after, events } = act(state, { type: 'mine', target: FLOOR });

    expect(isOpen(after, FLOOR)).toBe(true);
    // Gravity was called once, with the floor already mined out and the
    // mining events already recorded, and before anything was revealed.
    expect(settleCalls.length).toBe(1);
    const call = settleCalls[0] as SettleCall;
    expect(call.floorWasOpen).toBe(true);
    expect(call.eventTypes).toEqual(['blockMined', 'itemGained']);
    expect(events[0]).toEqual({ type: 'blockMined', pos: FLOOR, block: BLOCKS.stone.code });

    // Reveal ran after gravity: every `blockRevealed` comes after the events
    // gravity was shown.
    const firstReveal = events.findIndex((event) => event.type === 'blockRevealed');
    expect(firstReveal).toBeGreaterThanOrEqual(call.eventTypes.length);
  });
});
