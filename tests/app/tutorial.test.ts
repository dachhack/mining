// The tutorial (owner, after the 0.26.0 build: "we need a short tutorial
// mode"; asked: a guided first run teaching the basics, about 8 steps, with
// one-time tips for later things).
import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS, TUTORIAL_TIPS, tipsDue, tutorialStep } from '../../src/app/lab/tutorial';
import type { TutorialFacts } from '../../src/app/lab/tutorial';

const START: TutorialFacts = {
  gathered: false,
  mined: 0,
  dugArea: false,
  shift: 1,
  canPayCamp: false,
  camps: 1,
  bestLevel: 1,
  contracts: 0,
  dragon: false,
  fire: false,
  flood: false,
  raided: false,
  smelter: false,
};

describe('the tutorial', () => {
  it('is 8 short steps: gather, dig, hold to dig, end shift, save for a camp, place it, upgrade, a contract', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      'gather',
      'dig',
      'hold',
      'endShift',
      'save',
      'place',
      'upgrade',
      'contract',
    ]);
    for (const step of TUTORIAL_STEPS) {
      expect(step.text.length, step.id).toBeGreaterThan(20);
      expect(step.text.length, step.id).toBeLessThanOrEqual(150);
    }
  });

  it('moves on one step when the step is done, and waits otherwise', () => {
    expect(tutorialStep(0, START)).toBe(0);
    expect(tutorialStep(0, { ...START, gathered: true })).toBe(1);
    expect(tutorialStep(1, { ...START, gathered: true })).toBe(1);
    expect(tutorialStep(1, { ...START, gathered: true, mined: 1 })).toBe(2);
    expect(tutorialStep(2, { ...START, mined: 9 })).toBe(2); // taps are not the hold
    expect(tutorialStep(2, { ...START, dugArea: true })).toBe(3);
    expect(tutorialStep(3, { ...START, shift: 2 })).toBe(4);
  });

  it('passes over steps already done, to the end', () => {
    // Saved up and placed in one go: 'save' and 'place' are both done.
    expect(tutorialStep(4, { ...START, canPayCamp: true, camps: 2 })).toBe(6);
    const all: TutorialFacts = {
      ...START,
      gathered: true,
      mined: 3,
      dugArea: true,
      shift: 12,
      canPayCamp: true,
      camps: 2,
      bestLevel: 2,
      contracts: 1,
    };
    expect(tutorialStep(0, all)).toBe(TUTORIAL_STEPS.length); // finished
  });

  it('has a one-time tip for each later thing, due when it first shows up', () => {
    expect(TUTORIAL_TIPS.map((t) => t.id)).toEqual(['dragon', 'fire', 'flood', 'raid', 'smelter']);
    expect(tipsDue(START, [])).toEqual([]);
    expect(tipsDue({ ...START, dragon: true, fire: true }, [])).toEqual(['dragon', 'fire']);
    // Seen once, never again.
    expect(tipsDue({ ...START, dragon: true, fire: true }, ['dragon'])).toEqual(['fire']);
    // The smelter tip: a level-2 camp and no smelter yet.
    expect(tipsDue({ ...START, bestLevel: 2 }, [])).toEqual(['smelter']);
    expect(tipsDue({ ...START, bestLevel: 2, smelter: true }, [])).toEqual([]);
  });
});
