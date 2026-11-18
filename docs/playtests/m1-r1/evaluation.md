# Evaluation: playtest round m1-r1

Milestone M1 (engine core), engine 0.1.0. 12 persona runs (Cautious, Greedy, Speed-runner, Newcomer on seeds 11, 23, 37) and 3,000 simulated runs. There is no previous round.

## 1. Summary

The engine did what its rules say in every run: all 12 play logs replay to their recorded state hash, no playtester met an error, an empty action list, or an outcome they could not explain, and the action list's warnings (fall depth, "your ladder holds you", "too heavy to carry", the end-of-shift fuel line) were read and relied on. What does not work yet is pressure and choice. Fuel is the only clock M1 has, and the design doc's own numbers let a player refill it by standing still and play on indefinitely at zero, so nothing in M1 can end a careful run. Whether a run finds ore depends on where the first shaft happens to be, with nothing on screen to steer by; and between the surface and the first ore the dig is one repeated move down and one repeated move up. The lamp, torches and stone had no effect any playtester could find. The one thing most worth settling before M2 is the fuel rule (owner question 23), because M2's camp upkeep and entombment test are both written in terms of fuel.

No finding is rated `blocker`. Four are `major`; all four are questions for the owner rather than defects in the code.

## 2. Numbers

Sources, named in every row below:

- **sim random / wander / staircase**: `npm run sim -- --runs 1000 --policy <name> --json`, seeds 1–1000, shift cap 300. Random-policy numbers show what the rules allow, not how people play.
- **logs**: the 12 play logs in this folder, stepped through the engine's public functions by the evaluator (one replay per log; every hash matched).
- **gen**: the cubes of seeds 1–1000 as `createRun` generates them, read directly.
- **reports**: the 12 playtest reports.

### Outcomes and deaths

| Measure                    | Value                                                                                                                                                                                                                                         | Source       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Outcome mix by persona     | Cautious 3 salvage; Greedy 3 salvage; Speed-runner 3 salvage (course completed on 2 of 3); Newcomer 3 salvage. 0 deaths in 12 runs                                                                                                            | logs         |
| Outcome mix, simulated     | random: 789 salvage, 211 death. wander: 1000 death. staircase: 1000 salvage                                                                                                                                                                   | sim          |
| Death causes               | Out of fuel: 1,211 of 1,211 simulated deaths. Fell: 0 of 3,000 runs                                                                                                                                                                           | sim          |
| Deaths preceded by a tell  | All of them, in the sense that the end-of-shift forecast states an out-of-fuel death before the player confirms it (Greedy 11, shift 30: "THE RUN ENDS: you ran out of fuel and died"). No persona died, so no report tests this from a death | sim, reports |
| Health lost                | 0 in all 12 persona runs; longest fall 1 block. Simulated: 2 health in 1 random run, 24 health over 12 wander runs, none in staircase runs; lowest health seen anywhere 8 of 10                                                               | logs, sim    |
| Shift at which deaths came | random and wander: earliest 26, median 34, latest 54 (random) and 58 (wander)                                                                                                                                                                 | sim          |

### Run length and share of the cube mined

| Measure              | Value                                                                                                                       | Target (design doc 12) | Source |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| Shifts, persona runs | 11, 15, 15, 16, 19, 22, 30, 32, 33, 37, 45, 79                                                                              | 150–250                | logs   |
| Shifts, simulated    | random: median 2, max 54. wander: median 34, max 58. staircase (layer 8 and back): 9–11. No run of 3,000 reached 150 shifts | 150–250                | sim    |
| Blocks mined         | 15–73 per persona run, which is 0.05%–0.22% of the cube. 420 blocks in 354 shifts in all: 1.2 blocks per shift              | 2–3% (655–983 blocks)  | logs   |
| Share mined, sim     | random: mean 0.06%, max 0.27%. wander: mean 0.22%, max 0.33%. staircase: 0.05%                                              | 2–3%                   | sim    |

The target is for a completed tier-1 contract, and M1 has no contract, so the run lengths are not a miss in themselves. Finding 7 is about whether the two targets can be met together at all.

