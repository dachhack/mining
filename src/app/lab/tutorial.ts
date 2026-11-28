// The tutorial (owner, after the 0.26.0 build: "we need a short tutorial
// mode"; asked: a guided first run that teaches the basics, with a one-time
// tip when each later thing first shows up).
//
// - The steps (`TUTORIAL_STEPS`): one small goal at a time, on the player's
//   own first run. A step is done when the world says so (`TutorialFacts`),
//   so the tutorial never takes the game over: the player plays, and the card
//   moves on. A step already done is passed over.
// - The tips (`TUTORIAL_TIPS`): one sentence the first time a dragon, a
//   fire, a flood or a raid shows up, or a smelter can be built. Each is
//   shown once ever.
// - This file is the words and the logic; the screen (campScreen.ts) keeps
//   the step and the tips seen in the phone's storage and draws the card.
//   Nothing here touches the game's rules.

import { FRONTIER_NEW_CAMP_COST, FRONTIER_SHIFT } from '../../data/frontier';

/** What the tutorial needs to know of the run, worked out by the screen. */
export interface TutorialFacts {
  /** True once the store holds anything gathered (wood, grass or apples). */
  gathered: boolean;
  /** Blocks mined in the run. */
  mined: number;
  /** True once a press-and-hold dig has been done. */
  dugArea: boolean;
  /** The shift being played. */
  shift: number;
  /** True if the store holds a new camp's cost. */
  canPayCamp: boolean;
  camps: number;
  /** The best camp's level. */
  bestLevel: number;
  /** Contracts held or delivered. */
  contracts: number;
  // For the tips:
  /** A dragon is on the map. */
  dragon: boolean;
  /** A fire burns in the camps' light. */
  fire: boolean;
  /** A square is flooded. */
  flood: boolean;
  /** Marauders came last night. */
  raided: boolean;
  /** A camp has a smelter. */
  smelter: boolean;
}

/** What a step points at on the screen, if anything: the button pulses. */
export type TutorialTarget = 'endShift' | 'place' | 'goals';

export interface TutorialStepDef {
  id: string;
  text: string;
  target?: TutorialTarget;
  done: (facts: TutorialFacts) => boolean;
}

const campCost = FRONTIER_NEW_CAMP_COST.map((c) => `${c.count} ${c.item}`).join(' and ');

/** The steps, in order. */
export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    id: 'gather',
    text: 'Tap grass or a tree in your camp’s light to gather it. Each tap uses 1 of your ⚡ taps.',
    done: (f) => f.gathered,
  },
  {
    id: 'dig',
    text: 'Tap bare ground to dig it. You can dig only inside a camp’s light.',
    done: (f) => f.mined >= 1,
  },
  {
    id: 'hold',
    text: 'Press and hold a square: it shows the 3×3 it will dig and the cost. Let go to dig.',
    done: (f) => f.dugArea,
  },
  {
    id: 'endShift',
    text: `Tap End shift. Each night costs ${FRONTIER_SHIFT.woodEveryShift} wood, and food every ${FRONTIER_SHIFT.foodEveryShifts} nights; going short costs taps.`,
    target: 'endShift',
    done: (f) => f.shift >= 2,
  },
  {
    id: 'save',
    text: `A new camp lights more ground. Gather ${campCost} for one.`,
    done: (f) => f.canPayCamp || f.camps >= 2,
  },
  {
    id: 'place',
    text: 'Tap ⊕, choose the camp ⛺, tap a spot near the edge of your light, then Place camp.',
    target: 'place',
    done: (f) => f.camps >= 2,
  },
  {
    id: 'upgrade',
    text: 'Tap a camp to open its panel. Upgrade it: a better camp mines harder rock.',
    done: (f) => f.bestLevel >= 2,
  },
  {
    id: 'contract',
    text: 'The market opens every few shifts. Take a contract there; deliver it from 🎯 for coins.',
    target: 'goals',
    done: (f) => f.contracts >= 1,
  },
];

/**
 * The step the tutorial is on, from step `from` (0 is the first), given the
 * run's facts: the first step from `from` on that is not done yet.
 * TUTORIAL_STEPS.length means it is finished.
 */
export function tutorialStep(from: number, facts: TutorialFacts): number {
  let step = from;
  while (step < TUTORIAL_STEPS.length && TUTORIAL_STEPS[step]?.done(facts) === true) step += 1;
  return step;
}

/** A one-time tip: shown the first time `when` holds. */
export interface TutorialTipDef {
  id: string;
  text: string;
  when: (facts: TutorialFacts) => boolean;
}

export const TUTORIAL_TIPS: TutorialTipDef[] = [
  {
    id: 'dragon',
    text: '🐉 A dragon! It burns and eats what your camps light. Make a sword at a smelter, or buy one, and tap the dragon to drive it off.',
    when: (f) => f.dragon,
  },
  {
    id: 'fire',
    text: '🔥 Fire! Tap a burning square to put it out (1 tap). Left burning, it spreads overnight.',
    when: (f) => f.fire,
  },
  {
    id: 'flood',
    text: '💧 You hit water. Buy a pump at the market and tap the water to set it: it drains a few squares a night.',
    when: (f) => f.flood,
  },
  {
    id: 'raid',
    text: '⚔ Marauders came in the night. Build defenses from a camp’s panel: each level turns away stronger raids.',
    when: (f) => f.raided,
  },
  {
    id: 'smelter',
    text: '⚒ A level-2 camp can build a smelter (tap the camp). It turns raw ore and coal into ingots for tools.',
    when: (f) => f.bestLevel >= 2 && !f.smelter,
  },
];

/** The ids of the tips due now: those whose `when` holds and that are not in `seen`. */
export function tipsDue(facts: TutorialFacts, seen: string[]): string[] {
  return TUTORIAL_TIPS.filter((t) => !seen.includes(t.id) && t.when(facts)).map((t) => t.id);
}

/**
 * The tips the ? button turns through once the tutorial is over (owner,
 * after the 0.27.0 build: "It becomes just a tip rotation after the
 * tutorial"): general advice, one at a time, in this order, round and round.
 */
export const ROTATING_TIPS: string[] = [
  'Press and hold a square to dig the 3×3 round it. With 2 or more miners the whole dig costs only a few taps.',
  'Each night costs wood, and food every other night. Going short costs taps the next shift, so keep a little of both.',
  'A better camp brings the market more often, and you can hold as many contracts as your best camp’s level.',
  'Contracts open in stages: build up your camps and deliver contracts to see ore, farm goods and then treasure.',
  'You can only dig one level below a square’s neighbours. Dig wide to go deep.',
  'A saw house gives 1 more wood from every tree near it, and lets you saw lumber in the recipe book.',
  'Apple trees and maples fill again a few shifts after you pick them bare. Leave them standing.',
  'Put spare animals in a pen: with 2 or more and some hay, they breed.',
  'Rain fills low spots with dirt and clay, and brings mushrooms up under trees a few nights later.',
  'A dragon only attacks what your camps light. A sword drives it off for good.',
  'Marauders come 1 to 4 strong. Each level of defenses takes a point off what they do; a fortress stops them all.',
  'A deep camp can stand at the bottom of a pit, 3 or more down. It needs a camp kit from the market.',
  'Holding all 8 of the family’s relics at once is worth the most glory. Think before you sell them.',
];

/** The tip after tip `at` in the rotation (the first after the last; any number lands on a tip). */
export function nextTip(at: number): number {
  const n = ROTATING_TIPS.length;
  return (((Math.floor(at) + 1) % n) + n) % n;
}
