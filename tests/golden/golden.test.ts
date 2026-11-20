// Golden runs: each tests/golden/*.json is a recorded run (seed, decisions,
// expected final hash). Replaying it must give that hash. A changed hash
// means the rules changed; see README.md in this folder.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCKS, STRUCTURES, WORLD } from '../../src/data';
import {
  depthAt,
  hasStump,
  hasTree,
  hashState,
  mayMine,
  slumpCheck,
  structureOnSquare,
  topBlockAt,
  unstableSquares,
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
  it('there are at least five', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
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
    // Level benches keep the walls from slumping, so the pit is wide and
    // not as deep as a plain cone would be (issue #94).
    expect(deepest).toBeGreaterThanOrEqual(3);
  });

  // Pit walls slump (design doc 6.1; issue #94). The pit policy never makes a
  // square unstable knowingly, so its pit ends with nothing waiting to fall.
  it('pit-seed-11.json leaves a pit with no unstable square', () => {
    expect(unstableSquares(replayFile('pit-seed-11.json'))).toEqual([]);
  });

  // On this seed a square turns out unstable that the policy cannot mine
  // down, so it crafts a support and places it. The hash pins the place
  // action, the stored support, and a crack whose countdown the support stops.
  it('pit-seed-42-support.json crafts a support and places it on a cracked square', () => {
    const golden = loadGolden('pit-seed-42-support.json');
    expect(golden.decisions.some((decision) => decision.startsWith('craft support'))).toBe(true);
    const places = golden.decisions.filter((decision) => decision.startsWith('placeSupport'));
    expect(places.length).toBeGreaterThan(0);
    const state = replayFile('pit-seed-42-support.json');
    const square = squareOf(places[0] ?? '');
    expect(structureOnSquare(state, square.x, square.y)).toBe(STRUCTURES.support.code);
    expect(slumpCheck(state, square.x, square.y).heldBy).toBe('support');
  });

  // The greedy policy digs the steepest pit the level rule allows. Its walls
  // crack, count down and slump, and the crew is buried. The hash pins the
  // countdowns, the slumps and their order, the rubble, and the crew damage.
  it('greedy-seed-11-buried.json has walls that slump, and the crew is buried', () => {
    const golden = loadGolden('greedy-seed-11-buried.json');
    expect(golden.expectedStatus).toBe('ended: lost, buried');
    const state = replayFile('greedy-seed-11-buried.json');
    expect(state.crew.health).toBe(0);
    // Slumped blocks lie in the pit as rubble.
    let rubbleTops = 0;
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        if (topBlockAt(state, x, y) === BLOCKS.rubble.code) {
          rubbleTops += 1;
        }
      }
    }
    expect(rubbleTops).toBeGreaterThan(0);
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
