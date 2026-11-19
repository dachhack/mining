// Playing whole runs headlessly and measuring them. `tools/sim.ts` is the
// command line on top of this; the tests and `tools/golden.ts` use it too.
//
// Everything here goes through the engine's public surface.

import { BLOCKS, FIELD_RECIPES, ITEMS, SHIFT, STRUCTURES, TELLS } from '../src/data';
import {
  ENGINE_VERSION,
  actionKey,
  applyAction,
  cellIndex,
  createRun,
  endShift,
  hashState,
  inventoryEntries,
  isRunActive,
  legalActions,
  visibleMineralTraces,
} from '../src/engine';
import type { GameEvent, GameState } from '../src/engine';
import { decisionKey } from './policies';
import type { Policy } from './policies';

/** Mean, smallest and largest of a list of numbers. All 0 for an empty list. */
export interface Spread {
  mean: number;
  min: number;
  max: number;
}

/** A `Spread` with the median as well. */
export interface SpreadWithMedian extends Spread {
  median: number;
}

/** What one run did. See the JSON shape at the top of tools/sim.ts. */
export interface RunMetrics {
  seed: number;
  policy: string;
  /** 'salvage' or 'death' as the engine reports them, or 'unfinished' at the shift cap. */
  outcome: string;
  /**
   * 'left' or 'outOfFuel' as the engine reports them; 'shiftCap' for a
   * run stopped at `maxShifts`; or 'cutShort' for one stopped at
   * `maxDecisions` (which `npm run sim` never sets, so it never prints it).
   */
  cause: string;
  /** Shifts started, counting the one the run ended in. */
  shiftsPlayed: number;
  /** Actions taken, not counting ends of shift. */
  actionsTaken: number;
  /** The deepest layer the avatar stood in; -1 if it never left the surface. */
  deepestLayer: number;
  blocksMined: number;
  /** `blocksMined` divided by the number of cells in the cube (0.02 is 2%). */
  shareOfCubeMined: number;
  /** How many of the mined blocks were ore that gives mineral traces (iron, copper, crystal). */
  oreBlocksMined: number;
  /**
   * Did the player see mineral traces (decision note 0012) on any block before
   * the first such ore block was mined? In a run that mined none, whether
   * traces were seen at all.
   */
  tracesSeenBeforeFirstOre: boolean;
  /** The number of legal actions at the start of each player phase (full AP). */
  legalActionsPerPhase: Spread;
  /** The number of legal actions each time the policy was asked to choose. */
  legalActionsPerDecision: Spread;
  /** Recipe id -> times crafted. Every field recipe is listed, so unused ones show 0. */
  recipesUsed: Record<string, number>;
  /** Item or gauge id -> amount made by crafting (3 per fuel craft, and so on). */
  itemsCrafted: Record<string, number>;
  /** Structure id -> number placed. */
  structuresPlaced: Record<string, number>;
  damageTaken: number;
  healthAtEnd: number;
  fuelAtEnd: number;
  lampOilAtEnd: number;
  /** Shifts that began with 0 fuel, that is, fuel was 0 after the upkeep before them. */
  shiftsAtZeroFuel: number;
  /** Shifts that began with the lamp out, that is, lamp oil was 0 after the upkeep before them. */
  shiftsInTheDark: number;
  /** Item id -> count carried at the end. Every item is listed, so absent ones show 0. */
  finalInventory: Record<string, number>;
  /** `hashState` of the final state. */
  finalHash: string;
}

export interface RunResult {
  metrics: RunMetrics;
  /** Every decision the policy made, as `decisionKey` strings, in order. */
  decisions: string[];
  finalState: GameState;
}

export interface PlayOptions {
  seed: number;
  contractId: string;
  loadoutId: string;
  policy: Policy;
  /** Stop after this many shifts if the run has not ended by itself. */
  maxShifts: number;
  /**
   * Stop after this many decisions, however many shifts that is. Optional;
   * used to cut a run short on purpose (tests, golden runs).
   */
  maxDecisions?: number;
}

