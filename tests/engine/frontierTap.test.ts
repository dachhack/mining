// A tap in the new game, in the engine (plan A3): the surface (grass, trees,
// apple trees, animals) and mining under the fog, camps and level rule.
// Lab 2's own tests (tests/app/campWorld.test.ts, surface.test.ts) check the
// same rules through Lab 2's screen code.
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../../src/data';
import { FRONTIER_SURFACE } from '../../src/data/frontier';
import {
  createFrontier,
  demolishFrontierCamp,
  depthAt,
  frontierTap,
  hashFrontier,
  placeFrontierCamp,
  topBlockAt,
  upgradeFrontierCamp,
} from '../../src/engine';
import { APPLE_TREE, GRASS, NO_FEATURE, TREE } from '../../src/engine/frontier/state';
import { campRadius } from '../../src/engine/frontier/camps';
import { AT, MID, NEXT, SIDE, rich, world } from './frontierHelpers';

const at = (x: number, y: number): number => x + SIDE * y;

describe('the surface (plan A3)', () => {
  it('cuts grass for 1 grass; the next tap mines the block under it', () => {
    const w = world({ features: [{ ...AT, feature: GRASS }] });
    const cut = frontierTap(w, AT.x, AT.y);
    expect(cut.kind).toBe('harvested');
    expect(cut.harvest).toBe('grass');
    expect(cut.gain).toEqual([{ item: 'grass', count: FRONTIER_SURFACE.grassPerTuft }]);
    expect(cut.state.inventory.get('grass')).toBe(FRONTIER_SURFACE.grassPerTuft);
    expect(cut.state.features[at(AT.x, AT.y)]).toBe(NO_FEATURE);
    expect(cut.state.cube).toBe(w.cube); // only the grass went
    const mine = frontierTap(cut.state, AT.x, AT.y);
    expect(mine.kind).toBe('mined');
    expect(depthAt(mine.state.cube, AT.x, AT.y)).toBe(1);
  });

  it('fells a tree for wood, and only then can the ground be dug', () => {
    const w = world({ features: [{ ...AT, feature: TREE }] });
    const fell = frontierTap(w, AT.x, AT.y);
    expect(fell.harvest).toBe('felled');
    expect(fell.state.inventory.get('wood')).toBe(FRONTIER_SURFACE.woodPerTree);
    expect(fell.state.cube).toBe(w.cube);
    expect(frontierTap(fell.state, AT.x, AT.y).kind).toBe('mined');
  });

  it('picks an apple tree’s apples one a tap, then fells it for wood', () => {
    let w = world({ features: [{ ...AT, feature: APPLE_TREE, apples: 3 }] });
    for (let i = 0; i < 3; i += 1) {
      const pick = frontierTap(w, AT.x, AT.y);
      expect(pick.harvest).toBe('apple');
      w = pick.state;
    }
    expect(w.inventory.get('apple')).toBe(3);
    expect(w.apples[at(AT.x, AT.y)]).toBe(0);
    const fell = frontierTap(w, AT.x, AT.y);
    expect(fell.harvest).toBe('felled');
    expect(fell.state.features[at(AT.x, AT.y)]).toBe(NO_FEATURE);
  });

  it('catches an animal, even on a camp’s ground, before anything else there', () => {
    const w = world({
      features: [{ ...AT, feature: GRASS }],
      animals: [
        { id: 1, x: AT.x, y: AT.y },
        { id: 2, x: MID, y: MID },
      ],
    });
    const caught = frontierTap(w, AT.x, AT.y);
    expect(caught.harvest).toBe('caught');
    expect(caught.state.inventory.get('animal')).toBe(1);
    expect(caught.state.animals.map((a) => a.id)).toEqual([2]);
    expect(caught.state.features[at(AT.x, AT.y)]).toBe(GRASS); // the grass is still there
    const onCamp = frontierTap(caught.state, MID, MID);
    expect(onCamp.harvest).toBe('caught');
    expect(onCamp.state.animals).toEqual([]);
  });

  it('takes nothing in the fog', () => {
    const w = world({
      features: [{ x: 0, y: 0, feature: TREE }],
      animals: [{ id: 1, x: 1, y: 0 }],
    });
    expect(frontierTap(w, 0, 0).kind).toBe('fog');
    expect(frontierTap(w, 0, 0).state).toBe(w);
    expect(frontierTap(w, 1, 0).state).toBe(w);
  });
});

