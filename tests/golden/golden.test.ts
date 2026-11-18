// Golden runs: each tests/golden/*.json is a recorded run (seed, decisions,
// expected final hash). Replaying it must give that hash. A changed hash
// means the rules changed; see README.md in this folder.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { countItem, hashState, visibleMineralTraces } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { replayDecisions, statusText } from '../../tools/simRun';
import type { GoldenRun } from '../../tools/simRun';

const GOLDEN_DIR = import.meta.dirname;
const files = readdirSync(GOLDEN_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

/** Replay the golden run in the file `name` and return its final state. */
function replayFile(name: string): GameState {
  // `as GoldenRun`: we trust the files in our own repository to have this shape.
  const golden = JSON.parse(readFileSync(path.join(GOLDEN_DIR, name), 'utf8')) as GoldenRun;
  return replayDecisions(golden.seed, golden.contractId, golden.loadoutId, golden.decisions);
}

describe('golden runs', () => {
  it('there are at least four', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  // `it.each` makes one test per file, named after it.
  it.each(files)('%s replays to its recorded hash', (name) => {
    // `as GoldenRun`: we trust the files in our own repository to have this shape.
    const golden = JSON.parse(readFileSync(path.join(GOLDEN_DIR, name), 'utf8')) as GoldenRun;
    const state = replayDecisions(
      golden.seed,
      golden.contractId,
      golden.loadoutId,
      golden.decisions,
    );
    expect(statusText(state)).toBe(golden.expectedStatus);
    expect(hashState(state)).toBe(golden.expectedHash);
  });

  // A hash only pins a rule if the run exercises it. The other three runs
  // never light rock near ore, so their `tracesSeen` is all zeros; this one
  // is here for the mineral-traces rule (decision note 0012), and this test
  // fails if a new recording of it no longer covers that.
  it('staircase-seed-11-traces.json sees mineral traces and keeps them after mining ore', () => {
    const state = replayFile('staircase-seed-11-traces.json');
    const flags = state.tracesSeen.reduce((total, flag) => total + flag, 0);
    expect(flags).toBeGreaterThan(0);
    expect(visibleMineralTraces(state).length).toBeGreaterThan(0);
    // It mined an ore block on the way. The pack was full of stone by then,
    // so the raw ore lies where it was mined; count the pack and the floor.
    const ores = ['rawIronOre', 'rawCopperOre'];
    let rawOre = 0;
    for (const item of ores) {
      rawOre += countItem(state, item);
    }
    for (const loose of state.looseItems) {
      if (ores.includes(loose.item)) {
        rawOre += loose.count;
      }
    }
    expect(rawOre).toBeGreaterThan(0);
    // The lamp was lit to the end, so the traces were seen by lamp light.
    expect(state.lampOil).toBeGreaterThan(0);
  });
});