/** Decisions per shift beyond which a run is taken to be looping, and stopped with an error. */
const RUNAWAY_DECISIONS_PER_SHIFT = 1000;

function spreadOf(values: number[]): Spread {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0 };
  }
  let total = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    total += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { mean: total / values.length, min, max };
}

function spreadWithMedianOf(values: number[]): SpreadWithMedian {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  let median = 0;
  if (sorted.length > 0) {
    median =
      sorted.length % 2 === 1
        ? (sorted[middle] as number)
        : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
  }
  return { ...spreadOf(values), median };
}

/** A dict with every key set to 0. */
function zeroCounts(keys: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of keys) {
    counts[key] = 0;
  }
  return counts;
}

function addCount(counts: Record<string, number>, key: string, amount: number): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

/** The id an item or gauge made by a recipe is counted under. */
function recipeOutputId(recipeId: string): { id: string; amount: number } {
  const recipe = FIELD_RECIPES.find((candidate) => candidate.id === recipeId);
  if (recipe === undefined) {
    throw new Error(`The engine crafted an unknown recipe: ${recipeId}`);
  }
  return recipe.output.kind === 'item'
    ? { id: recipe.output.item, amount: recipe.output.count }
    : { id: recipe.output.gauge, amount: recipe.output.amount };
}

/** The codes of the ore blocks that give mineral traces. */
function traceSourceCodes(): Set<number> {
  const table: Record<string, { code: number } | undefined> = BLOCKS;
  const codes = new Set<number>();
  for (const blockId of TELLS.mineralTraces.sourceBlocks) {
    const def = table[blockId];
    if (def !== undefined) {
      codes.add(def.code);
    }
  }
  return codes;
}

function structureIdByCode(code: number): string {
  for (const [id, def] of Object.entries(STRUCTURES)) {
    if (def.code === code) {
      return id;
    }
  }
  return `structure${code}`;
}

/**
 * Play one run from start to finish (or to a cap) and measure it.
 *
 * Throws whatever the engine or the policy throws; the caller decides whether
 * that is a crash to report.
 */