### Choices per player phase

| Measure                                    | Value                                                                                                                                                                                                            | Source    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Legal actions at the start of a phase      | random: mean 18.8 (6–35). wander: mean 17.4 (5–35). staircase: mean 27.7 (19–34). Persona runs: per-run mean 20.8–30.4 (12–36)                                                                                   | sim, logs |
| What those actions are (persona runs)      | Per phase, by run: 12.9–16.0 "mine" lines, 2.0–6.9 "drop" lines, 0.4–4.1 "craft", 0.9–2.7 "move", 0.4–2.7 "place ladder"                                                                                         | logs      |
| How many differ in outcome (approximation) | The mine lines covered 1.9–2.6 different kinds of block per phase (per-run means). In 260 of 354 phases, no block within reach was anything but dirt, stone or hard rock                                         | logs      |
| Shifts repeating the one before            | 76 of 354 shifts used exactly the same sequence of action kinds as the shift before (drops and pick-ups ignored). Longest unbroken stretch: 10 shifts (Greedy 37), 9 (Greedy 23), 5 (Greedy 11, Speed-runner 11) | logs      |
| What the 1,363 actions were                | 544 moves (226 climbs or steps up, 218 level walks, 100 down), 420 mines, 171 ladders placed, 135 drops (126 of them stone), 80 crafts, 12 leaves, 1 pick-up                                                     | logs      |

"Differ in outcome" is not something the sim reports. The figures above are the evaluator's proxy (kinds of block among the mine options); they count options, not consequences, and should be read as an upper bound on real choice in a phase, not a measure of it.

### Items and recipes

| Item or recipe        | Persona runs (logs)                                                          | Simulated                                                          |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Ladder (craft, place) | 44 crafts in 9 runs; 171 placed in 10 runs                                   | random: 485 crafts, 912 placed. wander: 1,183 crafts, 2,892 placed |
| Fuel (craft)          | 31 crafts in 6 runs                                                          | random: 86 crafts. wander: 412                                     |
| Lamp oil (craft)      | 5 crafts in 3 runs                                                           | random: 92. wander: 437                                            |
| Torch (craft, place)  | 0 crafted, 0 placed                                                          | random: 7 crafted, 1 placed. wander: 33 crafted, 25 placed         |
| Support (craft)       | 0 crafted (cannot be placed until M2, by plan)                               | random: 212 crafted, 0 placed. wander: 625 crafted, 0 placed       |
| Stone (carried item)  | Never used. 126 drop actions. Carried out only as a token (3, 3, 5, 3 stone) | Used only in support crafts, and supports cannot be placed         |
| Crystal               | Carried out in 1 run (Greedy 23, 4 crystal)                                  | No simulated run reached layer 20                                  |

### Fuel

| Measure                        | Value                                                                                                                                                                      | Source          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Fuel at end of run             | Persona runs: 0, 0, 1, 2, 5, 6, 9, 10, 12, 12, 14, 14. random: median 23. wander: 0 in every run. staircase: 14–17                                                         | logs, sim       |
| Shifts begun at zero fuel      | Persona runs: 11 shifts in 3 runs (Speed-runner 11: 9; Greedy 11: 1; Greedy 37: 1), none fatal. random: 211 runs had one, all 211 died. wander: mean 1.2 per run, all died | logs, sim       |
| Fuel refunded from banked AP   | 46 fuel over the 12 persona runs, against 93 fuel crafted from coal. 176 of 1,770 AP went unspent                                                                          | logs            |
| Idling from the first shift    | Ending 30 shifts in a row without acting takes fuel from 24 to 44. The run stays active                                                                                    | engine, seed 11 |
| Playing on at zero fuel        | Fuel run down to 0 by shift 25, then 200 further shifts spending 2 AP each: fuel stays 0 and the run stays active                                                          | engine, seed 11 |
| Spending 3 or 4 AP every shift | 3 AP per shift: out of fuel at shift 73. 4 AP per shift: out of fuel at shift 37                                                                                           | engine, seed 11 |

