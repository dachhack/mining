// Property tests (docs/repo-plan.md section 5.4): for a set of fixed seeds,
// random legal actions are played for a few hundred decisions, and after
// every one of them the state must still make sense.
//
// The seeds are fixed so that CI is reproducible. The picks come from the
// engine's seeded generator (`createRng`), so a failure names a seed and a
// step that can be replayed.
//
// The second half is the hidden-information property (design doc v0.2
// section 3.4; issue #86): nothing the player is offered or shown may depend
// on a block below a top block, or on the block under a tree that has never
// been cut. The views built on the engine (the play tool's text, the phone
// map) have the same test of their own, in tests/tools and tests/app.

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
  actionKey,
  applyAction,
  createRng,
  createRun,
  depthAt,
  endShift,
  hasTree,
  stockpileEntries,
  isRevealed,
  isRunActive,
  knownSquare,
  legalActions,
  mineCheck,
  nextInt,
  previewCubePhase,
  serialise,
} from '../../src/engine';
import type { Action, GameEvent, GameState, RngState } from '../../src/engine';
import { knownCube } from '../../src/engine/known';
import {
  cloneState,
  setBlock,
  setCrackTimer,
  setGas,
  setLava,
  setStructure,
  setWater,
} from '../../src/engine/state';
import { act, buildState } from './helpers';

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

  // Gauges and counters.
  if (!isWholeNumber(state.ap) || state.ap < 0 || state.ap > SHIFT.apPerShift) {
    problems.push(`AP is ${state.ap}, outside 0..${SHIFT.apPerShift}`);
  }
  if (!isWholeNumber(state.fuel) || state.fuel < 0) {
    problems.push(`fuel is ${state.fuel}`);
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

  // The stockpile. It has no limit (design doc 4.1), so only the counts and
  // the item ids are checked.
  for (const entry of stockpileEntries(state)) {
    if (!isWholeNumber(entry.count) || entry.count < 0) {
      problems.push(`stockpile holds ${entry.count} ${entry.item}`);
    }
    if (!Object.hasOwn(ITEMS, entry.item)) {
      problems.push(`stockpile holds an unknown item: ${entry.item}`);
    }
  }

  // The terrain, square by square.
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const at = `(${x}, ${y})`;
      const depth = depthAt(state, x, y);
      const tree = hasTree(state, { x, y, z: -1 });

      // The level rule ([Decided]): neighbours are within 1 level. Checking
      // east and south covers every pair once.
      if (x + 1 < state.size.x && Math.abs(depth - depthAt(state, x + 1, y)) > 1) {
        problems.push(`squares ${at} and its east neighbour differ by more than 1 level`);
      }
      if (y + 1 < state.size.y && Math.abs(depth - depthAt(state, x, y + 1)) > 1) {
        problems.push(`squares ${at} and its south neighbour differ by more than 1 level`);
      }

      // A tree stands only at ground level.
      if (tree && depth !== 0) {
        problems.push(`a tree stands on square ${at} at depth ${depth}`);
      }

      // What is known: the top block unless a tree has always hidden it, the
      // open cells above it, and nothing below it.
      if (depth < state.size.z && !tree && !isRevealed(state, { x, y, z: depth })) {
        problems.push(`the top block of square ${at} is not known`);
      }
      for (let z = depth + 1; z < state.size.z; z += 1) {
        if (isRevealed(state, { x, y, z })) {
          problems.push(`a block below the top of square ${at} is known (layer ${z})`);
        }
      }
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

  // The mine list is exactly the squares `mineCheck` allows and the AP covers.
  if (isRunActive(state)) {
    const offered = new Set<string>();
    for (const action of legal) {
      if (action.type === 'mine') {
        offered.add(`${action.x},${action.y}`);
      }
    }
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const check = mineCheck(state, x, y);
        const expected = check.allowed && check.ap !== null && check.ap <= state.ap;
        if (offered.has(`${x},${y}`) !== expected) {
          problems.push(`square (${x}, ${y}): the mine list and mineCheck disagree`);
        }
      }
    }
  }
  return problems;
}

/** What a random player does next: one legal action, or end the shift. */
type Decision = Action | 'endShift';

