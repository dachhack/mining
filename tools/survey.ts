// The depth survey (issue #108; owner, question 85: "Measure first").
//
// `npm run sim -- --survey depth --runs 1000` plays every policy on the same
// seeds and prints, as Markdown tables: how deep runs get, how they end, what
// they meet on the way, what a pit of each depth costs against the fuel and
// AP a run starts with, and what each of the owner's three options would
// change (tools/whatIf.ts). docs/surveys/depth-survey.md is that output with
// the reading of it written round it.
//
// The same arguments always print the same report.

import { BLOCKS, GENERATION, LOADOUTS, SHIFT, WORLD } from '../src/data';
import { ENGINE_VERSION } from '../src/engine';
import { runInParallel } from './parallel';
import { RUN_END_CAUSES } from './simRun';
import type { RunMetrics } from './simRun';
import { TERRACE_POLICY } from './terracePolicy';
import { WHAT_IFS } from './whatIf';

export interface SurveyOptions {
  firstSeed: number;
  runs: number;
  maxShifts: number;
  workers: number;
  /** Called with a line of progress now and then; the CLI prints it to stderr. */
  log: (line: string) => void;
}

/** The policies of the main tables, in the order of their columns. */
const MAIN_POLICIES = ['random', 'greedy', 'camp', 'pit', 'terrace'];
/** The target depths the terracing policy is tried with. */
const TERRACE_TARGETS = [4, 5, 6, 7, 8, 9, 10];
/** The policies each what-if trial is played with. */
const WHAT_IF_POLICIES = ['pit', 'terrace:6', 'terrace:8', 'terrace:10'];
/** A what-if trial plays this share of the survey's runs (and at least `WHAT_IF_MIN_RUNS`). */
const WHAT_IF_RUN_SHARE = 0.2;
const WHAT_IF_MIN_RUNS = 20;
/** The depths of the cost table. */
const COST_DEPTHS = [4, 6, 8, 10, 12, 16, 20];

// ---------------------------------------------------------------------------
// What a pit costs, on paper
// ---------------------------------------------------------------------------

export type PitPlacement = 'middle' | 'side' | 'corner';

/**
 * Where the bottom square of a pit is: in the middle of the map, in the
 * middle of its north side, or in its north-west corner. (By symmetry the
 * other sides and corners cost the same.)
 */
function bottomSquareOf(placement: PitPlacement): { x: number; y: number } {
  const middleX = Math.floor(WORLD.size.x / 2);
  const middleY = Math.floor(WORLD.size.y / 2);
  if (placement === 'middle') {
    return { x: middleX, y: middleY };
  }
  if (placement === 'side') {
    return { x: middleX, y: 0 };
  }
  return { x: 0, y: 0 };
}

/**
 * The depth of each ring of the cheapest pit that reaches `depth`: entry k
 * is the depth of the squares k steps from the bottom square.
 *
 * `benchEvery` is the slump limit of the material (design doc 6.1), or
 * `null` for a wall held by supports. With `null` the wall is the plain cone
 * of 1-level steps the level rule allows. With a limit L the wall climbs L
 * levels and then has one level ring, a bench, where a sliding block would
 * stop: so no square stands at the top of a fall of more than L. The
 * untouched ground round the pit counts too: it must not stand at the top of
 * a longer fall either, so a wall that ends on a full climb of L levels gets
 * one more bench, 1 level down, as its last ring.
 */
export function pitProfile(depth: number, benchEvery: number | null): number[] {
  const profile: number[] = [];
  let ringDepth = depth;
  let stepsSinceBench = 0;
  while (ringDepth > 0) {
    profile.push(ringDepth);
    if (benchEvery !== null && stepsSinceBench === benchEvery) {
      stepsSinceBench = 0; // this ring is a bench: the next ring is level with it
      continue;
    }
    ringDepth -= 1;
    stepsSinceBench += 1;
  }
  return profile;
}