### What the cube holds

| Measure                                                             | Value                                                                                                                                   | Source |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A one-cell shaft at the start cell shows iron or copper by layer 12 | 576 of 1,000 seeds (the shaft shows the 3×3 column around it down to one layer below the miner)                                         | gen    |
| The same shaft shows iron or copper anywhere in layers 8–19         | 796 of 1,000 seeds                                                                                                                      | gen    |
| The same shaft, continued to layer 31, shows crystal                | 421 of 1,000 seeds                                                                                                                      | gen    |
| Round seeds                                                         | Seed 11: no ore in that column; nearest is 3 cells off. Seed 23: 12 iron ore in it at layer 16. Seed 37: 1 copper ore in it at layer 13 | gen    |
| Coal seams on the top layer                                         | Mean 22.7 blocks, never 0. Within 6 steps of the start on 550 of 1,000 seeds                                                            | gen    |
| Timber-roots on the top layer                                       | Mean 20.3 blocks, 0 on 1 seed of 1,000. Within 6 steps of the start on 584 of 1,000 seeds                                               | gen    |

## 3. The pillars

1. **Every block is a bet.** Not assessable as written: M1 has no hazards and so no tells. What can be said: the reveal rules gave every playtester correct information about the blocks within reach, and none reported a result they could not explain. But a bet needs odds, and before the first ore is in view there are none (finding 2). The one risk M1 does state, "you will fall 1 block or more; below that is unseen", was shown on 126 mines and was a 1-block fall every time (finding 9).
2. **The dig is the escape route.** Partly shown. The shape of the dig mattered when it was dug: ladders are not recoverable, the pick does not reach upward, and a stair tread must keep rock under it. Speed-runner 11 dug one ladder deeper than the kit could climb and spent 14 shifts finding one piece of timber; Cautious 23 (shift 5) and Speed-runner 11 (shift 12) each had to work out a way up before taking a block. The trip out itself asked for nothing: 226 upward moves in the round, each the only sensible action (finding 3). The escape phase that is meant to test the route is M4.
3. **Resources buy options, not power.** Mostly not assessable: there are five field recipes, one of which cannot be used, and no camps. Of what exists, coal offered a real split only between fuel and cargo; lamp oil and torches bought nothing observable (finding 4), stone has no use (finding 6), and fuel can be had for nothing by waiting (finding 1).
4. **Deterministic and seeded.** Held. All 12 logs replay to their recorded final hash. No report describes an outcome the player could not explain from what they had seen.

## 4. Findings

### 1. Fuel does not act as a clock: waiting refills it, and a run can continue at zero fuel without end

Severity: **major**. Kind: **design**. Bears on owner question 23 directly, and on 3, 19 and 31; question 12 depends on the answer.

Observed:

- Engine, seed 11: 30 idle shifts take fuel from 24 to 44. At zero fuel, 200 shifts of 2 AP each leave the run active. Only a player who spends 3 or more AP in a shift, shift after shift, runs out.
- Logs: Speed-runner 11 began 9 consecutive shifts (25–33) at zero fuel and left alive. Greedy 37 idled on shifts 77 and 78 and fuel went 1 → 2 → 2. Newcomer 37 ended shift 28 with 4 AP unspent and fuel went 8 → 9.
- Sim: every one of 1,211 simulated deaths was out of fuel, at shifts 26–58. Those policies almost never leave AP unspent.
- Reports: all four personas noticed; 11 of 12 reports mention it. Cautious 11: "I did not understand what fuel is meant to limit if waiting is free." Speed-runner 11: "It slowed me from 5 AP a shift to 2; it could not kill me unless I chose to spend the AP." Newcomer 11, shift 6: "from here on I did not believe fuel could really kill me." Newcomer 37, shift 28: "It felt like cheating, and waiting five or six shifts to gain three fuel would have been very dull, so I did it once and then went home on what I had." Greedy 37, shift 77: "I checked the line twice before believing it."
- Separately, top-layer coal alone made fuel a non-issue for the players who collected it: Greedy 23 never fell below 6 and peaked at 30; Newcomer 23 "Fuel: never" (see finding 5).

