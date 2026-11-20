// Playing many runs on several processor cores at once.
//
// A thousand runs of a careful policy take minutes on one core (issue #88
// item 6). The runs do not depend on each other, so the seeds are cut into
// batches and each batch is played by a worker process (tools/simWorker.ts).
// The answers are put back in seed order, so the result is exactly what one
// process would have produced: how many workers there are changes the time
// taken and nothing else.

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { RunMetrics } from './simRun';

/** A batch of runs for one worker. Everything in it is plain data, so it travels as JSON. */
export interface SimJob {
  /** A name `makePolicy` accepts (tools/policies.ts). */
  policyName: string;
  firstSeed: number;
  runs: number;
  maxShifts: number;
  /** Start every run with the sim-only tool kit (tools/simKit.ts). */
  kit: boolean;
  /** Check the rules after every step and replay every run (tools/invariants.ts). */
  check: boolean;
  /** The id of a what-if trial to play under (tools/whatIf.ts), or `null` for the game as it is. */
  whatIf: string | null;
}

export interface SimJobResult {
  /** One entry per run that finished, in seed order. */
  runs: RunMetrics[];
  /** One sentence per crash, broken rule or replay that differed. Empty if all is well. */
  problems: string[];
}

/**
 * The most seeds one worker process is given at a time. Small enough to
 * share the work evenly, large enough that starting a process is cheap by
 * comparison.
 */
const MOST_SEEDS_PER_BATCH = 25;

const WORKER_FILE = path.join(import.meta.dirname, 'simWorker.ts');

/** How many worker processes to use: one per core, at least 1. */
export function defaultWorkers(): number {
  return Math.max(1, os.availableParallelism());
}

/** Start one worker on one batch. The promise gives its answer when it ends. */
function runBatch(job: SimJob): Promise<SimJobResult> {
  // A Promise is a value that arrives later; `resolve` delivers it and
  // `reject` delivers an error instead.
  return new Promise((resolve, reject) => {
    // `process.execArgv` carries the flags this process was started with
    // (tsx's loader), so the worker can run a TypeScript file too.
    const child = spawn(process.execPath, [...process.execArgv, WORKER_FILE, JSON.stringify(job)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`a simulator worker ended with code ${String(code)}`));
        return;
      }
      // `as SimJobResult`: the worker wrote this JSON from a SimJobResult.
      resolve(JSON.parse(output) as SimJobResult);
    });
  });
}

/**
 * Play `job` (all its seeds) on up to `workers` processes and return the runs
 * in seed order. `onProgress`, if given, is called with the number of runs
 * done so far each time a batch ends.
 */
export async function runInParallel(
  job: SimJob,
  workers: number,
  onProgress?: (runsDone: number) => void,
): Promise<SimJobResult> {
  // Cut the seeds into batches: at least one for each worker, if there are
  // seeds enough.
  const seedsPerBatch = Math.max(1, Math.min(MOST_SEEDS_PER_BATCH, Math.ceil(job.runs / workers)));
  const batches: SimJob[] = [];
  for (let done = 0; done < job.runs; done += seedsPerBatch) {
    batches.push({
      ...job, // `...job` copies every field; the two below replace its own
      firstSeed: job.firstSeed + done,
      runs: Math.min(seedsPerBatch, job.runs - done),
    });
  }

  // Each of the `workers` loops below takes the next batch that nobody has
  // taken, until none are left. `await` waits for a worker without blocking
  // the other loops.
  const results: SimJobResult[] = [];
  let nextBatch = 0;
  let runsDone = 0;
  async function workLoop(): Promise<void> {
    while (nextBatch < batches.length) {
      const index = nextBatch;
      nextBatch += 1;
      const batch = batches[index] as SimJob;
      const result = await runBatch(batch);
      results[index] = result;
      runsDone += batch.runs;
      if (onProgress !== undefined) {
        onProgress(runsDone);
      }
    }
  }
  const loops: Promise<void>[] = [];
  for (let i = 0; i < Math.min(workers, batches.length); i += 1) {
    loops.push(workLoop());
  }
  await Promise.all(loops);

  // Put the batches back together, in seed order.
  const all: SimJobResult = { runs: [], problems: [] };
  for (const result of results) {
    all.runs.push(...result.runs);
    all.problems.push(...result.problems);
  }
  return all;
}