/**
 * How many squares of the map each ring of the pit has: entry k is the number
 * of squares exactly k steps from the bottom square (a step is to a face
 * neighbour, so the rings are diamonds). Counted on the real map, so a ring
 * that runs off the side of the cube loses the squares that are not there.
 */
function squaresPerRing(rings: number, placement: PitPlacement): number[] {
  const bottom = bottomSquareOf(placement);
  const counts: number[] = [];
  for (let k = 0; k < rings; k += 1) {
    counts.push(0);
  }
  for (let y = 0; y < WORLD.size.y; y += 1) {
    for (let x = 0; x < WORLD.size.x; x += 1) {
      const steps = Math.abs(x - bottom.x) + Math.abs(y - bottom.y);
      if (steps < rings) {
        counts[steps] = (counts[steps] as number) + 1;
      }
    }
  }
  return counts;
}

/** Blocks to mine for the pit of `pitProfile(depth, benchEvery)` at this placement. */
export function pitBlocks(
  depth: number,
  placement: PitPlacement,
  benchEvery: number | null,
): number {
  const profile = pitProfile(depth, benchEvery);
  const squares = squaresPerRing(profile.length, placement);
  let blocks = 0;
  profile.forEach((ringDepth, steps) => {
    blocks += (squares[steps] as number) * ringDepth;
  });
  return blocks;
}

/**
 * The mean AP to mine one block of plain rock in layer `z`, from the
 * generator's rock weights (src/data/generation.ts) and the blocks' mine
 * costs. Ore veins and caverns are left out: they are a few percent of a band.
 */
export function meanMineCostOfLayer(z: number): number {
  const band = WORLD.depthBands.find((entry) => z >= entry.firstLayer && z <= entry.lastLayer);
  const bandData = GENERATION.bands.find((entry) => entry.bandId === band?.id);
  if (band === undefined || bandData === undefined) {
    throw new Error(`No depth band holds layer ${z}`);
  }
  // How far down its band the layer is: 0 at the band's first layer, 1 at its last.
  const span = band.lastLayer - band.firstLayer;
  const along = span === 0 ? 0 : (z - band.firstLayer) / span;
  let weightTotal = 0;
  let costTotal = 0;
  const blockTable: Record<string, { mineCost: number | null } | undefined> = BLOCKS;
  for (const rock of bandData.rock) {
    const weight = rock.weightAtTop + (rock.weightAtBottom - rock.weightAtTop) * along;
    const cost = blockTable[rock.block]?.mineCost ?? 0;
    weightTotal += weight;
    costTotal += weight * cost;
  }
  return costTotal / weightTotal;
}

/** The AP to mine the pit of `pitProfile(depth, benchEvery)`, at the mean cost of each layer. */
export function pitAp(depth: number, placement: PitPlacement, benchEvery: number | null): number {
  const profile = pitProfile(depth, benchEvery);
  const squares = squaresPerRing(profile.length, placement);
  let ap = 0;
  profile.forEach((ringDepth, steps) => {
    for (let z = 0; z < ringDepth; z += 1) {
      ap += (squares[steps] as number) * meanMineCostOfLayer(z);
    }
  });
  return ap;
}

// ---------------------------------------------------------------------------
// Small helpers for the tables
// ---------------------------------------------------------------------------