Also observed, and not the same thing: fuel did shape decisions for players who did not wait. Greedy 11 (shifts 19–30), Greedy 37 (shifts 43 and 51) and Newcomer 37 (shift 31) counted AP to the surface against fuel and called it the tense or interesting part of the run. Greedy 11 left on the last AP of a shift begun at zero fuel.

Inference: the rule is implemented as the design doc and decision 0005 (items 20, 21) state it. With 5 AP per shift, 3 banked AP per fuel and 1 fuel per shift, any shift with 3 or more unspent AP is free and an idle shift is a net gain; the gauge has no maximum (question 31). So "out of fuel" is a death a player opts into. The tension three playtesters valued came from not being willing to wait, which is a matter of patience, not of the rules. Other explanations to hold open: the personas were told to watch for this (Cautious and Speed-runner), so its prominence in the reports is partly prompted; the measurements above are not.

Why it matters beyond M1: design doc 4 and 8 charge camp upkeep in fuel, and 5.3 defines entombment as lacking "the fuel and materials" to make a path. With fuel available by waiting, neither means anything, and a stuck avatar (finding 8) can never be shown to be out of fuel. The owner's answer is needed before those two M2 tasks are specified. Data values involved: `bankedApPerRefund`, `fuelPerRefund`, `fuelPerShift`, `apPerShift` in `src/data/shift.ts`; these are the design doc's own numbers.

A smaller point for question 19: three reports found a playable shift at zero fuel surprising. Greedy 37: "It reads as dead and is not." Greedy 11 notes that the design doc "reads as if zero fuel at upkeep ends the run" while the help text allows one more shift. Both players used it as intended once understood.

Reproduce: `greedy-37.json` (shifts 77–79), `speedrunner-11.json` (shifts 24–33).

### 2. Finding ore is decided by where the first shaft is, and the game gives nothing to choose that by

Severity: **major**. Kind: **design**. Bears on owner question 33 (ore density and vein size, assumed) and on design doc 3.3.

Observed:

- Gen: a one-cell shaft at the start shows iron or copper by layer 12 on 576 of 1,000 seeds, and anywhere in the middle band on 796. About one cube in five shows a full middle-band shaft no ore at all.
- Logs and gen: the three Speed-runner runs used the same route and took 33, 16 and 11 shifts. Seed 11 has no ore in the start column; seed 23 has 12 iron ore in it; seed 37 has one copper ore, at layer 13, which is the layer in view on arrival at 12.
- Runs that found no ore: Speed-runner 11 (14 layers, a 6-cell tunnel and four test pits; the report estimates 220 cells seen), Newcomer 11 (17 layers), Newcomer 37 (17 layers and 8 cells of tunnel), Greedy 37's first trip (26 layers and 11 cells of tunnel at layer 26, 51 shifts, empty pack).
- Reports: Speed-runner 23: "The run length was decided by where the ore was, not by anything I did." Newcomer 37: "I could trace the empty pack to no decision of mine that I could name." Greedy 37: "I could not tell whether I was unlucky or looking in the wrong way." Cautious 23: "Prospecting was a blind 3 AP per cell." Speed-runner 11: "every direction looked the same."
- Where a vein was touched, the vein rule worked as 3.3 intends: Greedy 23 followed four crystal one block at a time (shifts 30–33); Newcomer 23 found six more iron in view after the first four.

Inference: the generator and reveal rules behave as written. The effect is that the largest factor in a run's result is a draw the player cannot see or influence, which sits badly with pillar 1's "traceable to a decision". Two things could explain it and the round cannot separate them: the density itself (about 2% of a band per ore, question 33), or the absence of any information beyond the cells touching the dig. Scanners (M2, and they need crystal and a camp) and contract survey hints (M4) are the planned sources of that information, so some of this is by plan; but as the rules stand a player reaches the middle band, and can leave it again, having had no clue to act on. Sample caution: three seeds, of which one is a rich column and one an empty one.

