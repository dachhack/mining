// Headless simulation: play many whole runs with a scripted policy and report
// what happened. The balance-tuning tool of docs/repo-plan.md section 5.6,
// and the source of the evaluator's numbers (docs/agents/evaluator.md).
//
// Usage:
//   npm run sim -- --seed 123 --policy random --runs 1000
//   npm run sim -- --policy staircase --runs 20 --json
//   npm run sim -- --survey coal --runs 1000
//
//   --seed N         seed of the first run (default 1); run i uses seed N + i
//   --policy NAME    random | wander | staircase | coal (default random); see tools/policies.ts
//   --runs N         how many runs (default 1)
//   --max-shifts N   stop a run that has not ended after N shifts (default 300);
//                    such a run is reported as outcome "unfinished", cause "shiftCap"
//   --json           print one JSON document instead of the summary
//   --survey coal    instead of the report below, print the coal survey (issue #51):
//                    for each of the --runs seeds, how far the nearest coal is, and
//                    whether a trip to fetch it pays for itself in fuel. --policy is
//                    not used. See tools/coalSurvey.ts for what is measured and for
//                    the shape of its --json document.
//   --margin N       coal survey only: the fuel a player should still have at the
//                    worst moment of the trip (default 3)
//
// The same arguments always print the same output: nothing here depends on
// the clock. (The time taken is printed to stderr, apart from the report.)
//
// Shape of the --json document. Numbers are plain numbers; a "spread" is
// { mean, min, max } and a "spread+" also has median.
//
//   {
//     "sim": {                      what was asked for
//       "engineVersion": "0.3.0", "policy": "random", "firstSeed": 123,
//       "runs": 1000, "maxShifts": 300, "contractId": "none", "loadoutId": "standard"
//     },
//     "aggregate": {                all runs together
//       "runs": 1000,
//       "outcomes": { "salvage": n, "death": n, "unfinished": n },
//       "causes":   { "left": n, "outOfFuel": n, "shiftCap": n },
//       "shiftsPlayed":     spread+,
//       "deepestLayer":     spread+,   -1 is the surface
//       "blocksMined":      spread+,
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
//       "shiftsInTheDark":  spread+,   shifts that began with the lamp out (lamp oil
//                                      was 0 after the upkeep before them), per run
//       "runsWithAShiftInTheDark": n,
//       "finalInventoryMean": { "<item id>": mean count, ... }   every item
//     },
//     "runs": [                     one entry per run, in seed order
//       {
//         "seed": 123, "policy": "random",
//         "outcome": "salvage" | "death" | "unfinished",
//         "cause": "left" | "outOfFuel" | "shiftCap",
//         "shiftsPlayed": n,        shifts started, counting the one the run ended in
//         "actionsTaken": n,        not counting ends of shift
//         "deepestLayer": n, "blocksMined": n, "shareOfCubeMined": x,
//         "oreBlocksMined": n,      mined blocks of ore that gives mineral traces
//         "tracesSeenBeforeFirstOre": true | false,
//                                   were mineral traces seen on any block before the
//                                   first such ore was mined (or at all, if none was)
//         "legalActionsPerPhase": spread, "legalActionsPerDecision": spread,
//         "recipesUsed": { "<recipe id>": crafts, ... },
//         "itemsCrafted": { "<item or gauge id>": amount, ... },
//         "structuresPlaced": { "<structure id>": n, ... },   every structure
//         "damageTaken": n, "healthAtEnd": n, "fuelAtEnd": n, "lampOilAtEnd": n,
//         "shiftsAtZeroFuel": n, "shiftsInTheDark": n,
//         "finalInventory": { "<item id>": count, ... },   every item
//         "finalHash": "16 hex digits"                      hashState of the final state
//       }, ...
//     ]
//   }

import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, GAME_DATA, validateData } from '../src/data';
import { DEFAULT_MARGIN_SHIFTS, formatCoalSurvey, surveyCoal } from './coalSurvey';
import { POLICY_NAMES, makePolicy } from './policies';
import { formatSummary, simulate } from './simRun';

interface Options {
  seed: number;
  policy: string;
  runs: number;
  maxShifts: number;
  json: boolean;
  /** The survey to print instead of the usual report; `null` for the usual report. */
  survey: string | null;
  margin: number;
}

/** The names `--survey` accepts. */
const SURVEY_NAMES = ['coal'];

/** A run that has not ended after this many shifts is stopped (0005, Consequences). */
const DEFAULT_MAX_SHIFTS = 300;
const LARGEST_SEED = 0xffffffff;

function fail(message: string): never {
  console.error(`sim: ${message}`);
  console.error(
    `Usage: npm run sim -- [--seed N] [--policy ${POLICY_NAMES.join('|')}] [--runs N] [--max-shifts N] [--json]\n` +
      `       npm run sim -- --survey ${SURVEY_NAMES.join('|')} [--seed N] [--runs N] [--max-shifts N] [--margin N] [--json]`,
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
    survey: null,
    margin: DEFAULT_MARGIN_SHIFTS,
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
    } else if (arg === '--survey') {
      i += 1;
      options.survey = args[i] ?? '';
    } else if (arg === '--margin') {
      i += 1;
      options.margin = wholeNumber(args[i], '--margin');
    } else {
      fail(`unknown argument ${arg ?? ''}`);
    }
  }
  if (!POLICY_NAMES.includes(options.policy)) {
    fail(`--policy must be one of ${POLICY_NAMES.join(', ')}, but is "${options.policy}"`);
  }
  if (options.survey !== null && !SURVEY_NAMES.includes(options.survey)) {
    fail(`--survey must be one of ${SURVEY_NAMES.join(', ')}, but is "${options.survey}"`);
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

  if (options.survey === 'coal') {
    const survey = surveyCoal({
      firstSeed: options.seed,
      seeds: options.runs,
      contractId,
      loadoutId: DEFAULT_LOADOUT_ID,
      marginShifts: options.margin,
      maxShifts: options.maxShifts,
    });
    console.log(options.json ? JSON.stringify(survey, null, 2) : formatCoalSurvey(survey));
    const surveySeconds = (performance.now() - startedAt) / 1000;
    console.error(`sim: coal survey of ${options.runs} seeds in ${surveySeconds.toFixed(1)} s`);
    return;
  }

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
