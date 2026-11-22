// Record and re-hash the golden runs in tests/golden. See tests/golden/README.md
// for when to use which.
//
// Usage:
//   npm run golden -- --rehash
//       Replay every tests/golden/*.json and rewrite its expected hash and
//       status. Use after a deliberate rule change, when the recorded
//       decisions are all still legal.
//   npm run golden -- --record NAME --seed N --policy P [--max-decisions N] [--kit] [--description TEXT]
//       Play a new run with a policy (see tools/policies.ts) and write it to
//       tests/golden/NAME.json, replacing any file of that name.
//       --max-decisions cuts the run short, leaving it unfinished.
//       --kit starts the run with the sim-only tool kit (tools/simKit.ts).
//   npm run golden -- --record-all
//       Record every run in `STANDARD_RUNS` below again: the whole set in
//       tests/golden. Use when a rule change makes recorded decisions illegal.
//   npm run golden -- --frontier
//       Record the new game's golden runs (Lab 2 becomes the game, plan A3)
//       in tests/golden/frontier again: the new simulator's policies
//       (tools/frontierPolicies.ts) on the seeds in `FRONTIER_RUNS` below.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, GAME_DATA, validateData } from '../src/data';
import { ENGINE_VERSION, hashState } from '../src/engine';
import { POLICY_NAMES, isPolicyName, makePolicy } from './policies';
import { TOOL_KIT } from './simKit';
import { playRun, replayDecisions, statusText } from './simRun';
import type { GoldenRun } from './simRun';
import { playFrontierRun } from './frontierSim';
import type { FrontierPolicyName } from './frontierPolicies';
import type { FrontierGolden } from './frontierRun';

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
  /** Start the run with the sim-only tool kit (tools/simKit.ts). */
  kit: boolean;
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
    name: 'pit-seed-2',
    seed: 2,
    policyName: 'pit',
    maxDecisions: undefined,
    kit: false,
    description:
      'The pit policy on seed 2: digs a terraced pit round the middle of the map under the level rule, with the level benches that keep its walls from slumping, cutting the trees in its way, crafts fuel from the coal it finds, and closes the mine (salvage) when the fuel is about to run out.',
  },
  {
    name: 'pit-seed-7-support',
    seed: 7,
    policyName: 'pit',
    maxDecisions: undefined,
    kit: false,
    description:
      'The pit policy on a seed where a square turns out unstable that it cannot mine down: it crafts a support and places it on the cracked square, which then never slumps.',
  },
  {
    name: 'greedy-seed-11-buried',
    seed: 11,
    policyName: 'greedy',
    maxDecisions: undefined,
    kit: false,
    description:
      'The greedy policy: the steepest pit the level rule allows, with no heed for slumps. Its walls crack, count down and slump into the pit, cascades follow, and the crew is hurt where it works until it is buried.',
  },
  {
    name: 'pit-seed-24-caverns',
    seed: 24,
    policyName: 'pit',
    maxDecisions: undefined,
    kit: false,
    description:
      'The pit policy on a seed where its pit breaks into two caverns: each collapses to rubble at once and the square drops exactly 1 level, so the level rule holds (design doc 6.2).',
  },
  {
    name: 'camp-seed-12-rest',
    seed: 12,
    policyName: 'camp',
    maxDecisions: undefined,
    kit: false,
    description:
      'The camp policy (the greedy digger with a camp): it founds a camp near the middle with its starting kit, mines more cheaply near it, pays its upkeep, and rests there each time a slump has hurt the crew. It lives to close the mine.',
  },
  {
    name: 'camp-seed-25-destroyed',
    seed: 25,
    policyName: 'camp',
    maxDecisions: undefined,
    kit: false,
    description:
      'The camp policy on a seed where the pit reaches the camp: the crew rests there twice, then a slump destroys the camp, there is nowhere left to rest, and the crew is buried.',
  },
  {
    name: 'random-seed-6-forest',
    seed: 6,
    policyName: 'random',
    maxDecisions: undefined,
    kit: false,
    description:
      'The random policy (a kind of action at random, then one legal action of that kind; never closing the mine) until the fuel runs out. It cuts trees; some stumps are mined (and never regrow) and some grow a tree again.',
  },
  {
    name: 'random-seed-27-cut-short',
    seed: 27,
    policyName: 'random',
    maxDecisions: 60,
    kit: false,
    description: 'The random policy, stopped after 60 decisions with the run still going.',
  },
  {
    name: 'terrace-seed-1',
    seed: 1,
    policyName: 'terrace',
    maxDecisions: undefined,
    kit: false,
    description:
      'The terracing policy on seed 1: plans a pit 6 deep in a corner, digs it layer by layer, makes supports and places them on the wall squares before their cracks fall, takes the coal it sees, and closes the mine when the pit is finished. Nothing slumps and the crew is never hurt.',
  },
  {
    name: 'terrace-8-seed-4-flood',
    seed: 4,
    policyName: 'terrace:8',
    maxDecisions: undefined,
    kit: false,
    description:
      'The terracing policy with a pit planned 8 deep, on a seed where it breaks into a water pocket: the water floods the pit floor, flows as the pit deepens, and costs the crew health where it enters a square the crew worked. The run also sees damp stone and mineral traces, mines ore, and finishes its pit.',
  },
  {
    name: 'terrace-8-seed-10-poisoned',
    seed: 10,
    policyName: 'terrace:8',
    maxDecisions: undefined,
    kit: false,
    description:
      'The terracing policy with a pit planned 8 deep, on a seed where it breaks into gas pockets and goes on digging in the gas: the crew loses health shift after shift and is poisoned. The script does not heed pitted rock; a careful person would.',
  },
  {
    name: 'random-kit-seed-24-blast',
    seed: 24,
    policyName: 'random',
    maxDecisions: undefined,
    kit: true,
    description:
      'The random policy with the sim-only tool kit: it places explosives, pumps and vents, seals squares and scans, founds and takes down camps, and is hurt by one of its own blasts. No run with the standard loadout gets the items for these, so this is the golden run that pins them on a generated cube.',
  },
];