/**
 * Pick the next decision at random: usually a legal action, sometimes the end
 * of the shift, and always the end of the shift when nothing else is left.
 * Leaving is never picked, so that a run lasts.
 */
function randomDecision(state: GameState, rng: RngState): Decision {
  const choices = legalActions(state).filter((action) => action.type !== 'closeMine');
  // 1 time in 8, end the shift early.
  if (choices.length === 0 || nextInt(rng, 8) === 0) {
    return 'endShift';
  }
  return choices[nextInt(rng, choices.length)] as Action;
}

/** Play up to `maxDecisions` random decisions of one run, calling `check` after each. */
function playRandomly(
  seed: number,
  maxDecisions: number,
  check: (state: GameState, label: string) => void,
): GameState {
  // The picks use a generator of their own; `state.rng` belongs to the rules.
  const rng = createRng(seed + 1000);
  let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
  check(state, `seed ${seed}, new run`);
  for (let step = 1; step <= maxDecisions && isRunActive(state); step += 1) {
    const decision = randomDecision(state, rng);
    const name = decision === 'endShift' ? 'endShift' : actionKey(decision);
    const before = snapshot(state);
    const result = decision === 'endShift' ? endShift(state) : applyAction(state, decision);
    // The state that was passed in is untouched.
    expect(snapshot(state) === before, `seed ${seed}, decision ${step}: input changed`).toBe(true);
    state = result.state;
    check(state, `seed ${seed}, decision ${step} (${name})`);
  }
  return state;
}

describe('property tests: random legal play', () => {
  it.each([3, 11, 27, 150])(
    'seed %i: every state reached makes sense, and the level rule always holds',
    (seed) => {
      const last = playRandomly(seed, 150, (state, label) => {
        expect(invariantProblems(state), label).toEqual([]);
        // No soft-lock: the run has ended, or the shift can be ended (and the
        // preview that goes with it works).
        if (isRunActive(state)) {
          expect(() => endShift(state), `${label}: endShift`).not.toThrow();
          expect(() => previewCubePhase(state), `${label}: previewCubePhase`).not.toThrow();
        }
      });
      // The run did something: some square was dug.
      let deepest = 0;
      for (let y = 0; y < last.size.y; y += 1) {
        for (let x = 0; x < last.size.x; x += 1) {
          deepest = Math.max(deepest, depthAt(last, x, y));
        }
      }
      expect(deepest).toBeGreaterThan(0);
    },
    60000,
  );
});

// ---------------------------------------------------------------------------
// Hidden information
// ---------------------------------------------------------------------------

/** The codes of blocks a hidden cell may be turned into: every solid block that can be mined. */
const SOLID_CODES: number[] = Object.values(BLOCKS)
  .filter((def) => def.solid && def.mineCost !== null)
  .map((def) => def.code);

/**
 * A copy of `state` in which everything the player has NOT been shown is
 * replaced by something else, chosen with `rng`:
 * - every cell below a square's top block: another block or open space, and
 *   sometimes water, lava, gas, a crack or a structure;
 * - the layer-0 block under a tree, if it has never been seen: another solid
 *   block (solid, because the square's depth is seen and must stay 0).
 * What the player has been shown is left exactly as it is, and so are the
 * mineral traces already noted on it (`tracesSeen`): a tell is the one thing
 * that may depend on a hidden block (design doc 3.4).
 */
function scrambleHidden(state: GameState, rng: RngState): GameState {
  const copy = cloneState(state);
  for (let y = 0; y < copy.size.y; y += 1) {
    for (let x = 0; x < copy.size.x; x += 1) {
      const depth = depthAt(state, x, y);
      const groundUnderTree = { x, y, z: 0 };
      if (depth === 0 && !isRevealed(state, groundUnderTree)) {
        setBlock(copy, groundUnderTree, SOLID_CODES[nextInt(rng, SOLID_CODES.length)] as number);
      }
      for (let z = depth + 1; z < copy.size.z; z += 1) {
        const pos = { x, y, z };
        // 1 time in 4 open space, otherwise a random solid block.
        const open = nextInt(rng, 4) === 0;
        const code = open
          ? BLOCKS.air.code
          : (SOLID_CODES[nextInt(rng, SOLID_CODES.length)] as number);
        setBlock(copy, pos, code);
        setWater(copy, pos, open ? nextInt(rng, 2) : 0);
        setLava(copy, pos, open ? nextInt(rng, 2) : 0, nextInt(rng, 2) === 0);
        setGas(copy, pos, open ? nextInt(rng, 5) : 0);
        setStructure(copy, pos, open ? nextInt(rng, Object.keys(STRUCTURES).length + 1) : 0);
        if (!open && nextInt(rng, 3) === 0) {
          setCrackTimer(copy, pos, nextInt(rng, 3));
        }
      }
    }
  }
  return copy;
}

