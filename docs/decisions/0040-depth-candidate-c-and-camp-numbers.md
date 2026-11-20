# 0040 — The owner's numbers after the depth survey: candidate C, and camps worth founding

Date: 2026-11-20. Status: the owner's decision (issue #108, comment of 2026-11-20, on `docs/surveys/depth-survey.md`). It answers questions 128, 129 and 130. Every number here is [Default] data in `src/data`; no rule changes, and `ENGINE_VERSION` stays 0.4.0 (it was bumped once for this batch, and no playtest round has happened since).

## What changed in `src/data`

| File            | Number                                            | Was      | Is       |
| --------------- | ------------------------------------------------- | -------- | -------- |
| `world.ts`      | Upper band, layers                                | 0 to 7   | 0 to 3   |
| `world.ts`      | Middle band, layers                               | 8 to 19  | 4 to 11  |
| `world.ts`      | Deep band, layers                                 | 20 to 31 | 12 to 31 |
| `loadouts.ts`   | Standard loadout, starting fuel                   | 24       | 72       |
| `generation.ts` | Water pockets per 1,000 cells of the middle band  | 0.8      | 4.8      |
| `generation.ts` | Gas pockets per 1,000 cells of the middle band    | 0.6      | 3.6      |
| `generation.ts` | Iron veins per 1,000 cells of the middle band     | 4        | 12       |
| `generation.ts` | Copper veins per 1,000 cells of the middle band   | 3        | 9        |
| `camps.ts`      | Cheaper mining reaches (steps from a camp square) | 4        | 8        |
| `camps.ts`      | A camp burns 1 fuel every (shifts)                | 4        | 8        |

Corner pits are left as they are (question 129): the cube's walls still do not count for the level rule.

## What follows from it

- **Every cube is different**, so every golden run was recorded again and every hash changed (`tests/golden/README.md`). Six golden runs moved to another seed. Two now meet hazards no golden run met before: a flood, and a crew poisoned by gas.
- **Play logs recorded before this change do not replay**, although the engine version is the same: the same seed gives another cube. No playtest log exists from 0.4.0, so nothing is lost; the M2 round starts from this data.
- **What the bands contain moved with them.** The upper band is 4 layers, not 8, so coal and timber-root, which the generator places per 1,000 cells of that band, are about half as plentiful in all. The deep band is 20 layers, not 12, so there are more lava pockets, crystal and unstable ore in the cube; no run reaches them.
- **The design doc** follows: the band table (3.3), camp upkeep (4), the camp's reach (8) and the run-length section (12).
- **Tests that state the numbers** were changed to the new numbers, and nothing else in them: `tests/engine` (camps, data, generation, spaces, createRun, shift, sim, the pinned run in campTools), `tests/tools` (the play tool's camp lines, the survey's layer cost, the acceptance seeds) and three assertions in `tests/app`.
- **The Playwright tests no longer name squares by hand.** They broke because they tapped squares chosen on the old cubes. `tests/e2e/squares.ts` now finds suitable squares on the seed's cube with the engine (a row of dirt and a stone square, a clear patch for a camp, a plus of dirt with stone under its middle), so the next change to a generation number does not break them.

## Measured after the change

`npm run sim -- --survey depth-now --runs 300` (new in this change: tables 1 to 5 of the depth survey for the game as it is). The report has the tables (`docs/surveys/depth-survey.md`, "What the owner chose, and what it did"). In short: a careful pit planned 8 deep is finished in 89% of runs, mines ore in 57%, releases water in 24% and gas in 20%; its crew is lost in 11%, always to gas; a greedy player is still buried in every run; and with a camp the same pit is finished in 94% of runs, so the camp now pays.

## Not settled here

- The careful script loses its crew only to gas, because it digs on in gas and makes no vent. Whether gas is too harsh for a person is for the M2 playtest round.
- The deep band (lava, unstable ore, crystal, relics, the keystone) is out of reach of every scripted run. That belongs with the contracts in M4.
- A careful run is 34 to 99 shifts; the design doc's target for a finished contract is 150 to 250 (question 44).
- The what-if trials in `tools/whatIf.ts` are written as changes from the old numbers ("starting fuel 48, now 24"). They reproduce the survey's tables only on the commit of PR #113. The custom trials (`set:...`) work on any numbers.
