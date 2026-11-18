// Mining the block the avatar stands on, above a void (0005 item 7): the one
// way a fall of 3 or more can happen.
//
// Mining only opens the cell. The fall is gravity's (`settle` in gravity.ts),
// which the dispatcher calls after the mining and before reveal. This test
// runs the whole action through `applyAction` with nothing faked, and checks
// that the three happen in that order.

import { describe, expect, it } from 'vitest';
import { AVATAR, BLOCKS, ITEMS } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { isOpen, isRevealed } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { act, buildState } from './helpers';

describe('mining the floor above a void', () => {
  // A shaft down the middle of a 3 x 3 column: the avatar stands in a pit at
  // z = 0 on a single block (z = 1), with 3 open cells under it (z = 2 to 4)
  // and solid rock at z = 5.
  const solid = ['###', '###', '###'];
  const open = ['###', '#.#', '###'];
  const layers = [open, solid, open, open, open, solid];
  const start: Vec3 = { x: 1, y: 1, z: 0 };
  const floor: Vec3 = { x: 1, y: 1, z: 1 };
  const landing: Vec3 = { x: 1, y: 1, z: 4 };
  const distance = landing.z - start.z;

  it('drops the avatar to the bottom, with fall damage, then reveals what it sees there', () => {
    // The fall is long enough to hurt and not long enough to kill.
    expect(distance).toBeGreaterThanOrEqual(3);
    expect(distance).toBeGreaterThan(AVATAR.freeFallBlocks);
    expect(distance).toBeLessThan(AVATAR.fatalFallBlocks);
    // An uncontrolled fall: the first blocks cost health too (note 0010).
    const damage =
      AVATAR.freeFallBlocks * AVATAR.uncontrolledFallDamagePerBlock +
      (distance - AVATAR.freeFallBlocks) * AVATAR.fallDamagePerBlock;
    expect(damage).toBeLessThan(AVATAR.startHealth);

    const state = buildState({ layers, avatar: start });
    updateReveal(state, []);
    // The bottom of the shaft is beyond the lamp, behind the floor.
    const besideLanding: Vec3 = { x: 0, y: 1, z: landing.z };
    expect(isRevealed(state, besideLanding)).toBe(false);

    const { state: after, events } = act(state, { type: 'mine', target: floor });

    expect(isOpen(after, floor)).toBe(true);
    expect(after.avatar.pos).toEqual(landing);
    expect(after.avatar.health).toBe(AVATAR.startHealth - damage);
    expect(after.status).toEqual({ kind: 'active' });

    // Mining first, then the fall, then reveal.
    expect(events.slice(0, 4)).toEqual([
      { type: 'blockMined', pos: floor, block: BLOCKS.stone.code },
      { type: 'itemGained', item: 'stone', count: 1 },
      { type: 'fell', from: start, to: landing, distance, kind: 'uncontrolled' },
      { type: 'damageTaken', amount: damage, cause: 'fall', health: AVATAR.startHealth - damage },
    ]);
    const rest = events.slice(4);
    expect(rest.length).toBeGreaterThan(0);
    for (const event of rest) {
      expect(event.type).toBe('blockRevealed');
    }
    // Reveal ran from where the avatar landed, not from where it stood.
    expect(isRevealed(after, besideLanding)).toBe(true);
    expect(rest).toContainEqual({
      type: 'blockRevealed',
      pos: besideLanding,
      block: BLOCKS.stone.code,
    });
  });

  it('lets a yield that did not fit fall with it', () => {
    // At the carry limit the stone is left in the mined cell, which now has
    // no floor: it drops to the bottom of the shaft, where the avatar lands.
    const stones = AVATAR.carryCapacity / ITEMS.stone.weight;
    const state = buildState({ layers, avatar: start, inventory: { stone: stones } });
    updateReveal(state, []);

    const { state: after, events } = act(state, { type: 'mine', target: floor });

    expect(events[1]).toEqual({ type: 'itemLeft', pos: floor, item: 'stone', count: 1 });
    expect(after.looseItems).toEqual([{ pos: landing, item: 'stone', count: 1 }]);
  });
});