export function playRun(options: PlayOptions): RunResult {
  let state = createRun(options.seed, options.contractId, options.loadoutId);
  const policy = options.policy;
  const decisions: string[] = [];

  const recipesUsed = zeroCounts(FIELD_RECIPES.map((recipe) => recipe.id));
  const itemsCrafted = zeroCounts(FIELD_RECIPES.map((recipe) => recipeOutputId(recipe.id).id));
  const structuresPlaced = zeroCounts(Object.keys(STRUCTURES));
  const legalAtPhaseStart: number[] = [];
  const legalAtDecision: number[] = [];
  let blocksMined = 0;
  const oreCodes = traceSourceCodes();
  let oreBlocksMined = 0;
  // `createRun` gives no events, so look once at what the start shows. After
  // that the `mineralTracesSeen` events say when traces are first seen.
  let tracesSeenBeforeFirstOre = visibleMineralTraces(state).length > 0;
  let damageTaken = 0;
  let actionsTaken = 0;
  let shiftsAtZeroFuel = 0;
  let shiftsInTheDark = 0;
  let deepestLayer = state.avatar.pos.z;
  let atPhaseStart = true;
  let hitShiftCap = false;

  /** Count what one step's events say happened. */
  function record(events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'blockMined') {
        blocksMined += 1;
        if (oreCodes.has(event.block)) {
          oreBlocksMined += 1;
        }
      } else if (event.type === 'mineralTracesSeen') {
        // Events come in the order things happened, so traces seen in the
        // same step as the first ore was mined, but after it, do not count.
        if (oreBlocksMined === 0) {
          tracesSeenBeforeFirstOre = true;
        }
      } else if (event.type === 'crafted') {
        addCount(recipesUsed, event.recipe, 1);
        const output = recipeOutputId(event.recipe);
        addCount(itemsCrafted, output.id, output.amount);
      } else if (event.type === 'structurePlaced') {
        addCount(structuresPlaced, structureIdByCode(event.structure), 1);
      } else if (event.type === 'damageTaken') {
        damageTaken += event.amount;
      }
    }
  }

  while (isRunActive(state)) {
    const shiftsStarted = state.shift - SHIFT.firstShiftNumber + 1;
    if (shiftsStarted > options.maxShifts) {
      hitShiftCap = true;
      break;
    }
    if (options.maxDecisions !== undefined && decisions.length >= options.maxDecisions) {
      break;
    }
    if (decisions.length > options.maxShifts * RUNAWAY_DECISIONS_PER_SHIFT) {
      throw new Error(
        `Run with seed ${options.seed} made ${decisions.length} decisions in ${shiftsStarted} shifts; the policy is looping`,
      );
    }

    const legalCount = legalActions(state).length;
    legalAtDecision.push(legalCount);
    if (atPhaseStart) {
      legalAtPhaseStart.push(legalCount);
      atPhaseStart = false;
    }

    const decision = policy.decide(state);
    decisions.push(decisionKey(decision));
    if (decision === 'endShift') {
      const result = endShift(state);
      state = result.state;
      record(result.events);
      atPhaseStart = true;
      if (isRunActive(state) && state.fuel === 0) {
        shiftsAtZeroFuel += 1;
      }
      if (isRunActive(state) && state.lampOil === 0) {
        shiftsInTheDark += 1;
      }
    } else {
      const result = applyAction(state, decision);
      state = result.state;
      record(result.events);
      actionsTaken += 1;
    }
    deepestLayer = Math.max(deepestLayer, state.avatar.pos.z);
  }

  // The run ended by itself, hit the shift cap, or was cut short on purpose.
  let outcome = 'unfinished';
  let cause = hitShiftCap ? 'shiftCap' : 'cutShort';
  if (state.status.kind === 'ended') {
    outcome = state.status.outcome;
    cause = state.status.cause;
  }
  // At the shift cap, `state.shift` is the shift that was not played.
  const shiftsStarted = state.shift - SHIFT.firstShiftNumber + 1;
  const shiftsPlayed = hitShiftCap ? options.maxShifts : shiftsStarted;

  const finalInventory = zeroCounts(Object.keys(ITEMS));
  for (const entry of inventoryEntries(state)) {
    finalInventory[entry.item] = entry.count;
  }
  // `cellIndex` of the last cell, plus 1, is the number of cells in the cube.
  const lastCell = { x: state.size.x - 1, y: state.size.y - 1, z: state.size.z - 1 };
  const cubeCells = cellIndex(state.size, lastCell) + 1;

  const metrics: RunMetrics = {
    seed: options.seed,
    policy: policy.name,
    outcome,
    cause,
    shiftsPlayed,
    actionsTaken,
    deepestLayer,
    blocksMined,
    shareOfCubeMined: blocksMined / cubeCells,
    oreBlocksMined,
    tracesSeenBeforeFirstOre,
    legalActionsPerPhase: spreadOf(legalAtPhaseStart),
    legalActionsPerDecision: spreadOf(legalAtDecision),
    recipesUsed,
    itemsCrafted,
    structuresPlaced,
    damageTaken,
    healthAtEnd: state.avatar.health,
    fuelAtEnd: state.fuel,
    lampOilAtEnd: state.lampOil,
    shiftsAtZeroFuel,
    shiftsInTheDark,
    finalInventory,
    finalHash: hashState(state),
  };
  return { metrics, decisions, finalState: state };
}

// ---------------------------------------------------------------------------
// Many runs
// ---------------------------------------------------------------------------

