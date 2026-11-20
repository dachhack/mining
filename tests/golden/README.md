# tests/golden

Recorded runs: seed + list of decisions → expected state hash. `golden.test.ts` replays every `*.json` file here and compares the final hash. A changed hash means the rules changed; the PR must say so.

## The files

| File                            | What it is                                                                                                                                                                           | Decisions | Ends                   | Hash               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------- | ------------------ |
| `pit-seed-11.json`              | The pit policy: digs a terraced pit round the middle of the map under the level rule, cuts the trees in its way, crafts fuel from coal, and leaves when the fuel is about to run out | 125       | salvage, left          | `f9e03952e01d8fe5` |
| `pit-seed-31-traces.json`       | The pit policy on a seed where the pit gets deep enough for top blocks to lie near ore: mineral traces are seen, and stay on the map                                                 | 265       | salvage, left          | `d6b05a94b9f4a0a6` |
| `random-seed-9-forest.json`     | Random legal actions, never leaving, until the fuel runs out. It cuts 35 trees: some grow back, and none on a stump whose square was mined                                           | 104       | death, out of fuel     | `62a06f8302fce2e8` |
| `random-seed-27-cut-short.json` | Random legal actions, stopped after 60 decisions with the run still going                                                                                                            | 60        | still going (`active`) | `986f0c5dc5e22383` |

Each file holds:

- `seed`, `contractId`, `loadoutId`: what `createRun` is called with.
- `decisions`: every decision in order. `"endShift"` ends the shift; anything else is the engine's `actionKey` of an action (for example `"mine 17,16 ap 1"`: mine the top block of square (17, 16)), and the replay takes the legal action with that key.
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

2. **A recorded decision is no longer legal** (the replay says which one). The recording no longer describes a possible run, so record the whole set again:

   ```bash
   npm run golden -- --record-all
   ```

   The set is the list `STANDARD_RUNS` in `tools/golden.ts` (name, seed, policy, where to cut, description). A new recording may play out quite differently from the old one; `golden.test.ts` checks that each file still covers what the table above says, and if one does not, pick another seed in `STANDARD_RUNS`. One run can also be recorded by hand:

   ```bash
   npm run golden -- --record pit-seed-11 --seed 11 --policy pit
   npm run golden -- --record random-seed-27-cut-short --seed 27 --policy random --max-decisions 60
   ```

   Add `--description "..."` to keep a sentence about the run.

All the files were replaced for issue #86 (mine by square; engine 0.4.0; decision note 0025): there is no miner, so no recorded move replays, a mine names a square and not a cell, and the `staircase` and `wander` policies that recorded the old runs are gone. The new set is recorded with the `pit` and `random` policies. All four were re-hashed for issue #89 (light removed; decision note 0027): the state no longer holds `lampOil`, so every hash changed. Every recorded decision was still legal, so the decisions and the endings are the same. Earlier re-recordings (issues #75 and #80) are in the git history of this file.

Either way: update the table above, and say in the PR description which hashes changed and why (`CLAUDE.md`, working agreement).
