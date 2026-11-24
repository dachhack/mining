# 0065: The hazards in the simulator

Date: 2026-11-24. PR 6 of `docs/plans/hazards.md`: what the simulator says about the five hazards (rain, water, gas and fire, dragons, marauders) on engine 0.13.0. The owner asked for one build when all the hazards are in (question 192); these numbers are for that build's playtest. Rule changes this PR made because of them, and the questions they raised, are at the end.

## How it was run

- **Before and after:** `npx tsx tools/frontierSim.ts --policy gatherer --runs 100 --max-shifts 100`, seeds 1 to 100, on the merged 0.12.0 (no hazards) and on 0.13.0.
- **What each hazard did:** a script played the careful policy for whole runs on seeds 1 to 50 and added up the End shift reports and taps.
- **The acceptance check** (`--acceptance --runs 6 --max-shifts 100`) passed after every PR: every rule held after every step, and every run replayed to its hash.

## Before and after (gatherer, 100 runs of 100 shifts)

|                                | 0.12.0, no hazards | 0.13.0, hazards |
| ------------------------------ | ------------------ | --------------- |
| Crew lost                      | 0                  | 7               |
| Ever hungry                    | 40                 | 34              |
| Coins at the end (median)      | 3,550              | 2,918           |
| Contracts delivered (median)   | 26                 | 27              |
| Deepest square dug (median)    | 18                 | 16              |
| Reached level 3 (median shift) | 98 (@12)           | 94 (@10)        |
| Reached level 4                | 82 (@28)           | 66 (@31)        |
| First tier-1 contract          | 98 (@15)           | 92 (@15)        |
| First tier-2 contract          | 98 (@27)           | 92 (@24)        |
| First tier-3 contract          | 22 (@75)           | 5 (@78)         |

## What each hazard did (careful, 50 runs; per run, the mean)

| Hazard    | How often                               | What it cost                                                                                      |
| --------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Rain      | 19 rainy nights                         | about 900 squares filled a run (48 a rainy night): taps to dig them again, and free clay and dirt |
| Water     | 16 floods, 149 squares flooded          | 2.7 pumps bought (30 coins each); every flood was drained                                         |
| Gas       | 5.7 blasts, 5.7 vents                   | 5.5 blocks blown away a run; 2.7 fires set by blasts                                              |
| Fire      | 2.7 fires from blasts, 1.7 from dragons | 3 put out by a tap; 1.5 squares burned; camps lost 1 upgrade in all 50 runs                       |
| Dragons   | 5.7 a run, staying 17 shifts in all     | 1 animal and 0.7 apples eaten; 1 sword (made or bought); 5.4 driven off                           |
| Marauders | 8.5 raids, 1.9 turned away              | 907 items stolen (mostly clay and stone), 10 camp upgrades torn down; 6 levels of defenses built  |

## What it shows

1. **Marauders are the hazard that bites.** They come about 8 times a run from shift 15, most of them stronger than the camp's defenses: strength 2 arrives at depth 4, which a gatherer reaches by about shift 10. An undefended level-2 camp loses a level each time. On an unlucky seed (25) four raids in 16 shifts knocked a camp back to level 1 again and again; the gatherer spent its wood climbing back, never saved enough for a palisade or level 3, and lost its crew to wood upkeep. Most of the 7 lost runs are like that: wood runs out before the first tier-1 contract opens wood at the market.
2. **Fewer runs reach the top.** Level 4 drops from 82 runs to 66 and tier-3 contracts from 22 to 5: raids keep taking levels off.
3. **Water, gas, fire and dragons are small costs** for a player who answers them: a pump or two, a sword, a few taps on fires. Fire mostly harms through the blast, since a terraced pit leaves the blast little to dig (question 193).
4. **Rain fills a lot.** About 48 squares a rainy night: a terraced pit has many low spots, and each is filled half the time. It gives clay back (the full-run golden delivers mostly clay contracts), but costs taps to dig again.

## What this PR changed because of them

- **Fire** (question 195): a fire on a square no camp lights burns out without spreading, and burnt grass and trees grow back as cut grass and felled trees do. Before, unseen fires burned through forests for many nights and the trees never came back.
- **The gatherer** keeps 40 wood, not 20, when it builds defenses, and leaves squares under a dragon alone. With 20 it built palisades at every camp and ran out of wood (10 crews lost); with the dragon, it tried a tap the rules refuse and stopped.

No number in `src/data` was tuned: the owner tests the build. Suggestions for the playtest: raids less often or later (`FRONTIER_RAID.chance`, `fromShift`), strength 2 at a greater depth (`strengthFromDepth`), defenses at base camps (question 194), and a lower rain fill chance (`FRONTIER_RAIN.fillChance`, question 196).
