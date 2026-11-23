# tests/golden

Recorded runs: seed + list of decisions → expected state hash. `golden.test.ts` replays every `*.json` file here and compares the final hash. A changed hash means the rules changed; the PR must say so.

## The files

| File                              | What it is                                                                                                                                                                                                                                                                | Decisions | Ends                   | Hash               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------- | ------------------ |
| `pit-seed-2.json`                 | The pit policy: digs a terraced pit round the middle of the map under the level rule, with the level benches that keep its walls from slumping, cuts the trees in its way, crafts fuel from coal, and closes the mine when the fuel is about to run out                   | 405       | salvage, mine closed   | `bd19b9e7aba791a2` |
| `pit-seed-7-support.json`         | The pit policy on a seed where a square turns out unstable that it cannot mine down: it crafts a support and places it on the cracked square, whose countdown stops                                                                                                       | 326       | salvage, mine closed   | `e357be0a087b14ce` |
| `greedy-seed-11-buried.json`      | The greedy policy: the steepest pit the level rule allows, with no heed for slumps. Its walls crack, count down and slump, cascades follow, and the crew is hurt where it works until it is buried                                                                        | 59        | lost, buried           | `8314c37db2a85ef5` |
| `pit-seed-24-caverns.json`        | The pit policy on a seed where its pit breaks into two caverns: each collapses to rubble at once and the square drops exactly 1 level                                                                                                                                     | 352       | salvage, mine closed   | `4c6f18286da7689a` |
| `camp-seed-12-rest.json`          | The camp policy (the greedy digger with a camp): it founds a camp near the middle with its starting kit, mines more cheaply near it, pays its upkeep, and rests there each time a slump has hurt the crew                                                                 | 261       | salvage, mine closed   | `42c08285e2ea073a` |
| `camp-seed-25-destroyed.json`     | The camp policy on a seed where the pit reaches the camp: the crew rests there twice, then a slump destroys the camp and the crew is buried                                                                                                                               | 168       | lost, buried           | `2e9385d13beca94b` |
| `random-seed-6-forest.json`       | The random policy (a kind of action at random, then one legal action of that kind; never closing the mine) until the fuel runs out. It cuts trees: some grow back, and none on a stump whose square was mined                                                             | 216       | lost, out of fuel      | `a6bf2eaa1075c4c3` |
| `random-seed-27-cut-short.json`   | The random policy, stopped after 60 decisions with the run still going                                                                                                                                                                                                    | 60        | still going (`active`) | `2029b770390b36e6` |
| `terrace-seed-1.json`             | The terracing policy: plans a pit 6 deep in a corner, digs it layer by layer, makes supports and places them on the wall squares before their cracks fall, and closes the mine when the pit is finished. Nothing slumps                                                   | 130       | salvage, mine closed   | `b94a5f151909fcb6` |
| `terrace-8-seed-4-flood.json`     | The terracing policy with a pit planned 8 deep, on a seed where it breaks into a water pocket: the water floods the pit floor, flows as the pit deepens, and hurts the crew where it enters a worked square. The run sees mineral traces, mines ore, and finishes its pit | 278       | salvage, mine closed   | `21a3c48187225dcf` |
| `terrace-8-seed-10-poisoned.json` | The terracing policy with a pit planned 8 deep, on a seed where it breaks into gas pockets and digs on in the gas: the crew loses health shift after shift and is poisoned                                                                                                | 237       | lost, poisoned         | `d6b645188d18dbe8` |
| `random-kit-seed-24-blast.json`   | The random policy with the sim-only tool kit (`extraItems` in the file): it places explosives, pumps and vents, seals squares and scans, and is hurt by one of its own blasts                                                                                             | 217       | lost, out of fuel      | `c88dde32ff48392d` |

Each file holds:

