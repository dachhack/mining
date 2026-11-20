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
//   npm run golden -- --record-all
//       Record every run in `STANDARD_RUNS` below again: the whole set in
//       tests/golden. Use when a rule change makes recorded decisions illegal.

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

/** One golden run to record: what `--record` takes on the command line. */
interface RecordSpec {
  name: string;
  seed: number;
  policyName: string;
  /** Cut the run short after this many decisions; `undefined` plays it to its end. */
  maxDecisions: number | undefined;
  /** A sentence about the run; '' for a plain default. */
  description: string;
}

/**
 * The golden runs in tests/golden, as `--record-all` records them. The table
 * in tests/golden/README.md says what each is there to cover; golden.test.ts
 * checks that a new recording still covers it.
 */
const STANDARD_RUNS: RecordSpec[] = [
  {
    name: 'pit-seed-11',
    seed: 11,
    policyName: 'pit',
    maxDecisions: undefined,
    description:
      'The pit policy on seed 11: digs a terraced pit round the middle of the map under the level rule, cutting the trees in its way, crafts fuel from the coal it finds, and closes the mine (salvage) when the fuel is about to run out.',
  },
  {
    name: 'pit-seed-31-traces',
    seed: 31,
    policyName: 'pit',
    maxDecisions: undefined,
    description:
      'The pit policy on a seed where its pit gets deep enough for top blocks to lie near ore: mineral traces are seen and stay on the map.',
  },
  {
    name: 'pit-seed-24-caverns',
    seed: 24,
    policyName: 'pit',
    maxDecisions: undefined,
    description:
      'The pit policy on a seed where its pit breaks into two caverns: each collapses to rubble at once and the square drops exactly 1 level, so the level rule holds (design doc 6.2).',
  },
  {
    name: 'random-seed-9-forest',
    seed: 9,
    policyName: 'random',
    maxDecisions: undefined,
    description:
      'Random legal actions (never closing the mine) until the fuel runs out. About half its actions cut trees; some stumps are mined (and never regrow) and some grow a tree again.',
  },
  {
    name: 'random-seed-27-cut-short',
    seed: 27,
    policyName: 'random',
    maxDecisions: 60,
    description: 'Random legal actions, stopped after 60 decisions with the run still going.',
  },
];

function fail(message: string): never {
  console.error(`golden: ${message}`);
  console.error(
    'Usage: npm run golden -- --rehash\n' +
      '       npm run golden -- --record-all\n' +
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

/** Read the `--record` arguments from the command line. */
function parseRecordArgs(args: string[]): RecordSpec {
  const spec: RecordSpec = {
    name: '',
    seed: 1,
    policyName: '',
    maxDecisions: undefined,
    description: '',
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    i += 1;
    const value = args[i];
    if (arg === '--record') {
      spec.name = value ?? '';
    } else if (arg === '--seed') {
      spec.seed = wholeNumber(value, '--seed');
    } else if (arg === '--policy') {
      spec.policyName = value ?? '';
    } else if (arg === '--max-decisions') {
      spec.maxDecisions = wholeNumber(value, '--max-decisions');
    } else if (arg === '--description') {
      spec.description = value ?? '';
    } else {
      fail(`unknown argument ${arg ?? ''}`);
    }
  }
  return spec;
}

/** Play the run `spec` describes and write it to tests/golden/<name>.json. */
async function record(spec: RecordSpec): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(spec.name)) {
    fail('--record needs a name of lower-case letters, digits and hyphens');
  }
  if (!POLICY_NAMES.includes(spec.policyName)) {
    fail(`--policy must be one of ${POLICY_NAMES.join(', ')}`);
  }
  const contractId = CONTRACT_IDS[0];
  if (contractId === undefined) {
    fail('the data lists no contract');
  }

  const options = {
    seed: spec.seed,
    contractId,
    loadoutId: DEFAULT_LOADOUT_ID,
    policy: makePolicy(spec.policyName, spec.seed),
    maxShifts: RECORD_MAX_SHIFTS,
  };
  // With our compiler settings an optional field must be left out, not set to
  // `undefined`, so it is added only when given.
  const result = playRun(
    spec.maxDecisions === undefined ? options : { ...options, maxDecisions: spec.maxDecisions },
  );

  const golden: GoldenRun = {
    description:
      spec.description !== ''
        ? spec.description
        : `Policy ${spec.policyName}, seed ${spec.seed}: ${result.decisions.length} decisions.`,
    seed: spec.seed,
    contractId,
    loadoutId: DEFAULT_LOADOUT_ID,
    recordedWith: spec.policyName,
    expectedStatus: statusText(result.finalState),
    expectedHash: result.metrics.finalHash,
    decisions: result.decisions,
  };
  const file = path.join(GOLDEN_DIR, `${spec.name}.json`);
  await writeGolden(file, golden);
  console.log(
    `${spec.name}.json: ${golden.decisions.length} decisions, ${golden.expectedStatus}, hash ${golden.expectedHash}`,
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
  } else if (args.length === 1 && args[0] === '--record-all') {
    for (const spec of STANDARD_RUNS) {
      await record(spec);
    }
  } else if (args.includes('--record')) {
    await record(parseRecordArgs(args));
  } else {
    fail('give --rehash, --record-all or --record');
  }
}

main().catch((error: unknown) => {
  console.error(`golden: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
