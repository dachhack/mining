// Record and re-hash the golden runs in tests/golden. See tests/golden/README.md
// for when to use which.
//
// Usage:
//   npm run golden -- --rehash
//       Replay every tests/golden/*.json and rewrite its expected hash and
//       status. Use after a deliberate rule change, when the recorded
//       decisions are all still legal.
//   npm run golden -- --record NAME --seed N --policy P [--max-decisions N] [--description TEXT]
//       Play a new run with a policy (see tools/policies.ts) and write it to
//       tests/golden/NAME.json, replacing any file of that name.
//       --max-decisions cuts the run short, leaving it unfinished.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, GAME_DATA, validateData } from '../src/data';
import { hashState } from '../src/engine';
import { POLICY_NAMES, makePolicy } from './policies';
import { playRun, replayDecisions, statusText } from './simRun';
import type { GoldenRun } from './simRun';

const GOLDEN_DIR = path.join(import.meta.dirname, '..', 'tests', 'golden');
/** A recorded run that has not ended after this many shifts is stopped. */
const RECORD_MAX_SHIFTS = 300;

function fail(message: string): never {
  console.error(`golden: ${message}`);
  console.error(
    'Usage: npm run golden -- --rehash\n' +
      `       npm run golden -- --record NAME --seed N --policy ${POLICY_NAMES.join('|')} [--max-decisions N] [--description TEXT]`,
  );
  process.exit(1);
}

function wholeNumber(text: string | undefined, what: string): number {
  if (text === undefined || !/^\d+$/.test(text)) {
    fail(`${what} must be a whole number, but is ${text ?? 'missing'}`);
  }
  return Number(text);
}

/** Write a golden file, formatted as `npm run lint` (Prettier) expects. */
async function writeGolden(file: string, golden: GoldenRun): Promise<void> {
  // `await` waits for Prettier's answer, like Python's `await`.
  const config = await prettier.resolveConfig(file);
  const text = await prettier.format(JSON.stringify(golden), { ...config, filepath: file });
  writeFileSync(file, text);
}

async function rehashAll(): Promise<void> {
  const names = readdirSync(GOLDEN_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
  for (const name of names) {
    const file = path.join(GOLDEN_DIR, name);
    // `as GoldenRun`: we trust the files in our own repository to have this shape.
    const golden = JSON.parse(readFileSync(file, 'utf8')) as GoldenRun;
    const state = replayDecisions(
      golden.seed,
      golden.contractId,
      golden.loadoutId,
      golden.decisions,
    );
    const hash = hashState(state);
    const status = statusText(state);
    if (hash === golden.expectedHash && status === golden.expectedStatus) {
      console.log(`${name}: unchanged (${hash})`);
      continue;
    }
    console.log(
      `${name}: ${golden.expectedHash} -> ${hash}; ${golden.expectedStatus} -> ${status}`,
    );
    await writeGolden(file, { ...golden, expectedStatus: status, expectedHash: hash });
  }
}

async function record(args: string[]): Promise<void> {
  let name = '';
  let seed = 1;
  let policyName = '';
  let description = '';
  let maxDecisions: number | undefined = undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    i += 1;
    const value = args[i];
    if (arg === '--record') {
      name = value ?? '';
    } else if (arg === '--seed') {
      seed = wholeNumber(value, '--seed');
    } else if (arg === '--policy') {
      policyName = value ?? '';
    } else if (arg === '--max-decisions') {
      maxDecisions = wholeNumber(value, '--max-decisions');
    } else if (arg === '--description') {
      description = value ?? '';
    } else {
      fail(`unknown argument ${arg ?? ''}`);
    }
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    fail('--record needs a name of lower-case letters, digits and hyphens');
  }
  if (!POLICY_NAMES.includes(policyName)) {
    fail(`--policy must be one of ${POLICY_NAMES.join(', ')}`);
  }
  const contractId = CONTRACT_IDS[0];
  if (contractId === undefined) {
    fail('the data lists no contract');
  }

  const options = {
    seed,
    contractId,
    loadoutId: DEFAULT_LOADOUT_ID,
    policy: makePolicy(policyName, seed),
    maxShifts: RECORD_MAX_SHIFTS,
  };
  // With our compiler settings an optional field must be left out, not set to
  // `undefined`, so it is added only when given.
  const result = playRun(maxDecisions === undefined ? options : { ...options, maxDecisions });

  const golden: GoldenRun = {
    description:
      description !== ''
        ? description
        : `Policy ${policyName}, seed ${seed}: ${result.decisions.length} decisions.`,
    seed,
    contractId,
    loadoutId: DEFAULT_LOADOUT_ID,
    recordedWith: policyName,
    expectedStatus: statusText(result.finalState),
    expectedHash: result.metrics.finalHash,
    decisions: result.decisions,
  };
  const file = path.join(GOLDEN_DIR, `${name}.json`);
  await writeGolden(file, golden);
  console.log(
    `${name}.json: ${golden.decisions.length} decisions, ${golden.expectedStatus}, hash ${golden.expectedHash}`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const problems = validateData(GAME_DATA);
  if (problems.length > 0) {
    fail(`the data in src/data is not valid:\n  ${problems.join('\n  ')}`);
  }
  if (args.length === 1 && args[0] === '--rehash') {
    await rehashAll();
  } else if (args.includes('--record')) {
    await record(args);
  } else {
    fail('give --rehash or --record');
  }
}

main().catch((error: unknown) => {
  console.error(`golden: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