/** The numbers for a set of runs taken together. */
export interface AggregateMetrics {
  runs: number;
  /** Outcome -> number of runs. 'salvage', 'death' and 'unfinished' are always listed. */
  outcomes: Record<string, number>;
  /** Cause -> number of runs. 'left', 'outOfFuel' and 'shiftCap' are always listed. */
  causes: Record<string, number>;
  shiftsPlayed: SpreadWithMedian;
  deepestLayer: SpreadWithMedian;
  blocksMined: SpreadWithMedian;
  shareOfCubeMined: SpreadWithMedian;
  /** Runs that mined at least one ore block that gives mineral traces. */
  runsThatMinedOre: number;
  /** Runs in which traces were seen before the first ore was mined (or at all, if none was). */
  runsWithTracesSeenBeforeFirstOre: number;
  /** Runs counted in both of the two lines above: ore was mined, and traces were seen first. */
  runsThatMinedOreAfterSeeingTraces: number;
  /** Mean of the runs' means, smallest of their minimums, largest of their maximums. */
  legalActionsPerPhase: Spread;
  legalActionsPerDecision: Spread;
  /** Recipe id -> total crafts over all runs, and how many runs crafted it at least once. */
  recipesUsed: Record<string, { crafts: number; runs: number }>;
  /** Item or gauge id -> total amount crafted over all runs. */
  itemsCrafted: Record<string, number>;
  /** Structure id -> total placed over all runs. */
  structuresPlaced: Record<string, number>;
  fuelAtEnd: SpreadWithMedian;
  shiftsAtZeroFuel: SpreadWithMedian;
  /** Runs with at least one shift at 0 fuel. */
  runsWithAShiftAtZeroFuel: number;
  /** Shifts begun with the lamp out, per run. */
  shiftsInTheDark: SpreadWithMedian;
  /** Runs with at least one shift begun with the lamp out. */
  runsWithAShiftInTheDark: number;
  /** Item id -> mean count carried at the end of a run. */
  finalInventoryMean: Record<string, number>;
}

/** The whole document `npm run sim -- --json` prints. */
export interface SimReport {
  sim: {
    engineVersion: string;
    policy: string;
    firstSeed: number;
    runs: number;
    maxShifts: number;
    contractId: string;
    loadoutId: string;
  };
  aggregate: AggregateMetrics;
  runs: RunMetrics[];
}

function combineSpreads(spreads: Spread[]): Spread {
  if (spreads.length === 0) {
    return { mean: 0, min: 0, max: 0 };
  }
  return {
    mean: spreadOf(spreads.map((spread) => spread.mean)).mean,
    min: Math.min(...spreads.map((spread) => spread.min)),
    max: Math.max(...spreads.map((spread) => spread.max)),
  };
}

export function aggregate(runs: RunMetrics[]): AggregateMetrics {
  const outcomes = zeroCounts(['salvage', 'death', 'unfinished']);
  const causes = zeroCounts(['left', 'outOfFuel', 'shiftCap']);
  const recipesUsed: Record<string, { crafts: number; runs: number }> = {};
  for (const recipe of FIELD_RECIPES) {
    recipesUsed[recipe.id] = { crafts: 0, runs: 0 };
  }
  const itemsCrafted = zeroCounts(FIELD_RECIPES.map((recipe) => recipeOutputId(recipe.id).id));
  const structuresPlaced = zeroCounts(Object.keys(STRUCTURES));
  const inventoryTotals = zeroCounts(Object.keys(ITEMS));

  for (const run of runs) {
    addCount(outcomes, run.outcome, 1);
    addCount(causes, run.cause, 1);
    for (const [recipeId, crafts] of Object.entries(run.recipesUsed)) {
      const entry = recipesUsed[recipeId] ?? { crafts: 0, runs: 0 };
      entry.crafts += crafts;
      entry.runs += crafts > 0 ? 1 : 0;
      recipesUsed[recipeId] = entry;
    }
    for (const [id, amount] of Object.entries(run.itemsCrafted)) {
      addCount(itemsCrafted, id, amount);
    }
    for (const [id, count] of Object.entries(run.structuresPlaced)) {
      addCount(structuresPlaced, id, count);
    }
    for (const [item, count] of Object.entries(run.finalInventory)) {
      addCount(inventoryTotals, item, count);
    }
  }

  const finalInventoryMean: Record<string, number> = {};
  for (const [item, total] of Object.entries(inventoryTotals)) {
    finalInventoryMean[item] = runs.length === 0 ? 0 : total / runs.length;
  }

  return {
    runs: runs.length,
    outcomes,
    causes,
    shiftsPlayed: spreadWithMedianOf(runs.map((run) => run.shiftsPlayed)),
    deepestLayer: spreadWithMedianOf(runs.map((run) => run.deepestLayer)),
    blocksMined: spreadWithMedianOf(runs.map((run) => run.blocksMined)),
    shareOfCubeMined: spreadWithMedianOf(runs.map((run) => run.shareOfCubeMined)),
    runsThatMinedOre: runs.filter((run) => run.oreBlocksMined > 0).length,
    runsWithTracesSeenBeforeFirstOre: runs.filter((run) => run.tracesSeenBeforeFirstOre).length,
    runsThatMinedOreAfterSeeingTraces: runs.filter(
      (run) => run.oreBlocksMined > 0 && run.tracesSeenBeforeFirstOre,
    ).length,
    legalActionsPerPhase: combineSpreads(runs.map((run) => run.legalActionsPerPhase)),
    legalActionsPerDecision: combineSpreads(runs.map((run) => run.legalActionsPerDecision)),
    recipesUsed,
    itemsCrafted,
    structuresPlaced,
    fuelAtEnd: spreadWithMedianOf(runs.map((run) => run.fuelAtEnd)),
    shiftsAtZeroFuel: spreadWithMedianOf(runs.map((run) => run.shiftsAtZeroFuel)),
    runsWithAShiftAtZeroFuel: runs.filter((run) => run.shiftsAtZeroFuel > 0).length,
    shiftsInTheDark: spreadWithMedianOf(runs.map((run) => run.shiftsInTheDark)),
    runsWithAShiftInTheDark: runs.filter((run) => run.shiftsInTheDark > 0).length,
    finalInventoryMean,
  };
}

