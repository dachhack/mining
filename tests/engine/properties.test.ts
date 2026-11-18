// Property tests (docs/repo-plan.md section 5.4): for a set of fixed seeds, a
// policy that picks random legal actions plays a few hundred decisions, and
// after every one of them the state must still make sense.
//
// The seeds are fixed so that CI is reproducible. The policies pick with the
// engine's seeded generator (tools/policies.ts), so a failure names a seed
// and a step that can be replayed.

import { describe, expect, it } from 'vitest';
import {
  AVATAR,
  BLOCKS,
  CONTRACT_IDS,
  DEFAULT_LOADOUT_ID,
  ITEMS,
  SHIFT,
  STRUCTURES,
} from '../../src/data';
import {
  applyAction,
  carriedWeight,
  carryCapacity,
  createRun,
  endShift,
  inGrid,
  inventoryEntries,
  isOpen,
  isRevealed,
  isRunActive,
  isSolid,
  isSurface,
  legalActions,
  previewCubePhase,
  serialise,
  structureAt,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import type { Vec3 } from '../../src/data';
import { cloneState, setBlock } from '../../src/engine/state';
import { decisionKey, makePolicy } from '../../tools/policies';
import { playRun } from '../../tools/simRun';

const CONTRACT = CONTRACT_IDS[0] as string;

/** The whole state as one string; two states are the same exactly when these are. */
function snapshot(state: GameState): string {
  return JSON.stringify(serialise(state));
}

function isWholeNumber(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Everything that must be true of a state the engine produced. Returns a list
 * of what is wrong, empty if nothing is.
 */
function invariantProblems(state: GameState): string[] {
  const problems: string[] = [];
  const pos = state.avatar.pos;
  const below = { x: pos.x, y: pos.y, z: pos.z + 1 };

  // Gauges and counters.
  if (!isWholeNumber(state.ap) || state.ap < 0 || state.ap > SHIFT.apPerShift) {
    problems.push(`AP is ${state.ap}, outside 0..${SHIFT.apPerShift}`);
  }
  if (!isWholeNumber(state.fuel) || state.fuel < 0) {
    problems.push(`fuel is ${state.fuel}`);
  }
  if (!isWholeNumber(state.lampOil) || state.lampOil < 0) {
    problems.push(`lamp oil is ${state.lampOil}`);
  }
  if (!isWholeNumber(state.shift) || state.shift < SHIFT.firstShiftNumber) {
    problems.push(`shift is ${state.shift}`);
  }
  const health = state.avatar.health;
  if (!isWholeNumber(health) || health < 0 || health > AVATAR.startHealth) {
    problems.push(`health is ${health}, outside 0..${AVATAR.startHealth}`);
  }
  if (isRunActive(state) && health === 0) {
    problems.push('the run is still going with 0 health');
  }

  // Inventory.
  for (const entry of inventoryEntries(state)) {
    if (!isWholeNumber(entry.count) || entry.count < 0) {
      problems.push(`inventory holds ${entry.count} ${entry.item}`);
    }
    if (!Object.hasOwn(ITEMS, entry.item)) {
      problems.push(`inventory holds an unknown item: ${entry.item}`);
    }
  }
  if (carriedWeight(state) > carryCapacity()) {
    problems.push(`carried weight ${carriedWeight(state)} is over the limit ${carryCapacity()}`);
  }

  // The avatar: inside the world, in an open cell, held up by rock or a ladder.
  if (!inGrid(state.size, pos) && !isSurface(state.size, pos)) {
    problems.push(`the avatar is outside the world at (${pos.x}, ${pos.y}, ${pos.z})`);
  }
  if (!isOpen(state, pos)) {
    problems.push(`the avatar is inside a block at (${pos.x}, ${pos.y}, ${pos.z})`);
  }
  const onLadder = structureAt(state, pos) === STRUCTURES.ladder.code;
  if (!isSolid(state, below) && !onLadder) {
    problems.push(`the avatar has no footing at (${pos.x}, ${pos.y}, ${pos.z})`);
  }

  // Loose items: a positive count, in an open cell, resting on a solid block.
  for (const pile of state.looseItems) {
    const at = `(${pile.pos.x}, ${pile.pos.y}, ${pile.pos.z})`;
    if (!isWholeNumber(pile.count) || pile.count <= 0) {
      problems.push(`a loose pile of ${pile.count} ${pile.item} at ${at}`);
    }
    if (!isOpen(state, pile.pos)) {
      problems.push(`loose ${pile.item} inside a block at ${at}`);
    }
    if (!isSolid(state, { x: pile.pos.x, y: pile.pos.y, z: pile.pos.z + 1 })) {
      problems.push(`loose ${pile.item} at ${at} is not resting on a solid block`);
    }
  }

  // Legal actions: none costs more AP than there is, and none once the run is over.
  const legal = legalActions(state);
  for (const action of legal) {
    if (action.ap > state.ap) {
      problems.push(`a legal action costs ${action.ap} AP with ${state.ap} left`);
    }
  }
  if (!isRunActive(state) && legal.length > 0) {
    problems.push('the run has ended but there are legal actions');
  }
  return problems;
}

/**
 * Play up to `maxDecisions` decisions of one run with a random policy,
 * checking after each.
 */
function playAndCheck(seed: number, policyName: string, maxDecisions: number): void {
  const policy = makePolicy(policyName, seed);
  let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
  expect(invariantProblems(state), `seed ${seed}, new run`).toEqual([]);
  // The state as a string, taken before each call and compared after it.
  let before = snapshot(state);

  for (let step = 1; step <= maxDecisions && isRunActive(state); step += 1) {
    const decision = policy.decide(state);
    const label = `seed ${seed}, ${policyName}, decision ${step} (${decisionKey(decision)})`;

    // The engine must not throw on a legal action or on ending the shift.
    // (If it does, the test fails with the engine's own error.)
    const result = decision === 'endShift' ? endShift(state) : applyAction(state, decision);

    // The state that was passed in is untouched.
    expect(snapshot(state) === before, `${label}: the input state was changed`).toBe(true);

    state = result.state;
    before = snapshot(state);
    expect(invariantProblems(state), label).toEqual([]);

    // No soft-lock: the run has ended, or the shift can be ended (and the
    // preview that goes with it works). Neither changes the state; the next
    // turn of the loop, or the line after it, checks that.
    if (isRunActive(state)) {
      expect(() => endShift(state), `${label}: endShift`).not.toThrow();
      expect(() => previewCubePhase(state), `${label}: previewCubePhase`).not.toThrow();
    }
  }
  expect(snapshot(state) === before, `seed ${seed}: the last state was changed`).toBe(true);
}

describe('property tests: random legal play', () => {
  // The seeds and lengths of the runs below.
  const WANDER_SEEDS = [1, 2, 3, 4, 5, 6];
  const WANDER_DECISIONS = 350;
  const RANDOM_SEEDS = [101, 102, 103, 104, 105, 106, 107, 108];
  const RANDOM_DECISIONS = 150;

  // `wander` never leaves, so these runs go deep and long: most end out of
  // fuel between 180 and 320 decisions in.
  it.each(WANDER_SEEDS)(
    `wander policy, seed %i: the state stays valid for ${WANDER_DECISIONS} decisions`,
    (seed) => {
      playAndCheck(seed, 'wander', WANDER_DECISIONS);
    },
  );

  // `random` may also leave, which covers the run ending by choice.
  it.each(RANDOM_SEEDS)(
    `random policy, seed %i: the state stays valid for ${RANDOM_DECISIONS} decisions`,
    (seed) => {
      playAndCheck(seed, 'random', RANDOM_DECISIONS);
    },
  );

  it('those runs end in more than one way', () => {
    // A check on the tests themselves: if every run ended the same way, part
    // of the engine would not be exercised. It plays the same runs again
    // (same seeds, policies and lengths, so the same decisions) without the
    // per-step checks, which is quick. So it depends on no other test having
    // run, and is never skipped.
    const endings = new Set<string>();
    const plays: [number[], string, number][] = [
      [WANDER_SEEDS, 'wander', WANDER_DECISIONS],
      [RANDOM_SEEDS, 'random', RANDOM_DECISIONS],
    ];
    for (const [seeds, policyName, maxDecisions] of plays) {
      for (const seed of seeds) {
        const { finalState } = playRun({
          seed,
          contractId: CONTRACT,
          loadoutId: DEFAULT_LOADOUT_ID,
          policy: makePolicy(policyName, seed),
          maxShifts: Infinity,
          maxDecisions,
        });
        endings.add(finalState.status.kind === 'ended' ? finalState.status.cause : 'active');
      }
    }
    expect([...endings]).toEqual(expect.arrayContaining(['left', 'outOfFuel', 'active']));
  });
});

// ---------------------------------------------------------------------------
// The action list shows only what the player can see (issue #15)
// ---------------------------------------------------------------------------

// How far around the avatar to look for cells that matter. No rule looks
// further than this. Sideways and up, reach is 1 cell. Down, the furthest
// cell any rule reads is the floor that ends the longest drop a move may
// choose, taken from a ladder: 1 cell climbed, `maxChosenDropBlocks` fallen,
// and the floor below that. The window goes 2 cells beyond it, and follows
// the data value if that is ever raised.
const NEAR_SIDEWAYS = 3;
const NEAR_ABOVE = 2;
const NEAR_BELOW = AVATAR.maxChosenDropBlocks + 4;

/**
 * The unrevealed cells near the avatar whose content changes `legalActions`.
 * Each one in turn is swapped (open becomes stone, solid becomes air) in a
 * copy of the state, and the copy's action list is compared with the
 * original's. If the list changed, the player could learn what an unseen
 * cell holds by reading the list, so the result must be empty.
 *
 * This is the check the review of issue #15 used, kept small enough for CI
 * by trying only unrevealed cells close to the avatar.
 */
function unseenCellsThatChangeTheActionList(state: GameState): Vec3[] {
  const before = JSON.stringify(legalActions(state));
  const here = state.avatar.pos;
  const found: Vec3[] = [];
  for (let z = here.z - NEAR_ABOVE; z <= here.z + NEAR_BELOW; z += 1) {
    for (let y = here.y - NEAR_SIDEWAYS; y <= here.y + NEAR_SIDEWAYS; y += 1) {
      for (let x = here.x - NEAR_SIDEWAYS; x <= here.x + NEAR_SIDEWAYS; x += 1) {
        const pos = { x, y, z };
        if (!inGrid(state.size, pos) || isRevealed(state, pos)) {
          continue;
        }
        const changed = cloneState(state);
        setBlock(changed, pos, isOpen(state, pos) ? BLOCKS.stone.code : BLOCKS.air.code);
        if (JSON.stringify(legalActions(changed)) !== before) {
          found.push(pos);
        }
      }
    }
  }
  return found;
}

/**
 * Play one run with the wander policy and make the check above after every
 * `every`-th decision. With `lampOut`, the lamp is empty from the first
 * shift on, so nearly everything the avatar digs into is unlit.
 */
function playAndCheckUnseenCells(
  seed: number,
  lampOut: boolean,
  maxDecisions: number,
  every: number,
): { checks: number; checksWithLampOut: number } {
  const policy = makePolicy('wander', seed);
  let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
  if (lampOut) {
    // Not reachable through the public surface: empty the lamp by hand, as a
    // scenario test would, then end a shift so that the engine has run with it.
    state = cloneState(state);
    state.lampOil = 0;
    state = endShift(state).state;
  }
  let checks = 0;
  let checksWithLampOut = 0;
  for (let step = 1; step <= maxDecisions && isRunActive(state); step += 1) {
    const decision = policy.decide(state);
    state = decision === 'endShift' ? endShift(state).state : applyAction(state, decision).state;
    if (step % every === 0 && isRunActive(state)) {
      const label = `seed ${seed}, decision ${step} (${decisionKey(decision)}), lamp oil ${state.lampOil}`;
      expect(unseenCellsThatChangeTheActionList(state), label).toEqual([]);
      checks += 1;
      checksWithLampOut += state.lampOil === 0 ? 1 : 0;
    }
  }
  return { checks, checksWithLampOut };
}

describe('property tests: unrevealed cells do not change the action list (issue #15)', () => {
  // The seeds are ones whose wander run lasts long enough to make the number
  // of checks asked for below. Without a fuel refill (issue #32) a wander run
  // ends out of fuel after about 130 to 250 decisions.
  it.each([11, 16, 20])('with the lamp lit at the start, seed %i', (seed) => {
    const { checks } = playAndCheckUnseenCells(seed, false, 300, 4);
    expect(checks).toBeGreaterThan(40);
  });

  it.each([24, 27, 32])('with the lamp out from the start, seed %i', (seed) => {
    const { checks, checksWithLampOut } = playAndCheckUnseenCells(seed, true, 300, 2);
    // Most checks are in the dark; the wander policy may craft a little oil.
    expect(checks).toBeGreaterThan(80);
    expect(checksWithLampOut).toBeGreaterThan(checks / 2);
  });
});