Data values involved, if the owner treats it as density: `veinsPer1000Cells`, `minSize`, `maxSize` for the middle and deep bands in `src/data/generation.ts`.

Reproduce: compare `speedrunner-11.json` with `speedrunner-23.json`; `newcomer-37.json`; `greedy-37.json` (shifts 12–51).

### 3. Between the surface and the ore there is one move, repeated: the straight shaft beats every other way down, and the way up has no decisions

Severity: **major**. Kind: **design**. Bears on decision 0005 items 6 and 7 and owner questions 24 and 34; the M1 rules here are also what M2's hazards will sit on.

Observed:

- Logs: 76 of 354 shifts repeat the shift before action for action; the longest stretches are 10 and 9 shifts. 175 of 420 mines were the block under the miner's feet. 226 of 1,363 actions were a climb or step up along a route already built. 9 of 12 runs used a ladder shaft; only Cautious used stairs throughout.
- Reports: all 12 list the descent, the climb or both under tedious or automatic. Greedy 37: "about 50 of the 79 shifts offered no decision." Newcomer 37: "27 of 37 shifts in which there was one sensible move." Greedy 23: "Shifts 8–29: 22 shifts of 'Mine below you / Place a ladder in the cell above you / Drop Stone / End'." Speed-runner 37: "The whole run was one sensible move at a time." Cautious 37: "Once the staircase method is known, the descent has one sensible move at almost every step."
- The repetition had a cost in attention: Greedy 23 dug three layers past a crystal in view ("I was by then repeating the same four choices every shift"); Newcomer 23 passed copper at layers 7–8 and noticed three layers later; Speed-runner 23 lost a shift at the top ("automatic enough that I stopped reading the screen").
- Why the shaft wins, from the rules: mining the block underfoot costs the block's AP and the 1-block fall is free, so a layer of stone costs 2 AP down and 2 AP back (ladder, climb). A stair costs two mined blocks and two moves per layer. Speed-runner stood on layer 12 on shift 6, 7 and 6 of the three seeds. Speed-runner 11: "I never found a reason to dig any other shape on the way down."
- In hard rock (3 AP) the shift divides one way only: mine, ladder, 1 AP over. Greedy 11: "one layer per shift with 1 AP left over." Greedy 11 at shift 20: with 2 AP left "every Hard rock block vanished from the action list."
- What was called interesting was nearly all at the ends of a run: reading the top layer and choosing where to stand (Speed-runner 23, Newcomer 23 and 37), ladder and AP arithmetic near the turn-round (Greedy 11, Speed-runner 37, Newcomer 37), what to drop for the last ore (Cautious 11, Newcomer 23).

Inference: with no hazards the rock between the surface and the ore is empty by plan, and M2 is meant to fill it, so some of the monotony should not be held against M1. Two parts of it do come from M1's own rules and will still be there in M2: the free fall makes mining underfoot the cheapest descent by a wide margin, and the climb out is a fixed count of identical moves along a route that nothing changes until the escape phase in M4. Whether hazards alone will make the descent a sequence of decisions, or whether the cheapest-route rule needs the owner's attention first, cannot be told from this round. The Newcomer's later loops were driven by a script that chose actions by label, which is itself evidence the choices had become mechanical, but that persona's shift counts for "tedious" should be weighed as coming from a player who had stopped reading; the same pattern is reported by the three personas who played by hand.

Reproduce: `greedy-23.json` (shifts 8–29), `greedy-37.json` (shifts 12–51), `speedrunner-37.json` (whole run).

### 4. Lamp oil, the lamp going out, and torches changed nothing a player could see

Severity: **major**. Kind: **design**. Bears on owner question 22 (reach reveals, assumed) and 40, and on 6, 10 and 11 (light radius, lamp-oil rate).

Observed:

