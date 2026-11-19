// Scenario tests for mining (design doc 4.1; decision note 0005 items 10 to
// 12 and 16), on small hand-built cubes.

import { describe, expect, it } from 'vitest';
import { AVATAR, BLOCKS, ITEMS } from '../../src/data';
import type { BlockId, Vec3 } from '../../src/data';
import {
  applyAction,
  blockAt,
  carriedWeight,
  carryCapacity,
  countItem,
  isOpen,
  legalActions,
  looseItemsAt,
} from '../../src/engine';
import type { GameState, MineAction } from '../../src/engine';
import { updateReveal } from '../../src/engine/reveal';
import { BLOCK_CHARS, act, buildState, findActions } from './helpers';
import type { BuildStateOptions } from './helpers';

/**
 * Build a state and reveal what the avatar sees from where it stands, as
 * `createRun` and every action do. A hand-built state starts with nothing
 * revealed, and only revealed blocks can be mined.
 */
function seenState(options: BuildStateOptions): GameState {
  const state = buildState(options);
  updateReveal(state, []);
  return state;
}

/** The targets of the legal mine actions, as "x,y,z" strings, sorted. */
function mineTargets(state: GameState): string[] {
  return findActions(state, { type: 'mine' })
    .map((action) => {
      const target = (action as MineAction).target;
      return `${target.x},${target.y},${target.z}`;
    })
    .sort();
}

/** The character `buildState` reads as this block. */
function charFor(blockId: BlockId): string {
  for (const [char, id] of Object.entries(BLOCK_CHARS)) {
    if (id === blockId) {
      return char;
    }
  }
  throw new Error(`No character for block ${blockId}`);
}

// A one-cell pocket in the middle of solid stone, with rock on every side:
// the avatar is at (2, 2, 1).
const POCKET: string[][] = [
  ['#####', '#####', '#####', '#####', '#####'],
  ['#####', '#####', '##.##', '#####', '#####'],
  ['#####', '#####', '#####', '#####', '#####'],
  ['#####', '#####', '#####', '#####', '#####'],
];
const IN_POCKET: Vec3 = { x: 2, y: 2, z: 1 };
const EAST: Vec3 = { x: 3, y: 2, z: 1 };

/** The pocket with the block east of the avatar replaced by `blockId`. */
function pocketWithEast(blockId: BlockId): string[][] {
  const layers = POCKET.map((layer) => layer.slice());
  // Row y = 2 of layer z = 1 is '##.##'; the east cell is x = 3.
  (layers[1] as string[])[2] = `##.${charFor(blockId)}#`;
  return layers;
}

