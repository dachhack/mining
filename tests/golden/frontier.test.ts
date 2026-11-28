// The new game's golden runs (Lab 2 becomes the game, plan A3): each
// tests/golden/frontier/*.json is a seed, a list of steps and the hash of the
// state after them. Replaying it must give that hash; a changed hash means
// the rules changed (see README.md in this folder). Record them again with
// `npm run golden -- --frontier`.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  createFrontier,
  frontierAct,
  hashFrontier,
  tapsPerShift,
} from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { FRONTIER_AXE, FRONTIER_CONTRACTS, FRONTIER_SURFACE } from '../../src/data/frontier';
import { actionOf, applyFrontierStep, replayFrontier } from '../../tools/frontierRun';
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

  it('between them, they place camps, upgrade one, build a smelter, load it to smelt, make a pickaxe, make or buy the drills, mine with them, hang a lantern, reach level 4, catch animals, take plants, mine clay, sell and buy at the market, plant saplings, make hay, keep a pen that breeds, take and deliver contracts, place a deep camp, buy an axe, build a saw house and fell trees for more wood, grow maples, tap their sap and boil it into syrup at a sugar shack, saw lumber, deliver a surface contract, pick mushrooms, fill a square with dirt, sow seeds and harvest the crops, hire miners and dig a 3 x 3 with them, build a work camp and hire a worker, see rain fill a pit, hit water and pump it out, set off gas and put out its fires, let a fire burn, meet a dragon and drive one off, build defenses, be raided and turn raiders away, finish a run, and go short of upkeep, so a shift has fewer taps', () => {
    const seen = new Set<string>();
    const fireCount = (x: FrontierState): number => x.hazards.fires.filter((f) => f).length;
    for (const name of files) {
      const golden = load(name);
      let state = createFrontier(golden.seed);
      for (const step of golden.steps) {
        const next = applyFrontierStep(state, step);
        const verb = step.split(' ')[0] ?? '';
        // A tree felled for more than its plain wood: with an axe or by a saw house.
        const wood = (x: typeof state): number => x.inventory.get('wood') ?? 0;
        if (verb === 'tap' && wood(next) - wood(state) > FRONTIER_SURFACE.woodPerTree)
          seen.add('moreWood');
        if (step === `buy ${FRONTIER_AXE.item} 1`) seen.add('axe');
        if (step.startsWith('build sawHouse')) seen.add('sawHouse');
        if (step.startsWith('buy miner')) seen.add('hireMiner');
        if (/^build (lumberCamp|farmCamp|hermitCamp) /.test(step)) seen.add('workCamp');
        if (step.startsWith('build sugarShack')) seen.add('sugarShack');
        if (step === 'make syrup') seen.add('syrup');
        if (step === 'make lumber') seen.add('lumber');
        // A surface contract delivered (owner, after the 0.22.0 build).
        const [cVerb, cId] = step.split(' ');
        if (
          (cVerb === 'fillContract' || cVerb === 'deliver') &&
          FRONTIER_CONTRACTS.some((c) => c.id === cId && c.surface === true)
        )
          seen.add('surfaceContract');
        const sap = (x: typeof state): number => x.inventory.get('sap') ?? 0;
        if (verb === 'tap' && sap(next) > sap(state)) seen.add('sap');
        const mushroom = (x: typeof state): number => x.inventory.get('mushroom') ?? 0;
        if (verb === 'tap' && mushroom(next) > mushroom(state)) seen.add('mushroom');
        const sown = (x: typeof state): number => x.crops.filter((k) => k > 0).length;
        if (step.startsWith('plant') && sown(next) > sown(state)) seen.add('sow');
        if (verb === 'tap' && sown(next) < sown(state)) seen.add('harvestCrop');
        if (verb !== 'tap') {
          seen.add(verb);
          if (step === 'make iron-pickaxe') seen.add('pickaxe');
          if (step === 'make iron-drill' || step === 'buy drill 1') seen.add('drill');
          if (step === 'buy steelDrill 1') seen.add('steelDrill');
          if (verb === 'plant') seen.add('planting');
          const penned = (x: typeof state): number => x.camps.reduce((n, c) => n + c.penned, 0);
          if (verb === 'endShift' && penned(next) > penned(state)) seen.add('born');
          if (step === 'make hay') seen.add('hay');
          // Rain filled a square: the cube changed at the night (hazards PR 1).
          if (verb === 'endShift' && next.cube !== state.cube) seen.add('rain');
          const ends = verb === 'endShift';
          // Raids (hazards PR 5): only the engine's report says one came.
          const raid = ends ? frontierAct(state, actionOf(step)).report?.raid : null;
          // Upkeep not paid: the next shift has fewer taps (owner, after the 0.22.0 build).
          if (ends && next.tapsLeft < tapsPerShift(next.inventory)) seen.add('hungry');
          if (raid !== null && raid !== undefined)
            seen.add(raid.turnedAway ? 'turnedAway' : 'raided');
          if (ends && fireCount(state) > 0) seen.add('burned');
          if (ends && next.hazards.dragons.length > state.hazards.dragons.length)
            seen.add('dragonCame');
          const pumps = (x: typeof state): number => x.hazards.pumps.length;
          if (verb === 'endShift' && pumps(next) < pumps(state)) seen.add('pumpBack');
          if (verb === 'upgrade' && next.camps.some((c) => c.level === 4)) seen.add('level4');
        } else if (next.hazards.pumps.length > state.hazards.pumps.length) {
          seen.add('pumpSet');
        } else if (next.hazards.dragons.length < state.hazards.dragons.length) {
          seen.add('dragonDriven');
        } else if (fireCount(next) < fireCount(state)) {
          seen.add('fireOut');
        } else if (next.mined > state.mined) {
          seen.add('mine');
          const wet = (x: typeof state): number => x.hazards.flooded.filter((f) => f).length;
          if (wet(next) > wet(state)) seen.add('flood');
          if (fireCount(next) > fireCount(state)) seen.add('blast');
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
      if (state.status === 'finished') seen.add('finished');
    }
    expect([...seen]).toEqual(
      expect.arrayContaining([
        'rain',
        'flood',
        'pumpSet',
        'pumpBack',
        'blast',
        'fireOut',
        'burned',
        'dragonCame',
        'dragonDriven',
        'buildDefense',
        'raided',
        'turnedAway',
        'born',
        'buildPen',
        'deliver',
        'placeDeep',
        'takeContract',
        'buildSmelter',
        'loadSmelter',
        'hay',
        'buy',
        'catch',
        'clay',
        'endShift',
        'finished',
        'hangLantern',
        'hungry',
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
        'planting',
        'sell',
        'upgrade',
        'axe',
        'sawHouse',
        'sugarShack',
        'sap',
        'syrup',
        'lumber',
        'surfaceContract',
        'mushroom',
        'fillSquare',
        'sow',
        'harvestCrop',
        'hireMiner',
        'digArea',
        'workCamp',
        'hire',
        'moreWood',
      ]),
    );
  });
});