export interface SimOptions {
  policyName: string;
  firstSeed: number;
  runs: number;
  maxShifts: number;
  contractId: string;
  loadoutId: string;
  /** Makes the policy for one run from its seed. */
  makePolicy: (name: string, seed: number) => Policy;
}

/**
 * Play `runs` runs with seeds `firstSeed`, `firstSeed + 1`, ... and report on
 * them. The same options always give the same report.
 */
export function simulate(options: SimOptions): SimReport {
  const runs: RunMetrics[] = [];
  for (let i = 0; i < options.runs; i += 1) {
    const seed = options.firstSeed + i;
    const result = playRun({
      seed,
      contractId: options.contractId,
      loadoutId: options.loadoutId,
      policy: options.makePolicy(options.policyName, seed),
      maxShifts: options.maxShifts,
    });
    runs.push(result.metrics);
  }
  return {
    sim: {
      engineVersion: ENGINE_VERSION,
      policy: options.policyName,
      firstSeed: options.firstSeed,
      runs: options.runs,
      maxShifts: options.maxShifts,
      contractId: options.contractId,
      loadoutId: options.loadoutId,
    },
    aggregate: aggregate(runs),
    runs,
  };
}

// ---------------------------------------------------------------------------
// The human-readable summary
// ---------------------------------------------------------------------------

function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

function spreadLine(spread: SpreadWithMedian, digits: number): string {
  return `mean ${fixed(spread.mean, digits)}, median ${fixed(spread.median, digits)}, min ${fixed(spread.min, digits)}, max ${fixed(spread.max, digits)}`;
}

function countsLine(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');
}