describe('which cells can be mined (face neighbours only: issue #75, decision note 0022)', () => {
  // Before issue #75 the pick reached 17 cells (0005 item 10): the 8 around
  // the avatar and the 9 on the level below. Now it reaches the face
  // neighbours only, as in Minecraft: north, east, south, west, and below.
  const FACES = [
    { x: 0, y: -1, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
  ];

  it('offers the 5 face neighbours in reach, no diagonal, and not the cell overhead', () => {
    const state = seenState({ layers: POCKET, avatar: IN_POCKET, ap: 99 });
    const expected = FACES.map(
      (f) => `${IN_POCKET.x + f.x},${IN_POCKET.y + f.y},${IN_POCKET.z + f.z}`,
    );
    expect(mineTargets(state)).toEqual(expected.sort());

    const overhead = { x: IN_POCKET.x, y: IN_POCKET.y, z: IN_POCKET.z - 1 };
    expect(isOpen(state, overhead)).toBe(false); // there is a block there to mine
    expect(findActions(state, { type: 'mine', target: overhead })).toEqual([]);
    // Diagonals, on the avatar's level and below, are not offered.
    expect(findActions(state, { type: 'mine', target: { x: 3, y: 3, z: 1 } })).toEqual([]);
    expect(findActions(state, { type: 'mine', target: { x: 3, y: 2, z: 2 } })).toEqual([]);
  });

  it('mines each of the 5 cells, leaving it open', () => {
    const state = seenState({ layers: POCKET, avatar: IN_POCKET, ap: 99 });
    const actions = findActions(state, { type: 'mine' });
    expect(actions.length).toBe(5);
    for (const action of actions) {
      const target = (action as MineAction).target;
      const { state: after, events } = applyAction(state, action);
      expect(isOpen(after, target)).toBe(true);
      expect(events[0]).toEqual({ type: 'blockMined', pos: target, block: BLOCKS.stone.code });
      // The state the action was applied to is untouched.
      expect(isOpen(state, target)).toBe(false);
    }
  });

  it("mines the block overhead only with a support in the avatar's cell (0014 item 9)", () => {
    const overhead = { x: IN_POCKET.x, y: IN_POCKET.y, z: IN_POCKET.z - 1 };
    const supported = seenState({
      layers: POCKET,
      avatar: IN_POCKET,
      ap: 99,
      supports: [IN_POCKET],
    });
    expect(findActions(supported, { type: 'mine', target: overhead })).toHaveLength(1);
    expect(mineTargets(supported)).toHaveLength(6);
  });

  it('never offers bedrock: nothing outside the grid, and no open cell', () => {
    // In a pit in the corner of a one-layer cube: beyond two sides and below
    // is bedrock. Only the two face neighbours that hold stone are left.
    const pit = seenState({ layers: [['.#', '##']], avatar: { x: 0, y: 0, z: 0 }, ap: 99 });
    expect(mineTargets(pit)).toEqual(['0,1,0', '1,0,0']);

    // On the surface the cells beside the avatar are open air: the only
    // block in reach is the one underfoot.
    const surface = seenState({
      layers: [['###', '###', '###']],
      avatar: { x: 0, y: 0, z: -1 },
      ap: 99,
    });
    expect(mineTargets(surface)).toEqual(['0,0,0']);
  });

  it('does not offer a block that has not been revealed', () => {
    // Cannot arise in play, because the six cells touching the avatar are
    // always revealed; the state is hand-built with nothing revealed and no
    // reveal run.
    const unseen = buildState({ layers: POCKET, avatar: IN_POCKET, ap: 99 });
    expect(findActions(unseen, { type: 'mine' })).toEqual([]);
  });
});

describe('AP cost (0005 item 12)', () => {
  it('is the mine cost of the block type, from the data', () => {
    let tested = 0;
    for (const [blockId, def] of Object.entries(BLOCKS) as [BlockId, (typeof BLOCKS)[BlockId]][]) {
      if (def.mineCost === null) {
        continue; // air and bedrock
      }
      const state = seenState({ layers: pocketWithEast(blockId), avatar: IN_POCKET, ap: 99 });
      expect(blockAt(state, EAST)).toBe(def.code);
      expect(findActions(state, { type: 'mine', target: EAST })).toEqual([
        { type: 'mine', target: EAST, ap: def.mineCost },
      ]);
      const { state: after } = act(state, { type: 'mine', target: EAST });
      expect(after.ap).toBe(99 - def.mineCost);
      tested += 1;
    }
    expect(tested).toBeGreaterThanOrEqual(8);
    // The costs are not all the same, so the test above tells them apart.
    expect(BLOCKS.dirt.mineCost).not.toBe(BLOCKS.hardRock.mineCost);
  });

  it('refuses a block that costs more AP than the avatar has left', () => {
    const cost = BLOCKS.hardRock.mineCost as number;
    const layers = pocketWithEast('hardRock');
    const mineEast: MineAction = { type: 'mine', target: EAST, ap: cost };

    const short = seenState({ layers, avatar: IN_POCKET, ap: cost - 1 });
    expect(findActions(short, { type: 'mine', target: EAST })).toEqual([]);
    expect(() => applyAction(short, mineEast)).toThrow('Not a legal action');

    // With exactly enough it is mined in one action and the AP are spent.
    const enough = seenState({ layers, avatar: IN_POCKET, ap: cost });
    const { state: after } = applyAction(enough, mineEast);
    expect(isOpen(after, EAST)).toBe(true);
    expect(after.ap).toBe(0);
  });
});

describe('yield (0005 item 16)', () => {
  it('goes into the inventory', () => {
    const state = seenState({ layers: pocketWithEast('coalSeam'), avatar: IN_POCKET });
    const { state: after, events } = act(state, { type: 'mine', target: EAST });

    expect(countItem(after, 'coal')).toBe(1);
    expect(looseItemsAt(after, EAST)).toEqual([]);
    expect(events.slice(0, 2)).toEqual([
      { type: 'blockMined', pos: EAST, block: BLOCKS.coalSeam.code },
      { type: 'itemGained', item: 'coal', count: 1 },
    ]);
  });

  it('is nothing for a block with no yield (dirt)', () => {
    expect(BLOCKS.dirt.yields).toEqual([]);
    const state = seenState({ layers: pocketWithEast('dirt'), avatar: IN_POCKET });
    const { state: after, events } = act(state, { type: 'mine', target: EAST });

    expect(isOpen(after, EAST)).toBe(true);
    expect(carriedWeight(after)).toBe(0);
    expect(after.looseItems).toEqual([]);
    const itemEvents = events.filter(
      (event) => event.type === 'itemGained' || event.type === 'itemLeft',
    );
    expect(itemEvents).toEqual([]);
  });

  it('is left in the mined cell at the carry limit, and can be picked up after a drop', () => {
    // Carry stone up to the limit exactly.
    const stones = AVATAR.carryCapacity / ITEMS.stone.weight;
    const state = seenState({
      layers: pocketWithEast('coalSeam'),
      avatar: IN_POCKET,
      inventory: { stone: stones },
    });
    expect(carriedWeight(state)).toBe(carryCapacity());

    const mined = act(state, { type: 'mine', target: EAST });
    expect(isOpen(mined.state, EAST)).toBe(true);
    expect(countItem(mined.state, 'coal')).toBe(0);
    expect(looseItemsAt(mined.state, EAST)).toEqual([{ item: 'coal', count: 1 }]);
    expect(mined.events.slice(0, 2)).toEqual([
      { type: 'blockMined', pos: EAST, block: BLOCKS.coalSeam.code },
      { type: 'itemLeft', pos: EAST, item: 'coal', count: 1 },
    ]);
    expect(carriedWeight(mined.state)).toBe(carryCapacity());

    // It does not fit, so it cannot be picked up yet.
    expect(findActions(mined.state, { type: 'pickUp' })).toEqual([]);

    // Drop one stone; now the coal fits.
    const dropped = act(mined.state, { type: 'drop', item: 'stone', count: 1 });
    const picked = act(dropped.state, { type: 'pickUp', from: EAST, item: 'coal' });
    expect(countItem(picked.state, 'coal')).toBe(1);
    expect(countItem(picked.state, 'stone')).toBe(stones - 1);
    expect(looseItemsAt(picked.state, EAST)).toEqual([]);
    expect(looseItemsAt(picked.state, IN_POCKET)).toEqual([{ item: 'stone', count: 1 }]);
    expect(carriedWeight(picked.state)).toBeLessThanOrEqual(carryCapacity());
  });

  it('never takes the carried weight over the limit', () => {
    // One short of the limit: a coal (weight 1) fits, a stone (weight 2) does not.
    expect(ITEMS.coal.weight).toBe(1);
    expect(ITEMS.stone.weight).toBe(2);
    const inventory = { coal: AVATAR.carryCapacity - 1 };

    const coal = seenState({ layers: pocketWithEast('coalSeam'), avatar: IN_POCKET, inventory });
    const afterCoal = act(coal, { type: 'mine', target: EAST }).state;
    expect(carriedWeight(afterCoal)).toBe(carryCapacity());

    const stone = seenState({ layers: pocketWithEast('stone'), avatar: IN_POCKET, inventory });
    const afterStone = act(stone, { type: 'mine', target: EAST }).state;
    expect(carriedWeight(afterStone)).toBe(carryCapacity() - 1);
    expect(looseItemsAt(afterStone, EAST)).toEqual([{ item: 'stone', count: 1 }]);
  });
});

describe('after mining', () => {
  it('reveals what the new opening shows', () => {
    // Before, the block 2 east is hidden behind the block 1 east; mining that
    // lets the lamp's light through. (With the lamp out nothing would show:
    // the miner knows only the cells it touches. See darkness.test.ts.)
    const state = seenState({ layers: POCKET, avatar: IN_POCKET });
    const twoEast = { x: 4, y: 2, z: 1 };
    const { state: after, events } = act(state, { type: 'mine', target: EAST });
    expect(events).toContainEqual({
      type: 'blockRevealed',
      pos: twoEast,
      block: BLOCKS.stone.code,
    });
    expect(legalActions(after).length).toBeGreaterThan(0);
  });
});

describe('a stair dug with face-only reach (issue #75 item 4)', () => {
  /** Take the one legal action that matches. */
  const take = (state: GameState, wanted: object): GameState => act(state, wanted).state;

  it('goes down by mine ahead, walk in, dig down; and can be climbed back up to the surface', () => {
    // A row of stone 6 cells long and 4 layers deep, the avatar on the
    // surface over x = 1. Nothing is revealed by hand: each step shows what
    // the next one needs, as in play.
    let state = seenState({
      layers: [['######'], ['######'], ['######'], ['######']],
      avatar: { x: 1, y: 0, z: -1 },
      ap: 99,
    });
    // Dig down onto layer 0, then two steps of the stair.
    state = take(state, { type: 'mine', target: { x: 1, y: 0, z: 0 } });
    expect(state.avatar.pos).toEqual({ x: 1, y: 0, z: 0 });
    for (let step = 1; step <= 2; step += 1) {
      const x = 1 + step;
      const z = step - 1;
      state = take(state, { type: 'mine', target: { x, y: 0, z } });
      state = take(state, { type: 'move', to: { x, y: 0, z } });
      state = take(state, { type: 'mine', target: { x, y: 0, z: z + 1 } });
      expect(state.avatar.pos).toEqual({ x, y: 0, z: z + 1 });
    }
    // Every dig down moved the miner one block down, unhurt.
    expect(state.avatar.health).toBe(AVATAR.startHealth);

    // Back up the way it came, one move each: up into the cell it dug down
    // from, then west onto the stair before (issue #80: no step-up rule).
    state = take(state, { type: 'move', to: { x: 3, y: 0, z: 1 } });
    state = take(state, { type: 'move', to: { x: 2, y: 0, z: 1 } });
    state = take(state, { type: 'move', to: { x: 2, y: 0, z: 0 } });
    state = take(state, { type: 'move', to: { x: 1, y: 0, z: 0 } });
    state = take(state, { type: 'move', to: { x: 1, y: 0, z: -1 } });
    expect(state.avatar.pos).toEqual({ x: 1, y: 0, z: -1 });
    expect(state.avatar.health).toBe(AVATAR.startHealth);
  });
});
