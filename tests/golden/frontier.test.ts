// The new game's golden runs (Lab 2 becomes the game, plan A3): each
// tests/golden/frontier/*.json is a seed, a list of steps and the hash of the
// state after them. Replaying it must give that hash; a changed hash means
// the rules changed (see README.md in this folder). Record them again with
// `npm run golden -- --frontier`.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, createFrontier, hashFrontier } from '../../src/engine';
import { applyFrontierStep, replayFrontier } from '../../tools/frontierRun';
import type { FrontierGolden } from '../../tools/frontierRun';

const DIR = path.join(import.meta.dirname, 'frontier');
const files = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

/** The golden run in the file `name`. */
function load(name: string): FrontierGolden {
  // `as FrontierGolden`: we trust the files in our own repository to have this shape.
  return JSON.parse(readFileSync(path.join(DIR, name), 'utf8')) as FrontierGolden;
}

// Each replay takes a fraction of a second alone; the limit allows for a busy CI machine.
describe('the new game’s golden runs (plan A3)', { timeout: 30000 }, () => {
  it('there is one for every policy, recorded on this engine version', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    const policies = new Set(files.map((name) => load(name).recordedWith));
    expect([...policies].sort()).toEqual(['careful', 'digger', 'gatherer', 'idle', 'random']);
    for (const name of files) {
      expect(load(name).engineVersion, name).toBe(ENGINE_VERSION);
    }
  });

  for (const name of files) {
    it(`${name} replays to its hash`, () => {
      const golden = load(name);
      expect(golden.steps).toHaveLength(golden.stepCount);
      expect(hashFrontier(replayFrontier(golden.seed, golden.steps))).toBe(golden.expectedHash);
    });
  }

  it('between them, they place camps, upgrade one, build a smelter, smelt, make a pickaxe, make or buy the drills, mine with them, hang a lantern, reach level 4, catch animals, take plants, mine clay, rest, sell and buy at the market, finish a run, and lose a crew', () => {
    const seen = new Set<string>();
    for (const name of files) {
      const golden = load(name);
      let state = createFrontier(golden.seed);
      for (const step of golden.steps) {
        const next = applyFrontierStep(state, step);
        const verb = step.split(' ')[0] ?? '';
        if (verb !== 'tap') {
          seen.add(verb);
          if (step === 'make iron-pickaxe') seen.add('pickaxe');
          if (step === 'make iron-drill' || step === 'buy drill 1') seen.add('drill');
          if (step === 'buy steelDrill 1') seen.add('steelDrill');
          if (verb === 'upgrade' && next.camps.some((c) => c.level === 4)) seen.add('level4');
        } else if (next.mined > state.mined) {
          seen.add('mine');
          if ((state.inventory.get('ironPickaxe') ?? 0) > 0) seen.add('mineWithPickaxe');
          if ((state.inventory.get('drill') ?? 0) > 0) seen.add('mineWithDrill');
          const clayBefore = state.inventory.get('clay') ?? 0;
          if ((next.inventory.get('clay') ?? 0) > clayBefore) seen.add('clay');
        } else if (next.animals.length < state.animals.length && step.startsWith('tap')) {
          seen.add('catch');
        } else {
          seen.add('plant');
        }
        state = next;
      }
      if (state.status === 'lost') seen.add('lost');
      if (state.status === 'finished') seen.add('finished');
    }
    expect([...seen]).toEqual(
      expect.arrayContaining([
        'buildSmelter',
        'buy',
        'catch',
        'clay',
        'endShift',
        'finished',
        'hangLantern',
        'lost',
        'make',
        'mine',
        'mineWithDrill',
        'mineWithPickaxe',
        'drill',
        'steelDrill',
        'level4',
        'pickaxe',
        'place',
        'plant',
        'rest',
        'sell',
        'upgrade',
      ]),
    );
  });
});