/** The short summary `npm run sim` prints without `--json`. */
export function formatSummary(report: SimReport): string {
  const a = report.aggregate;
  const percent = (share: number): number => share * 100;
  const share = a.shareOfCubeMined;
  const lines = [
    `sim: ${report.sim.runs} runs, policy ${report.sim.policy}, seeds ${report.sim.firstSeed}-${report.sim.firstSeed + report.sim.runs - 1}, shift cap ${report.sim.maxShifts}`,
    `outcomes:           ${countsLine(a.outcomes)}`,
    `causes:             ${countsLine(a.causes)}`,
    `shifts played:      ${spreadLine(a.shiftsPlayed, 1)}`,
    `deepest layer:      ${spreadLine(a.deepestLayer, 1)}   (-1 is the surface)`,
    `blocks mined:       ${spreadLine(a.blocksMined, 1)}`,
    `share of cube (%):  mean ${fixed(percent(share.mean), 3)}, median ${fixed(percent(share.median), 3)}, min ${fixed(percent(share.min), 3)}, max ${fixed(percent(share.max), 3)}`,
    `mineral traces:     seen before the first ore was mined (or at all, if none was) in ${a.runsWithTracesSeenBeforeFirstOre} runs; ore mined in ${a.runsThatMinedOre} runs, ${a.runsThatMinedOreAfterSeeingTraces} of them after seeing traces`,
    `legal actions at the start of a player phase: mean ${fixed(a.legalActionsPerPhase.mean, 1)}, min ${a.legalActionsPerPhase.min}, max ${a.legalActionsPerPhase.max}`,
    `legal actions per decision:                   mean ${fixed(a.legalActionsPerDecision.mean, 1)}, min ${a.legalActionsPerDecision.min}, max ${a.legalActionsPerDecision.max}`,
    `recipes used (crafts / runs that used it): ${Object.entries(a.recipesUsed)
      .map(([id, entry]) => `${id} ${entry.crafts}/${entry.runs}`)
      .join(', ')}`,
    `items crafted:      ${countsLine(a.itemsCrafted)}`,
    `structures placed:  ${countsLine(a.structuresPlaced)}`,
    `fuel at end:        ${spreadLine(a.fuelAtEnd, 1)}`,
    `shifts at 0 fuel:   ${spreadLine(a.shiftsAtZeroFuel, 2)}; runs with at least one: ${a.runsWithAShiftAtZeroFuel}`,
    `shifts in the dark: ${spreadLine(a.shiftsInTheDark, 2)}; runs with at least one: ${a.runsWithAShiftInTheDark}   (shifts begun with the lamp out)`,
    `final inventory (mean per run): ${Object.entries(a.finalInventoryMean)
      .map(([item, mean]) => `${item} ${fixed(mean, 2)}`)
      .join(', ')}`,
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Recorded runs
// ---------------------------------------------------------------------------

/** A golden run as stored in tests/golden/*.json. See tests/golden/README.md. */
export interface GoldenRun {
  /** What the run is, in a sentence. */
  description: string;
  seed: number;
  contractId: string;
  loadoutId: string;
  /** The policy that first produced the decisions. For the reader only; a replay does not use it. */
  recordedWith: string;
  /** 'active', or 'ended: <outcome>, <cause>'. Checked along with the hash, and easier to read. */
  expectedStatus: string;
  /** `hashState` of the state after the last decision. */
  expectedHash: string;
  /** Every decision in order: 'endShift', or the engine's `actionKey` of an action. */
  decisions: string[];
}

/** The run status in the words a golden file uses. */
export function statusText(state: GameState): string {
  return state.status.kind === 'active'
    ? 'active'
    : `ended: ${state.status.outcome}, ${state.status.cause}`;
}

/**
 * Apply a recorded list of decisions to `state` and return the state after
 * the last one. `state` itself is not changed. Throws if a recorded action is
 * not legal when its turn comes, or the run ends before the list does.
 */
export function applyDecisions(state: GameState, decisions: string[]): GameState {
  let current = state;
  decisions.forEach((key, index) => {
    const where = `decision ${index + 1} of ${decisions.length} ("${key}")`;
    if (!isRunActive(current)) {
      throw new Error(`replay: the run had already ended before ${where}`);
    }
    if (key === 'endShift') {
      current = endShift(current).state;
      return;
    }
    const action = legalActions(current).find((legal) => actionKey(legal) === key);
    if (action === undefined) {
      throw new Error(`replay: ${where} is not a legal action at that point`);
    }
    current = applyAction(current, action).state;
  });
  return current;
}

/** Start a run and apply a recorded list of decisions to it; see `applyDecisions`. */
export function replayDecisions(
  seed: number,
  contractId: string,
  loadoutId: string,
  decisions: string[],
): GameState {
  return applyDecisions(createRun(seed, contractId, loadoutId), decisions);
}