/** Everything the player is offered or shown, as one string. */
function playerSees(state: GameState): string {
  const squares = [];
  const checks = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      squares.push(knownSquare(state, x, y));
      checks.push(mineCheck(state, x, y));
    }
  }
  return JSON.stringify({
    actions: legalActions(state).map(actionKey),
    forecast: previewCubePhase(state),
    squares,
    checks,
    hud: [state.ap, state.fuel, state.shift, state.avatar, state.stockpile],
    knownCube: snapshot(knownCube(state)),
  });
}

describe('property tests: hidden blocks change nothing the player gets (issue #86)', () => {
  it.each([5, 12, 49])(
    'seed %i: scrambling everything below the tops and under uncut trees changes nothing',
    (seed) => {
      const scrambler = createRng(seed + 5000);
      let compared = 0;
      playRandomly(seed, 60, (state, label) => {
        // Every 10th state, to keep the test quick.
        compared += 1;
        if (compared % 10 !== 1 || !isRunActive(state)) {
          return;
        }
        const other = scrambleHidden(state, scrambler);
        // The scramble did change the true cube...
        expect(snapshot(other) === snapshot(state), `${label}: scramble`).toBe(false);
        // ...and nothing the player gets.
        expect(playerSees(other) === playerSees(state), label).toBe(true);
      });
      expect(compared).toBeGreaterThan(10);
    },
    60000,
  );

  it('ending the shift shows the same events whatever is hidden, tells apart', () => {
    const state = createRun(21, CONTRACT, DEFAULT_LOADOUT_ID);
    const other = scrambleHidden(state, createRng(77));
    // Tells are the one deliberate exception (design doc 3.4): a tell reports
    // something hidden near a block the player sees. The scramble puts ore
    // under the tops, so the scrambled cube notes new mineral traces.
    const withoutTells = (events: GameEvent[]) =>
      events.filter((event) => event.type !== 'mineralTracesSeen');
    expect(withoutTells(endShift(other).events)).toEqual(withoutTells(endShift(state).events));
  });

  it('a mine costs the same and shows the same, apart from the block it uncovers', () => {
    // Two cubes that differ only under the tops.
    // (No ore among the differences: ore near a top shows mineral traces,
    // which is what a tell is for.)
    const one = buildState({ layers: [['##'], ['c#'], ['##']] });
    const two = buildState({ layers: [['##'], ['H#'], ['.#']] });
    expect(playerSees(two)).toBe(playerSees(one));
    const afterOne = act(one, { type: 'mine', x: 1, y: 0 });
    const afterTwo = act(two, { type: 'mine', x: 1, y: 0 });
    // The same square, the same hidden block under it: the same events.
    expect(afterTwo.events).toEqual(afterOne.events);
    expect(afterTwo.state.ap).toBe(afterOne.state.ap);
  });

  it('the block under an uncut tree changes nothing: not the lists, not the cut', () => {
    const coal = buildState({ layers: [['#c#'], ['###']], surface: ['.T.'] });
    const dirt = buildState({ layers: [['#d#'], ['###']], surface: ['.T.'] });
    expect(playerSees(dirt)).toBe(playerSees(coal));
    const cutCoal = act(coal, { type: 'cutTree', x: 1, y: 0 });
    const cutDirt = act(dirt, { type: 'cutTree', x: 1, y: 0 });
    expect(cutDirt.state.ap).toBe(cutCoal.state.ap);
    // Only the reveal differs: that is the block being shown at last.
    const withoutReveal = (events: GameEvent[]) =>
      events.filter((event) => event.type !== 'blockRevealed');
    expect(withoutReveal(cutDirt.events)).toEqual(withoutReveal(cutCoal.events));
  });
});
