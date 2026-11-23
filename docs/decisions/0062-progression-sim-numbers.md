# 0062: Progression in the simulator

Date: 2026-11-23. PR 7 of `docs/plans/progression-phases.md`: what the simulator says about the whole arc of a run, after PRs 1 to 6 (engine 0.9.0). No number in `src/data` changed in this PR. The open design choices it raised are owner questions 177 to 180.

## How it was run

`npm run sim -- --policy P --runs 100 --max-shifts 100 --json` for each policy, seeds 1 to 100. A run lasts 100 shifts now, so `--max-shifts 100` plays each to its end. The acceptance check (`--acceptance --runs 20 --max-shifts 100`) passed after every PR of the batch: every rule held after every step, and every run replayed to its hash.

The policies as they stand (`tools/frontierRun.ts`, `tools/frontierPolicies.ts`):

- **gatherer:** takes and delivers contracts (keeping what its next upgrade needs), places a deep camp, smelts and crafts, keeps a pen and makes hay, buys drills and a camp kit, sells surplus, plants saplings, upgrades, places up to 3 camps, gathers and mines.
- **careful:** the gatherer, keeping wood and food back for 4 shifts of upkeep.
- **random:** a useful step at random, now including trades, planting, pens and contracts.
- **digger:** digs a pit beside the first camp and gathers only for upkeep.

## The numbers (100 runs a policy)

|                                                   | careful             | gatherer            | random    | digger    |
| ------------------------------------------------- | ------------------- | ------------------- | --------- | --------- |
| Finished (shift 100)                              | 99                  | 99                  | 35        | 5         |
| Crew lost                                         | 1                   | 1                   | 65        | 95        |
| Ever hungry                                       | 8                   | 16                  | 79        | 100       |
| Coins at the end: 10th / median / 90th percentile | 111 / 4,113 / 6,035 | 112 / 4,279 / 6,421 | 0 / 2 / 5 | 0 / 0 / 0 |
| Contracts delivered (median)                      | 32                  | 33                  | 0         | 0         |
| Deepest level dug (median)                        | 22                  | 22.5                | 6         | 2         |

How many runs reached each step, and the median shift they reached it in:

| Step (phase it opens)           | careful | gatherer | random |
| ------------------------------- | ------- | -------- | ------ |
| Level-2 camp (phase 2)          | 100 @4  | 100 @4   | 78 @8  |
| Level-3 camp (phase 3)          | 79 @13  | 80 @13   | 0      |
| Iron drill                      | 79 @27  | 80 @27   | 0      |
| First tier-1 contract (phase 4) | 79 @26  | 80 @25   | 0      |
| Steel drill                     | 79 @39  | 80 @39   | 0      |
| Level-4 camp                    | 65 @31  | 66 @31   | 0      |
| First tier-2 contract (phase 5) | 75 @48  | 76 @48   | 0      |
| First tier-3 contract           | 19 @90  | 20 @90   | 0      |

## What it says

1. **The arc works for a steady player.** A careful player reaches phase 5 in three runs in four, at a median shift of 48, and plays the rest of the run for money. The phases come at shifts 4, 13, 26 and 48.
2. **Apples block level 3 (question 177).** About one run in five (21 careful runs) stays at level 2 for all 100 shifts. In 20 of them, apples are what is short for the level-3 upgrade (10), most often by 1 to 4. Apple trees are felled for wood, upkeep eats apples once grass runs out, and the market sells apples only from phase 4. Those runs never see a contract, which is why the 10th percentile of coins is about 110.
3. **Tier 3 is rare and late.** One run in five delivers a tier-3 contract, at a median shift of 90. Crystal, rare ore and relics lie at layer 12 and below; the median run digs 22 deep, but its tier-3 contract asks for 10 to 20 crystal.
4. **Small tier-1 contracts are most of the money (question 179).** In six careful runs of 100 shifts (seeds 3 to 8), 200 of the 247 contracts taken were tier 1: most often iron ingots (60) and raw copper (58), then stone (31) and raw iron (24). Tier 1 stays on the board for the whole run, so a player can keep filling small contracts instead of moving on to bigger ones. Stone, which a pit gives as it is dug, was about one contract in five.
5. **The deep camp does not deepen the pit yet (question 178).** The careful policy buys a kit and places a deep camp in every run that reaches phase 4, but its median depth (22) is no deeper than before PR 6 (24). It places the camp on the deepest patch it can find, which seldom opens new ground. That is partly the policy. Also, a deep camp may stand at the surface, which makes it a quick level-3 camp for its kit.
6. **Players who do not gather starve.** The digger loses 95 runs in 100: a base camp cannot dig stone, so it digs 2 levels and the surface runs out by about shift 75. The random policy loses 65. That is the "nurture" pressure the owner asked for in phase 2.
