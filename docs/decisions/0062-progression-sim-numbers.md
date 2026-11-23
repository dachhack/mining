# 0062: Progression in the simulator

Date: 2026-11-23. PR 7 of `docs/plans/progression-phases.md`: what the simulator says about the whole arc of a run, after PRs 1 to 6 (engine 0.9.0). No number in `src/data` changed in this PR. The open design choices it raised are owner questions 177 to 180.

## How it was run

`npm run sim -- --policy P --runs 100 --max-shifts 100 --json` for each policy, seeds 1 to 100. A run lasts 100 shifts now, so `--max-shifts 100` plays each to its end. The acceptance check (`--acceptance --runs 20 --max-shifts 100`) passed after every PR of the batch: every rule held after every step, and every run replayed to its hash.

The policies as they stand (`tools/frontierRun.ts`, `tools/frontierPolicies.ts`):

- **gatherer:** takes and delivers contracts (keeping what its next upgrade needs), flattens a patch 3 deep and places a deep camp, smelts and crafts, keeps a pen and makes hay, buys drills, wood and a camp kit, sells surplus, plants saplings, upgrades, places up to 3 camps, gathers and mines. It never fells an apple tree picked bare: it picks the apples when they regrow (owner, question 177).
- **careful:** the gatherer, keeping wood and food back for 4 shifts of upkeep.
- **random:** a useful step at random, now including trades, planting, pens and contracts.
- **digger:** digs a pit beside the first camp and gathers only for upkeep.

## The numbers (100 runs a policy)

These are after the owner's answers to questions 177 and 178 (below). The first draft of this note, before them, had a careful player stall at level 2 in 21 runs in 100.

|                                                   | careful               | gatherer              | random    | digger    |
| ------------------------------------------------- | --------------------- | --------------------- | --------- | --------- |
| Finished (shift 100)                              | 100                   | 100                   | 35        | 5         |
| Crew lost                                         | 0                     | 0                     | 65        | 95        |
| Ever hungry                                       | 5                     | 27                    | 79        | 100       |
| Coins at the end: 10th / median / 90th percentile | 1,850 / 3,196 / 5,009 | 1,825 / 3,174 / 4,937 | 0 / 2 / 5 | 0 / 0 / 0 |
| Contracts delivered (median)                      | 29                    | 28                    | 0         | 0         |
| Deepest level dug (median)                        | 18.5                  | 19                    | 6         | 2         |
| Placed a deep camp                                | 70                    | 68                    | 0         | 0         |

How many runs reached each step, and the median shift they reached it in:

| Step (phase it opens)           | careful | gatherer | random |
| ------------------------------- | ------- | -------- | ------ |
| Level-2 camp (phase 2)          | 100 @4  | 100 @4   | 78 @8  |
| Level-3 camp (phase 3)          | 97 @12  | 97 @12   | 0      |
| First tier-1 contract (phase 4) | 97 @21  | 97 @20   | 0      |
| Iron drill                      | 97 @24  | 97 @24   | 0      |
| Steel drill                     | 97 @39  | 97 @39   | 0      |
| Level-4 camp                    | 81 @31  | 79 @31   | 0      |
| First tier-2 contract (phase 5) | 97 @42  | 97 @42   | 0      |
| First tier-3 contract           | 15 @78  | 14 @78   | 0      |

## What it says

1. **The arc works for a steady player.** A careful player finishes every run, reaches phase 5 in 97 runs in 100 at a median shift of 42, and plays the rest of the run for money. The phases come at shifts 4, 12, 21 and 42.
2. **Apples are enough (question 177, answered).** Before, about one run in five stayed at level 2 all run, a few apples short of level 3's 10, because the policies felled apple trees for wood. The owner: "apples should be enough. don't chop down the trees and pick apples when they regrow." No rule changed; with the policies leaving bare apple trees standing, 3 runs in 100 stall there.
3. **Wood comes from the market in phase 4.** Leaving apple trees standing means less wood from felling late in a run: until the policies bought wood (sold from the first tier-1 contract), 14 careful runs in 100 lost their crew to wood upkeep around shift 85, holding thousands of coins. Buying wood fixed every one. A player who does not think to buy wood late may meet the same end.
4. **Tier 3 is rare and late.** One run in seven delivers a tier-3 contract, at a median shift of 78. Crystal, rare ore and relics lie at layer 12 and below; the median run digs 18 to 19 deep.
5. **Small tier-1 contracts are most of the money (question 179).** In six careful runs (seeds 3 to 8, before the owner's answers), 200 of the 247 contracts taken were tier 1: most often iron ingots (60) and raw copper (58), then stone (31) and raw iron (24). Tier 1 stays on the board for the whole run, so a player can keep filling small contracts instead of moving on to bigger ones.
6. **The deep camp needs flattened ground (question 178, answered).** It stands only at depth 3 or more (owner: "min depth required on the deep camp"). The level rule terraces a pit, so a level 3 x 3 that deep seldom exists until it is dug for: the policies flatten one, and 70 careful runs in 100 place a deep camp. The flattening takes digging from the pit, so the median depth fell from 22 to 18.5.
7. **Players who do not gather starve.** The digger loses 95 runs in 100: a base camp cannot dig stone, so it digs 2 levels and the surface runs out by about shift 75. The random policy loses 65. That is the "nurture" pressure the owner asked for in phase 2.
