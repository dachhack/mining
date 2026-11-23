// The new game's simulator (plan B3): play many whole runs with a scripted
// policy and report what happened; and the acceptance check.
//
// Usage:
//   npm run sim -- --policy gatherer --runs 100
//   npm run sim -- --policy careful --runs 1000 --json
//   npm run sim -- --acceptance --runs 1000
//   npm run sim:old -- --help-ish        the old game's simulator, until Phase C
//
//   --seed N         seed of the first run (default 1); run i uses seed N + i
//   --policy NAME    random | gatherer | careful | digger (default gatherer);
//                    see tools/frontierPolicies.ts
//   --runs N         how many runs (default 1)
//   --max-shifts N   stop a run after N shifts (default 40); it is reported as
//                    outcome "unfinished"
//   --json           print one JSON document instead of the summary
//
// The summary has two lines a policy: the run's outcome, then, for each step
// of smelting and crafting (levels 2 to 4, smelter, ingot, pickaxe, drill,
// lantern made and hung), how many runs reached it and the median shift,
// and the coal, ore and crystal mined (decision note 0060).
//   --acceptance     play --runs runs of EVERY policy, checking the rules
//                    after every step (tools/frontierInvariants.ts) and
//                    replaying every run to the same hash. Prints one line per
//                    policy and every problem found; exits with code 1 if
//                    there is any. --policy is not used.
//
// The same arguments always print the same output: nothing here depends on
// the clock (the time taken goes to stderr).

import {
  FRONTIER_DRILL,
  FRONTIER_LANTERN,
  FRONTIER_PICKAXE,
  FRONTIER_SHIFT,
} from '../src/data/frontier';
import { ENGINE_VERSION, createFrontier, depthAt, frontierAct, hashFrontier } from '../src/engine';
import type { FrontierState } from '../src/engine';
import { checkStep } from './frontierInvariants';
import {
  FRONTIER_POLICY_NAMES,
  isFrontierPolicyName,
  makeFrontierPolicy,
} from './frontierPolicies';
import type { FrontierPolicyName } from './frontierPolicies';
import { actionOf, replayFrontier } from './frontierRun';
import type { FrontierStep } from './frontierRun';

/** What one run did. */
export interface FrontierRunMetrics {
  seed: number;
  /** 'lost' (the crew), 'closed' (the mine), 'finished' (the run's last shift), or 'unfinished' (the shift cap). */
  outcome: 'lost' | 'closed' | 'finished' | 'unfinished';
  shifts: number;
  steps: number;
  health: number;
  /** Health lost to hunger over the whole run. */
  healthLost: number;
  /** The first shift whose end cost health, or -1. */
  firstHunger: number;
  camps: number;
  topCampLevel: number;
  blocksMined: number;
  /** Levels down of the deepest square. */
  deepest: number;
  grassHeld: number;
  /** Coins held when the run stopped: the score, once the run has finished. */
  coins: number;
  /**
   * The shift each step of smelting and crafting was first reached in, or -1
   * if never: a camp at level 2, 3 and 4, a smelter, the first ingot, an
   * iron pickaxe, an iron drill, a copper lantern made and one hung.
   */
  firsts: Record<FirstName, number>;
  /** What mining gave over the whole run (with the pickaxe's double counted). */
  mined: { coal: number; rawIronOre: number; rawCopperOre: number; crystal: number };
  finalHash: string;
}

/** The steps whose first shift a run records (`FrontierRunMetrics.firsts`). */
export const FIRST_NAMES = [
  'level2',
  'level3',
  'smelter',
  'ingot',
  'pickaxe',
  'drill',
  'lantern',
  'lanternHung',
  'level4',
] as const;
export type FirstName = (typeof FIRST_NAMES)[number];

/** Which of FIRST_NAMES `state` has reached. */
function reached(state: FrontierState): Set<FirstName> {
  const got = new Set<FirstName>();
  const top = Math.max(...state.camps.map((c) => c.level));
  if (top >= 2) got.add('level2');
  if (top >= 3) got.add('level3');
  if (top >= 4) got.add('level4');
  if (state.camps.some((c) => c.smelter)) got.add('smelter');
  if (state.camps.some((c) => c.lantern)) got.add('lanternHung');
  const held = (item: string): boolean => (state.inventory.get(item) ?? 0) > 0;
  if (held('ironIngot') || held('copperIngot')) got.add('ingot');
  if (held(FRONTIER_PICKAXE.item)) got.add('pickaxe');
  if (held(FRONTIER_DRILL.item)) got.add('drill');
  if (held(FRONTIER_LANTERN.item)) got.add('lantern');
  return got;
}