describe('mining (plan A3)', () => {
  it('mines a lit square, adds its yield and counts it', () => {
    const w = world({ top: '#' });
    const tap = frontierTap(w, MID + 2, MID);
    expect(tap.kind).toBe('mined');
    expect(tap.block).toBe(BLOCKS.stone.code);
    expect(tap.gain).toEqual([{ item: 'stone', count: 1 }]);
    expect(tap.state.inventory.get('stone')).toBe(1);
    expect(tap.state.mined).toBe(1);
    expect(depthAt(tap.state.cube, MID + 2, MID)).toBe(1);
    expect(depthAt(w.cube, MID + 2, MID)).toBe(0); // the state it was given is untouched
  });

  it('mines clay, a real block now, for clay', () => {
    const w = world({
      special: [
        { ...AT, char: 'd' },
        { ...AT, z: 1, char: 'C' },
      ],
    });
    const first = frontierTap(w, AT.x, AT.y);
    expect(first.kind).toBe('mined');
    expect(topBlockAt(first.state.cube, AT.x, AT.y)).toBe(BLOCKS.clay.code);
    // Its neighbours must come down too, by the level rule; then the clay can be mined.
    let s = first.state;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      s = frontierTap(s, AT.x + dx, AT.y + dy).state;
    }
    const clay = frontierTap(s, AT.x, AT.y);
    expect(clay.kind).toBe('mined');
    expect(clay.gain).toEqual([{ item: 'clay', count: FRONTIER_SURFACE.clayPerBlock }]);
  });

  it('refuses a fogged, greyed, off-map or camp square, changing nothing', () => {
    const w = world();
    expect(frontierTap(w, 0, 0).kind).toBe('fog');
    expect(frontierTap(w, -1, 0).refusal).toBe('outside');
    expect(frontierTap(w, MID, MID).kind).toBe('camp');
    const greyed = demolishFrontierCamp(
      placeFrontierCamp(world({ inventory: rich() }), MID + NEXT, MID),
      1,
    );
    const tap = frontierTap(greyed, MID - campRadius(1), MID);
    expect(tap.kind).toBe('greyed');
    expect(tap.state).toBe(greyed);
  });

  it('says "too steep" before "too hard"', () => {
    // Hard rock one level down at AT, under open space: its neighbours are higher.
    let w = world({
      special: [
        { ...AT, char: '.' },
        { ...AT, z: 1, char: 'H' },
      ],
    });
    const steep = frontierTap(w, AT.x, AT.y);
    expect(steep.kind).toBe('refused');
    expect(steep.refusal).toBe('neighbourHigher');
    expect(steep.higherNeighbours).toHaveLength(4);
    expect(steep.state).toBe(w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      w = frontierTap(w, AT.x + dx, AT.y + dy).state;
    }
    const hard = frontierTap(w, AT.x, AT.y);
    expect(hard.kind).toBe('tooHard');
    expect(hard.needs).toBe(2);
    // A level-2 camp over it mines it.
    const upgraded = upgradeFrontierCamp({ ...w, inventory: new Map(Object.entries(rich())) }, 1);
    expect(frontierTap(upgraded, AT.x, AT.y).kind).toBe('mined');
  });
});

describe('the frontier hash (plan A3)', () => {
  it('is the same for the same taps, and changes with any of them', () => {
    const a = frontierTap(createFrontier(3), 16, 16).state;
    const b = frontierTap(createFrontier(3), 16, 16).state;
    expect(hashFrontier(a)).toBe(hashFrontier(b));
    expect(hashFrontier(createFrontier(3))).not.toBe(hashFrontier(createFrontier(4)));
    const w = world({ features: [{ ...AT, feature: GRASS }] });
    expect(hashFrontier(frontierTap(w, AT.x, AT.y).state)).not.toBe(hashFrontier(w));
  });
});
