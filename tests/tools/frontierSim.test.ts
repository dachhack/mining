// The new game's simulator and its acceptance check (plan B3).
import { describe, expect, it } from 'vitest';
import { FRONTIER_SHIFT } from '../../src/data/frontier';
import { createFrontier, frontierAct, frontierTap, previewTap } from '../../src/engine';
import { checkStep } from '../../tools/frontierInvariants';
import { FRONTIER_POLICY_NAMES, makeFrontierPolicy } from '../../tools/frontierPolicies';
import { actionOf } from '../../tools/frontierRun';
import { parseSimArgs, playFrontierRun, runFrontierSim } from '../../tools/frontierSim';

describe('the new game’s simulator (plan B3)', { timeout: 60_000 }, () => {
  it('passes the acceptance check on a small sample of every policy', () => {
    const result = runFrontierSim(['--acceptance', '--runs', '3', '--max-shifts', '15']);
    expect(result.output).toContain('every rule held after every step');
    expect(result.exitCode).toBe(0);
    for (const policy of FRONTIER_POLICY_NAMES) expect(result.output).toContain(policy);
  });

  it('plays the same run twice for the same seed and policy', () => {
    for (const policy of FRONTIER_POLICY_NAMES) {
      const a = playFrontierRun(4, policy, 10);
      const b = playFrontierRun(4, policy, 10);
      expect(b.steps).toEqual(a.steps);
      expect(b.metrics.finalHash).toBe(a.metrics.finalHash);
    }
  });

  it('previewTap says what frontierTap does, on every square, over whole runs', () => {
    const policy = makeFrontierPolicy('gatherer', 9);
    let state = createFrontier(9);
    for (let i = 0; i < 120 && state.status === 'active'; i += 1) {
      for (let y = 0; y < state.cube.size.y; y += 3) {
        for (let x = 0; x < state.cube.size.x; x += 1) {
          const preview = previewTap(state, x, y);
          const tap = frontierTap(state, x, y);
          expect(preview.kind, `${x},${y}`).toBe(tap.kind);
          if (tap.kind === 'mined' || tap.kind === 'harvested')
            expect(preview.gain).toEqual(tap.gain);
        }
      }
      const step = policy(state);
      if (step === null) break;
      state = frontierAct(state, actionOf(step)).state;
    }
  });

  it('the rule checker catches a step that breaks the rules', () => {
    const state = createFrontier(2);
    const camp = state.camps[0] ?? { x: 0, y: 0 };
    const step = `tap ${camp.x + 2},${camp.y}`;
    const outcome = frontierAct(state, actionOf(step));
    expect(checkStep(state, step, outcome)).toEqual([]);
    // The same step, as if it had cost no tap and left health above full.
    const broken = {
      ...outcome,
      state: { ...outcome.state, tapsLeft: state.tapsLeft, health: FRONTIER_SHIFT.startHealth + 1 },
    };
    const problems = checkStep(state, step, broken);
    expect(problems.some((p) => p.includes('taps went from'))).toBe(true);
    expect(problems.some((p) => p.includes('health 11'))).toBe(true);
  });

  it('reads its arguments, and refuses a bad one', () => {
    expect(parseSimArgs(['--policy', 'digger', '--runs', '5'])).toMatchObject({
      policy: 'digger',
      runs: 5,
    });
    expect(runFrontierSim(['--policy', 'pit']).exitCode).toBe(1);
    const one = runFrontierSim(['--policy', 'careful', '--runs', '2', '--max-shifts', '5']);
    expect(one.output).toContain('careful   2 runs');
  });

  it('records the shift each step of smelting and crafting is first reached in', () => {
    // The gatherer builds a smelter, smelts, and makes the tools (smelting PR 5).
    const run = playFrontierRun(1, 'gatherer', 30, true);
    expect(run.problems).toEqual([]);
    const f = run.metrics.firsts;
    expect(f.level2).toBeGreaterThan(0);
    expect(f.smelter).toBeGreaterThanOrEqual(f.level2);
    expect(f.ingot).toBeGreaterThanOrEqual(f.smelter);
    expect(f.pickaxe).toBeGreaterThanOrEqual(f.ingot);
    expect(run.metrics.mined.rawIronOre).toBeGreaterThan(0);
    // Never reached is -1, and the summary says how many runs reached each.
    const idle = playFrontierRun(1, 'idle', 5);
    expect(idle.metrics.firsts.smelter).toBe(-1);
    const out = runFrontierSim(['--policy', 'idle', '--runs', '2', '--max-shifts', '3']).output;
    expect(out).toContain('smelter 0/2');
  });
});
