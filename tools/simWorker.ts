// One worker process of the simulator: plays a batch of runs and prints what
// it measured as JSON. `tools/parallel.ts` starts several of these at once
// and puts their answers together; nobody runs this file by hand.
//
// Usage: tsx tools/simWorker.ts '<a SimJob as JSON>'

import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, GAME_DATA, validateData } from '../src/data';
import { hashState } from '../src/engine';
import { makeRuleChecker } from './invariants';
import type { SimJob, SimJobResult } from './parallel';
import { makePolicy } from './policies';
import { TOOL_KIT } from './simKit';
import { playRun, replayDecisions } from './simRun';
import type { RunMetrics } from './simRun';
import { findWhatIf } from './whatIf';

function main(): void {
  // `as SimJob`: the parent process wrote this JSON from a SimJob.
  const job = JSON.parse(process.argv[2] ?? '') as SimJob;

  if (job.whatIf !== null) {
    findWhatIf(job.whatIf).apply();
  }
  const dataProblems = validateData(GAME_DATA);
  if (dataProblems.length > 0) {
    throw new Error(`the data is not valid:\n  ${dataProblems.join('\n  ')}`);
  }
  const contractId = CONTRACT_IDS[0] ?? '';
  const extraItems = job.kit ? TOOL_KIT : undefined;

  const runs: RunMetrics[] = [];
  const problems: string[] = [];
  for (let i = 0; i < job.runs; i += 1) {
    const seed = job.firstSeed + i;
    const label = `policy ${job.policyName}${job.kit ? ' with the tool kit' : ''}, seed ${seed}`;
    const checker = job.check ? makeRuleChecker(label) : null;
    try {
      const result = playRun({
        seed,
        contractId,
        loadoutId: DEFAULT_LOADOUT_ID,
        policy: makePolicy(job.policyName, seed),
        maxShifts: job.maxShifts,
        extraItems,
        onStep: checker === null ? undefined : checker.onStep,
      });
      runs.push(result.metrics);
      if (checker !== null) {
        problems.push(...checker.problems);
        // The same decisions, played again from the seed, must give the same
        // state: the engine is deterministic (design doc pillar 4).
        const replayed = replayDecisions(
          seed,
          contractId,
          DEFAULT_LOADOUT_ID,
          result.decisions,
          extraItems,
        );
        const replayHash = hashState(replayed);
        if (replayHash !== result.metrics.finalHash) {
          problems.push(
            `${label}: the replay ended with hash ${replayHash}, the run with ${result.metrics.finalHash}`,
          );
        }
      }
    } catch (error) {
      // A crash is a finding, not a reason to lose the other runs.
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`${label}: crashed: ${message}`);
    }
  }

  const answer: SimJobResult = { runs, problems };
  process.stdout.write(JSON.stringify(answer));
}

main();