- Logs: the lamp was out for 73 shifts across 5 runs. Replaying each log with a lamp that never runs out, the player ends up having seen 3 more cells in Greedy 11 (1 of them not plain rock), 9 more in Greedy 23 (2 not plain rock), and exactly the same cells in Greedy 37 (32 shifts dark), Speed-runner 11 (9) and Newcomer 37 (13).
- Logs: no torch was crafted or placed in 12 runs. Lamp oil was crafted 5 times in 3 runs.
- Reports, 9 of 12 say the lamp did nothing they could find. Newcomer 37, shift 24: "The map looked exactly as it had the shift before. On shift 25 I turned the Coal into fuel instead, since the dark had cost me nothing." Newcomer 37: "After three runs I do not know what lamp oil is for." Greedy 11: "It did not change what I could do; the cells my pick reaches were still shown." Speed-runner 37: "Fuel, lamp oil, coal and health played no part."

Inference: decision 0005 item 10 always reveals the 17 cells in reach, the cell overhead, and the cells a drop is judged by. In a one-cell shaft or tunnel that is everything a radius-3 lamp would light, so the light radius of design doc 5.1 has nothing left to do, and the coal-into-oil recipe is a worse use of coal than fuel in every case seen. This is the assumed reading doing what it says, not a defect. It may change by itself when M2 adds caverns and other open spaces, where light travels; it will not change in dug tunnels, which is where all 12 runs were spent. It also bears on M2 directly: the tells of design doc 6 are on blocks within 1 or 2 of a pocket, which the reach rule will show regardless of light, and the torch-or-safety-lamp choice for gas (question 10) presumes the player wants light.

Reproduce: `newcomer-37.json` (shift 24 onward), `greedy-37.json` (shifts 40–79).

### 5. The top layer hands out timber and coal without risk, so neither limited any player who looked

Severity: **minor**. Kind: **balance**. Bears on owner questions 13 (timber supply), 2 (starting kit) and 21 (ladders weigh nothing). Decision 0005 asked this round to show whether timber limiting shaft depth "is a real choice".

Observed:

- Gen: the top layer holds on average 22.7 coal seams (68 fuel) and 20.3 timber-roots (61 ladders), all revealed at the start and all within the pick's reach from the surface. Only 1 seed in 1,000 has no timber there; none has no coal.
- Logs: the runs that collected from the surface first made 27 ladders from 5 timber (Greedy 23 and 37) and reached layer 26 on them; fuel peaked at 30 and 31. Newcomer 23 threw away 8 timber. Speed-runner 23 took 2 timber from the start cell for 2 AP.
- Timber did limit the two first runs that did not look: Newcomer 11 ("Timber decided how deep the shaft could go") and Speed-runner 11 (one ladder short).
- Reports: Speed-runner 11 lists it under things that look exploitable: "the whole top layer is visible from the start, including every timber-root and coal seam, and the pick reaches layer 0 from the surface." Planning the surface walk was also one of the few things called interesting (Newcomer 23, shift 1: "I enjoyed that").

Inference: the answer to 0005's question is that timber was a constraint for exactly one run per player, the one before they looked at the top layer; after that 5 timber and the kit covered any depth reached, and cut steps covered the rest (Greedy 11, layers 22–23). The same holds for fuel wherever coal lay near the start. Whether that is too generous is the owner's call under question 13. Data values involved and direction: the upper band's `veinsPer1000Cells` for `coalSeam` and `timberRoot` in `src/data/generation.ts`, and the `standard` loadout in `src/data/loadouts.ts`; lower, if these are meant to bind.

Reproduce: `greedy-23.json` (shifts 1–7), `speedrunner-23.json` (shift 1).

### 6. Stone is collected automatically, has no use, and has to be thrown away by hand; free dropping means the carry limit never bites on anything unwanted

Severity: **minor**. Kind: **design**. Bears on decision 0005 items 16–18 and owner questions 11 and 30.

Observed:

- Logs: 126 of 1,363 actions were dropping stone (43 in Greedy 37 alone). 213 of the 420 blocks mined yielded stone.
- Reports, all four personas. Greedy 11: "Dropping Stone every shift is a chore." Cautious 11: "Stone therefore had no use at all, and I dropped it each time I picked it up." Speed-runner 23: "the carry limit only ever asks me to remember to press 'drop' before mining something I want." Newcomer 11 carried 6 stone to layer 9 wondering "whether Stone was the thing to collect."
- "Craft Support" was offered whenever stone and timber were held, although supports cannot be placed (Cautious 11, Newcomer 11).
- The carry limit did produce the round's clearest trade-offs when the pack held only wanted things: Cautious 11 shift 12, Greedy 23 shift 42, Newcomer 23 shifts 27–28 ("the one moment in three runs that felt like a real trade").