/** A Markdown table from a header row and the other rows. */
function table(header: string[], rows: string[][]): string {
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function median(values: number[]): number {
  const list = sorted(values);
  if (list.length === 0) {
    return 0;
  }
  const middle = Math.floor(list.length / 2);
  return list.length % 2 === 1
    ? (list[middle] as number)
    : ((list[middle - 1] as number) + (list[middle] as number)) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

/** "median (min to max)" of a list of whole numbers. */
function medianAndRange(values: number[]): string {
  const list = sorted(values);
  if (list.length === 0) {
    return '-';
  }
  return `${median(list)} (${list[0]} to ${list[list.length - 1]})`;
}

/** How many runs pass the test, as "n (p%)". */
function share(runs: RunMetrics[], test: (run: RunMetrics) => boolean): string {
  const count = runs.filter(test).length;
  if (runs.length === 0) {
    return '0';
  }
  const percent = (100 * count) / runs.length;
  // One decimal place only where the share is small and not zero.
  const text = percent > 0 && percent < 10 ? percent.toFixed(1) : percent.toFixed(0);
  return `${count} (${text}%)`;
}

function whole(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

function outcomesTable(results: Map<string, RunMetrics[]>, policies: string[]): string {
  const header = [
    'Policy',
    'Runs',
    'Deepest square: median (min to max)',
    'mean',
    'Shifts played: median (min to max)',
    'Blocks mined: median (min to max)',
    'Trees cut: median',
  ];
  const rows = policies.map((policy) => {
    const runs = results.get(policy) ?? [];
    return [
      policy,
      String(runs.length),
      medianAndRange(runs.map((run) => run.deepestSquare)),
      mean(runs.map((run) => run.deepestSquare)).toFixed(2),
      medianAndRange(runs.map((run) => run.shiftsPlayed)),
      medianAndRange(runs.map((run) => run.blocksMined)),
      String(median(runs.map((run) => run.treesCut))),
    ];
  });
  return table(header, rows);
}

const CAUSE_HEADINGS: Record<string, string> = {
  mineClosed: 'Mine closed (alive)',
  outOfFuel: 'Out of fuel',
  buried: 'Crew lost: buried',
  drowned: 'Crew lost: drowned',
  burned: 'Crew lost: burned',
  poisoned: 'Crew lost: poisoned',
  shiftCap: 'Still going at the shift cap',
};

function endingsTable(results: Map<string, RunMetrics[]>, policies: string[]): string {
  const header = ['Policy', ...RUN_END_CAUSES.map((cause) => CAUSE_HEADINGS[cause] ?? cause)];
  const rows = policies.map((policy) => {
    const runs = results.get(policy) ?? [];
    return [
      policy,
      ...RUN_END_CAUSES.map((cause) => String(runs.filter((run) => run.cause === cause).length)),
    ];
  });
  return table(header, rows);
}

function depthDistributionTable(results: Map<string, RunMetrics[]>, policies: string[]): string {
  let deepest = 0;
  for (const policy of policies) {
    for (const run of results.get(policy) ?? []) {
      deepest = Math.max(deepest, run.deepestSquare);
    }
  }
  const rows: string[][] = [];
  for (let depth = 0; depth <= deepest; depth += 1) {
    rows.push([
      String(depth),
      ...policies.map((policy) =>
        String((results.get(policy) ?? []).filter((run) => run.deepestSquare === depth).length),
      ),
    ]);
  }
  return table(['Deepest square', ...policies], rows);
}

function metTable(results: Map<string, RunMetrics[]>, policies: string[]): string {
  const header = [
    'Policy',
    'Saw mineral traces',
    'Mined iron, copper or crystal',
    'A block cracked',
    'A block slumped',
    'Broke into a cavern',
    'Saw damp stone',
    'Released water',
    'Saw pitted rock',
    'Released gas',
    'Saw warm glow',
    'Released lava',
    'Saw unstable ore',
    'Crew was hurt',
  ];
  const rows = policies.map((policy) => {
    const runs = results.get(policy) ?? [];
    return [
      policy,
      share(runs, (run) => run.tracesSeen),
      share(runs, (run) => run.oreBlocksMined > 0),
      share(runs, (run) => run.hazards.blocksCracked > 0),
      share(runs, (run) => run.hazards.blocksSlumped > 0),
      share(runs, (run) => run.hazards.cavernsBroken > 0),
      share(runs, (run) => run.tellsSeen.dampStone),
      share(runs, (run) => run.hazards.waterPocketsBroken > 0),
      share(runs, (run) => run.tellsSeen.pittedRock),
      share(runs, (run) => run.hazards.gasPocketsBroken > 0),
      share(runs, (run) => run.tellsSeen.warmGlow),
      share(runs, (run) => run.hazards.lavaPocketsBroken > 0),
      share(runs, (run) => run.hazards.unstableOreSeen > 0 || run.tellsSeen.hairlineGlow),
      share(runs, (run) => run.damageTaken > 0),
    ];
  });
  return table(header, rows);
}

/** The target depth in a policy name 'terrace:N'; the default for plain 'terrace'. */
function targetOf(policyName: string): number {
  const text = policyName.split(':')[1];
  return text === undefined ? TERRACE_POLICY.targetDepth : Number(text);
}

function terraceTable(results: Map<string, RunMetrics[]>, policies: string[]): string {
  const header = [
    'Target depth',
    'Runs that reached it',
    'Deepest square: median (min to max)',
    'Shifts played: median (min to max)',
    'Blocks mined: median',
    'Fuel made from coal: mean',
    'Supports placed: mean',
    'Trees cut: median',
    'Crew was hurt',
  ];
  const rows = policies.map((policy) => {
    const runs = results.get(policy) ?? [];
    const target = targetOf(policy);
    return [
      String(target),
      share(runs, (run) => run.deepestSquare >= target),
      medianAndRange(runs.map((run) => run.deepestSquare)),
      medianAndRange(runs.map((run) => run.shiftsPlayed)),
      String(median(runs.map((run) => run.blocksMined))),
      mean(runs.map((run) => run.itemsCrafted['fuel'] ?? 0)).toFixed(1),
      mean(runs.map((run) => run.structuresPlaced['support'] ?? 0)).toFixed(1),
      String(median(runs.map((run) => run.treesCut))),
      share(runs, (run) => run.damageTaken > 0),
    ];
  });
  return table(header, rows);
}

function costTable(): string {
  const fuel = LOADOUTS.standard.fuel;
  const startAp = fuel * SHIFT.apPerShift;
  const header = [
    'Depth',
    'Where',
    'Steepest pit, walls held by supports: blocks',
    'AP',
    'Benched for stone (limit 2): blocks',
    'AP',
    'Benched for dirt (limit 1): blocks',
    'AP',
    'Steepest pit as a share of the starting AP',
  ];
  const rows: string[][] = [];
  for (const depth of COST_DEPTHS) {
    for (const placement of ['corner', 'side', 'middle'] as const) {
      const steepAp = pitAp(depth, placement, null);
      rows.push([
        String(depth),
        placement,
        whole(pitBlocks(depth, placement, null)),
        whole(steepAp),
        whole(pitBlocks(depth, placement, BLOCKS.stone.slumpLimit)),
        whole(pitAp(depth, placement, BLOCKS.stone.slumpLimit)),
        whole(pitBlocks(depth, placement, BLOCKS.dirt.slumpLimit)),
        whole(pitAp(depth, placement, BLOCKS.dirt.slumpLimit)),
        `${(steepAp / startAp).toFixed(1)} x`,
      ]);
    }
  }
  return table(header, rows);
}

function layerCostTable(): string {
  const rows: string[][] = [];
  for (const z of [0, 2, 4, 6, 7, 8, 12, 16, 19, 20, 26, 31]) {
    rows.push([String(z), meanMineCostOfLayer(z).toFixed(2)]);
  }
  return table(['Layer', 'Mean AP to mine one block of its rock'], rows);
}

function whatIfTable(
  results: Map<string, RunMetrics[]>,
  trials: { id: string; label: string; middleStart: number }[],
): string {
  const header = [
    'Trial',
    'Policy',
    'Deepest square: median (min to max)',
    'Reached the middle band',
    'Saw damp stone or pitted rock',
    'Released water or gas',
    'Mined iron or copper',
    'Crew was hurt',
    'Crew lost',
    'Shifts played: median',
  ];
  const rows: string[][] = [];
  for (const trial of trials) {
    for (const policy of WHAT_IF_POLICIES) {
      const runs = results.get(`${trial.id} ${policy}`) ?? [];
      rows.push([
        trial.label,
        policy,
        medianAndRange(runs.map((run) => run.deepestSquare)),
        share(runs, (run) => run.deepestSquare >= trial.middleStart),
        share(runs, (run) => run.tellsSeen.dampStone || run.tellsSeen.pittedRock),
        share(
          runs,
          (run) => run.hazards.waterPocketsBroken > 0 || run.hazards.gasPocketsBroken > 0,
        ),
        share(runs, (run) => run.oreBlocksMined > 0),
        share(runs, (run) => run.damageTaken > 0),
        share(runs, (run) => run.outcome === 'lost' && run.cause !== 'outOfFuel'),
        String(median(runs.map((run) => run.shiftsPlayed))),
      ]);
    }
  }
  return table(header, rows);
}

/**
 * One row per trial: the best any of the trial's policies did on each count.
 * "Best" is taken column by column, so the cells of a row may come from
 * different policies; table 8 has every policy's own row.
 */
function whatIfSummaryTable(
  results: Map<string, RunMetrics[]>,
  trials: { id: string; label: string; middleStart: number }[],
): string {
  const header = [
    'Trial',
    'Reached the middle band: best policy',
    'Saw damp stone or pitted rock: best',
    'Released water or gas: best',
    'Mined iron or copper: best',
    'Crew was hurt: most',
    'Crew lost: most',
  ];
  const rows = trials.map((trial) => {
    /** The policy with the most runs that pass the test, as "n of N (p%), policy". */
    function best(test: (run: RunMetrics) => boolean): string {
      let bestPolicy = '';
      let bestCount = -1;
      let runCount = 0;
      for (const policy of WHAT_IF_POLICIES) {
        const runs = results.get(`${trial.id} ${policy}`) ?? [];
        const count = runs.filter(test).length;
        if (count > bestCount) {
          bestCount = count;
          bestPolicy = policy;
          runCount = runs.length;
        }
      }
      if (bestCount <= 0) {
        return '0';
      }
      return `${((100 * bestCount) / runCount).toFixed(0)}% (${bestPolicy})`;
    }
    return [
      trial.label,
      best((run) => run.deepestSquare >= trial.middleStart),
      best((run) => run.tellsSeen.dampStone || run.tellsSeen.pittedRock),
      best((run) => run.hazards.waterPocketsBroken > 0 || run.hazards.gasPocketsBroken > 0),
      best((run) => run.oreBlocksMined > 0),
      best((run) => run.damageTaken > 0),
      best((run) => run.outcome === 'lost' && run.cause !== 'outOfFuel'),
    ];
  });
  return table(header, rows);
}

// ---------------------------------------------------------------------------
// The survey
// ---------------------------------------------------------------------------

/** Play the whole depth survey and return its report as Markdown. */
export async function runDepthSurvey(options: SurveyOptions): Promise<string> {
  const results = new Map<string, RunMetrics[]>();
  const problems: string[] = [];

  /** Play one policy on the survey's seeds (or the first `runs` of them) and keep the result under `key`. */
  async function play(
    key: string,
    policyName: string,
    runs: number,
    whatIf: string | null,
  ): Promise<void> {
    options.log(`survey: ${key}: ${runs} runs`);
    const result = await runInParallel(
      {
        policyName,
        firstSeed: options.firstSeed,
        runs,
        maxShifts: options.maxShifts,
        kit: false,
        check: false,
        whatIf,
      },
      options.workers,
    );
    results.set(key, result.runs);
    problems.push(...result.problems);
  }

  for (const policy of MAIN_POLICIES) {
    await play(policy, policy, options.runs, null);
  }
  const terracePolicies = TERRACE_TARGETS.map((target) => `terrace:${target}`);
  for (const policy of terracePolicies) {
    await play(policy, policy, options.runs, null);
  }

  // The what-if trials, and the game as it is on the same (fewer) seeds.
  const whatIfRuns = Math.min(
    options.runs,
    Math.max(WHAT_IF_MIN_RUNS, Math.round(options.runs * WHAT_IF_RUN_SHARE)),
  );
  const middleNow = WORLD.depthBands.find((band) => band.id === 'middle')?.firstLayer ?? 0;
  const trials = [
    {
      id: 'now',
      label: 'The game as it is',
      middleStart: middleNow,
      whatIf: null as string | null,
    },
    ...WHAT_IFS.map((whatIf) => ({
      id: whatIf.id,
      label: `(${whatIf.option}) ${whatIf.label}`,
      middleStart: whatIf.middleBandStart ?? middleNow,
      whatIf: whatIf.id as string | null,
    })),
  ];
  for (const trial of trials) {
    for (const policy of WHAT_IF_POLICIES) {
      await play(`${trial.id} ${policy}`, policy, whatIfRuns, trial.whatIf);
    }
  }

  const lastSeed = options.firstSeed + options.runs - 1;
  const fuel = LOADOUTS.standard.fuel;
  const sections = [
    `Depth survey: engine ${ENGINE_VERSION}, seeds ${options.firstSeed} to ${lastSeed} (${options.runs} runs for each policy), standard loadout, shift cap ${options.maxShifts}.`,
    '### Table 1. How deep runs get',
    'The deepest square is the most levels any one square went down by mining. 0 is untouched ground; the middle band, where water, gas, iron and copper begin, starts at 8.',
    outcomesTable(results, MAIN_POLICIES),
    '### Table 2. How runs end',
    endingsTable(results, MAIN_POLICIES),
    '### Table 3. The deepest square, run by run',
    'Each cell is the number of runs whose deepest square was at that depth.',
    depthDistributionTable(results, MAIN_POLICIES),
    '### Table 4. What runs met',
    'Each cell is the number of runs in which it happened at least once.',
    metTable(results, MAIN_POLICIES),
    '### Table 5. The terracing policy, by the depth it plans for',
    `The terracing policy plans its pit for one target depth and closes the mine when the pit is finished, so no run goes deeper than its target. The \`terrace\` column of tables 1 to 4 is target ${TERRACE_POLICY.targetDepth}.`,
    terraceTable(results, terracePolicies),
    '### Table 6. What a pit costs, on paper',
    `A run starts with ${fuel} fuel: ${fuel} shifts of ${SHIFT.apPerShift} AP, ${fuel * SHIFT.apPerShift} AP in all. One coal block costs ${BLOCKS.coalSeam.mineCost} AP to mine and 1 AP to craft, and gives 3 more shifts. The table is arithmetic, not simulation: blocks in the cheapest pit that reaches each depth, and the AP to mine them at the mean cost of each layer's rock. It leaves out trees (2 AP each), supports (2 AP each, plus the timber and stone), and coal found on the way.`,
    costTable(),
    layerCostTable(),
    '### Table 7. What each option would change: the best result of each trial',
    `Each trial changes one set of numbers in the simulator's memory only (tools/whatIf.ts) and plays seeds ${options.firstSeed} to ${options.firstSeed + whatIfRuns - 1} (${whatIfRuns} runs) with each of the policies ${WHAT_IF_POLICIES.join(', ')}. Each cell is the share of runs for the policy that did best on that count, with its name. "Reached the middle band" means the deepest square reached the first layer of the middle band as that trial has it.`,
    whatIfSummaryTable(results, trials),
    '### Table 8. What each option would change: every policy',
    `The same trials, one row for each policy (${whatIfRuns} runs a row).`,
    whatIfTable(results, trials),
  ];
  if (problems.length > 0) {
    sections.push('### Problems', ...problems.map((problem) => `- ${problem}`));
  }
  return sections.join('\n\n');
}
