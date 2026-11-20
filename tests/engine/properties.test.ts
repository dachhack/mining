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
//
// A scan is the one sanctioned way to learn what lies below a top (design doc
// 3.4 and 7.2; issue #104). So "hidden" means "not revealed": the cells a
// scan revealed count as known, every random run checks that nothing else
// below a top ever becomes known, and one group of runs starts with the
// camp-made tools in the stockpile so that scans, seals and pumps happen.

import { describe, expect, it } from 'vitest';
import {
  CREW,
  BLOCKS,
  CONTRACT_IDS,
  DEFAULT_LOADOUT_ID,
  ITEMS,
  SHIFT,
  STRUCTURES,
  TELLS,
} from '../../src/data';
import type { Vec3 } from '../../src/data';
import {
  actionKey,
  applyAction,
  createRng,
  createRun,
  depthAt,
  endShift,
  hasTree,
  stockpileEntries,
  isLegalAction,
  isRevealed,
  isRunActive,
  knownSquare,
  legalActions,
  mineCheck,
  nextInt,
  previewCubePhase,
  scanCells,
  serialise,
} from '../../src/engine';
import type { Action, GameEvent, GameState, RngState } from '../../src/engine';
import { knownCube } from '../../src/engine/known';
import {
  addItem,
  cellIndex,
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
  const health = state.crew.health;
  if (!isWholeNumber(health) || health < 0 || health > CREW.startHealth) {
    problems.push(`health is ${health}, outside 0..${CREW.startHealth}`);
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

      // What is known: the top block unless a tree has always hidden it, and
      // the open cells above it. What is known BELOW a top is checked step by
      // step in `playRandomly` (`leakedBelowTops`): only a scan may add to it.
      if (depth < state.size.z && !tree && !isRevealed(state, { x, y, z: depth })) {
        problems.push(`the top block of square ${at} is not known`);
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

/**
 * The cells below a top block that are known in `after` and should not be
 * (design doc 3.4): a cell below a top may be known only if it was known
 * already in `before` (it was scanned earlier, or it was a top once and has
 * been buried), or if `decision` is a scan and the cell is one of the cells
 * that scan looks into. `before` is `null` for a new run, in which nothing
 * below a top is known at all. Returns a description of each such cell.
 */
function leakedBelowTops(
  before: GameState | null,
  decision: Decision | null,
  after: GameState,
): string[] {
  const scanned = new Set<number>();
  if (before !== null && decision !== null && decision !== 'endShift' && decision.type === 'scan') {
    for (const cell of scanCells(before, decision.x, decision.y)) {
      scanned.add(cellIndex(before.size, cell));
    }
  }
  const leaks: string[] = [];
  for (let y = 0; y < after.size.y; y += 1) {
    for (let x = 0; x < after.size.x; x += 1) {
      for (let z = depthAt(after, x, y) + 1; z < after.size.z; z += 1) {
        const pos = { x, y, z };
        if (!isRevealed(after, pos)) {
          continue;
        }
        const knownBefore = before !== null && isRevealed(before, pos);
        if (!knownBefore && !scanned.has(cellIndex(after.size, pos))) {
          leaks.push(`(${x}, ${y}, ${z}) is known below a top, and no scan showed it`);
        }
      }
    }
  }
  return leaks;
}

/**
 * The camp-made tools a run of `playRandomly` may start with, so that random
 * play scans, seals and pumps (a random player never gets as far as crafting
 * them: a scanner charge needs crystal from the deep band).
 */
const TOOL_KIT: Record<string, number> = { scannerCharge: 4, sealant: 4, pump: 2, drill: 1 };

/** What a random player does next: one legal action, or end the shift. */
type Decision = Action | 'endShift';

/**
 * Pick the next decision at random: usually a legal action, sometimes the end
 * of the shift, and always the end of the shift when nothing else is left.
 * Leaving is never picked, so that a run lasts.
 */
function randomDecision(state: GameState, rng: RngState, favour: string[] = []): Decision {
  const choices = legalActions(state).filter((action) => action.type !== 'closeMine');
  // 1 time in 8, end the shift early.
  if (choices.length === 0 || nextInt(rng, 8) === 0) {
    return 'endShift';
  }
  // `favour` names kinds of action to pick from half the time, when one is
  // legal. Without it, a kind that few squares allow (sealing needs a dug
  // square) would almost never be picked among a thousand scans.
  if (favour.length > 0 && nextInt(rng, 2) === 0) {
    const favoured = choices.filter((action) => favour.includes(action.type));
    if (favoured.length > 0) {
      return favoured[nextInt(rng, favoured.length)] as Action;
    }
  }
  return choices[nextInt(rng, choices.length)] as Action;
}

/**
 * Play up to `maxDecisions` random decisions of one run, calling `check` after
 * each. `kit` is put into the stockpile at the start (item id -> count), and
 * `favour` is handed to `randomDecision`. After every decision this also
 * checks that nothing below a top became known except by a scan.
 */
function playRandomly(
  seed: number,
  maxDecisions: number,
  check: (state: GameState, label: string, decision: Decision | null) => void,
  kit: Record<string, number> = {},
  favour: string[] = [],
): GameState {
  // The picks use a generator of their own; `state.rng` belongs to the rules.
  const rng = createRng(seed + 1000);
  let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
  for (const [item, count] of Object.entries(kit)) {
    addItem(state, item, count);
  }
  expect(leakedBelowTops(null, null, state), `seed ${seed}, new run`).toEqual([]);
  check(state, `seed ${seed}, new run`, null);
  for (let step = 1; step <= maxDecisions && isRunActive(state); step += 1) {
    const decision = randomDecision(state, rng, favour);
    const name = decision === 'endShift' ? 'endShift' : actionKey(decision);
    const before = snapshot(state);
    const result = decision === 'endShift' ? endShift(state) : applyAction(state, decision);
    // The state that was passed in is untouched.
    expect(snapshot(state) === before, `seed ${seed}, decision ${step}: input changed`).toBe(true);
    expect(
      leakedBelowTops(state, decision, result.state),
      `seed ${seed}, decision ${step}`,
    ).toEqual([]);
    state = result.state;
    check(state, `seed ${seed}, decision ${step} (${name})`, decision);
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

  it.each([8, 31])(
    'seed %i, with the camp-made tools in the stockpile: scans, seals and pumps keep every rule',
    (seed) => {
      const taken = new Set<string>();
      let step = 0;
      playRandomly(
        seed,
        80,
        (state, label, decision) => {
          if (decision !== null && decision !== 'endShift') {
            taken.add(decision.type);
          }
          expect(invariantProblems(state), label).toEqual([]);
          // `applyAction` checks one action's legality directly (issue #88
          // item 6). Every 20th state, check that this agrees with the list.
          step += 1;
          if (step % 20 === 1) {
            expect(legalityDisagreements(state), label).toEqual([]);
          }
        },
        TOOL_KIT,
        // Mines make dug squares, which sealing needs.
        ['mine', 'seal'],
      );
      // The run did use the tools.
      expect(taken.has('scan')).toBe(true);
      expect(taken.has('seal')).toBe(true);
      expect(taken.has('placePump')).toBe(true);
    },
    60000,
  );
});

/**
 * Where `isLegalAction` and `legalActions` disagree about `state`: every
 * action of the list must be legal, and for every square, every kind of
 * action that is checked by asking about that one square, and every AP cost
 * 0 to 3, the direct check must give the same answer as looking the action
 * up in the list. (The camp actions are looked up in their own short list,
 * so the first loop covers them.)
 */
function legalityDisagreements(state: GameState): string[] {
  const problems: string[] = [];
  const legal = legalActions(state);
  const keys = new Set(legal.map(actionKey));
  for (const action of legal) {
    if (!isLegalAction(state, action)) {
      problems.push(`listed but not legal: ${actionKey(action)}`);
    }
  }
  const kinds = [
    'mine',
    'cutTree',
    'placeSupport',
    'placePump',
    'placeVent',
    'seal',
    'scan',
  ] as const;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      for (const type of kinds) {
        for (let ap = 0; ap <= 3; ap += 1) {
          const action: Action = { type, x, y, ap };
          if (isLegalAction(state, action) !== keys.has(actionKey(action))) {
            problems.push(`the direct check and the list disagree: ${actionKey(action)}`);
          }
        }
      }
    }
  }
  return problems;
}

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
 * - every cell below a square's top block that is not revealed: another
 *   block or open space, and sometimes water, lava, gas, a crack or a
 *   structure. A cell below a top that IS revealed (a scan showed it, or it
 *   was a top once) is known, and is left as it is;
 * - the layer-0 block under a tree, if it has never been seen: another solid
 *   block (solid, because the square's depth is seen and must stay 0).
 * What the player has been shown is left exactly as it is, and so are the
 * mineral traces already noted on it (`tracesSeen`): a tell is the one thing
 * that may depend on a hidden block (design doc 3.4).
 *
 * `keepNear` is for the test of the hazard tells: hidden cells within that
 * many steps (through the grid, in 3D) of a known block (a top block, or a
 * block a scan showed) are left as they are.
 * 0, the default, scrambles every hidden cell.
 */
function scrambleHidden(state: GameState, rng: RngState, keepNear = 0): GameState {
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
        if (isRevealed(state, pos)) {
          continue; // known to the player: not hidden
        }
        if (keepNear > 0 && stepsToNearestKnown(state, pos) <= keepNear) {
          continue;
        }
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

/**
 * How many steps (through the grid, in 3D) the cell `pos` is from the nearest
 * known block: a top block, or a revealed cell below a top (which shows its
 * tells too: design doc 3.7). Only cells close by are looked at, which is
 * enough to tell whether the answer is at most `TELL_REACH`.
 */
function stepsToNearestKnown(state: GameState, pos: Vec3): number {
  let nearest = Infinity;
  for (let dy = -TELL_REACH; dy <= TELL_REACH; dy += 1) {
    for (let dx = -TELL_REACH; dx <= TELL_REACH; dx += 1) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (x < 0 || x >= state.size.x || y < 0 || y >= state.size.y) {
        continue;
      }
      const top = depthAt(state, x, y);
      nearest = Math.min(nearest, Math.abs(dx) + Math.abs(dy) + Math.abs(pos.z - top));
      for (let dz = -TELL_REACH; dz <= TELL_REACH; dz += 1) {
        const z = pos.z + dz;
        if (z > top && z < state.size.z && isRevealed(state, { x, y, z })) {
          nearest = Math.min(nearest, Math.abs(dx) + Math.abs(dy) + Math.abs(dz));
        }
      }
    }
  }
  return nearest;
}

/** The farthest any hazard tell reaches (design doc 3.7: warm glow, 2 steps). */
const TELL_REACH = Math.max(
  TELLS.hazards.dampStoneDistance,
  TELLS.hazards.pittedRockDistance,
  TELLS.hazards.warmGlowDistance,
);

/**
 * Everything the player is offered or shown, as one string.
 *
 * The hazard tells (`KnownSquare.tells`) are left out unless `withTells` is
 * true: like mineral traces they are the deliberate exception (design doc
 * 3.4), a hint of something hidden near a block. They have a test of their
 * own below, which checks how far that hint reaches.
 */
function playerSees(state: GameState, withTells = false): string {
  const squares = [];
  const checks = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const square = knownSquare(state, x, y);
      // `{ ...square, tells: null }` is a copy of the square without its
      // tells; the known cells under the top lose theirs the same way.
      const belowWithoutTells = square.below.map((cell) => ({ ...cell, tells: null }));
      squares.push(withTells ? square : { ...square, tells: null, below: belowWithoutTells });
      checks.push(mineCheck(state, x, y));
    }
  }
  return JSON.stringify({
    actions: legalActions(state).map(actionKey),
    forecast: previewCubePhase(state),
    squares,
    checks,
    hud: [state.ap, state.fuel, state.shift, state.crew, state.stockpile],
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

  it.each([8, 31])(
    'seed %i, with scans: scrambling every cell that is not revealed changes nothing',
    (seed) => {
      // The same test in a run that scans (and seals and pumps): the scanned
      // cells are known and stay as they are; everything else below the tops
      // is scrambled, and nothing the player gets may change.
      const scrambler = createRng(seed + 7000);
      let compared = 0;
      let scans = 0;
      let comparedAfterScan = 0;
      playRandomly(
        seed,
        60,
        (state, label, decision) => {
          if (decision !== null && decision !== 'endShift' && decision.type === 'scan') {
            scans += 1;
          }
          compared += 1;
          if (compared % 6 !== 1 || !isRunActive(state)) {
            return;
          }
          if (scans > 0) {
            comparedAfterScan += 1;
          }
          const other = scrambleHidden(state, scrambler);
          expect(snapshot(other) === snapshot(state), `${label}: scramble`).toBe(false);
          expect(playerSees(other) === playerSees(state), label).toBe(true);
        },
        TOOL_KIT,
        ['mine', 'seal'],
      );
      expect(scans).toBeGreaterThan(0);
      expect(comparedAfterScan).toBeGreaterThan(0);
    },
    60000,
  );

  it.each([5, 12])(
    'seed %i: a hazard tell depends only on hidden cells within its reach (design doc 3.7)',
    (seed) => {
      // Scramble every hidden cell that is more than 2 steps from every top
      // block: the tells must not change. And the test has teeth: scrambling
      // the near cells as well does change them.
      const scrambler = createRng(seed + 9000);
      let compared = 0;
      let nearScrambleChangedTells = false;
      playRandomly(seed, 60, (state, label) => {
        compared += 1;
        if (compared % 20 !== 1 || !isRunActive(state)) {
          return;
        }
        const farOnly = scrambleHidden(state, scrambler, TELL_REACH);
        expect(snapshot(farOnly) === snapshot(state), `${label}: scramble`).toBe(false);
        expect(playerSees(farOnly, true) === playerSees(state, true), label).toBe(true);
        const everything = scrambleHidden(state, scrambler);
        if (playerSees(everything, true) !== playerSees(state, true)) {
          nearScrambleChangedTells = true;
        }
      });
      expect(nearScrambleChangedTells).toBe(true);
    },
    60000,
  );

  it.each([8, 31])(
    'seed %i, with scans: a tell on a scanned block also depends only on cells within its reach',
    (seed) => {
      // The same in a run that scans (issue #107): a scanned block shows its
      // tells too, so the cells near it are kept as well as those near a top.
      const scrambler = createRng(seed + 11000);
      let compared = 0;
      let scans = 0;
      let comparedAfterScan = 0;
      playRandomly(
        seed,
        60,
        (state, label, decision) => {
          if (decision !== null && decision !== 'endShift' && decision.type === 'scan') {
            scans += 1;
          }
          compared += 1;
          if (compared % 6 !== 1 || !isRunActive(state)) {
            return;
          }
          if (scans > 0) {
            comparedAfterScan += 1;
          }
          const farOnly = scrambleHidden(state, scrambler, TELL_REACH);
          expect(snapshot(farOnly) === snapshot(state), `${label}: scramble`).toBe(false);
          expect(playerSees(farOnly, true) === playerSees(state, true), label).toBe(true);
        },
        TOOL_KIT,
        ['mine', 'seal'],
      );
      expect(scans).toBeGreaterThan(0);
      expect(comparedAfterScan).toBeGreaterThan(0);
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
