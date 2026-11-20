// Headless simulation: play many whole runs with a scripted policy and report
// what happened. The balance-tuning tool of docs/repo-plan.md section 5.6,
// and the source of the evaluator's numbers (docs/agents/evaluator.md).
//
// Usage:
//   npm run sim -- --seed 123 --policy random --runs 1000
//   npm run sim -- --policy pit --runs 20 --json
//   npm run sim -- --acceptance --runs 1000
//   npm run sim -- --survey depth --runs 1000
//
//   --seed N         seed of the first run (default 1); run i uses seed N + i
//   --policy NAME    random | pit | greedy | camp | terrace (default random);
//                    also terrace:N and terrace:N:camp; see tools/policies.ts
//   --runs N         how many runs (default 1)
//   --max-shifts N   stop a run that has not ended after N shifts (default 300);
//                    such a run is reported as outcome "unfinished", cause "shiftCap"
//   --kit            start every run with the sim-only tool kit (tools/simKit.ts),
//                    so that the random policy can use pumps, vents, sealant,
//                    scans and explosives
//   --json           print one JSON document instead of the summary
//   --jobs N         worker processes for --acceptance and --survey (default:
//                    one per processor core). It changes the time taken only.
//
//   --acceptance     the acceptance check (issue #108): play --runs runs of
//                    EVERY policy, and of the random policy with the tool kit,
//                    checking the rules after every step (tools/invariants.ts)
//                    and replaying every run to the same hash. Prints one line
//                    per policy and every problem found; exits with code 1 if
//                    there is any. --policy is not used.
//   --survey depth   the depth survey (tools/survey.ts): how deep each policy
//                    gets, what it meets, what a pit costs, and what-if trials.
//                    Prints Markdown. --policy is not used.
//   --survey candidates   candidate settings under which runs meet the hazards,
//                    measured (the list is CANDIDATE_SETTINGS in tools/survey.ts)
//   --survey camp    what a camp is worth to the terracing policy, with the
//                    camp's numbers as they are and changed one at a time
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
//       "causes":   { "mineClosed": n, "outOfFuel": n, "buried": n, "drowned": n,
//                     "burned": n, "poisoned": n, "shiftCap": n },
//       "shiftsPlayed":     spread+,
//       "deepestSquare":    spread+,   levels down of the deepest square; 0 is
//                                      untouched ground
//       "blocksMined":      spread+,
//       "treesCut":         spread+,
//       "runsThatBrokeIntoASpace": n,  a mine broke into a cavern or pocket
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
//         "cause": "mineClosed" | "outOfFuel" | "buried" | "drowned" | "burned" |
//                  "poisoned" | "shiftCap",
//         "shiftsPlayed": n,        shifts started, counting the one the run ended in
//         "actionsTaken": n,        not counting ends of shift
//         "deepestSquare": n, "blocksMined": n, "treesCut": n, "shareOfCubeMined": x,
//         "spacesBrokenInto": n,    caverns and pockets a mine broke into
//         "oreBlocksMined": n,      mined blocks of ore that gives mineral traces
//         "tracesSeenBeforeFirstOre": true | false,
//                                   were mineral traces seen on any block before the
//                                   first such ore was mined (or at all, if none was)
//         "legalActionsPerPhase": spread, "legalActionsPerDecision": spread,
//         "recipesUsed": { "<recipe id>": crafts, ... },
//         "itemsCrafted": { "<item or gauge id>": amount, ... },
//         "structuresPlaced": { "<structure id>": n, ... },   every structure
//         "damageTaken": n,
//         "damageByCause": { "<cause>": n, ... },   slump, water, lava, gas,
//                                                   gasExplosion, explosion
//         "healthAtEnd": n, "fuelAtEnd": n,
//         "shiftsAtZeroFuel": n,
//         "finalStockpile": { "<item id>": count, ... },   every item
//         "tracesSeen": true | false,       mineral traces seen at any time
//         "hazards": {                      what the run met, counted from events
//           "blocksCracked": n, "blocksSlumped": n, "cavernsBroken": n,
//           "waterPocketsBroken": n, "waterReleased": n,
//           "lavaPocketsBroken": n, "lavaReleased": n,
//           "gasPocketsBroken": n, "gasReleased": n,
//           "unstableOreSeen": n, "explosions": n
//         },
//         "tellsSeen": { "dampStone": b, "pittedRock": b, "warmGlow": b, "hairlineGlow": b },
//         "finalHash": "16 hex digits"                      hashState of the final state
//       }, ...
//     ]
//   }

import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, GAME_DATA, validateData } from '../src/data';
import { defaultWorkers, runInParallel } from './parallel';
import { POLICY_NAMES, isPolicyName, makePolicy } from './policies';
import { TOOL_KIT } from './simKit';
import { RUN_END_CAUSES, formatSummary, simulate } from './simRun';
import { runCampSurvey, runCandidateSurvey, runDepthSurvey } from './survey';

interface Options {
  seed: number;
  policy: string;
  runs: number;
  maxShifts: number;
  kit: boolean;
  json: boolean;
  jobs: number;
  acceptance: boolean;
  /** The survey asked for ('depth'), or '' for none. */
  survey: string;
}