Inference: stone gets its uses in M2 (supports, sealant), so "no use" is by plan and may resolve. The handling cost is M1's own: the yield goes into the pack unasked, and removing it is a free action taken dozens of times. Whether mined stone should enter the pack by default is a question for the owner; on a phone each of those drops is at least one tap.

Reproduce: `greedy-37.json` (any stretch of shifts 12–43).

### 7. The run-length target and the cube-share target cannot both be met with the design doc's AP numbers

Severity: **minor**. Kind: **design**. Bears on design doc 12 against 4 and 3.2; no owner question covers it yet.

Observed:

- Design doc 12 asks for 150–250 shifts and 2–3% of the cube mined, which is 655–983 blocks. At 5 AP per shift, 250 shifts are 1,250 AP. Below layer 7 nearly every block costs 2 AP (stone, ore) or 3 AP (hard rock, crystal), so 655 blocks cost at least 1,310 AP with no AP spent on anything else.
- Logs: the personas mined 1.2 blocks per shift (420 in 354). At that rate 250 shifts is about 300 blocks, 0.9% of the cube. The most a persona run mined was 73 blocks (0.22%, Greedy 37, 79 shifts).
- Sim: the largest share in 3,000 runs was 0.33%.

Inference: this is arithmetic on the doc's own defaults, not a defect in the build. Camp clearings and explosives (M2) will add blocks at a better rate than a pick, so the gap may narrow; it is unlikely to close by a factor of two or more. Until one of the three numbers moves, later rounds cannot be judged against section 12 as written.

### 8. An avatar below its last ladder has no way up and no way to end the run except by choosing to burn its fuel

