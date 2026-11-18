// Scenario tests for torches (design doc 4.1; decision note 0005 items 13
// and 19).

import { describe, expect, it } from 'vitest';
import { ACTION_COSTS, AVATAR, BLOCKS, STRUCTURES } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { countItem, isRevealed, structureAt } from '../../src/engine';
import type { PlaceTorchAction } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { setBlock } from '../../src/engine/state';
import { act, buildState, findActions } from './helpers';

const TORCH = AVATAR.torchLightRadius;
const LAMP_OUT = AVATAR.lightRadiusWithoutOil;

/**
 * A straight tunnel, one cell wide and high, two layers under the top:
 * row y = 1 of layer z = 2, cells x = 0 .. length - 1, then two cells of rock.
 */
function tunnelLayers(length: number): string[][] {
  const width = length + 2;
  const solid = ['#'.repeat(width), '#'.repeat(width), '#'.repeat(width)];
  const tunnel = ['#'.repeat(width), '.'.repeat(length) + '##', '#'.repeat(width)];
  return [solid, solid, tunnel, solid, solid];
}

function inTunnel(x: number): Vec3 {
  return { x, y: 1, z: 2 };
}

function wallBeside(x: number): Vec3 {
  return { x, y: 0, z: 2 };
}

describe('placing a torch (0005 item 19)', () => {
  it('goes into the avatar’s own cell or an open face neighbour', () => {
    const state = buildState({
      layers: tunnelLayers(4),
      avatar: inTunnel(1),
      inventory: { torch: 1 },
    });
    const targets = findActions(state, { type: 'placeTorch' }).map(
      (action) => (action as PlaceTorchAction).target,
    );
    // Its own cell, then east and west along the tunnel. Not into the rock
    // beside, above or below.
    expect(targets).toEqual([inTunnel(1), inTunnel(2), inTunnel(0)]);
  });

  it('needs a torch', () => {
    const state = buildState({ layers: tunnelLayers(4), avatar: inTunnel(1), inventory: {} });
    expect(findActions(state, { type: 'placeTorch' })).toEqual([]);
  });

  it('cannot go on the surface, or into a cell that already holds a structure', () => {
    // On the surface, above solid ground: the avatar's cell and its
    // neighbours are surface cells, which hold no structures (question 28).
    const onSurface = buildState({
      layers: [['###', '###', '###']],
      avatar: { x: 1, y: 1, z: -1 },
      inventory: { torch: 1 },
    });
    expect(findActions(onSurface, { type: 'placeTorch' })).toEqual([]);

    // A ladder to the east and a torch to the west leave only its own cell.
    const crowded = buildState({
      layers: tunnelLayers(4),
      avatar: inTunnel(1),
      inventory: { torch: 1 },
      ladders: [inTunnel(2)],
      torches: [inTunnel(0)],
    });
    expect(findActions(crowded, { type: 'placeTorch' })).toEqual([
      { type: 'placeTorch', target: inTunnel(1), ap: ACTION_COSTS.placeTorch },
    ]);
  });

  it('costs 1 AP and 1 torch', () => {
    expect(ACTION_COSTS.placeTorch).toBe(1);
    const state = buildState({
      layers: tunnelLayers(4),
      avatar: inTunnel(1),
      inventory: { torch: 2 },
      ap: 3,
    });
    const { state: after, events } = act(state, { type: 'placeTorch', target: inTunnel(2) });
    expect(after.ap).toBe(2);
    expect(countItem(after, 'torch')).toBe(1);
    expect(structureAt(after, inTunnel(2))).toBe(STRUCTURES.torch.code);
    expect(events[0]).toEqual({
      type: 'structurePlaced',
      pos: inTunnel(2),
      structure: STRUCTURES.torch.code,
    });
    // The state the action was applied to is untouched.
    expect(structureAt(state, inTunnel(2))).toBe(0);

    // With no AP it is not legal.
    const tired = buildState({
      layers: tunnelLayers(4),
      avatar: inTunnel(1),
      inventory: { torch: 1 },
      ap: 0,
    });
    expect(findActions(tired, { type: 'placeTorch' })).toEqual([]);
  });
});

describe('torch light (0005 item 13)', () => {
  it('lights from the moment the torch is placed, out to its own radius', () => {
    // The lamp is out of oil, so the torch reaches further than the avatar.
    expect(TORCH).toBeGreaterThan(LAMP_OUT + 1);
    const state = buildState({
      layers: tunnelLayers(TORCH + 4),
      avatar: inTunnel(0),
      inventory: { torch: 1 },
      lampOil: 0,
    });
    updateReveal(state, []);
    expect(isRevealed(state, wallBeside(TORCH))).toBe(false);

    const { state: after, events } = act(state, { type: 'placeTorch', target: inTunnel(0) });

    expect(isRevealed(after, wallBeside(TORCH))).toBe(true);
    expect(isRevealed(after, wallBeside(TORCH + 1))).toBe(false);
    expect(events).toContainEqual({
      type: 'blockRevealed',
      pos: wallBeside(TORCH),
      block: BLOCKS.stone.code,
    });
  });

  it('lights and reveals around its own cell when the avatar is somewhere else', () => {
    // A torch stands in the tunnel. The avatar is on the surface, far from
    // it, and nothing has been revealed yet.
    const length = 2 * TORCH + 3;
    const torchX = TORCH + 1;
    const state = buildState({
      layers: tunnelLayers(length),
      avatar: { x: 0, y: 0, z: -1 },
      torches: [inTunnel(torchX)],
    });
    updateReveal(state, []);

    // Around the torch, as far as its radius in both directions, and no further.
    expect(isRevealed(state, inTunnel(torchX))).toBe(true);
    expect(isRevealed(state, wallBeside(torchX - TORCH))).toBe(true);
    expect(isRevealed(state, wallBeside(torchX + TORCH))).toBe(true);
    expect(isRevealed(state, wallBeside(torchX - TORCH - 1))).toBe(false);
    expect(isRevealed(state, wallBeside(torchX + TORCH + 1))).toBe(false);
    // The floor under the torch, which no daylight reaches.
    expect(isRevealed(state, { x: torchX, y: 1, z: 3 })).toBe(true);
  });

  it('shows what is mined open near it after the avatar has gone', () => {
    // The avatar places a torch at the dead end of a tunnel and walks back
    // out of its own light. The torch still lights the dead end: the cells
    // there were revealed by it, and stay so.
    const length = 2 * TORCH + 4;
    const end = length - 1;
    const state = buildState({
      layers: tunnelLayers(length),
      avatar: inTunnel(end),
      inventory: { torch: 1 },
      lampOil: 0,
    });
    updateReveal(state, []);
    const placed = act(state, { type: 'placeTorch', target: inTunnel(end) }).state;

    // Walk away (moving is another task's module, so by hand).
    placed.avatar.pos = inTunnel(0);
    updateReveal(placed, []);
    expect(isRevealed(placed, wallBeside(end - TORCH))).toBe(true);

    // Rock next to the torch crumbles (set by hand): the torch, not the
    // avatar, shows what is behind it.
    const behind: Vec3 = { x: end + 2, y: 1, z: 2 };
    expect(isRevealed(placed, behind)).toBe(false);
    setBlock(placed, { x: end + 1, y: 1, z: 2 }, BLOCKS.air.code);
    updateReveal(placed, []);
    expect(isRevealed(placed, behind)).toBe(true);
  });
});
