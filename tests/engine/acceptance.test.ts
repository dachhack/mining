// M1 acceptance (docs/repo-plan.md section 8): "A scripted test digs from the
// surface to layer 8 on a fixed seed."
//
// The script is the staircase policy (tools/policies.ts): cut a staircase
// down, walk back up it, leave. It uses only actions from `legalActions` and
// `endShift`; `applyAction` would throw on anything else.

import { describe, expect, it } from 'vitest';
import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, WORLD } from '../../src/data';
import {
  applyAction,
  createRun,
  endShift,
  isRunActive,
  isSurface,
  legalActions,
  sameAction,
} from '../../src/engine';
import type { GameEvent, GameState } from '../../src/engine';
import { makeStaircasePolicy } from '../../tools/policies';
import { buildState } from './helpers';

const TARGET_LAYER = 8;
/** Far more decisions than the dig needs; reaching it means the policy is going nowhere. */
const DECISION_LIMIT = 2000;

interface DigResult {
  final: GameState;
  /** The deepest layer the avatar stood in. */
  deepestLayer: number;
  /** The lowest the fuel gauge ever read. */
  lowestFuel: number;
  events: GameEvent[];
  shiftsEnded: number;
}

/**
 * Let the staircase policy play `start` until the run ends, checking on the
 * way that every action it takes is a legal one.
 */
function dig(start: GameState, targetLayer: number): DigResult {
  const policy = makeStaircasePolicy(targetLayer);
  let state = start;
  let deepestLayer = state.avatar.pos.z;
  let lowestFuel = state.fuel;
  let shiftsEnded = 0;
  const events: GameEvent[] = [];

  for (let decisions = 0; isRunActive(state); decisions += 1) {
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
    deepestLayer = Math.max(deepestLayer, state.avatar.pos.z);
    lowestFuel = Math.min(lowestFuel, state.fuel);
  }
  return { final: state, deepestLayer, lowestFuel, events, shiftsEnded };
}

function newRun(seed: number): GameState {
  return createRun(seed, CONTRACT_IDS[0] as string, DEFAULT_LOADOUT_ID);
}

describe('M1 acceptance: dig from the surface to layer 8 and come back', () => {
  const start = newRun(8);
  const result = dig(start, TARGET_LAYER);

  it('starts on the surface', () => {
    expect(start.avatar.pos).toEqual(WORLD.startPosition);
    expect(isSurface(start.size, start.avatar.pos)).toBe(true);
  });

  it('stands in layer 8', () => {
    expect(result.deepestLayer).toBe(TARGET_LAYER);
  });

  it('does not die, take damage, or run out of fuel', () => {
    expect(result.final.avatar.health).toBe(start.avatar.health);
    expect(result.events.filter((event) => event.type === 'damageTaken')).toEqual([]);
    expect(result.lowestFuel).toBeGreaterThan(0);
  });

  it('climbs back to the surface and leaves', () => {
    expect(result.final.status).toEqual({ kind: 'ended', outcome: 'salvage', cause: 'left' });
    expect(isSurface(result.final.size, result.final.avatar.pos)).toBe(true);
    // The last thing that happened is the run ending by leaving.
    expect(result.events[result.events.length - 1]).toEqual({
      type: 'runEnded',
      outcome: 'salvage',
      cause: 'left',
    });
  });

  it('needed several shifts, and used no ladders', () => {
    expect(result.shiftsEnded).toBeGreaterThan(1);
    expect(result.events.filter((event) => event.type === 'structurePlaced')).toEqual([]);
  });

  it('mined two blocks per stair, less the first stair, whose headroom is open air', () => {
    const mined = result.events.filter((event) => event.type === 'blockMined').length;
    expect(mined).toBe(2 * (TARGET_LAYER + 1) - 1);
  });
});

describe('the staircase policy', () => {
  it('reaches layer 8 and gets out again on other seeds too', () => {
    for (const seed of [1, 2, 3, 77, 4000000000]) {
      const result = dig(newRun(seed), TARGET_LAYER);
      expect(result.deepestLayer).toBe(TARGET_LAYER);
      expect(result.final.status).toEqual({ kind: 'ended', outcome: 'salvage', cause: 'left' });
    }
  });

  it('turns at the edge of the cube, and can still climb back', () => {
    // A 3 x 3 column of dirt, 7 layers deep. Starting above (0, 0) and
    // heading east, the staircase has to turn south, then west, to get to
    // layer 4.
    const layer = ['ddd', 'ddd', 'ddd'];
    const start = buildState({
      layers: [layer, layer, layer, layer, layer, layer, layer],
      // A hand-built state is not revealed until something happens in it.
      revealAll: true,
      fuel: 20,
    });
    const result = dig(start, 4);
    expect(result.deepestLayer).toBe(4);
    expect(result.final.status).toEqual({ kind: 'ended', outcome: 'salvage', cause: 'left' });
    expect(isSurface(result.final.size, result.final.avatar.pos)).toBe(true);
  });

  it('throws when it is stuck, and does not wait for ever', () => {
    // A cube one cell wide: there is nowhere to cut a stair.
    const start = buildState({ layers: [['d'], ['d']], revealAll: true });
    expect(() => dig(start, 1)).toThrow(/staircase policy/);
  });

  it('refuses a target layer outside the cube', () => {
    const start = buildState({ layers: [['dd'], ['dd']] });
    expect(() => makeStaircasePolicy(2).decide(start)).toThrow(/target layer/);
  });
});