/** A run that has not ended after this many shifts is stopped (0005, Consequences). */
const DEFAULT_MAX_SHIFTS = 300;
const LARGEST_SEED = 0xffffffff;
const SURVEY_NAMES = ['depth', 'candidates', 'camp'];

function fail(message: string): never {
  console.error(`sim: ${message}`);
  console.error(
    `Usage: npm run sim -- [--seed N] [--policy ${POLICY_NAMES.join('|')}] [--runs N] [--max-shifts N] [--kit] [--json] [--acceptance] [--survey depth|candidates|camp] [--jobs N]`,
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
    kit: false,
    json: false,
    jobs: defaultWorkers(),
    acceptance: false,
    survey: '',
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
    } else if (arg === '--jobs') {
      i += 1;
      options.jobs = wholeNumber(args[i], '--jobs');
    } else if (arg === '--survey') {
      i += 1;
      options.survey = args[i] ?? '';
      if (!SURVEY_NAMES.includes(options.survey)) {
        fail(`--survey must be one of ${SURVEY_NAMES.join(', ')}, but is "${options.survey}"`);
      }
    } else if (arg === '--kit') {
      options.kit = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--acceptance') {
      options.acceptance = true;
    } else {
      fail(`unknown argument ${arg ?? ''}`);
    }
  }
  if (!isPolicyName(options.policy)) {
    fail(`--policy must be one of ${POLICY_NAMES.join(', ')}, but is "${options.policy}"`);
  }
  if (options.runs < 1) {
    fail('--runs must be at least 1');
  }
  if (options.maxShifts < 1) {
    fail('--max-shifts must be at least 1');
  }
  if (options.jobs < 1) {
    fail('--jobs must be at least 1');
  }
  if (options.seed + options.runs - 1 > LARGEST_SEED) {
    fail(`seeds must not pass ${LARGEST_SEED}; lower --seed or --runs`);
  }
  return options;
}

/**
 * The acceptance check (issue #108): every policy, and the random policy
 * with the tool kit, `options.runs` runs each, with the rules checked after
 * every step and every run replayed. Returns the number of problems found.
 *
 * `async` and `await`: the runs are played by worker processes, and `await`
 * waits for them (tools/parallel.ts).
 */
async function runAcceptance(options: Options): Promise<number> {
  const lastSeed = options.seed + options.runs - 1;
  console.log(
    `acceptance: ${options.runs} runs of each policy, seeds ${options.seed}-${lastSeed}, shift cap ${options.maxShifts}`,
  );
  let problemCount = 0;
  const entries = [
    ...POLICY_NAMES.map((policyName) => ({ policyName, kit: false })),
    { policyName: 'random', kit: true },
  ];
  for (const entry of entries) {
    const result = await runInParallel(
      {
        policyName: entry.policyName,
        firstSeed: options.seed,
        runs: options.runs,
        maxShifts: options.maxShifts,
        kit: entry.kit,
        check: true,
        whatIf: null,
      },
      options.jobs,
    );
    const endings = RUN_END_CAUSES.map((cause) => ({
      cause,
      count: result.runs.filter((run) => run.cause === cause).length,
    }))
      .filter((ending) => ending.count > 0)
      .map((ending) => `${ending.cause} ${ending.count}`)
      .join(', ');
    const name = entry.kit ? `${entry.policyName} + tool kit` : entry.policyName;
    const verdict = result.problems.length === 0 ? 'ok' : `${result.problems.length} PROBLEMS`;
    // `padEnd` pads a string with spaces to a width, to line the columns up.
    console.log(
      `${name.padEnd(18)} ${verdict.padEnd(12)} ${result.runs.length} runs finished and replayed to the same hash; ended: ${endings}`,
    );
    for (const problem of result.problems) {
      console.log(`  ${problem}`);
    }
    problemCount += result.problems.length;
  }
  console.log(
    problemCount === 0
      ? 'acceptance: passed: no crash, no broken rule, every replay identical'
      : `acceptance: FAILED with ${problemCount} problems`,
  );
  return problemCount;
}

async function main(): Promise<void> {
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
  function reportTime(what: string): void {
    const seconds = (performance.now() - startedAt) / 1000;
    console.error(`sim: ${what} in ${seconds.toFixed(1)} s`);
  }

  if (options.acceptance) {
    const problemCount = await runAcceptance(options);
    reportTime('acceptance');
    process.exit(problemCount === 0 ? 0 : 1);
  }

  if (options.survey !== '') {
    const surveyOptions = {
      firstSeed: options.seed,
      runs: options.runs,
      maxShifts: options.maxShifts,
      workers: options.jobs,
      log: (line: string): void => {
        console.error(line);
      },
    };
    let report: string;
    if (options.survey === 'depth') {
      report = await runDepthSurvey(surveyOptions);
    } else if (options.survey === 'candidates') {
      report = await runCandidateSurvey(surveyOptions);
    } else {
      report = await runCampSurvey(surveyOptions);
    }
    console.log(report);
    reportTime('survey');
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
    extraItems: options.kit ? TOOL_KIT : undefined,
  });

  console.log(options.json ? JSON.stringify(report, null, 2) : formatSummary(report));
  reportTime(`${options.runs} runs`);
}

// `void`: main's promise is not waited for; an error in it ends the process
// with a stack trace, as an uncaught error does.
void main();
