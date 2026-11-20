// Headless simulation: play many whole runs with a scripted policy and report
// what happened. The balance-tuning tool of docs/repo-plan.md section 5.6,
// and the source of the evaluator's numbers (docs/agents/evaluator.md).
//
// Usage:
//   npm run sim -- --seed 123 --policy random --runs 1000
//   npm run sim -- --policy pit --runs 20 --json
//
//   --seed N         seed of the first run (default 1); run i uses seed N + i
//   --policy NAME    random | pit (default random); see tools/policies.ts
//   --runs N         how many runs (default 1)
//   --max-shifts N   stop a run that has not ended after N shifts (default 300);
//                    such a run is reported as outcome "unfinished", cause "shiftCap"
//   --json           print one JSON document instead of the summary
//
// The same arguments always print the same output: nothing here depends on
// the clock. (The time taken is printed to stderr, apart from the report.)
//
// Shape of the --json document. Numbers are plain numbers; a "spread" is
// { mean, min, max } and a "spread+" also has median.
//
//   {
//     "sim": {                      what was asked for
//       "engineVersion": "0.4.0", "policy": "random", "firstSeed": 123,
//       "runs": 1000, "maxShifts": 300, "contractId": "none", "loadoutId": "standard"
//     },
//     "aggregate": {                all runs together
//       "runs": 1000,
//       "outcomes": { "salvage": n, "lost": n, "unfinished": n },
//       "causes":   { "mineClosed": n, "outOfFuel": n, "shiftCap": n },
//       "shiftsPlayed":     spread+,
//       "deepestSquare":    spread+,   levels down of the deepest square; 0 is
//                                      untouched ground
//       "blocksMined":      spread+,
//       "treesCut":         spread+,
//       "shareOfCubeMined": spread+,   a fraction: 0.02 is 2% of the cube's cells
//       "runsThatMinedOre": n,         ore that gives mineral traces: iron, copper, crystal
//       "runsWithTracesSeenBeforeFirstOre": n,    see "tracesSeenBeforeFirstOre" below
//       "runsThatMinedOreAfterSeeingTraces": n,   runs counted in both lines above
//       "legalActionsPerPhase":    spread,   legal actions at the start of each player
//                                            phase: mean of the runs' means, lowest
//                                            minimum, highest maximum
//       "legalActionsPerDecision": spread,   the same, counted at every choice
//       "recipesUsed":  { "<recipe id>": { "crafts": n, "runs": n }, ... },
//                                            every field recipe, so unused ones show 0;
//                                            "runs" is how many runs crafted it at all
//       "itemsCrafted": { "<item or gauge id>": amount, ... },
//       "structuresPlaced": { "<structure id>": n, ... },   every structure
//       "fuelAtEnd":        spread+,
//       "shiftsAtZeroFuel": spread+,   shifts that began with 0 fuel (fuel was 0
//                                      after the upkeep before them), per run
//       "runsWithAShiftAtZeroFuel": n,
//       "finalStockpileMean": { "<item id>": mean count, ... }   every item
//     },
//     "runs": [                     one entry per run, in seed order
//       {
//         "seed": 123, "policy": "random",
//         "outcome": "salvage" | "lost" | "unfinished",
//         "cause": "mineClosed" | "outOfFuel" | "shiftCap",
//         "shiftsPlayed": n,        shifts started, counting the one the run ended in
//         "actionsTaken": n,        not counting ends of shift
//         "deepestSquare": n, "blocksMined": n, "treesCut": n, "shareOfCubeMined": x,
//         "oreBlocksMined": n,      mined blocks of ore that gives mineral traces
//         "tracesSeenBeforeFirstOre": true | false,
//                                   were mineral traces seen on any block before the
//                                   first such ore was mined (or at all, if none was)
//         "legalActionsPerPhase": spread, "legalActionsPerDecision": spread,
//         "recipesUsed": { "<recipe id>": crafts, ... },
//         "itemsCrafted": { "<item or gauge id>": amount, ... },
//         "structuresPlaced": { "<structure id>": n, ... },   every structure
//         "damageTaken": n, "healthAtEnd": n, "fuelAtEnd": n,
//         "shiftsAtZeroFuel": n,
//         "finalStockpile": { "<item id>": count, ... },   every item
//         "finalHash": "16 hex digits"                      hashState of the final state
//       }, ...
//     ]
//   }

import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, GAME_DATA, validateData } from '../src/data';
import { POLICY_NAMES, makePolicy } from './policies';
import { formatSummary, simulate } from './simRun';

interface Options {
  seed: number;
  policy: string;
  runs: number;
  maxShifts: number;
  json: boolean;
}

/** A run that has not ended after this many shifts is stopped (0005, Consequences). */
const DEFAULT_MAX_SHIFTS = 300;
const LARGEST_SEED = 0xffffffff;

function fail(message: string): never {
  console.error(`sim: ${message}`);
  console.error(
    `Usage: npm run sim -- [--seed N] [--policy ${POLICY_NAMES.join('|')}] [--runs N] [--max-shifts N] [--json]`,
  );
  process.exit(1);
}

/** Read a whole number of at least 0 from a command-line value. */
function wholeNumber(text: string | undefined, what: string): number {
  if (text === undefined || !/^\d+$/.test(text)) {
    fail(`${what} must be a whole number, but is ${text ?? 'missing'}`);
  }
  return Number(text);
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    seed: 1,
    policy: 'random',
    runs: 1,
    maxShifts: DEFAULT_MAX_SHIFTS,
    json: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--seed') {
      i += 1;
      options.seed = wholeNumber(args[i], '--seed');
    } else if (arg === '--policy') {
      i += 1;
      options.policy = args[i] ?? '';
    } else if (arg === '--runs') {
      i += 1;
      options.runs = wholeNumber(args[i], '--runs');
    } else if (arg === '--max-shifts') {
      i += 1;
      options.maxShifts = wholeNumber(args[i], '--max-shifts');
    } else if (arg === '--json') {
      options.json = true;
    } else {
      fail(`unknown argument ${arg ?? ''}`);
    }
  }
  if (!POLICY_NAMES.includes(options.policy)) {
    fail(`--policy must be one of ${POLICY_NAMES.join(', ')}, but is "${options.policy}"`);
  }
  if (options.runs < 1) {
    fail('--runs must be at least 1');
  }
  if (options.maxShifts < 1) {
    fail('--max-shifts must be at least 1');
  }
  if (options.seed + options.runs - 1 > LARGEST_SEED) {
    fail(`seeds must not pass ${LARGEST_SEED}; lower --seed or --runs`);
  }
  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  // Every tool checks the data tables before using them (0005 item 24).
  const problems = validateData(GAME_DATA);
  if (problems.length > 0) {
    fail(`the data in src/data is not valid:\n  ${problems.join('\n  ')}`);
  }
  const contractId = CONTRACT_IDS[0];
  if (contractId === undefined) {
    fail('the data lists no contract');
  }

  // Wall-clock time is fine here: this is a tool, not the engine, and the
  // time goes to stderr only, so the report itself stays reproducible.
  const startedAt = performance.now();

  const report = simulate({
    policyName: options.policy,
    firstSeed: options.seed,
    runs: options.runs,
    maxShifts: options.maxShifts,
    contractId,
    loadoutId: DEFAULT_LOADOUT_ID,
    makePolicy,
  });
  const seconds = (performance.now() - startedAt) / 1000;

  console.log(options.json ? JSON.stringify(report, null, 2) : formatSummary(report));
  console.error(`sim: ${options.runs} runs in ${seconds.toFixed(1)} s`);
}

main();