/** One run: its steps, its end, and what it did. */
export interface FrontierRunResult {
  steps: FrontierStep[];
  state: FrontierState;
  metrics: FrontierRunMetrics;
  /** Broken rules found (only when checked). */
  problems: string[];
}

/** Play `policyName` on `seed` until the run ends or `maxShifts` shifts have been played. */
export function playFrontierRun(
  seed: number,
  policyName: FrontierPolicyName,
  maxShifts: number,
  check = false,
): FrontierRunResult {
  const policy = makeFrontierPolicy(policyName, seed);
  let state = createFrontier(seed);
  const steps: FrontierStep[] = [];
  const problems: string[] = [];
  let healthLost = 0;
  let firstHunger = -1;
  const firsts = Object.fromEntries(FIRST_NAMES.map((n) => [n, -1])) as Record<FirstName, number>;
  const mined = { coal: 0, rawIronOre: 0, rawCopperOre: 0, crystal: 0 };
  // A safety cap on steps per shift, so a policy that never ends a shift cannot loop.
  const maxSteps = maxShifts * (FRONTIER_SHIFT.taps + 20);
  while (state.status === 'active' && state.shift <= maxShifts && steps.length < maxSteps) {
    const step = policy(state);
    if (step === null) break;
    const outcome = frontierAct(state, actionOf(step));
    if (check) problems.push(...checkStep(state, step, outcome));
    if (!outcome.done) {
      problems.push(`seed ${seed}, ${policyName}: the policy chose "${step}", which did nothing`);
      break;
    }
    if (outcome.report !== null && outcome.report.healthLost > 0) {
      healthLost += outcome.report.healthLost;
      if (firstHunger < 0) firstHunger = outcome.report.shift;
    }
    steps.push(step);
    if (outcome.tap?.kind === 'mined') {
      for (const stack of outcome.tap.gain) {
        if (stack.item in mined) mined[stack.item as keyof typeof mined] += stack.count;
      }
    }
    // A step reached in the shift it was taken in (End shift has moved on by then).
    const shift = state.shift;
    state = outcome.state;
    for (const name of reached(state)) {
      if (firsts[name] < 0) firsts[name] = shift;
    }
  }
  let deepest = 0;
  for (let y = 0; y < state.cube.size.y; y += 1) {
    for (let x = 0; x < state.cube.size.x; x += 1)
      deepest = Math.max(deepest, depthAt(state.cube, x, y));
  }
  const finalHash = hashFrontier(state);
  if (check && hashFrontier(replayFrontier(seed, steps)) !== finalHash) {
    problems.push(`seed ${seed}, ${policyName}: the run does not replay to the same hash`);
  }
  return {
    steps,
    state,
    problems,
    metrics: {
      seed,
      outcome: state.status === 'active' ? 'unfinished' : state.status,
      shifts: state.shift - 1,
      steps: steps.length,
      health: state.health,
      healthLost,
      firstHunger,
      camps: state.camps.length,
      topCampLevel: Math.max(...state.camps.map((c) => c.level)),
      blocksMined: state.mined,
      deepest,
      grassHeld: state.inventory.get('grass') ?? 0,
      coins: state.inventory.get('coin') ?? 0,
      firsts,
      mined,
      finalHash,
    },
  };
}

/** The median of a list (0 for an empty one). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** One line of the summary for a policy's runs. */
export function summaryLine(policy: string, runs: FrontierRunMetrics[]): string {
  const lost = runs.filter((r) => r.outcome === 'lost').length;
  const hungry = runs.filter((r) => r.firstHunger >= 0);
  return [
    `${policy.padEnd(9)} ${runs.length} runs`,
    `lost ${lost}`,
    `shifts ${median(runs.map((r) => r.shifts))}`,
    `health ${median(runs.map((r) => r.health))}`,
    `hungry ${hungry.length} (first at shift ${median(hungry.map((r) => r.firstHunger))})`,
    `camps ${median(runs.map((r) => r.camps))}`,
    `top level ${median(runs.map((r) => r.topCampLevel))}`,
    `mined ${median(runs.map((r) => r.blocksMined))}`,
    `deepest ${median(runs.map((r) => r.deepest))}`,
    `grass held ${median(runs.map((r) => r.grassHeld))}`,
    `coins ${median(runs.map((r) => r.coins))}`,
  ].join(' · ');
}