- `seed`, `contractId`, `loadoutId`: what `createRun` is called with.
- `decisions`: every decision in order. `"endShift"` ends the shift; anything else is the engine's `actionKey` of an action (for example `"mine 17,16 ap 1"`: mine the top block of square (17, 16)), and the replay takes the legal action with that key.
- `expectedHash`: `hashState` of the state after the last decision.
- `expectedStatus`: `active`, or `ended: <outcome>, <cause>`. The hash already covers it; it is there so a person can read how the run ended.
- `extraItems` (one file only): items the run started with on top of its loadout, the sim-only tool kit of `tools/simKit.ts`. A replay puts them in the stockpile before the first decision.
- `description` and `recordedWith`: for the reader. A replay uses only the decisions, so changing a policy in `tools/policies.ts` does not change a golden run.

## The new game's runs (`frontier/`)

Lab 2 becomes the game (`docs/plans/lab2-becomes-the-game.md`). Its rules are moving into the engine beside the old game's, and they get their own golden runs from plan step A3. `frontier.test.ts` replays every `frontier/*.json`.

Recorded with the new simulator's policies (`tools/frontierPolicies.ts`, plan B3), each for at most 10 shifts of 100 taps, except where the table says otherwise (the idle run until it is lost):

| File                                    | What it is                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontier/gatherer-seed-1.json`         | The gatherer: places two more camps, mines, upgrades three times, builds a smelter and a pen, makes hay, plants saplings, sells grass on market days, and is never hungry                                                                                                                                                                                                            |
| `frontier/gatherer-seed-26.json`        | The gatherer on another seed: two more camps, all three at level 2, and a smelter                                                                                                                                                                                                                                                                                                    |
| `frontier/careful-seed-3.json`          | The careful policy: keeps wood and food back for upkeep, places two more camps, a smelter, a camp at level 3                                                                                                                                                                                                                                                                         |
| `frontier/digger-seed-5.json`           | The digger: a pit next to the first camp, as deep as a base camp digs (dirt and clay), gathering only for upkeep                                                                                                                                                                                                                                                                     |
| `frontier/random-seed-6.json`           | The random policy: a useful step at random; upgrades a camp to level 2, makes hay and buys hay                                                                                                                                                                                                                                                                                       |
| `frontier/random-seed-16-tools.json`    | The random policy for 42 shifts: upgrades its camp to level 2, builds a smelter and a pen, makes hay, and buys hay at the market                                                                                                                                                                                                                                                     |
| `frontier/careful-seed-3-finished.json` | The careful policy for a whole run of 100 shifts: buys an iron and a steel drill, smelts, makes a pickaxe and lanterns, brings two camps to level 4, buys a camp kit, flattens a patch 3 deep and places a deep camp, plants saplings, keeps a pen and makes hay, buys wood, delivers 35 contracts of all three tiers, sells its surplus, and the run ends finished, scored in coins |
| `frontier/idle-seed-2-lost.json`        | The idle policy: gathers nothing, rests at camp 1 once, and loses the crew to hunger at shift 11                                                                                                                                                                                                                                                                                     |

Each file holds:

- `seed`: what `createFrontier` is called with.
- `steps`: every step in order: `"tap X,Y"`, `"place X,Y"`, `"upgrade ID"`, `"demolish ID"`, `"endShift"`, `"rest ID"` (at camp ID), `"close"`, `"buildSmelter ID"`, `"make RECIPE"`, `"hangLantern ID"`, `"sell ITEM LOTS"`, `"buy ITEM LOTS"`, `"plant X,Y ITEM"`, `"buildPen ID"`, `"penIn ID"`, `"penOut ID"`, `"takeContract ID"`, `"deliver"`, `"dropContract"` or `"placeDeep X,Y"`. A step the rules refuse (including a tap with no taps left in the shift) fails the replay.
- `expectedHash`: `hashFrontier` of the state after the last step.
- `engineVersion`: the engine version it was recorded on. A replay is only expected to match on that version.
- `stepCount`, `description` and `recordedWith` (the policy): for the reader.

If the new rules change on purpose, record the runs again with `npm run golden -- --frontier`, and say in the PR why the hashes changed. A policy always plays the same way on a seed, so there is no separate rehash.

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
   npm run golden -- --record pit-seed-2 --seed 2 --policy pit
   npm run golden -- --record random-seed-27-cut-short --seed 27 --policy random --max-decisions 60
   npm run golden -- --record random-kit-seed-24-blast --seed 24 --policy random --kit
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

For issue #108 (task T15: every way a run ends, the sim policies, acceptance, the depth survey; decision note 0038) no rule changed, and the six `pit`, `greedy` and `camp` files are untouched: `npm run golden -- --rehash` reports their hashes unchanged. What changed:

- **The two `random` files were recorded again, because the policy changed and not the rules.** The `random` policy now picks a kind of action first and then an action of that kind, so that it crafts, places and founds as well as mines. `--record-all` would no longer have produced the old files, so they were recorded with the new policy. `random-seed-9-forest` became `random-seed-22-forest`: on seed 9 the new policy mines no stump, so that seed no longer covered "no regrowth once mined".
- **Three files are new.** `terrace-seed-4` pins the terracing policy and supports placed in time. `terrace-8-seed-8-traces` brings mineral traces back into a golden run (they left with `pit-seed-31-traces` in issue #94) and is the deepest golden run: its corner square reaches layer 8. `random-kit-seed-27-blast` pins explosives, pumps, vents, sealant and scans on a generated cube; it starts with the sim-only tool kit because no run with the standard loadout gets the iron, copper and crystal those need.
- **Still no golden run meets water, gas, lava or unstable ore.** The issue asked for "a run that meets a hazard if any seed and policy can". None can with the standard loadout: on seeds 1 to 1000 no policy releases water, gas or lava or sees unstable ore (`docs/surveys/depth-survey.md`, table 4). Slumps and caverns are the hazards the golden runs meet. The fixed scenarios "a pinned flood" (`tests/engine/fluids.test.ts`) and "a pinned blast" (`tests/engine/explosions.test.ts`) still pin the flow and gas rules by hash, and `tests/engine/runEnds.test.ts` plays each hazard through to the crew's loss on a hand-built cube.

**The whole set was recorded again for the owner's choice after the depth survey** (issue #108, candidate C and the camp numbers; decision note 0040). The numbers in `src/data` changed: the middle band starts at layer 4 and the deep band at 12, the standard loadout starts with 72 fuel, there are six times as many water and gas pockets and three times as many iron and copper veins, and a camp's cheaper mining reaches 8 steps and its upkeep comes every 8 shifts. Every cube is different, so no old decision list fits, and every hash changed. No rule changed.

- Six files moved to a seed where the new cube still shows what the file is for: `pit-seed-7-support` (was seed 4), `camp-seed-12-rest` (was 10), `random-seed-4-forest` (was 22), `terrace-seed-1` (was 4), `random-kit-seed-2-blast` (was 27), and `terrace-8-seed-4-flood` in place of `terrace-8-seed-8-traces`.
- **Golden runs now meet water and gas.** `terrace-8-seed-4-flood` breaks into a water pocket and is hurt by the water; `terrace-8-seed-10-poisoned` is new and is the first golden run whose crew is lost to something other than a slump. The stand-ins "a pinned flood" (`tests/engine/fluids.test.ts`) and "a pinned blast" (`tests/engine/explosions.test.ts`) are kept: they pin lava and ignition, which no golden run meets yet.
- Runs are longer (72 fuel): the pit runs have 378 to 573 decisions where they had 121 to 326.

**The whole set was recorded again for question 140** (no coal at the surface, a minimum of 12 coal in layer 1; engine 0.5.0; decision note 0052). Every cube changed: coal in layer 0 is stone now, coal in sight is gone, and a few cubes got extra coal in layer 1. So recorded decisions stopped being legal (the replay of `camp-seed-12-rest` failed at decision 225) and every hash changed.

- Three files moved to a seed where the new cube still shows what the file is for. `pit-seed-2` replaces `pit-seed-11`: on seed 11 the pit policy no longer crafts fuel, because it took coal it could see on the surface. `random-seed-6-forest` replaces `random-seed-4-forest`: on seed 4 the random policy no longer mines a stump. `random-kit-seed-24-blast` replaces `random-kit-seed-2-blast`: on seed 2 its crew is no longer hurt by its own blast.
- The other nine keep their seeds and still cover what the table says.
