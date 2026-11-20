// Golden runs: each tests/golden/*.json is a recorded run (seed, decisions,
// expected final hash). Replaying it must give that hash. A changed hash
// means the rules changed; see README.md in this folder.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/data';
import {
  depthAt,
  hasStump,
  hasTree,
  hashState,
  mayMine,
  visibleMineralTraces,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { replayDecisions, statusText } from '../../tools/simRun';
import type { GoldenRun } from '../../tools/simRun';

const GOLDEN_DIR = import.meta.dirname;
const files = readdirSync(GOLDEN_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

/** The golden run in the file `name`. */
function loadGolden(name: string): GoldenRun {
  // `as GoldenRun`: we trust the files in our own repository to have this shape.
  return JSON.parse(readFileSync(path.join(GOLDEN_DIR, name), 'utf8')) as GoldenRun;
}

/** Replay the golden run in the file `name` and return its final state. */
function replayFile(name: string): GameState {
  const golden = loadGolden(name);
  return replayDecisions(golden.seed, golden.contractId, golden.loadoutId, golden.decisions);
}

/** The square a recorded "mine x,y ap n" or "cutTree x,y ap n" decision names. */
function squareOf(decision: string): { x: number; y: number } {
  const [x, y] = (decision.split(' ')[1] ?? '').split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

describe('golden runs', () => {
  it('there are at least four', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  // `it.each` makes one test per file, named after it.
  it.each(files)('%s replays to its recorded hash', (name) => {
    const golden = loadGolden(name);
    const state = replayFile(name);
    expect(statusText(state)).toBe(golden.expectedStatus);
    expect(hashState(state)).toBe(golden.expectedHash);
  });

  // A hash only pins a rule if the run exercises it. The tests below fail if
  // a new recording no longer covers what its file is there for.

  it('pit-seed-11.json digs a terraced pit, cuts trees, crafts fuel and closes the mine', () => {
    const golden = loadGolden('pit-seed-11.json');
    expect(golden.decisions.some((decision) => decision.startsWith('cutTree'))).toBe(true);
    expect(golden.decisions.some((decision) => decision.startsWith('craft fuel'))).toBe(true);
    expect(golden.decisions[golden.decisions.length - 1]).toBe('closeMine ap 0');

    const state = replayFile('pit-seed-11.json');
    let deepest = 0;
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const depth = depthAt(state, x, y);
        deepest = Math.max(deepest, depth);
        // The level rule, seen afterwards: no square is more than 1 level
        // below a neighbour. `mayMine` lists the neighbours that are higher.
        for (const higher of mayMine(state, x, y).higherNeighbours) {
          expect(depth - higher.depth).toBe(1);
        }
      }
    }
    expect(deepest).toBeGreaterThanOrEqual(4);
  });

  // The pit of this run gets deep enough for top blocks to lie within reach
  // of ore (decision note 0012), so its `tracesSeen` is not all zeros.
  it('pit-seed-31-traces.json sees mineral traces, and they stay on the map', () => {
    const state = replayFile('pit-seed-31-traces.json');
    const flags = state.tracesSeen.reduce((total, flag) => total + flag, 0);
    expect(flags).toBeGreaterThan(0);
    expect(visibleMineralTraces(state).length).toBeGreaterThan(0);
  });

  // The surface forest (issue #70; design doc 3.2): this run cuts trees. A
  // stump left alone grows a tree again; a stump whose square is mined never
  // does. The hash pins cutting, stumps, regrowth and "no regrowth once mined".
  it('random-seed-9-forest.json cuts trees; some grow back, and none on a mined square', () => {
    const golden = loadGolden('random-seed-9-forest.json');
    const cuts = golden.decisions.filter((decision) => decision.startsWith('cutTree'));
    expect(cuts.length).toBeGreaterThan(0);
    const state = replayFile('random-seed-9-forest.json');
    let stumps = 0;
    let regrown = 0;
    let minedAfterCut = 0;
    for (const decision of cuts) {
      const square = squareOf(decision);
      const cell = { x: square.x, y: square.y, z: WORLD.surfaceZ };
      if (depthAt(state, square.x, square.y) > 0) {
        minedAfterCut += 1;
        expect(hasTree(state, cell)).toBe(false);
        expect(hasStump(state, cell)).toBe(false);
      } else if (hasStump(state, cell)) {
        stumps += 1;
      } else if (hasTree(state, cell)) {
        regrown += 1;
      }
    }
    expect(stumps).toBeGreaterThan(0);
    expect(regrown).toBeGreaterThan(0);
    expect(minedAfterCut).toBeGreaterThan(0);
  });

  it('random-seed-27-cut-short.json stops with the run still going', () => {
    expect(loadGolden('random-seed-27-cut-short.json').expectedStatus).toBe('active');
  });
});
