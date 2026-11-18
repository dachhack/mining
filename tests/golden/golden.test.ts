// Golden runs: each tests/golden/*.json is a recorded run (seed, decisions,
// expected final hash). Replaying it must give that hash. A changed hash
// means the rules changed; see README.md in this folder.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/engine';
import { replayDecisions, statusText } from '../../tools/simRun';
import type { GoldenRun } from '../../tools/simRun';

const GOLDEN_DIR = import.meta.dirname;
const files = readdirSync(GOLDEN_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

describe('golden runs', () => {
  it('there are at least three', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
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
});
