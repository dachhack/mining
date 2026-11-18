# tests/golden

Recorded runs: seed + list of decisions → expected state hash. `golden.test.ts` replays every `*.json` file here and compares the final hash. A changed hash means the rules changed; the PR must say so.

## The files

| File                            | What it is                                                                                                                   | Decisions | Ends                   | Hash               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------- | ------------------ |
| `staircase-seed-8.json`         | The staircase policy: dig to layer 8, climb back, leave                                                                      | 45        | salvage, left          | `4ba4abaf8f19ca05` |
| `wander-seed-9.json`            | Random legal actions, never leaving, until the fuel runs out                                                                 | 184       | death, out of fuel     | `299a304a55072f30` |
| `random-seed-25-cut-short.json` | Random legal actions, stopped after 150 decisions in the middle of a shift                                                   | 150       | still going (`active`) | `4ba4fbcae36279c8` |
| `staircase-seed-11-traces.json` | The staircase policy on a seed where it lights rock near ore: mineral traces are seen, and stay after one ore block is mined | 45        | salvage, left          | `6ca3ed13f820ba95` |

Each file holds:

- `seed`, `contractId`, `loadoutId`: what `createRun` is called with.
- `decisions`: every decision in order. `"endShift"` ends the shift; anything else is the engine's `actionKey` of an action (for example `"mine 17,16,0 ap 1"`), and the replay takes the legal action with that key.
- `expectedHash`: `hashState` of the state after the last decision.
- `expectedStatus`: `active`, or `ended: <outcome>, <cause>`. The hash already covers it; it is there so a person can read how the run ended.
- `description` and `recordedWith`: for the reader. A replay uses only the decisions, so changing a policy in `tools/policies.ts` does not change a golden run.

## When a golden test fails

First decide whether the change was meant. A golden test that fails after a change that was not supposed to touch the rules has found a bug: fix the change, not the file.

If the rules, the data in `src/data`, cube generation, the RNG, `serialise` or the hash were changed on purpose, update the files deliberately:

1. **The hash differs, but every recorded decision is still legal.** Run

   ```bash
   npm run golden -- --rehash
   ```

   It replays each file, prints the old and new hash, and rewrites `expectedHash` and `expectedStatus`.

2. **A recorded decision is no longer legal** (the replay says which one). The recording no longer describes a possible run, so record it again:

   ```bash
   npm run golden -- --record staircase-seed-8 --seed 8 --policy staircase
   npm run golden -- --record wander-seed-9 --seed 9 --policy wander
   npm run golden -- --record random-seed-25-cut-short --seed 25 --policy random --max-decisions 150
   npm run golden -- --record staircase-seed-11-traces --seed 11 --policy staircase
   ```

   Add `--description "..."` to keep a sentence about the run. A new recording may play out quite differently from the old one; check that it still covers what the table above says, and pick another seed if it does not.

Either way: update the table above, and say in the PR description which hashes changed and why (`CLAUDE.md`, working agreement).
