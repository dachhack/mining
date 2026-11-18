// Print layers of a generated cube as text. A debugging tool: it shows every
// block, revealed or not. See docs/repo-plan.md section 5.
//
// Usage:
//   npm run ascii -- --seed 7                 layer 0 of the cube for seed 7
//   npm run ascii -- --seed 7 --layer 12      one layer
//   npm run ascii -- --seed 7 --layers 8-11   a range of layers, inclusive
//   npm run ascii -- --seed 7 --all           every layer
//   npm run ascii -- --seed 7 --layers 8-11 --traces
//                                             also mark rock that carries mineral traces
//
// Each layer is drawn from above: one character per block, x across (x = 0 on
// the left) and y down (y = 0 at the top). Layer 0 is the top of the cube.

import {
  BLOCKS,
  CONTRACT_IDS,
  DEFAULT_LOADOUT_ID,
  GAME_DATA,
  blockDefByCode,
  validateData,
} from '../src/data';
import type { BlockId } from '../src/data';
import { blockAt, createRun } from '../src/engine';
// Not on the engine's public surface: it reads hidden blocks, which only a
// debugging tool like this one may do.
import { carriesMineralTraces } from '../src/engine/tells';

// One character for each block that can be stored in the cube. These are the
// same characters the test helper uses (tests/engine/helpers.ts).
//
// `Partial<Record<BlockId, string>>` is a dict from block id to character that
// may leave some ids out (bedrock is never stored in the cube).
const BLOCK_CHARS: Partial<Record<BlockId, string>> = {
  air: '.',
  dirt: 'd',
  stone: '#',
  hardRock: 'H',
  coalSeam: 'c',
  timberRoot: 't',
  ironOre: 'i',
  copperOre: 'u',
  crystal: 'x',
  unstableOre: 'U',
  relic: 'r',
  keystone: 'k',
};

const CHAR_BY_CODE = new Map<number, string>();
for (const [blockId, char] of Object.entries(BLOCK_CHARS)) {
  // `Object.entries` gives the keys back as plain strings; `as BlockId` tells
  // the compiler they are the block ids written just above.
  CHAR_BY_CODE.set(BLOCKS[blockId as BlockId].code, char);
}

interface Options {
  seed: number;
  firstLayer: number;
  /** `null` means "the bottom layer of the cube". */
  lastLayer: number | null;
  /** Draw rock that carries mineral traces (decision note 0010) as `%`. */
  traces: boolean;
}

/** The character for rock that carries mineral traces, with `--traces`. */
const TRACES_CHAR = '%';

function fail(message: string): never {
  console.error(`ascii: ${message}`);
  console.error('Usage: npm run ascii -- --seed N [--layer Z | --layers A-B | --all] [--traces]');
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
  const options: Options = { seed: 1, firstLayer: 0, lastLayer: 0, traces: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--seed') {
      i += 1;
      options.seed = wholeNumber(args[i], '--seed');
    } else if (arg === '--layer') {
      i += 1;
      options.firstLayer = wholeNumber(args[i], '--layer');
      options.lastLayer = options.firstLayer;
    } else if (arg === '--layers') {
      i += 1;
      const parts = (args[i] ?? '').split('-');
      if (parts.length !== 2) {
        fail(`--layers must look like 8-11, but is ${args[i] ?? 'missing'}`);
      }
      options.firstLayer = wholeNumber(parts[0], '--layers');
      options.lastLayer = wholeNumber(parts[1], '--layers');
    } else if (arg === '--all') {
      options.firstLayer = 0;
      options.lastLayer = null;
    } else if (arg === '--traces') {
      options.traces = true;
    } else {
      fail(`unknown argument ${arg ?? ''}`);
    }
  }
  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  // Every tool checks the data tables before using them (0005 item 24), so a
  // bad edit to src/data is reported here and not from deep inside the engine.
  const problems = validateData(GAME_DATA);
  if (problems.length > 0) {
    fail(`the data in src/data is not valid:\n  ${problems.join('\n  ')}`);
  }
  const contractId = CONTRACT_IDS[0];
  if (contractId === undefined) {
    fail('the data lists no contract');
  }
  // The same call the game makes, so this is exactly the cube a run gets.
  let state;
  try {
    state = createRun(options.seed, contractId, DEFAULT_LOADOUT_ID);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const bottomLayer = state.size.z - 1;
  const lastLayer = options.lastLayer ?? bottomLayer;
  if (options.firstLayer > lastLayer || lastLayer > bottomLayer) {
    fail(`layers must be within 0-${bottomLayer}, first no greater than last`);
  }

  const lines: string[] = [
    `seed ${options.seed}, cube ${state.size.x} x ${state.size.y} x ${state.size.z}`,
  ];
  // How many of each block the printed layers hold, for the legend.
  const counts = new Map<number, number>();
  let tracedCount = 0;
  for (let z = options.firstLayer; z <= lastLayer; z += 1) {
    lines.push('', `layer z=${z}`);
    for (let y = 0; y < state.size.y; y += 1) {
      let row = '';
      for (let x = 0; x < state.size.x; x += 1) {
        const code = blockAt(state, { x, y, z });
        if (options.traces && carriesMineralTraces(state, { x, y, z })) {
          // Counted apart from the rock it is drawn over.
          tracedCount += 1;
          row += TRACES_CHAR;
          continue;
        }
        counts.set(code, (counts.get(code) ?? 0) + 1);
        row += CHAR_BY_CODE.get(code) ?? '?';
      }
      lines.push(row);
    }
  }

  lines.push('', 'legend (count in the layers shown)');
  for (const [code, char] of CHAR_BY_CODE) {
    const count = counts.get(code) ?? 0;
    if (count > 0) {
      lines.push(`  ${char}  ${blockDefByCode(code).name} (${count})`);
    }
  }
  if (options.traces) {
    lines.push(
      `  ${TRACES_CHAR}  rock with mineral traces: dirt, stone or hard rock near ore (${tracedCount})`,
    );
  }
  console.log(lines.join('\n'));
}

main();
