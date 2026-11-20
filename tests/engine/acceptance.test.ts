// Acceptance of the top-down model's first build (issue #86): a scripted
// player digs a terraced pit on a fixed seed, taking only legal actions, and
// the level rule (design doc 4.2) holds in every state it passes through.
//
// The script is the pit policy (tools/policies.ts). It uses only actions from
// `legalActions` and `endShift`; `applyAction` would throw on anything else.
// (The M1 acceptance run, a staircase dug by a walking miner, went with the
// miner; decision note 0025.)

import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_IDS, DEFAULT_LOADOUT_ID } from '../../src/data';
import {
  applyAction,
  createRun,
  depthAt,
  endShift,
  isRunActive,
  legalActions,
  mayMine,
  sameAction,
} from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { makePolicy } from '../../tools/policies';

/** Far more decisions than a run needs; reaching it means the policy is going nowhere. */
const DECISION_LIMIT = 5000;

interface PlayResult {
  final: GameState;
  /** The depth of the deepest square at the end. */
  deepestSquare: number;
  /** The lowest the fuel gauge ever read. */
  lowestFuel: number;
  events: GameEvent[];
  shiftsEnded: number;
}

/**
 * Throw unless the level rule holds everywhere in `state`: no square is more
 * than 1 level below a face neighbour. Returns the depth of the deepest
 * square. `mayMine` lists the neighbours that are higher than a square.
 */
function checkLevelRule(state: GameState): number {
  let deepest = 0;
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const depth = depthAt(state, x, y);
      deepest = Math.max(deepest, depth);
      for (const higher of mayMine(state, x, y).higherNeighbours) {
        if (depth - higher.depth > 1) {
          throw new Error(
            `level rule broken in shift ${state.shift}: square (${x}, ${y}) is at depth ${depth}, its ${higher.direction} neighbour at ${higher.depth}`,
          );
        }
      }
    }
  }
  return deepest;
}

/**
 * Let the named policy play a new run on `seed` until the run ends or it has
 * made `maxDecisions` decisions, checking on the way that every action it
 * takes is a legal one and that the level rule holds after every step.
 */
function play(policyName: string, seed: number, maxDecisions: number): PlayResult {
  const policy = makePolicy(policyName, seed);
  let state = createRun(seed, CONTRACT_IDS[0] as string, DEFAULT_LOADOUT_ID);
  let lowestFuel = state.fuel;
  let shiftsEnded = 0;
  let deepestSquare = 0;
  const events: GameEvent[] = [];

  for (let decisions = 0; isRunActive(state) && decisions < maxDecisions; decisions += 1) {
    if (decisions >= DECISION_LIMIT) {
      throw new Error(`The run has not ended after ${DECISION_LIMIT} decisions`);
    }
    const decision = policy.decide(state);
    let result;
    if (decision === 'endShift') {
      result = endShift(state);
      shiftsEnded += 1;
    } else {
      expect(legalActions(state).some((legal) => sameAction(legal, decision))).toBe(true);
      result = applyAction(state, decision);
    }
    state = result.state;
    events.push(...result.events);
    lowestFuel = Math.min(lowestFuel, state.fuel);
    deepestSquare = checkLevelRule(state);
  }
  return { final: state, deepestSquare, lowestFuel, events, shiftsEnded };
}

describe('acceptance: dig a terraced pit and close the mine', () => {
  // The run is played in `beforeAll`, not while the file is loaded, so that if
  // the policy or the engine throws, the failure is reported under this name.
  let result: PlayResult;
  beforeAll(() => {
    result = play('pit', 8, Infinity);
  });

  it('gets several levels down, by terraces (the level rule held at every step)', () => {
    expect(result.deepestSquare).toBeGreaterThanOrEqual(4);
  });

  it('mined exactly the blocks the pit is missing: nothing else moved a block', () => {
    const mined = result.events.filter((event) => event.type === 'blockMined').length;
    let missing = 0;
    for (let y = 0; y < result.final.size.y; y += 1) {
      for (let x = 0; x < result.final.size.x; x += 1) {
        missing += depthAt(result.final, x, y);
      }
    }
    expect(mined).toBe(missing);
    expect(mined).toBeGreaterThan(50);
  });

  it('cut the trees in its way and kept itself in fuel from coal', () => {
    expect(result.events.some((event) => event.type === 'treeCut')).toBe(true);
    expect(result.events.some((event) => event.type === 'crafted')).toBe(true);
    expect(result.shiftsEnded).toBeGreaterThan(24); // more shifts than the starting fuel pays for
  });

  it('does not die, take damage, or run out of fuel', () => {
    expect(result.events.filter((event) => event.type === 'damageTaken')).toEqual([]);
    expect(result.lowestFuel).toBeGreaterThan(0);
  });

  it('closes the mine alive, as salvage', () => {
    expect(result.final.status).toEqual({ kind: 'ended', outcome: 'salvage', cause: 'mineClosed' });
    // The last thing that happened is the run ending by closing the mine.
    expect(result.events[result.events.length - 1]).toEqual({
      type: 'runEnded',
      outcome: 'salvage',
      cause: 'mineClosed',
    });
  });
});

describe('the policies on other seeds', () => {
  it('pit: takes only legal actions, keeps the level rule, and gets below ground', () => {
    // Cut after 150 decisions: enough for a pit a few levels deep.
    for (const seed of [1, 77, 4000000000]) {
      const result = play('pit', seed, 150);
      expect(result.deepestSquare).toBeGreaterThanOrEqual(3);
    }
  });

  it('random: takes only legal actions and keeps the level rule to the end of its fuel', () => {
    for (const seed of [2, 3]) {
      const result = play('random', seed, Infinity);
      expect(result.final.status).toEqual({ kind: 'ended', outcome: 'death', cause: 'outOfFuel' });
      expect(result.events.some((event) => event.type === 'blockMined')).toBe(true);
    }
  });
});
