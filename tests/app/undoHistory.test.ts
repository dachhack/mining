// UI lab 2: Undo (owner: "Undo button"; question 141: "animal and apple
// harvest cannot be undone", the animals and apples are left alone).
// Undo takes back only the player's own changes, exactly, within the current
// shift (question 151, plan A4), and gives each undone action's tap back.
import { describe, expect, it } from 'vitest';
import { LAB_NEW_CAMP_COST } from '../../src/data/labCamps';
import { hashState } from '../../src/engine';
import {
  applyCampStep,
  campRadius,
  campTap,
  demolishRefusal,
  footprintOf,
  newCampWorld,
  sightMap,
} from '../../src/app/lab/campWorld';
import type { CampStep, CampWorld } from '../../src/app/lab/campWorld';
import { emptyHistory, noteAction, undoCount, undoLast } from '../../src/app/lab/undoHistory';
import type { UndoHistory } from '../../src/app/lab/undoHistory';
import { tapsUntil } from '../e2e/campPlan';

/**
 * The player's own state, as one string: the cube, depths, blocks mined,
 * camps, what is lit, the plants, and the counts other than the harvests
 * (apples and animals), which undo never touches.
 */
function playerState(w: CampWorld): string {
  return JSON.stringify({
    cube: hashState(w.lab.state),
    depths: w.lab.depths.depths,
    mined: w.lab.mined,
    camps: w.camps,
    nextCampId: w.nextCampId,
    seen: w.seen,
    sights: sightMap(w),
    features: w.surface.features,
    counts: [...w.lab.counts].filter(([item]) => item !== 'apple' && item !== 'animal').sort(),
  });
}

/** The living world, which undo leaves alone; squares in `skip` (plants undo puts back) are left out. */
function living(w: CampWorld, skip: Set<number> = new Set()): string {
  return JSON.stringify({
    animals: w.surface.animals,
    apples: w.surface.apples.filter((_, i) => !skip.has(i)),
    regrowIn: w.surface.regrowIn.filter((_, i) => !skip.has(i)),
    rng: w.surface.rng,
    shift: w.turn.shift,
    caught: w.lab.counts.get('animal') ?? 0,
    picked: w.lab.counts.get('apple') ?? 0,
  });
}

/** Is a tap at (x, y) on `w` an undoable action (not a catch or an apple pick, and it changes something)? */
function undoable(w: CampWorld, step: CampStep): boolean {
  if (step.kind !== 'tap') return applyCampStep(w, step) !== w;
  const tap = campTap(w, step.x, step.y);
  if (tap.kind === 'mined') return true;
  return (
    tap.kind === 'harvested' && (tap.harvest?.kind === 'grass' || tap.harvest?.kind === 'felled')
  );
}

/** A player: plays steps, keeping the history as the screen does (emptied when a shift ends). */
function player(start: CampWorld): {
  act: (step: CampStep) => void;
  undo: () => string | null;
  world: () => CampWorld;
  history: () => UndoHistory;
} {
  let world = start;
  let history = emptyHistory(start);
  return {
    act: (step) => {
      const next = applyCampStep(world, step);
      if (next === world) return;
      if (step.kind === 'endShift' || step.kind === 'close') {
        history = emptyHistory(next);
      } else {
        // Every action that did something is noted; catches and apple picks as not undoable.
        history = noteAction(history, step, undoable(world, step));
      }
      world = next;
    },
    undo: () => {
      const result = undoLast(history, world);
      if (result === null) return 'nothing';
      if ('refused' in result) return result.refused;
      world = result.world;
      history = result.history;
      return null;
    },
    world: () => world,
    history: () => history,
  };
}

/** The first lit square of `w` where a tap does `kind` ('grass', 'felled', 'apple', 'caught' or 'mined'). */
function squareWhere(w: CampWorld, kind: string): { x: number; y: number } | null {
  const width = w.lab.state.size.x;
  const sights = sightMap(w);
  for (let i = 0; i < sights.length; i += 1) {
    if (sights[i] !== 'shown') continue;
    const x = i % width;
    const y = Math.floor(i / width);
    const tap = campTap(w, x, y);
    const got = tap.kind === 'harvested' ? (tap.harvest?.kind ?? '') : tap.kind;
    if (got === kind) return { x, y };
  }
  return null;
}