Severity: **minor**. Kind: **watch**. Bears on owner questions 12 (entombment: "Should lacking ladders count?"), 4 (mining overhead) and 34 (a climb needs a ladder in the miner's own cell too).

Observed:

- Engine, seed 11: at the bottom of a one-cell shaft with no ladder in the cell, the legal actions at full AP are 17 mines and pick-up and drop lines; there is no move.
- Speed-runner 11 was one ladder short at layer 1 with no timber and spent shifts 19–32 looking for a timber-root: "I could have been stuck below layer 0 for ever, alive, at 2 AP a shift. I got out only because a timber-root happened to extend below layer 0 within reach."
- Nothing warned of it. Speed-runner 11: "Nothing in the game warned me that I was digging deeper than my ladders could bring me back from." Greedy 11, shift 15, left a ladder out of the shaft by running out of AP: "Nothing warned me; I only saw it because the cell above showed '.' instead of '='."
- Related one-way rules met by other runs: placed ladders cannot be taken back (Newcomer 11 lost one of six to a mistyped number); ore one layer above a tunnel cannot be reached at all (Greedy 37, shift 68: "one block from my head and I had no way to take them").

Inference: decision 0005 records that entombment detection is M2 and that a stuck avatar cannot end the run in M1, so this is known and by plan. The round adds evidence for question 12: the one near-entombment seen was a shortage of ladders, not of fuel, and with finding 1 a fuel test would never fire. Carry into the M2 playtest brief.

Reproduce: `speedrunner-11.json` (shifts 12, 19–33).

### 9. The only risk warning in M1 was shown 126 times and was never more than a 1-block fall

Severity: **minor**. Kind: **watch**. For the M2 brief, when voids and caverns exist.

Observed:

- Logs: 126 mines of the block underfoot with no ladder in the cell. Every one was a fall of 1 block. No persona lost health.
- Reports: the same line, "you will fall 1 block or more; below that is unseen", split the personas. Newcomer 11: "I never took this action in the whole run." Cautious placed a ladder first every time. Greedy took it 76 times and Speed-runner 50: "Nothing was under any of them in this cube."

Inference: the warning is accurate, and two personas changed what they did because of it, which is pillar 1 working. But in M1 nothing can be under a block, so the players who ignored it were right, and by M2 a returning player will have learnt that the line means nothing. Whether the same wording still reads as a warning once caverns make it true is worth a specific look next round.

Reproduce: `greedy-23.json` (shifts 8–29).

### 10. Play tool: menu numbers shift after each action, and the default map hides most of the top layer

Severity: **minor**. Kind: **bug** (the text play interface, not an engine rule). Decision 0009 left grouping the action list "until the first playtest round says it is needed".

Observed:

- Five mis-chosen actions in four runs came from a number changing meaning between two choices in a chain: Cautious 11 (shifts 5 and 8), Cautious 23 (shift 12), Newcomer 11 (shift 2, a ladder lost for good). After that Cautious and Newcomer sent one choice per command. The help text does warn of it.
- The drop line the players needed most often "sits near the bottom of the list and its number changes" (Cautious 11). Newcomer 11: "every view listed sixteen 'Mine ...: Stone, gives 1 Stone' lines that I had no reason to choose between."
- The help says "You know the whole top layer from the start", but the default view draws 9 by 9 cells of it. Newcomer 23: "I only found them because I happened to try `--radius`. A player who does not would play seed 11's run again." Greedy 11 never learned whether its cube had coal.
- A move that is missing because the drop is too long is not explained anywhere on the view (Cautious 23, shift 18).

Inference: these cost the playtesters AP and attention and so colour the evidence for other findings (the Newcomer's script was a response to them). None is a rule defect. The phone interface of design doc 11 selects by tapping a block, so the numbering problem is specific to this tool; the hidden top layer is not.

## 5. Compared with last round

There is no previous round. All ten findings are new.

## 6. What could not be assessed

- **Pillar 1 in full (tells, countdowns, deaths traceable to a decision).** M1 has no hazards. No persona died, and the only simulated cause of death is fuel. Nothing here says whether tells will be noticed.
- **Pillar 2 on the way out.** Nothing changes the route between digging it and climbing it until the escape phase (M4). The round shows the route constrains the dig, not that it matters during the climb.
- **Pillar 3 (trade-offs in what to craft and carry).** Camps, camp recipes and supports are M2. The field recipes alone are too few to judge.
- **What a haul is worth.** There is no contract and no salvage fee on screen, so no playtester could say whether a result was good, and neither can this evaluation. Greedy 23: "I had no reason to prefer one to the other." Newcomer 23: "Two runs, one with five stones and one with a full pack of ore, got the same word." This is by plan (M4), but it means the Greedy persona's aim could not really be played, and the "outcome mix" measure is flat: 12 of 12 salvage.
- **Run length and share mined against section 12.** The targets are for a completed tier-1 contract. Only the arithmetic in finding 7 can be offered.
- **How many legal actions differ in outcome.** Not produced by the sim. Section 2 gives a proxy from the logs (kinds of block among the mine options, and repeated shifts); it does not measure consequences.
- **Never-used items other than placeables.** Assessed from the logs for what M1 has (stone, torch, support, lamp oil). Crystal and ore have no use until camps exist.
- **The deep band.** Two personas reached it (Greedy, three runs), none of the 3,000 simulated runs did, and only one run found crystal. Nothing can be said about its density or pacing beyond finding 2's column count.
- **Learning effects.** Each persona played its three seeds in order in one session, so seed 37 is always a third run and seed 11 always a first. Differences between seeds and differences from practice cannot be separated; the Speed-runner's 33, 16, 11 is both.
- **The Newcomer's later shifts.** From shift 22 of seed 23 onward the loops were chosen by a script that stopped when anything but rock came into view. The first twenty actions of seed 11 and the confusions listed in all three reports are first-hand; the "tedious" shift counts for seeds 23 and 37 are not independent evidence of boredom.
- **Whether any of this is fun.** Not the evaluator's call.
