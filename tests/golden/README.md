# tests/golden

Recorded runs: seed + list of decisions → expected state hash. `golden.test.ts` replays every `*.json` file here and compares the final hash. A changed hash means the rules changed; the PR must say so.

## The files

| File                            | What it is                                                                                                                                                                                                                                              | Decisions | Ends                   | Hash               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------- | ------------------ |
| `pit-seed-11.json`              | The pit policy: digs a terraced pit round the middle of the map under the level rule, with the level benches that keep its walls from slumping, cuts the trees in its way, crafts fuel from coal, and closes the mine when the fuel is about to run out | 141       | salvage, mine closed   | `2c3ae6abe99a9080` |
| `pit-seed-4-support.json`       | The pit policy on a seed where a square turns out unstable that it cannot mine down: it crafts a support and places it on the cracked square, whose countdown stops                                                                                     | 326       | salvage, mine closed   | `9a0291a68ce5cd06` |
| `greedy-seed-11-buried.json`    | The greedy policy: the steepest pit the level rule allows, with no heed for slumps. Its walls crack, count down and slump, cascades follow, and the crew is hurt where it works until it is buried                                                      | 67        | lost, buried           | `ddd7ace31b48cf7d` |
| `pit-seed-24-caverns.json`      | The pit policy on a seed where its pit breaks into two caverns: each collapses to rubble at once and the square drops exactly 1 level                                                                                                                   | 121       | salvage, mine closed   | `6e3d6e04d48b202e` |
| `camp-seed-10-rest.json`        | The camp policy (the greedy digger with a camp): it founds a camp near the middle with its starting kit, mines more cheaply near it, pays its upkeep, and rests there each time a slump has hurt the crew                                               | 117       | salvage, mine closed   | `a23b356bd3ad1b3f` |
| `camp-seed-25-destroyed.json`   | The camp policy on a seed where the pit reaches the camp: the crew rests there twice, then a slump destroys the camp and the crew is buried                                                                                                             | 121       | lost, buried           | `6591a782488d9c54` |
| `random-seed-9-forest.json`     | Random legal actions, never closing the mine, until the fuel runs out. It cuts trees: some grow back, and none on a stump whose square was mined                                                                                                        | 104       | lost, out of fuel      | `673e0c473f817f0c` |
| `random-seed-27-cut-short.json` | Random legal actions, stopped after 60 decisions with the run still going                                                                                                                                                                               | 60        | still going (`active`) | `6cb4571b7eedad0d` |

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

All four were re-hashed for issue #90 (crew health; decision note 0028): the state's shape changed (`crew` for `avatar`, no air, and the new `worked` squares), so every hash changed. The outcome id `death` is now `lost` (design doc 9.4), which is in the status of `random-seed-9-forest`. Every recorded decision is still legal and every run ends the way it did.

All four were recorded again for issue #92 (carrying removed, "close the mine"; decision note 0029). Two things changed. The action `leave` is now `closeMine`, so the last decision of the two pit runs (`leave ap 0`) was no longer legal; a new recording gives `closeMine ap 0` there and the same 124 and 264 decisions before it. And the state's shape changed (`stockpile` for `inventory`, no `looseItems`, no camp `stash`), so every hash changed. The two random runs hold the same decisions as before, and every run ends as it did (the cause `left` is now `mineClosed`).

All four were recorded again for issue #95 (generation for the terrain model, breaking into underground spaces; decision note 0030), and `pit-seed-24-caverns` was added. Generation changed every cube: caverns, pockets and unstable ore are generated, and the surface lost its start clearing and its path wear. So the old decisions no longer fit the map (a recorded "cut the tree at ..." names a square that may have no tree now). The pit runs play out differently on the new surface (141 and 228 decisions, where they had 125 and 265); the random runs have the same number of decisions as before (104 and 60). No rule a recorded run used changed, apart from the collapse of a cavern, which only the new file meets.

Either way: update the table above, and say in the PR description which hashes changed and why (`CLAUDE.md`, working agreement).

The whole set was recorded again for issue #94 (pit walls slump; decision note 0031), on top of issue #95's cubes. The `pit` policy changed with the rule: it no longer takes a mine that would make a square unstable, so its old decisions are not the ones it makes now, and played as recorded they would have slumped. `pit-seed-31-traces` is gone: with level benches the pit reaches 3 to 5 levels, too far above the ore for traces, so no recording could cover what that file was for. Two files are new: `pit-seed-4-support` (a support is crafted and placed) and `greedy-seed-11-buried` (walls slump and the crew is buried), so that the hashes pin the slump rule. The two `random` runs make the same decisions as before; their hashes changed because the state version did.

For issue #100 (camps; decision note 0032) the six files above were re-hashed, not recorded again: every recorded decision is still legal and every run ends the way it did. The hashes changed because every run now starts with a camp kit in the stockpile (owner, question 63) and the state version is 12 (`crew.restingAt` replaces `crew.resting`). None of those six runs founds a camp, so no mine in them got cheaper. Two files are new, recorded with the new `camp` policy, so that the hashes pin camps: `camp-seed-10-rest` (founding, cheaper mines near the camp, upkeep, rest) and `camp-seed-25-destroyed` (a slump destroys the camp).

Nothing was recorded again for issue #99 (water and lava on squares; decision note 0033): no recorded run meets water or lava, and the state's shape did not change, so `npm run golden -- --rehash` reports every hash unchanged. The issue asked for a run that floods. None can be recorded yet: pockets start at layer 8, and no policy digs deeper than 6 before its fuel runs out or its crew is buried (measured on seeds 1 to 400 with the pit dug in a corner). Until a policy can (task T15), the flow rule is pinned by a fixed scenario with a recorded hash, "a pinned flood" in `tests/engine/fluids.test.ts`. Treat a change of that hash like a change of a golden hash.

Nothing was re-hashed or recorded again for issue #104 (camp tools; decision note 0034): the shape of the state did not change and no recorded run holds a pump, sealant, a scanner charge or a drill, so every hash is as it was. No policy crafts a camp tool, so no golden run uses one; `tests/engine/campTools.test.ts` pins a hand-played run (seed 1: camp, sealant, seal) by its hash instead.

Nothing was recorded again for issue #103 (gas, ignition, unstable ore and explosives; decision note 0035): no recorded run meets gas, unstable ore or an explosive, and the state's shape did not change, so `npm run golden -- --rehash` reports every hash unchanged. Until a policy digs to the gas (task T15), step (c) of the cube phase is pinned by a fixed scenario with a recorded hash, "a pinned blast" in `tests/engine/explosions.test.ts`. Treat a change of that hash like a change of a golden hash.

Nothing was re-hashed for issue #107 (the vent; decision note 0036) either: no recorded run holds a vent.
