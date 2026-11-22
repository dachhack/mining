// UI lab 2: Undo. Every undo must give back exactly the world as it was
// before the action: blocks, items, camps, fog, and the surface (animals and
// the lab clock too).
import { describe, expect, it } from 'vitest';
import { LAB_NEW_CAMP_COST } from '../../src/data/labCamps';
import { hashState } from '../../src/engine';
import {
  advanceWorld,
  applyCampStep,
  campRadius,
  demolishRefusal,
  footprintOf,
  newCampWorld,
  placeRefusal,
  sightMap,
} from '../../src/app/lab/campWorld';
import type { CampStep, CampWorld } from '../../src/app/lab/campWorld';
import {
  CHECKPOINT_EVERY,
  emptyHistory,
  recordAction,
  undoCount,
  undoLast,
} from '../../src/app/lab/undoHistory';
import { tapsUntil } from '../e2e/campPlan';

/** Everything the player can see or hold, as one string: equal strings mean equal worlds. */
function fingerprint(w: CampWorld): string {
  return JSON.stringify({
    cube: hashState(w.lab.state),
    depths: w.lab.depths.depths,
    counts: [...w.lab.counts].sort(),
    mined: w.lab.mined,
    camps: w.camps,
    sights: sightMap(w),
    features: w.surface.features,
    apples: w.surface.apples,
    regrowAt: w.surface.regrowAt,
    animals: w.surface.animals,
    nextAnimalId: w.surface.nextAnimalId,
    nextSpawnAt: w.surface.nextSpawnAt,
    rng: w.surface.rng,
    time: w.surface.time,
  });
}

describe('undo (owner: "Undo button")', () => {
  it('is empty at first, and undoing nothing gives nothing', () => {
    const history = emptyHistory();
    expect(undoCount(history)).toBe(0);
    expect(undoLast(history)).toBeNull();
  });

  it('undoes every action, one by one, back to the start: each world exactly as it was', () => {
    const start = newCampWorld(110);
    const camp = start.camps[0] ?? { x: 0, y: 0 };
    const target = { x: camp.x + campRadius(1) - 1, y: camp.y };
    const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp, footprintOf(target.x, target.y));
    expect(plan).not.toBeNull();
    if (plan === null) return;

    // Play: taps that pay for a camp, then the camp, with 700 ms of lab time
    // before each action, so the animals move between them. Moving animals
    // can change what a planned tap does, so the taps are planned again from
    // where the world is, until the camp can be paid for. Keep what the
    // world was before each action.
    let world = start;
    let history = emptyHistory();
    const before: string[] = [];
    let t = 0;
    const act = (step: CampStep): void => {
      t += 700;
      const now = advanceWorld(world, t);
      const next = applyCampStep(now, step);
      if (next === now) {
        world = now; // not an action: nothing changed
        return;
      }
      before.push(fingerprint(now));
      history = recordAction(history, now, step);
      world = next;
    };
    for (let round = 0; round < 5 && world.camps.length < 2; round += 1) {
      const more =
        round === 0
          ? plan
          : tapsUntil(world, LAB_NEW_CAMP_COST, camp, footprintOf(target.x, target.y));
      for (const s of more?.taps ?? []) {
        act({ kind: 'tap', x: s.x, y: s.y });
      }
      act({ kind: 'place', x: target.x, y: target.y });
    }
    // The first camp can be demolished once the second covers it.
    const first = world.camps[0];
    if (first !== undefined && demolishRefusal(world, first.id) === null) {
      t += 700;
      const now = advanceWorld(world, t);
      before.push(fingerprint(now));
      history = recordAction(history, now, { kind: 'demolish', id: first.id });
      world = applyCampStep(now, { kind: 'demolish', id: first.id });
    }
    // A camp was placed, and (once it covered the first) the first demolished.
    const kinds = history.entries.map((e) => e.step.kind);
    expect(kinds).toContain('place');
    expect(kinds).toContain('demolish');
    // Enough actions that undo plays steps again from a whole copy.
    expect(undoCount(history)).toBeGreaterThan(CHECKPOINT_EVERY);
    expect(placeRefusal(start, target.x, target.y)).toBe('cost');

    // Undo, all the way back.
    for (let k = before.length - 1; k >= 0; k -= 1) {
      const undone = undoLast(history);
      expect(undone, `undo ${k}`).not.toBeNull();
      if (undone === null) return;
      expect(fingerprint(undone.world), `the world before action ${k}`).toBe(before[k]);
      history = undone.history;
      expect(undoCount(history)).toBe(k);
    }
    expect(undoLast(history)).toBeNull();
  });

  it('can carry on after an undo: new actions are recorded after the undone point', () => {
    const start = newCampWorld(110);
    const camp = start.camps[0] ?? { x: 0, y: 0 };
    const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp);
    expect(plan).not.toBeNull();
    if (plan === null) return;
    const taps = plan.taps.slice(0, 6);
    let world = start;
    let history = emptyHistory();
    for (const s of taps.slice(0, 5)) {
      history = recordAction(history, world, { kind: 'tap', x: s.x, y: s.y });
      world = applyCampStep(world, { kind: 'tap', x: s.x, y: s.y });
    }
    const undone = undoLast(history);
    if (undone === null) throw new Error('nothing to undo');
    // A different action in its place, then undo it: back to the same world.
    const other = taps[5] ?? { x: 0, y: 0 };
    const again = recordAction(undone.history, undone.world, {
      kind: 'tap',
      x: other.x,
      y: other.y,
    });
    expect(undoCount(again)).toBe(5);
    const back = undoLast(again);
    expect(back === null ? '' : fingerprint(back.world)).toBe(fingerprint(undone.world));
  });
});