describe('undo (owner: "Undo button"; question 141)', () => {
  it('is empty at first, and undoing nothing gives nothing', () => {
    const p = player(newCampWorld(110));
    expect(undoCount(p.history())).toBe(0);
    expect(p.undo()).toBe('nothing');
  });

  it('takes back every action of the shift, exactly, gives each tap back, and leaves the animals and apples alone', () => {
    const start = newCampWorld(110);
    const camp = start.camps[0] ?? { x: 0, y: 0 };
    const target = { x: camp.x + campRadius(1) - 1, y: camp.y };
    const p = player(start);
    // Gather for a camp over several shifts, then start a fresh shift: place
    // the camp, dig a little, and demolish the first camp, all in one shift,
    // keeping the player's state before each undoable action.
    const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp, footprintOf(target.x, target.y));
    for (const step of plan?.steps ?? []) p.act(step);
    p.act({ kind: 'endShift' });
    expect(undoCount(p.history())).toBe(0); // a shift's end empties the history
    // Upkeep may have spent some of what the plan gathered: gather it back in this shift.
    const topUp = tapsUntil(p.world(), LAB_NEW_CAMP_COST, camp, footprintOf(target.x, target.y));
    const before: string[] = [];
    const taps: number[] = [];
    const act = (step: CampStep): void => {
      if (undoable(p.world(), step)) {
        before.push(playerState(p.world()));
        taps.push(p.world().turn.tapsLeft);
      }
      p.act(step);
    };
    for (const step of topUp?.steps ?? []) act(step);
    act({ kind: 'place', x: target.x, y: target.y });
    const first = p.world().camps[0];
    if (first !== undefined && demolishRefusal(p.world(), first.id) === null) {
      act({ kind: 'demolish', id: first.id });
    }
    expect(p.world().turn.shift).toBe(
      start.turn.shift + (plan?.steps.filter((s) => s.kind === 'endShift').length ?? 0) + 1,
    );
    const kinds = p
      .history()
      .log.actions.filter((a) => a.undoable)
      .map((a) => a.action.kind);
    expect(kinds).toContain('place');
    expect(kinds).toContain('demolish');
    expect(undoCount(p.history())).toBe(before.length);

    // Undo all the way back to the start of the shift.
    for (let k = before.length - 1; k >= 0; k -= 1) {
      // The squares whose plants the undo puts back are left out of the living world.
      const was = before[k] ?? '';
      const skip = new Set<number>();
      const plantsNow = p.world().surface.features;
      const plantsBefore = (JSON.parse(was) as { features: number[] }).features;
      plantsBefore.forEach((f, i) => {
        if (plantsNow[i] !== f) skip.add(i);
      });
      const livingBefore = living(p.world(), skip);
      expect(p.undo(), `undo ${k}`).toBeNull();
      expect(playerState(p.world()), `the player's state before action ${k}`).toBe(before[k]);
      expect(p.world().turn.tapsLeft, `taps back after undo ${k}`).toBe(taps[k]);
      // The animals, harvests, apples and shift are as they were just before
      // the undo, except on a plant the undo put back.
      expect(living(p.world(), skip)).toBe(livingBefore);
    }
    expect(p.undo()).toBe('nothing');
  });

  it('never undoes a caught animal or a picked apple, and steps past them', () => {
    const start = newCampWorld(110);
    const p = player(start);
    const dig = squareWhere(start, 'mined');
    const apple = squareWhere(start, 'apple');
    const animal = squareWhere(start, 'caught');
    expect(dig).not.toBeNull();
    expect(apple).not.toBeNull();
    expect(animal).not.toBeNull();
    if (dig === null || apple === null || animal === null) return;

    // Dig A, catch the animal, pick an apple, then dig B.
    p.act({ kind: 'tap', ...dig });
    const afterA = playerState(p.world());
    p.act({ kind: 'tap', ...animal });
    p.act({ kind: 'tap', ...apple });
    const caughtId = start.surface.animals.find((a) => a.x === animal.x && a.y === animal.y)?.id;
    const applesLeft = p.world().surface.apples[apple.x + start.lab.state.size.x * apple.y];
    const digB = squareWhere(p.world(), 'mined');
    if (digB === null) throw new Error('nothing more to dig');
    p.act({ kind: 'tap', ...digB });
    // Only the two digs are in the history.
    expect(
      p
        .history()
        .log.actions.filter((a) => a.undoable)
        .map((a) => a.action),
    ).toEqual([
      { kind: 'tap', ...dig },
      { kind: 'tap', ...digB },
    ]);

    // Undo: dig B comes back; the animal and the apple stay taken.
    expect(p.undo()).toBeNull();
    expect(playerState(p.world())).toBe(afterA);
    const stillTaken = (w: CampWorld): void => {
      expect(w.lab.counts.get('animal')).toBe(1);
      expect(w.lab.counts.get('apple')).toBe(1);
      expect(w.surface.animals.some((a) => a.id === caughtId)).toBe(false);
      expect(w.surface.apples[apple.x + start.lab.state.size.x * apple.y]).toBe(applesLeft);
    };
    stillTaken(p.world());
    // Undo again: dig A comes back, past the catch and the pick.
    expect(p.undo()).toBeNull();
    expect(playerState(p.world())).toBe(playerState(start));
    stillTaken(p.world());
    expect(p.undo()).toBe('nothing');
  });

  it('starts again at the end of a shift: nothing from the last shift can be undone', () => {
    const start = newCampWorld(110);
    const dig = squareWhere(start, 'mined');
    if (dig === null) throw new Error('nothing to dig');
    const p = player(start);
    p.act({ kind: 'tap', ...dig });
    expect(undoCount(p.history())).toBe(1);
    p.act({ kind: 'endShift' });
    expect(undoCount(p.history())).toBe(0);
    expect(p.undo()).toBe('nothing');
  });
});