/**
 * A second line for a policy's runs: for each step of smelting and
 * crafting, how many runs reached it and the median shift they did, e.g.
 * "smelter 18/20 @6"; then the median ore, coal and crystal mined.
 */
export function craftLine(runs: FrontierRunMetrics[]): string {
  const parts = FIRST_NAMES.map((name) => {
    const at = runs.map((r) => r.firsts[name]).filter((s) => s >= 0);
    return `${name} ${at.length}/${runs.length}${at.length > 0 ? ` @${median(at)}` : ''}`;
  });
  const m = (key: keyof FrontierRunMetrics['mined']): number =>
    median(runs.map((r) => r.mined[key]));
  parts.push(
    `mined: coal ${m('coal')}, iron ${m('rawIronOre')}, copper ${m('rawCopperOre')}, crystal ${m('crystal')}`,
  );
  return `          ${parts.join(' · ')}`;
}

interface SimOptions {
  seed: number;
  policy: FrontierPolicyName;
  runs: number;
  maxShifts: number;
  json: boolean;
  acceptance: boolean;
}

/** Read the arguments. Throws with a message for the user on a bad one. */
export function parseSimArgs(args: string[]): SimOptions {
  const options: SimOptions = {
    seed: 1,
    policy: 'gatherer',
    runs: 1,
    maxShifts: 40,
    json: false,
    acceptance: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const number = (): number => {
      const v = args[i + 1] ?? '';
      if (!/^\d+$/.test(v)) throw new Error(`${arg ?? ''} needs a whole number`);
      i += 1;
      return Number(v);
    };
    if (arg === '--seed') options.seed = number();
    else if (arg === '--runs') options.runs = number();
    else if (arg === '--max-shifts') options.maxShifts = number();
    else if (arg === '--json') options.json = true;
    else if (arg === '--acceptance') options.acceptance = true;
    else if (arg === '--policy') {
      const name = args[i + 1] ?? '';
      if (!isFrontierPolicyName(name))
        throw new Error(`--policy must be one of ${FRONTIER_POLICY_NAMES.join(', ')}`);
      options.policy = name;
      i += 1;
    } else throw new Error(`unknown argument ${arg ?? ''}`);
  }
  return options;
}

/** Run the simulator: the text to print and the exit code. */
export function runFrontierSim(args: string[]): { output: string; exitCode: number } {
  let options: SimOptions;
  try {
    options = parseSimArgs(args);
  } catch (error) {
    return { output: `sim: ${(error as Error).message}`, exitCode: 1 };
  }
  const policies: FrontierPolicyName[] = options.acceptance
    ? [...FRONTIER_POLICY_NAMES]
    : [options.policy];
  const lines: string[] = [];
  const all: Record<string, FrontierRunMetrics[]> = {};
  const problems: string[] = [];
  for (const policy of policies) {
    const runs: FrontierRunMetrics[] = [];
    for (let i = 0; i < options.runs; i += 1) {
      const result = playFrontierRun(
        options.seed + i,
        policy,
        options.maxShifts,
        options.acceptance,
      );
      runs.push(result.metrics);
      problems.push(...result.problems);
    }
    all[policy] = runs;
    lines.push(summaryLine(policy, runs), craftLine(runs));
  }
  if (options.json) {
    const doc = {
      sim: {
        engineVersion: ENGINE_VERSION,
        firstSeed: options.seed,
        runs: options.runs,
        maxShifts: options.maxShifts,
      },
      policies: all,
      problems,
    };
    return { output: JSON.stringify(doc, null, 2), exitCode: problems.length > 0 ? 1 : 0 };
  }
  const head = `The new game, engine ${ENGINE_VERSION}: seeds ${options.seed} to ${options.seed + options.runs - 1}, at most ${options.maxShifts} shifts a run.`;
  const tail = options.acceptance
    ? problems.length === 0
      ? 'Acceptance: every rule held after every step, and every run replayed to its hash.'
      : `Acceptance: ${problems.length} problem(s):\n${problems.slice(0, 50).join('\n')}`
    : '';
  return {
    output: [head, ...lines, tail].filter((l) => l !== '').join('\n'),
    exitCode: problems.length > 0 ? 1 : 0,
  };
}

// Run from the command line (not when the tests import this file).
if (process.argv[1]?.endsWith('frontierSim.ts') === true) {
  const started = performance.now();
  const result = runFrontierSim(process.argv.slice(2));
  console.log(result.output);
  console.error(`(${((performance.now() - started) / 1000).toFixed(1)} s)`);
  process.exitCode = result.exitCode;
}
