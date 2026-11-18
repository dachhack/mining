# Evaluation: playtest round m1-r2

Milestone M1 (engine core), engine 0.2.0 at commit 8f0001a. 12 persona runs (Cautious, Greedy, Speed-runner, Newcomer on seeds 11, 23, 37) and 3,000 simulated runs. The previous round is m1-r1 (engine 0.1.0); its evaluation is on branch `claude/m1-playtest-r1`.

Between the rounds the owner made four decisions, all built: no fuel refill; mining the block you stand on is an uncontrolled fall costing 1 health a block; rock within 2 steps of ore shows mineral traces; with the lamp out the miner knows only the six cells it touches. Starting lamp oil then went from 6 to 3, and the play tool gained stable choice names and "Not on the list" notes.

## 1. Round one's major findings, one round later

| Round-one finding (issue)                          | Verdict                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. Fuel is not a clock (#21)                       | **Fixed** as a rule. A new problem sits on top of it: finding 3                      |
| 2. Finding ore is luck (#22)                       | **Improved.** Traces led players to ore. They also mislead in two ways: finding 4    |
| 3. One repeated move between surface and ore (#23) | **Unchanged.** The repeated move is a different one. Findings 1 and 2                |
| 4. Light changes nothing (#24)                     | **Improved** where the dark was met; whether it is met is decided by coal: finding 3 |

### Fuel is not a clock: fixed

- Code (`src/engine/shift.ts`, `computeUpkeep`): unspent AP plays no part in upkeep. Nothing but crafting coal adds fuel.
- Sim: out-of-fuel deaths now come at shift 25 exactly (median 25 in both `random` and `wander`; round one: 26 to 58, median 34). 24 starting fuel is 24 shifts and one more at zero.
- Logs: 19 AP were left unspent at shift ends in the whole round (round one: 176). Nobody idled.
- Reports: fuel was planned against in 4 runs. Cautious 11: fuel "was the whole run". Greedy 23 left on the last affordable shift with fuel 0 and called planning it "satisfying to get exactly right". Greedy 11 left with 2. Newcomer 37 counted lamp shifts against climbing shifts.
- What is not fixed is next to it, not in it: in the other 8 runs fuel was never a limit, because coal was at hand (finding 3) or the run was 7 to 10 shifts long (Speed-runner).

### Finding ore is luck: improved

- Logs: all 12 runs carried ore out. In round one, 3 runs and one whole 51-shift trip found none. On seed 11, where the start column has no ore and round one's Speed-runner and Newcomer found nothing, all four personas found ore this round.
- Logs: traces were seen a shift or more before the first ore came into view in 9 of 12 runs, and in the same shift in the other 3.
- Reports: 7 of 12 describe working out where the ore was from which walls had traces. Speed-runner 23: "I expected ore at x19 y16 layer 8 and that is exactly where the copper was ... the best moment of the three runs." Greedy 11: "Both times the answer was one of two cells and I was right. This was the best part of the run." Cautious 11: "the traces had promised something two shifts earlier and delivered."
- Sim: traces are common on a blind descent (`staircase`: seen in 470 of 1,000 runs to layer 8) but a policy that does not follow them mines ore in only 50.
- Caution: three seeds, and playtesters who knew from the design doc that ore starts at layer 8. What remains luck is listed in finding 4 and in section 6.

### One repeated move between surface and ore: unchanged

- The bare fall shaft of round one is gone from three personas: 104 of the 117 mines of the block underfoot were made from a ladder (round one: 49 of 175). It was replaced by "ladder in my cell, mine below, climb down", which is one AP dearer and otherwise the same routine. The Speed-runner kept falling and paid health for it.
- All 12 reports again list the descent, the climb, or both under tedious or automatic. Greedy 37: "twenty-one shifts of the same four actions. I ran them from one saved command line." Newcomer 37: "Five shifts, five identical chains except for the compass letter." Cautious 23: "Between layer 1 and layer 7 not one view contained anything to react to."
- Logs: at the start of 159 of 269 shifts nothing within reach was anything but dirt, stone or hard rock (round one: 260 of 354). 170 of 1,146 actions were a climb or step up along a route already built.
- The game is still automatic between the surface and the first trace, and all the way up. Finding 1.

### Light changes nothing: improved, for the runs that met the dark

- Logs: 26 shifts were begun with the lamp out, in 5 runs. In 3 of them the dark was worked in: Cautious 11 (6 shifts), Greedy 11 (11) and Greedy 23 (6) mined 15 ore blocks between them with the lamp out, and placed 6 ladders to enter cells whose floor they could not see.
- Reports: Cautious 11: "It was the only part of the run where I thought before every action." Greedy 11: "feeling iron one block at a time was tense in a good way. It did cost AP (a ladder per step)." Both found the method from the "Not on the list" note ("A ladder in that cell would hold you").
- Logs: lamp oil was crafted 17 times in 7 runs (round one: 5 times in 3), so players now pay to keep the lamp lit.
- What did not change: one torch was crafted and placed in 12 runs, and it showed nothing (Cautious 23: "I do not know what the torch did for me"). On the way up the dark cost nothing, because a route already seen stays on the list (Greedy 23, Newcomer 37, Greedy 11's climb). And whether a player meets the dark at all was decided by whether coal lay near the start: finding 3.

## 2. Summary

The four rule changes did what each was meant to do, and the engine again behaved as written: all 12 logs replay to their recorded hash and no playtester met an error or an outcome they could not explain. Fuel now ends runs, traces now lead players to ore, and working by touch in the dark was the part of the round playtesters described most warmly. What does not work yet: the trip between the surface and the ore is still one routine repeated, down and up; the new fall rule made the bare shaft cost something but did not make it dangerous, which is what the owner asked for; and whether fuel and lamp matter in a run is settled on shift 1 by how far the nearest surface coal is. The one thing most worth settling before M2 is the fall rule (finding 2), because M2's cave-ins and voids will be judged by the same health numbers and the same "a ladder in your cell is footing" exemption.

No finding is rated `blocker`. Four are `major`, all `design`. Thirteen are `minor`.

## 3. Numbers

Sources, named in every row:

- **sim random / wander / staircase**: `npm run sim -- --runs 1000 --policy <name> --json` on this commit, seeds 1 to 1000, shift cap 300.
- **logs**: the 12 play logs in this folder, stepped through the engine by the evaluator with throwaway scripts kept outside the repo. Every log replayed to its recorded hash.
- **gen**: the cubes of seeds 1 to 1000 as `createRun` makes them.
- **code**: read in `src/engine`, `src/data` and `tools/play` at this commit.
- **reports**: the 12 playtest reports.

### Outcomes, deaths, health

| Measure                   | Value                                                                                                                                                                                                                 | Source    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Outcome mix by persona    | Cautious 3 salvage; Greedy 3 salvage; Speed-runner 3 salvage; Newcomer 3 salvage. 0 deaths in 12 runs                                                                                                                 | logs      |
| Outcome mix, simulated    | random: 786 salvage, 214 death. wander: 1,000 death. staircase: 1,000 salvage                                                                                                                                         | sim       |
| Death causes              | random: out of fuel 177, fell 37. wander: out of fuel 829, fell 171. Round one had no fall death in 3,000 runs                                                                                                        | sim       |
| Deaths preceded by a tell | No persona died. Both simulated causes are stated before the player confirms: the end-of-shift line says "THE RUN ENDS", and the mine-below line states the fall and its least cost. No simulated policy reads either | sim, code |
| Shift of death            | Out of fuel: 25 to 34 (random), 25 to 46 (wander), median 25. Fell: 18 to 32 (random), 16 to 35 (wander). Whether the fall deaths were one long fall or health worn down a block at a time is not in the sim's output | sim       |
| Health lost, persona runs | 13 in all: Speed-runner 11 lost 6, Speed-runner 37 lost 5, Greedy 37 and Newcomer 37 lost 1 each. The other 8 runs lost none. Lowest health reached: 4 of 10                                                          | logs      |
| Falls, persona runs       | 13 uncontrolled falls, every one of 1 block: 11 by the Speed-runner as the chosen way down, 2 taken once each "to see the rule". 55 chosen drops, the longest 2 blocks                                                | logs      |
| Health, simulated         | random: 383 runs took damage. wander: 999 did, mean health at the end 3.3. staircase: none                                                                                                                            | sim       |

### Run length and share of the cube mined

| Measure              | Value                                                                                     | Target (design doc 12) | Source |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------------- | ------ |
| Shifts, persona runs | 7, 9, 10, 18, 20, 22, 22, 23, 24, 28, 34, 52                                              | 150–250                | logs   |
| Shifts, simulated    | random: median 2, max 34. wander: median 25, max 46. staircase: 9 to 11                   | 150–250                | sim    |
| Blocks mined         | 12 to 58 per persona run (0.04% to 0.18%). 347 blocks in 269 shifts: 1.3 blocks per shift | 2–3% (655–983 blocks)  | logs   |
| Share mined, sim     | random: mean 0.04%, max 0.23%. wander: mean 0.15%, max 0.27%. staircase: 0.05%            | 2–3%                   | sim    |

The targets are for a completed tier-1 contract and M1 has none. With no refill, a run without coal is now capped at 25 shifts, so the gap to 150 shifts is wider than in round one; round one's finding 7 (owner question 44) stands unchanged.

### Choices per player phase

| Measure                               | Value                                                                                                                                                                                                                                                             | Source    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Legal actions at the start of a phase | random: mean 18.2 (1 to 33). wander: 14.5 (1 to 35). staircase: 27.7 (19 to 34). Persona runs: per-run mean 23.0 to 28.9 (16 to 34)                                                                                                                               | sim, logs |
| How many differ in outcome (proxy)    | The mine choices covered 2.0 to 2.6 kinds of block per phase (per-run means). In 159 of 269 phases nothing within reach was anything but dirt, stone or hard rock (round one: 260 of 354)                                                                         | logs      |
| Shifts repeating the one before       | 47 of 269 shifts used the same sequence of action types as the shift before, drops and pick-ups ignored. The same count on round one's logs gives 102 of 354 (round one's evaluation used a stricter rule and reported 76). Longest stretch: 5 shifts (Greedy 23) | logs      |
| Where the repeats were                | Greedy 37: 16. Greedy 23: 13. Newcomer: 5, 4, 3. Cautious: 2, 1, 2. Greedy 11: 1. Speed-runner: 0 in runs of 7 to 10 shifts                                                                                                                                       | logs      |
| What the 1,146 actions were           | 442 moves (170 climbs or steps up, 156 down, 116 level), 347 mines, 141 ladders placed, 108 drops (104 of them stone), 95 crafts, 12 leaves, 1 torch placed, 0 pick-ups                                                                                           | logs      |
| Mines of the block underfoot          | 117 of 347 mines. 104 from a ladder (no fall), 13 without. By persona: Cautious 30 (30 held), Greedy 53 (52), Newcomer 20 (19), Speed-runner 14 (3)                                                                                                               | logs      |
| Dropping stone as a share of actions  | 104 of 1,146 (round one: 126 of 1,363). 107 stone entered a pack; 1 was carried out                                                                                                                                                                               | logs      |

The repeat count undercounts the routine: a shaft shift ends with one spare AP that goes on whichever craft is to hand, which makes two otherwise identical shifts differ. "Differ in outcome" is still not something the sim reports.

### Fuel, lamp and the dark

| Measure                                         | Value                                                                                                                                                                                                                        | Source    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Fuel at end of run                              | Persona runs: 0, 2, 6, 6, 7, 8, 10, 15, 15, 16, 18, 18. random: median 23. wander: median 0. staircase: 14 to 16                                                                                                             | logs, sim |
| Shifts begun at zero fuel                       | Persona runs: 1 (Greedy 23, shift 34, left alive in it). random: 183 runs had one. wander: 860 runs                                                                                                                          | logs, sim |
| AP unspent at shift ends                        | 19 in 12 runs (round one: 176)                                                                                                                                                                                               | logs      |
| Shifts begun with the lamp out                  | 26, in 5 runs: Greedy 11: 11, Cautious 11: 6, Greedy 23: 6, Newcomer 37: 2, Greedy 37: 1 (a miscount, relit next shift). None in the other 7                                                                                 | logs      |
| What was done in the dark                       | 104 actions: 68 moves, 18 mines (15 of them ore), 7 ladders placed, the rest crafts and drops                                                                                                                                | logs      |
| What a lamp that never ran out would have shown | Replaying the same actions with the lamp kept lit: Greedy 11 sees 28 more cells and 15 more traced blocks, Cautious 11 10 and 9, Greedy 23 8 and 9; nothing more in Greedy 37 or Newcomer 37. Round one: 3, 9, 0, 0, 0 cells | logs      |
| Simulated runs ending in the dark               | random: 189 of the 215 runs longer than 12 shifts. wander: 905 of 1,000                                                                                                                                                      | sim       |
| Nearest coal on the top layer                   | Seed 11: 14 steps from the start. Seed 37: 9. Seed 23: 4. Over 1,000 seeds: within 4 steps on 335, within 6 on 550, more than 10 on 156, more than 15 on 17                                                                  | gen       |

The lamp replay follows the actions the player actually took, which the dark had already shaped, so it understates what a lit lamp would have been worth.

### Items and recipes

| Item or recipe        | Persona runs (logs)                                                                                                     | Simulated                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Ladder (craft, place) | 47 crafts in 10 runs; 141 placed in 12 runs. Carried out unused: 3, 3, 5, 6, 6, 6, 6, 17, 20 in the 9 runs that had any | random: 474 crafts, 929 placed. wander: 1,131 crafts, 2,979 placed |
| Fuel (craft)          | 30 crafts in 7 runs                                                                                                     | random: 75. wander: 316                                            |
| Lamp oil (craft)      | 17 crafts in 7 runs                                                                                                     | random: 74. wander: 319                                            |
| Torch (craft, place)  | 1 crafted, 1 placed (Cautious 23); it revealed nothing the lamp had not                                                 | random: 9 crafted, 3 placed. wander: 35 crafted, 29 placed         |
| Support (craft)       | 0 (cannot be placed until M2, by plan)                                                                                  | random: 194 crafted. wander: 532 crafted. 0 placed                 |
| Stone                 | Never used. 104 drop actions                                                                                            | Used only in support crafts                                        |
| What was carried out  | Ore in all 12 runs: 38 raw copper, 44 raw iron, 5 crystal in all. Pack at 19 or 20 of 20 in 7 runs                      | random: 6 runs mined ore. wander: 17. staircase: 50                |

### Traces

| Measure                                                 | Value                                                                                                                                                                            | Source |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| First traces against first ore seen                     | Traces a shift or more earlier in 9 runs; same shift in 3 (Cautious 23, Greedy 37, Speed-runner 37)                                                                              | logs   |
| Trace marks on the map at the end of a run              | 273 marked blocks still standing over the 12 runs. 159 of them had no ore left within 2 steps (stale); 114 still did                                                             | logs   |
| Known rock near ore that the map drew as plain          | At 171 of 257 shift ends, at least one block the player knew, below the top layer, was within 2 steps of ore and drawn without `%`. Most at once: 35 (Greedy 23), 28 (Greedy 37) | logs   |
| Traced blocks mined, and how many were hard rock (3 AP) | 54 mined; 14 were hard rock, drawn with the same `%` as traced stone and dirt                                                                                                    | logs   |
| Simulated runs that saw traces before ore               | random: 18. wander: 56. staircase: 470                                                                                                                                           | sim    |

## 4. The pillars

1. **Every block is a bet.** Better served than in round one, in the last two layers before ore: traces gave odds, and players acted on them and could say afterwards why they were right or wrong. Above the first trace there is still nothing to bet on (159 of 269 phases with only plain rock in reach). The fall warning was honoured by three personas and priced by the fourth; nobody was hurt by something they had not been told. Two places where the map let a player draw a false conclusion are in finding 4.
2. **The dig is the escape route.** Shown a little more than last time. Speed-runner 23 undercut its own staircase and paid a shift; Newcomer 23 and 37 each saw that a block on offer was holding up their stair and left it; Cautious 37 tripped on a jog it had dug into its own shaft. The climb itself is still a count of identical moves (170 actions).
3. **Resources buy options, not power.** One real three-way split now exists, coal into fuel, lamp oil or cargo, and several reports call it the right kind of small decision (Cautious 23, Greedy 23). It exists only where coal does. Health turned out to be a resource that buys AP and nothing else (finding 2). Torch and stone still buy nothing.
4. **Deterministic and seeded.** Held. All 12 logs replay to their recorded hash. No report describes an outcome the player could not explain.

## 5. Findings

### 1. Between the surface and the ore the game is still one routine, repeated; the routine changed, the repetition did not

Severity: **major**. Kind: **design**. Round one's finding 3 (issue #23), persisting. Bears on owner questions 42 and 50.

Observed:

- Reports: all 12 list the descent, the climb or both as tedious or automatic. Greedy 23: "nineteen shifts of mine-down, drop the stone, ladder-down, down." Greedy 37 ran 21 shifts "from one saved command line". Cautious 37: "by this third run I was chaining a full shift of it at a time and only reading the last view. That habit is what caused the shift 19 and shift 27 mistakes." Newcomer 23: "From shift 7 on I was never unsure what to do next."
- Logs: 159 of 269 phases had only plain rock in reach. 47 shifts repeat the one before; the deep Greedy runs hold 29 of them. 170 actions were climbs or steps up with, in every report, nothing to decide.
- The three ways down now have different prices, measured by the Speed-runner in play: per layer, round trip, a fall costs the mine plus 2 AP and 1 health; ladder-first the mine plus 3 AP; a cut step two mines plus 2 AP. Speed-runner 37: "There is a real choice, but a narrow one, and after one run it is settled."
- Each persona picked one way and kept it: Cautious and Greedy the ladder-first shaft in all 6 runs, Newcomer steps in dirt and the ladder shaft in stone, Speed-runner falls. No report describes changing method in response to what the rock showed, except to follow a trace.
- In hard rock the shift still divides one way: Greedy 23: "in hard rock (5 AP a layer) there was no spare AP at all."
- What was called interesting was again at the ends and at the ore: reading the surface map on shift 1 (Greedy 37, Newcomer 23), reading traces, the order of mining around a ladder at the vein (Cautious 37, Greedy 37), fitting the last ore into the AP left (Speed-runner 37, Greedy 23).

Inference: the owner's decision changed which move is repeated, not whether one is. With no hazards the rock above the ore is empty by plan and M2 is meant to fill it; that part should not be held against M1. Two parts will still be there in M2: a one-cell ladder shaft remains the cheapest safe descent by 1 to 2 AP a layer over steps, and the climb out is a fixed count of moves along a route nothing changes before M4. Traces shortened the empty stretch (ore was found by layers 7 to 8 in most runs, where round one dug to 12 and beyond) and so shortened the problem without touching it. Owner question 50 asked whether the free zigzag would replace the shaft: it did not; steps were the dearest way down in AP and only the Newcomer and one Speed-runner test run used them for long.

Suggested: keep on the owner's list under question 42 with this round's evidence; no code. Ask the M2 playtesters specifically whether hazards broke the routine or were merely laddered past.

Reproduce: `greedy-37.json` (shifts 16–36), `greedy-23.json` (shifts 6–24), `newcomer-37.json` (shifts 10–14).

### 2. The new fall rule put a price on the bare shaft; it did not make it dangerous

Severity: **major**. Kind: **design**. Bears on owner question 42 ("a single one-block shaft should be dangerous") and decision note 0010, whose form is still for the owner to confirm.

Observed:

- Logs: 13 uncontrolled falls in 12 runs, each of 1 block, 13 health lost, no death, lowest health 4. 11 of the 13 were the Speed-runner buying AP: 1 health saves the 1 AP of the climb down. The other two were taken once each to see what happens.
- Reports, Speed-runner: "Health as a currency. Each fall saved exactly 1 AP over the ladder way and cost 1 health that nothing else in this version wants." "Fall while health lasts, since nothing else in this version wants health." It stopped at health 4 only because of the "below that is unseen" wording.
- Reports, the other three personas: the rule never touched them. Greedy 37: "as a rule it never touched my play: a ladder in my cell removes it completely, and ladders were never short." Cautious 37: "A cautious player gets no information about the new fall rules except from the help text." Newcomer 37: "I lost 1 health in 68 shifts and that was on purpose."
- Logs: 104 of 117 mines of the block underfoot were made from a ladder. The ladder is needed for the way back in any case, so the safe shaft costs exactly 1 AP a layer more than the fall. The lowest stock of ladders plus uncrafted timber at any point in any run was 3 ladders' worth.
- Code (`src/engine/gravity.ts`, `src/data/avatar.ts`): 1 health for each of the first 2 blocks, as decision 0010 says. Nothing in M1 restores health, and nothing else takes it.
- Sim: the rule can kill a player who does not read: fell is 37 of 214 deaths (random) and 171 of 1,000 (wander), none before shift 16.

Inference: the owner asked for danger and got a toll. A one-cell shaft is still what at least 8 of 12 runs sank for most of their depth; it is safe with a ladder and cheap without one. Danger would need an outcome the player cannot fully price in advance, or a cost that the ladder does not cancel; in M1 every fall is exactly 1 block, the warning says so, and the "or more" never happens (finding 16). M2 changes part of this: voids make a fall of unknown depth real, and health will have other claims on it. It does not change the ladder exemption. Other explanations to hold open: the Speed-runner persona is built to find exactly this trade, and three personas avoiding the fall entirely could be read as the warning working.

Suggested: owner's question list (proposed question A in section 8). No code until answered. Data values involved, if the owner wants a steeper price: `uncontrolledFallDamagePerBlock` in `src/data/avatar.ts`; the ladder exemption is a rule, not a number.

Reproduce: `speedrunner-11.json` (shifts 1–4), `speedrunner-37.json` (shifts 2–4), `greedy-37.json` (shift 52).

### 3. Whether fuel and the lamp limit a run is decided on shift 1 by how far away the surface coal is

Severity: **major**. Kind: **design**. Bears on owner questions 47 (how long the lamp lasts), 13 and 2, and on round one's finding 5.

Observed:

- Gen: the nearest top-layer coal is 14 steps from the start on seed 11, 4 on seed 23, 9 on seed 37. Over 1,000 seeds it is within 6 steps on 550 and more than 10 away on 156.
- Seed 11 (far): Cautious and Greedy both decided the walk was not worth it. Fuel then ran both runs (ended at 7 and 2) and the lamp went out on schedule at the end of shift 12; these are the two runs that worked in the dark. Cautious 11: fuel is "a countdown to the end of the run that I could do nothing about on this seed."
- Seed 23 (near): Cautious took 7 coal, Greedy 5, Newcomer 5, before or just after starting down. Cautious 23: "fuel stopped being a limit by shift 5 and I stopped thinking about it. On seed 11 it was the whole run. I could not tell which of those the game means it to be." Keeping the lamp lit all run took "two crafts, 2 AP and 2 coal in total. Once I had coal it was not a decision."
- Seed 37 (middling): Greedy walked 14 moves to the largest patch, took 16 coal, played 52 shifts and left with 6 fuel. Cautious took 10, and fuel "read 24 afterwards, the same as at shift 1" at shift 22. Newcomer skipped it, found 2 coal underground, and finished in the dark: "the first decision in three runs whose consequence arrived much later."
- Logs: in the 7 runs that crafted fuel or oil, the lamp was out for 9 shifts in all (6 of them Greedy 23's climb, where it "made no difference"). In the 2 seed-11 runs without coal it was out for 17.
- In the coal-rich runs the thing that ended the run was the pack: 7 of 12 runs left at 19 or 20 of 20 weight (finding 12).

Inference: the fuel rule and the lamp rule each work when they bind, and playtesters valued both. They bind together or not at all, and which it is depends on one fact visible on the first screen. One coal is 3 shifts of fuel or 8 shifts of light for 1 AP, so a handful of coal removes both clocks for a whole M1 run. This is round one's finding 5 (the top layer hands out coal without risk) with real consequences now that fuel cannot be had by waiting. For question 47: the starting oil of 3 does what issue #41 intended on a start without coal, and the two players who met the dark there worked in it for 6 and 11 shifts. On a start with coal the starting oil hardly matters, because the lamp lasts as long as the player likes. So the lamp-life question cannot be settled by the starting oil alone; it depends on how much coal a run is meant to have and what a coal is worth in oil. Whether "walk for coal or do without" is a good opening decision (three reports say it was the most consequential choice of the run) or an accident of generation is the owner's call. Sample caution: three seeds, one of each kind.

Suggested: owner's question list (proposed question B). Data values involved: the upper band's `veinsPer1000Cells` for `coalSeam` in `src/data/generation.ts`; the fuel and lamp-oil yields in `src/data/recipes.ts`; `lampOil` and `fuel` in `src/data/loadouts.ts`. No direction is proposed, because the direction depends on the answer.

Reproduce: compare `cautious-11.json` with `cautious-23.json`; `greedy-37.json` (shifts 3–15); `newcomer-37.json` (shifts 1, 16–22).

### 4. Traces find ore, but the map misleads in two ways: known rock that has not been lit looks trace-free, and marks stay after the ore is gone

Severity: **major**. Kind: **design**. Bears on owner question 51 and decision note 0012.

Observed, known-but-unlit rock:

- Code (`src/engine/tells.ts`, decision 0012): traces are noticed only on a block that is revealed and in light. A block known through the pick's reach (a diagonal, or the ring one layer down) is on the map and in the mine list with no traces until light touches it. The state keeps no record of which known blocks have been lit, so the play tool cannot draw the difference.
- Logs: at 171 of 257 shift ends the map held at least one known block within 2 steps of ore drawn as plain rock.
- Reports, three personas. Cautious 11: "I read absence as information when it was not ... I was right by luck." Speed-runner 11: "I read '#' as 'no ore near here' and nearly ruled out the direction the ore was in." Greedy 11: "Plain rock on the map can mean 'no ore near' or 'not looked at closely yet', and the map does not say which." Speed-runner 37 worked round it by treating every diagonal as unknown.

Observed, stale marks:

- Logs: of 273 trace marks standing at the ends of the runs, 159 had no ore left within 2 steps.
- Reports, three personas. Greedy 37: "After the crystal was gone the whole area on layers 22 to 24 was covered in '%'. I could not tell which marks were still true. The only test I found was to dig into unmarked ground ... at 4 AP a look." Cautious 37: "Along a vein the traces say 'yes' everywhere, so I found each next ore by walking to the end of the tunnel and looking." Newcomer 11 listed it as a possible bug: "'ore is near' was false as far as I could ever find at layer 11." The message "You notice mineral traces: ore is near" is printed on rock newly lit by removing the very ore it refers to.

Observed, what traces cannot say:

- Greedy 23 spent two shifts tunnelling after traces at layer 20 that belonged to iron overhead, which the pick cannot reach. Newcomer 37 followed a trail for three layers that went cold. Greedy 23 read deep-band traces as crystal; they were iron.

Inference: the tell works for the first ore of a vein and the pleasure in the reports comes from reading which walls are marked and which are not. That reading depends on a clean wall meaning something, and today it means either "no ore within 2" or "not lit yet" with nothing to tell them apart; the players who reasoned from absence were right partly by luck. After the first ore is mined the marks stop carrying information, which is the case decision 0012 foresaw ("an old `%` can point at ore that is gone") and question 51 asks about. The round's answer to 51: the reach of 2 was usable and nobody called it noise before mining began; not fading is what three personas tripped over. Both points will matter more on a phone, where there is no mine list to read the truth from.

Suggested: owner's question list (proposed question C, which sharpens 51). No code until answered.

Reproduce: `cautious-11.json` (shifts 5–6, 9–10), `speedrunner-11.json` (shifts 4–5), `greedy-37.json` (shifts 37–43), `newcomer-11.json` (shifts 9–12).

### 5. The lamp-out banner says "No diagonal mining" while diagonal mines are on the list, and it shows on the surface in daylight

Severity: **minor**. Kind: **bug** (play tool wording; the rules are right). Raised by Cautious 11 and Newcomer 37.

Observed:

- Code (`tools/play/view.ts`, `hudLines`): the text "LAMP IS OUT: you know only the six cells touching yours. No diagonal mining, no looking down a drop, no moves you cannot judge" is printed whenever lamp oil is 0, wherever the miner stands.
- Code and decision 0011: blocks revealed earlier stay revealed and stay mineable. The help text says so ("plus anything you saw earlier").
- Logs: at 90 decision points with the lamp out (actions and ends of shift), at least one diagonal mine was on the list. 5 were chosen (Greedy 23: 4, Greedy 11: 1). 4 decisions were taken on the surface with the banner showing; all 4 lists offered diagonal mines into the top layer, all of which daylight had shown.
- Newcomer 37: "the banner and the list contradict each other on the same screen."

Inference: the banner states the rule for unseen cells as if it were a rule about actions. On the surface it is simply untrue.

Suggested: developer task on the play tool: word the banner as what the lamp no longer reveals, and do not show the restrictions where daylight makes them false. Failing test first.

Reproduce: `cautious-11.json` (shift 13), `newcomer-37.json` (shifts 21–22).

### 6. In the dark, a loose item tells the player whether an unseen cell has a floor, and the move list then refuses a move the player knows is safe

Severity: **minor**. Kind: **design**. Widens owner question 49 (open).

Observed:

- Logs, Cautious 11, shift 15, lamp out, miner on a ladder at layer 10: mining the block below let a stone lying in the miner's cell fall into the new hole. The result line read "1 Stone fell 1 block to layer 11" and the map marked it there. In the same view: "No climb down: you have not seen how far the drop under the cell below goes."
- Checked by replay: the cell the stone landed in (layer 11) is revealed, because it touches the miner's cell. The cell under it (layer 12) is not revealed.
- Code (`tools/play/describe.ts`, `itemFell`): the tool names the landing layer only when the landing cell is revealed, and says "out of sight" otherwise. So the tool adds nothing the engine's state does not already show: a loose pile sitting in a revealed cell.
- Code (`src/engine/gravity.ts`): loose items fall until they rest on a solid block, and ladders do not hold them.

Inference: this is not a leak in the tool's wording. It is the rule of question 49 seen from another side: the miner sees an item come to rest in a cell it knows, which proves there is a floor under that cell, but "revealed" does not record that, so the climb down stays off the list. Both lines on the screen are true; together they read as the playtester put it: "The game told me the answer and then said I did not know it." It reaches further than question 49 says. Question 49 is about a mined yield that does not fit the pack. From the code, any item dropped (0 AP) from a ladder over an open cell does the same: "fell 1 block to layer N" means a floor, "fell out of sight" means none. That is a free one-cell depth probe in the dark; no playtester used it on purpose.

Suggested: add this case to question 49 for the owner (proposed question D). No code until answered.

Reproduce: `cautious-11.json`, entry 72 (shift 15).

### 7. "Zero fuel at upkeep ends the run": the code follows decision 0005 item 21, the design doc's sentence can be read the other way, and the preview does not warn at "fuel 1 -> 0"

Severity: **minor**. Kind: **design** (a doc sentence and an assumed answer to confirm; no rule defect). Bears on owner question 19, still "assumed". Raised by Greedy 23; round one's Greedy 11 and Greedy 37 raised the same thing.

Observed:

- Greedy 23: fuel went 1 → 0 at the end of shift 33 and the run went on; shift 34 was played at fuel 0 with 5 AP, and ending it would have been death.
- Decision 0005 item 21: "at upkeep, if fuel is 0 the run ends, otherwise the shift's fuel is consumed ... a player may finish a shift on 0 fuel and survive only by crafting fuel before the next upkeep."
- Code (`computeUpkeep` in `src/engine/shift.ts`): tests fuel before taking the shift's fuel. The same as 0005 item 21.
- Design doc 4: "Fuel is consumed ... Zero fuel at upkeep ends the run." Design doc 5.3: "Out of fuel: Fuel is 0 at upkeep." Neither says before or after the shift's fuel is taken.
- Play tool: at fuel 1 the end-of-shift line says only "fuel 1 -> 0". Greedy 23: "It did not say that the following shift would be my last."

Inference: by 0005 item 21 and the code, the game is right and Greedy 23 saw the intended behaviour: 24 fuel is 24 shifts plus one at zero. The design doc does not contradict the code; it is ambiguous, and three playtesters over two rounds have read it the other way. Question 19 has never been answered by the owner, only assumed, and with no refill the extra shift now matters (it was Greedy 23's whole margin).

Suggested: ask the owner to confirm question 19 as it stands, then reword design doc 4 and 5.3 to say which. Separately, a play-tool task: when ending the shift would leave fuel at 0, say that the next shift is the last unless fuel is crafted.

Reproduce: `greedy-23.json` (shifts 33–34).

### 8. "Not on the list" notes are missing in three cases players met

Severity: **minor**. Kind: **bug** (play tool). Decision 0013 lists what the notes cover; these are outside it.

Observed:

- **In a pit after a fall.** Logs: 9 times a fall left the miner with AP in hand and no move on the list (Speed-runner 11: 5, Speed-runner 37: 3, Newcomer 37: 1). Checked with the tool's own `missingMoveNotes`: no note in any of the 9. Newcomer 37: "an action list with no moves and no explanation ... I had to infer 'you are in a pit' from the absence of n e s w." It cost that player 2 ladders and the rest of the run's willingness to dig underfoot. Code (`tools/play/missing.ts`): a climb-up note is given only when the miner's cell holds a ladder; a bare pit is "a plain wall" four times and gets nothing.
- **An action left off for want of AP.** Code (`legalActions`): unaffordable actions are filtered out, and the notes cover moves only. Newcomer 37, shift 9: "an action missing because of AP looks exactly like an action missing because of a rule." Greedy 11 met the same in round one. With `%` hiding the rock type (finding 10) the map cannot answer it either.
- **A step up that used to be there.** Speed-runner 23, shift 7: the stair cell had been mined away; the list offered "Move north, then drop 1 block" and no note.

Inference: each is a place where the list is correct and silent. The first is the one that matters: it is the first thing a new player meets after trying the fall the game has just priced for them.

Suggested: developer task on the play tool for the pit case (a note saying there is open space overhead and how a ladder gets you out) and for AP (a line naming what is in reach but costs more AP than is left). Failing tests first. The third case belongs with finding 9.

Reproduce: `newcomer-37.json` (shift 2), `speedrunner-23.json` (shift 7).

### 9. Nothing warns before a player mines a block their own way out stands on

Severity: **minor**. Kind: **design**.

Observed:

- Speed-runner 23, shift 4: mined the block that was the tread of its own previous step, because the stair had turned back under itself. Found out at shift 7; cost about a shift and 6 ladders.
- Newcomer 23, shift 7: "mine-n was offered on a Timber-root that was the block under my previous step ... The list gave no hint; I only caught it because I looked at the map column by column." Newcomer 37 left an iron ore for the same reason.
- The list does warn about the block under the miner's feet, in full.

Inference: this is pillar 2 doing its job; the mistake was the player's and traceable. Whether the game should say "this block holds up your route" is a real question, because on a phone the player sees one layer at a time and the block in question is on another. Saying it would need the game to know what "your route" is, which it does not today.

Suggested: owner's question list (proposed question E). Carry into the M2 brief: ask playtesters to note every time they damage their own route.

Reproduce: `speedrunner-23.json` (shifts 4, 7).

### 10. `%` on the map hides what the rock is, and so what it costs

Severity: **minor**. Kind: **bug** (play tool; decision 0012 chose one character per cell and noted the cost).

Observed:

- Logs: 14 of the 54 traced blocks mined were hard rock (3 AP), drawn like traced stone (2 AP) and dirt (1 AP).
- Reports, 5 runs: Cautious 11 (shift 12: "It left me 2 AP instead of 3, which is why I could not mine the iron while the lamp was still lit"), Greedy 11, Newcomer 11, Newcomer 23 ("I still cannot plan AP from the map when traces are about"), Newcomer 37.

Inference: the mine list does name the rock, for blocks in reach and affordable. Players plan a shift from the map. The cost lands exactly where traces have just made the next block interesting.

Suggested: developer task on the play tool: show rock type and traces together. Note for the M3 renderer: traces should be a mark on the block, not a replacement for it.

### 11. Stone still goes into the pack unasked and is thrown away by hand; a dropped stone now follows the shaft down

Severity: **minor**. Kind: **design**. Round one's finding 6 (issue #26), persisting. Owner question 43 is open.

Observed:

- Logs: 104 of 1,146 actions were dropping stone (round one: 126 of 1,363). 107 stone went into packs; 1 came out of the cube.
- Reports, 9 of 12. Newcomer 37: "Ten drop-stone inputs in five shifts." Newcomer 11: when the pack was full the stone was "left lying there", "which was the behaviour I wanted all along."
- New this round, Cautious 23: "Every stone I dropped in my cell fell to the new bottom each time I mined the floor ... so I was offered take-here-stone every shift and dropped a new one every shift." Greedy 23: 17 loose stone at the foot of the shaft by layer 20.
- Greedy 11, shift 19: an unwanted stone took the pack to 20 of 20 just before the last iron; noticed only from the gauge.

Inference: unchanged from round one. That stone has no use is by plan until M2 (supports, sealant). That it is collected by default and removed by a free action a hundred times is M1's own.

Suggested: stays with question 43. Nothing new to ask.

### 12. In most runs the 20-weight pack, not fuel, ended the run, and whole shifts went on crafting things weightless

Severity: **minor**. Kind: **watch**. Bears on owner question 21 (ladders, fuel and oil weigh nothing).

Observed:

- Logs: 7 of 12 runs left at 19 or 20 of 20. Ten ore fill a pack.
- Cautious 37 spent three whole shifts (14, 18, 22) crafting coal and timber into fuel, oil and ladders to free weight: "Nothing in the help told me that ladders, fuel and oil being weightless is the important fact about them." It left with 20 spare ladders; Newcomer 23 with 17: "Converting timber to ladders was only a way to shed weight."
- The pack also produced the decisions playtesters liked: what to leave (Newcomer 11, shift 18; Newcomer 23, shift 20), whether to convert and go back for more (Cautious 37, shifts 21–22: "the one real 'is it worth it' decision of the run").

Inference: a full pack is a reasonable end to a run that has no contract, and camps (M2) add stashing and smelting. What to watch is the weight-shedding by craft: 1 AP turns weight into a gauge with no cap (question 31), so the carry limit can be worked round wherever coal or timber is the load.

Suggested: carry into the M2 brief.

### 13. Timber and ladders never limited anyone

Severity: **minor**. Kind: **balance**. Round one's finding 5 (issue #25), the timber half, persisting. Owner question 13.

Observed:

- Logs: the lowest stock of ladders plus uncrafted timber at any moment in any run was 3 ladders' worth (Greedy 37, Speed-runner 11). Nine runs carried out unused ladders, 72 in all.
- Gen and reports: timber was 1 to 5 steps from the start on all three seeds and every persona that looked took it on shift 1 without leaving the surface. Cautious 23: "Standing on top and using the 'one layer down' reach felt safe and a little too easy."
- The one shortage: Newcomer 37 skipped the surface timber on purpose and "switched to staircases through stone at one layer per shift".

Inference: as in round one, timber limits only the player who does not look. It matters more now, because a ladder is what cancels the fall rule (finding 2) and what makes the dark workable (a ladder per step).

Suggested: balance task only if the owner wants ladders to bind. Data values and direction: upper-band `veinsPer1000Cells` for `timberRoot` in `src/data/generation.ts`, the ladder yield in `src/data/recipes.ts`, the `standard` loadout; lower.

### 14. The torch still has no job, and health has none except to be spent on falls

Severity: **minor**. Kind: **watch**.

Observed:

- One torch crafted and placed in 12 runs, with the lamp lit; it revealed nothing. The two runs that worked in the dark had no coal, and a torch needs coal. A player with coal makes oil instead: 1 coal is 8 shifts of light that moves with the miner, against one fixed torch for 1 coal, 1 timber and 2 AP.
- Health: 8 runs ended at 10 of 10. "Hazards: none known" was on every view (Newcomer 11 and 23: "I do not know what a hazard is in this game").

Inference: both are mostly by plan: M2's hazards give health its meaning, and gas makes the torch a risk to weigh. But as the recipes stand, the only player who needs a torch is one who cannot make it, so decision 0011's "this is now the reason to place a torch" was not borne out.

Suggested: carry into the M2 brief; ask whether any torch was placed for its light.

### 15. Nothing says what a haul is worth or what a run is for

Severity: **minor**. Kind: **watch** (by plan until contracts in M4).

Observed:

- Greedy, all three reports: "Nothing in the game says what any ore is worth." It went to layer 20 for crystal "on the strength of the design doc's band table". Newcomer 23: which ore to leave "was a coin toss rather than a judgement". Newcomer 11: "'salvage' sounded like a consolation prize without saying what the better result would have been." Newcomer 37: "I still do not know what the run is for."
- Play tool: the end screen gives shifts, depth, health and fuel, with the pack listed below as on any view. No value, no comparison.

Inference: contracts, payouts and the salvage fee are M4, so this is by plan. It limits what rounds can show until then: the Greedy persona cannot play its brief, and "outcome mix" is 12 of 12 salvage again.

Suggested: no task now. If the coordinator wants the M2 round to test trade-offs in what to carry, an interim line of salvage values on the end screen would be the cheapest way; that is a question of plan, not a defect.

### 16. The fall warning says "1 block or more" every time and it is always 1

Severity: **minor**. Kind: **watch**. Round one's finding 9, persisting.

Observed: 13 unheld mines underfoot, 13 falls of 1 block. Speed-runner 37: "By this run I was ignoring it. I kept health above 4 because of it, but I have no idea how likely a longer fall is."

Inference: unchanged. It is true only once M2 has voids. The health floor the Speed-runner kept shows the wording still carries some weight.

Suggested: carry into the M2 brief, as before.

### 17. Small things in the play tool's text

Severity: **minor**. Kind: **bug** (play tool).

- The lamp-oil rate is not stated: the help says "a little every few shifts". Cautious 11 and Greedy 11 each learned "1 every 4 shifts" from the preview line at shift 4. The preview was trusted and right every time.
- "Loose in your cell: 5 Stone" beside "Pick up 4 Stone" (Cautious 23, Newcomer 23): the count is what fits the pack and the line does not say so.
- "You notice mineral traces: ore is near" is printed about rock uncovered by mining the ore itself (Newcomer 11; see finding 4).
- "Got 1 Stone. 1 Stone fell 1 block to layer 7" reads as if the same stone fell (Speed-runner 11).

Not a problem: four actions were wasted on chained names that had changed meaning because the miner had moved (Cautious 37 shifts 2, 19, 27; Speed-runner 23 shift 7). All four playtesters called it their own mistake, the list had said what each name would do, and a name that was not on the list stopped the chain cleanly (Newcomer 37, shift 7).

Suggested: one small developer task for the four wording points.

## 6. The eight points the coordinator asked about

| #   | Point                                                                               | Classification                                                                                                                                                                            | Where     |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Lamp-out banner against diagonal mines; banner in daylight                          | **Bug**, play tool wording. The rule is right and the help states it                                                                                                                      | Finding 5 |
| 2   | "1 Stone fell 1 block to layer 11" in the dark                                      | **Design.** Not a leak in the wording: the tool reports only a revealed landing cell. The rule itself lets a resting item prove a floor the move list will not act on. Question 49, wider | Finding 6 |
| 3   | Run continued one shift at fuel 0                                                   | **Not a rule problem.** Code and 0005 item 21 agree; the doc sentence is ambiguous and question 19 is still only assumed. **Design** (confirm and reword), plus a tool wording gap        | Finding 7 |
| 4   | Falling is the cheapest descent; a ladder cancels the fall; is the shaft dangerous? | **Design.** No: it is priced, not dangerous                                                                                                                                               | Finding 2 |
| 5   | Coal near the start decides whether fuel and lamp matter                            | **Design**, with balance values named. Question 47 cannot be settled by starting oil alone                                                                                                | Finding 3 |
| 6   | Traces: stale; known-unlit rock looks clean; `%` hides rock type                    | Stale and unlit: **design** (question 51). `%`: **bug**, play tool                                                                                                                        | 4 and 10  |
| 7   | Missing "Not on the list" notes; no warning when mining your own stair              | Notes: **bug**, play tool. Stair warning: **design**                                                                                                                                      | 8 and 9   |
| 8   | Stone by hand; identical shaft shifts; no values or goal                            | Stone: **design**, persisting; its lack of use is by plan (M2). Shaft: **design**, not by plan. Values and goal: **watch**, by plan (M4)                                                  | 11, 1, 15 |

## 7. Compared with last round

| Round-one finding                                  | Now                                                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Fuel is not a clock (major)                     | Resolved. See finding 3 for what replaced it                                                                                                              |
| 2. Finding ore is luck (major)                     | Improved. New: finding 4                                                                                                                                  |
| 3. One repeated move (major)                       | Persists: findings 1 and 2                                                                                                                                |
| 4. Light changes nothing (major)                   | Improved for runs without coal; the torch part persists: findings 3 and 14                                                                                |
| 5. Top layer hands out timber and coal (minor)     | Persists and matters more: findings 3 (coal) and 13 (timber)                                                                                              |
| 6. Stone collected and dropped by hand (minor)     | Persists: finding 11                                                                                                                                      |
| 7. Run-length and cube-share targets clash (minor) | Persists unchanged: 1.3 blocks mined per shift. Question 44 is open                                                                                       |
| 8. Stuck below the last ladder (minor, watch)      | Changed by the fuel rule: a stuck miner now does run out of fuel. One near case (Newcomer 37's pit, 2 ladders to escape). Still for the M2 brief          |
| 9. Fall warning never more than 1 block (watch)    | Persists: finding 16                                                                                                                                      |
| 10. Play tool: shifting numbers, hidden top layer  | Resolved. No action was lost to a number changing; three personas used the whole-top-layer map as a shopping list. New tool points: findings 5, 8, 10, 17 |

New this round: findings 2 (as a rule to judge), 3, 4, 5, 6, 8, 9, 10, 12, 14 (torch reasoning), 17.

## 8. Proposed questions for the owner

Not added to `docs/owner-questions.md`; for the coordinator to number and add.

- **A. Fall danger (question 42, decision 0010).** The 1-health fall was used as a way to buy 1 AP and was otherwise avoided for 1 AP and a ladder. Is a price what was meant, or should a bare shaft carry a risk the player cannot cancel with a ladder they need anyway? (Finding 2.)
- **B. Coal at the start (questions 13, 47).** A few coal within reach on shift 1 remove both the fuel clock and the lamp clock for a whole run; none within reach makes both bind. Is that spread between seeds wanted? The lamp-life question depends on the answer. (Finding 3.)
- **C. Traces (question 51).** Two parts. Should a block the miner knows but has not lit be shown differently from one it has lit and found clean, or should reach show traces while the lamp is lit? And should marks fade or change once no ore is left near them? (Finding 4.)
- **D. Items as probes in the dark (question 49).** A dropped or fallen item shows whether an unseen cell has a floor, for 0 AP, and the move is still refused. Offer the move, hide where items come to rest in the dark, or leave it? (Finding 6.)
- **E. Undermining your own route.** Should the game warn before a player mines a block their stair or ladder depends on, as it does for the block underfoot? (Finding 9.)
- **Question 19, to confirm.** Fuel is tested before the shift's fuel is taken, so a player gets one shift at zero. Assumed since M1; three playtesters over two rounds read the design doc the other way. (Finding 7.)

## 9. What could not be assessed

- **Whether the fall deaths in the sim were long falls or health worn down.** The sim's output gives cause and shift only.
- **The dark as a place to explore.** The two runs that worked in it had ore already in view when the lamp went out. Nobody tried to find something new in the dark, and nobody had a torch there.
- **Traces as a way to choose where to dig from the surface.** All four personas started within a few cells of the start on all three seeds. Whether traces help on a seed whose start column shows none (151 in 1,000 by decision 0012's survey) was not tested.
- **The deep band.** One run reached crystal (Greedy 37). No simulated run went below layer 12.
- **Fall damage as a hazard.** No fall was unplanned, and none was longer than 1 block.
- **Learning effects.** Each persona again played 11, 23, 37 in order, and the seeds differ most in exactly the thing finding 3 is about. Seed 11 is both the coal-poor seed and everyone's first run; Cautious and Greedy doing without coal there may be inexperience as much as distance.
- **Pillar 1 in full, pillar 2 on the way out, pillar 3's trade-offs, run length against section 12, what a haul is worth.** As in round one, and for the same reasons: no hazards, no escape phase, no camps, no contract.
- **Whether any of this is fun.** Not the evaluator's call.

## 10. What the owner should look at

1. **The shaft is not dangerous yet.** You asked for a one-block shaft to be dangerous. What was built charges 1 health per block, and a ladder in your cell cancels it. Three of four players never fell; the fourth fell eleven times on purpose because 1 health was a fair price for 1 AP and nothing else needs health. (Finding 2, question A.)
2. **Going down and coming up is still automatic.** Players chained a whole shift of the same commands and stopped reading the screen; one ran 21 shifts from a saved command line. The traces made the last two layers before ore interesting. Everything above them, and the whole climb, is not. (Finding 1.)
3. **Coal near the start switches the two clocks off.** With no coal in reach, fuel ran the whole run and the lamp went out half-way, and players said that was the best part. With coal four steps away, neither mattered again after shift 5. Which of those the game is meant to be is yours to say; how long the lamp should last follows from it. (Finding 3, question B.)
4. **Traces work, and then mislead.** Players found ore by reasoning from which walls were marked. But a wall can look unmarked only because the lamp has not reached it, and marks stay after the ore is gone, so a mined-out vein is covered in marks that mean nothing. (Finding 4, question C.)
5. **Working by touch in the dark was liked.** Two players spent 6 and 11 shifts feeling their way along a vein one ladder at a time and called it the most thoughtful part of their run. That is your "make light matter" decision working. It happened only on the seed without coal.
6. **One sentence in the design doc to settle.** "Zero fuel at upkeep ends the run": the game gives you one last shift at zero. Players keep reading the doc the other way. (Finding 7.)
