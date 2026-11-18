// Property tests (docs/repo-plan.md section 5.4): for a set of fixed seeds, a
// policy that picks random legal actions plays a few hundred decisions, and
// after every one of them the state must still make sense.
//
// The seeds are fixed so that CI is reproducible. The policies pick with the
// engine's seeded generator (tools/policies.ts), so a failure names a seed
// and a step that can be replayed.

import { describe, expect, it } from 'vitest';
import { AVATAR, CONTRACT_IDS, DEFAULT_LOADOUT_ID, ITEMS, SHIFT, STRUCTURES } from '../../src/data';
import {
  applyAction,
  carriedWeight,
  carryCapacity,
  createRun,
  endShift,
  inGrid,
  inventoryEntries,
  isOpen,
  isRunActive,
  isSolid,
  isSurface,
  legalActions,
  previewCubePhase,
  serialise,
  structureAt,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { decisionKey, makePolicy } from '../../tools/policies';

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
  if (
    !isWholeNumber(state.bankedAp) ||
    state.bankedAp < 0 ||
    state.bankedAp >= SHIFT.bankedApPerRefund
  ) {
    problems.push(`banked AP is ${state.bankedAp}, outside 0..${SHIFT.bankedApPerRefund - 1}`);
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
 * checking after each. Returns how the run ended: its cause, or 'active' if
 * it was still going.
 */
function playAndCheck(seed: number, policyName: string, maxDecisions: number): string {
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
  return state.status.kind === 'ended' ? state.status.cause : 'active';
}

describe('property tests: random legal play', () => {
  /** How each run below ended, for the last test. */
  const endings = new Set<string>();

  // `wander` never leaves, so these runs go deep and long: most end out of
  // fuel between 180 and 320 decisions in.
  it.each([1, 2, 3, 4, 5, 6])(
    'wander policy, seed %i: the state stays valid for 350 decisions',
    (seed) => {
      endings.add(playAndCheck(seed, 'wander', 350));
    },
  );

  // `random` may also leave, which covers the run ending by choice.
  it.each([101, 102, 103, 104, 105, 106, 107, 108])(
    'random policy, seed %i: the state stays valid for 150 decisions',
    (seed) => {
      endings.add(playAndCheck(seed, 'random', 150));
    },
  );

  it('the runs above ended in more than one way', () => {
    // A check on the tests themselves: if every run ended the same way, part
    // of the engine would not be exercised. (Tests in a file run in order.)
    expect([...endings]).toEqual(expect.arrayContaining(['left', 'outOfFuel', 'active']));
  });
});