function fail(message: string): never {
  console.error(`golden: ${message}`);
  console.error(
    'Usage: npm run golden -- --rehash\n' +
      '       npm run golden -- --record-all\n' +
      `       npm run golden -- --record NAME --seed N --policy ${POLICY_NAMES.join('|')} [--max-decisions N] [--kit] [--description TEXT]`,
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
async function writeGolden(file: string, golden: GoldenRun | FrontierGolden): Promise<void> {
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
      golden.extraItems,
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
    kit: false,
    description: '',
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--kit') {
      spec.kit = true; // the one argument with no value after it
      continue;
    }
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
  if (!isPolicyName(spec.policyName)) {
    fail(`--policy must be one of ${POLICY_NAMES.join(', ')}, or terrace:N`);
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
    extraItems: spec.kit ? TOOL_KIT : undefined,
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
    // `...` with a condition: the field is added only for a run with the kit.
    ...(spec.kit ? { extraItems: TOOL_KIT } : {}),
    decisions: result.decisions,
  };
  const file = path.join(GOLDEN_DIR, `${spec.name}.json`);
  await writeGolden(file, golden);
  console.log(
    `${spec.name}.json: ${golden.decisions.length} decisions, ${golden.expectedStatus}, hash ${golden.expectedHash}`,
  );
}

/**
 * The new game's golden runs, in tests/golden/frontier: the new simulator's
 * policies (tools/frontierPolicies.ts, plan B3) on these seeds, each played
 * for at most `maxShifts` shifts. `--frontier` records them all again;
 * there is nothing to rehash separately, since a policy always plays the
 * same way on a seed.
 */
const FRONTIER_RUNS: {
  name: string;
  seed: number;
  policy: FrontierPolicyName;
  maxShifts: number;
  description: string;
}[] = [
  {
    name: 'gatherer-seed-1',
    seed: 1,
    policy: 'gatherer',
    maxShifts: 10,
    description:
      'The gatherer for 10 shifts of 100 taps: takes plants and animals, places two more camps where they light the most new ground, mines 560 blocks, upgrades three times, and is never hungry',
  },
  {
    name: 'gatherer-seed-26',
    seed: 26,
    policy: 'gatherer',
    maxShifts: 10,
    description:
      'The gatherer on another seed: places two more camps and brings a camp to level 3, never hungry',
  },
  {
    name: 'careful-seed-3',
    seed: 3,
    policy: 'careful',
    maxShifts: 10,
    description:
      'The careful policy: keeps wood and food back for upkeep, places two more camps and brings one to level 3; short only at the end of the first shift',
  },
  {
    name: 'digger-seed-5',
    seed: 5,
    policy: 'digger',
    maxShifts: 10,
    description:
      'The digger: a pit 5 levels deep next to the first camp under the level rule, gathering only for upkeep',
  },
  {
    name: 'random-seed-6',
    seed: 6,
    policy: 'random',
    maxShifts: 10,
    description:
      'The random policy: a useful step at random, ending each shift when its taps run out; it upgrades a camp to level 3 and is never hungry',
  },
  {
    name: 'idle-seed-2-lost',
    seed: 2,
    policy: 'idle',
    maxShifts: 40,
    description:
      'The idle policy: gathers nothing, rests at camp 1 once the crew is at half health, then starves at shift 11',
  },
];

async function recordFrontier(): Promise<void> {
  const dir = path.join(GOLDEN_DIR, 'frontier');
  mkdirSync(dir, { recursive: true });
  // The runs recorded before B3 (the gatherer only, 400 steps) are replaced.
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    rmSync(path.join(dir, name));
  }
  for (const run of FRONTIER_RUNS) {
    const result = playFrontierRun(run.seed, run.policy, run.maxShifts);
    const golden: FrontierGolden = {
      description: run.description,
      recordedWith: run.policy,
      engineVersion: ENGINE_VERSION,
      seed: run.seed,
      stepCount: result.steps.length,
      expectedHash: result.metrics.finalHash,
      steps: result.steps,
    };
    await writeGolden(path.join(dir, `${run.name}.json`), golden);
    console.log(
      `frontier/${run.name}.json: ${golden.stepCount} steps, ${result.metrics.outcome}, hash ${golden.expectedHash}`,
    );
  }
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
  } else if (args.length === 1 && args[0] === '--frontier') {
    await recordFrontier();
  } else if (args.includes('--record')) {
    await record(parseRecordArgs(args));
  } else {
    fail('give --rehash, --record-all, --record or --frontier');
  }
}

main().catch((error: unknown) => {
  console.error(`golden: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
