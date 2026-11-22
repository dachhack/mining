# Depth survey: how deep runs get, and what would change that

Task T15 (issue #108), for the owner's question 85: "Measure first." Engine 0.4.0, measured on main as of PR #109 (the vent). No rule and no number in `src/data` was changed to make this report.

## The short answer

1. **Today no run reaches the hazards.** In 1,000 runs of each of five scripted players, not one released water, gas or lava, saw unstable ore, saw damp stone, pitted rock or warm glow, or mined iron, copper or crystal. The only hazards any run met were slumping walls and empty caverns.
2. **The deepest a careful player gets is about 6 levels.** The middle band, where water, gas, iron and copper begin, starts at 8. The most careful script (a planned pit in a corner, held by supports) finishes a pit 6 deep in 80% of runs, 7 deep in 45%, and 8 deep in 18%. A benched pit in the middle of the map gets 3 or 4 deep.
3. **The reason is the budget.** A run starts with 24 fuel, which is 24 shifts, 120 AP. The cheapest possible pit to depth 8 costs about 174 AP of mining in a corner and about 493 AP in the middle, before trees and supports. Coal found on the way roughly doubles the budget, and that is all.
4. **None of the three options is enough by itself** to make runs meet the hazards:
   - (a) shallower bands: runs reach the middle band (79% to 100%), but at most 4% release water or gas, because pockets are few and only the bottom few squares of a pit are in the band;
   - (b) more fuel or AP: runs reach depth 8 (67% to 100%), but at most 2% release water or gas, for the same reason;
   - (c) larger slump limits: almost no effect (19% reach depth 8 today, 27% with every limit 2 higher).
5. **Combinations do work, if pocket and ore density go up too.** Three candidate settings are measured below (table 9). Under each, a careful player releases water or gas in about half of runs (49% to 60%) and mines ore in 65% to 75%, and a greedy player is still buried every time. Each needs four numbers to change: where the bands start, the starting fuel, how many pockets, how many ore veins.
6. **Two things the survey found on the way:** a pit in a corner costs about a third of a pit in the middle, so a careful player always digs in a corner (question 129); and the starting camp makes a careful digger slightly worse off, not better (table 10; question 130).

The choice is the owner's: question 128 in `docs/owner-questions.md`.

## What the owner chose, and what it did

**Added after the survey (2026-11-20, issue #108).** Everything from "How it was measured" down describes the game before the choice: 24 fuel, the middle band at layer 8. The owner chose:

- **candidate C:** the middle band starts at layer 4 and the deep band at 12; starting fuel 72; six times as many water and gas pockets; three times as many iron and copper veins;
- **camps worth founding:** the cheaper mining reaches 8 steps (was 4) and a camp's upkeep comes every 8 shifts (was 4);
- **corner pits:** left as they are.

Those numbers are now in `src/data` (decision note 0040). Measured again on the real data, 300 seeds for each policy (tables A1 to A5 at the end):

|                                                             | Before                   | After                    |
| ----------------------------------------------------------- | ------------------------ | ------------------------ |
| Careful pit planned 8 deep (`terrace:8`): finished it       | 18%                      | 89%                      |
| ... mined iron or copper                                    | 0%                       | 57%                      |
| ... released water / released gas                           | 0% / 0%                  | 24% / 20%                |
| ... crew was hurt / crew lost                               | 0% / 0%                  | 39% / 11% (all poisoned) |
| ... shifts played (median)                                  | 45                       | 67                       |
| Benched pit in the middle (`pit`): deepest square (median)  | 3                        | 5                        |
| ... mined ore / released water / released gas               | 0% / 0% / 0%             | 16% / 19% / 10%          |
| ... shifts played (median)                                  | 45                       | 99                       |
| Greedy player buried                                        | 100%                     | 100%                     |
| Careful pit 8 deep with a camp against without: finished it | 41% against 48% (7 deep) | 94% against 89%          |

- The hazards are part of normal play now, and the camp pays for itself.
- **Every crew lost by the careful script is lost to gas.** The script digs on in gas without a vent; a person who heeds pitted rock, or makes a vent, should not. That is the first thing for the M2 playtest round to look at.
- Lava and unstable ore are still never met: the deep band starts at 12 and no run gets below 10.
- A careful run now takes 34 to 99 shifts, against the design doc's target of 150 to 250 for a finished contract.
- The 60%, 75% and 24% quoted for candidate C in table 9 are for a pit planned 10 deep (`terrace:10`), measured with exactly these numbers; the table above gives the pit planned 8 deep, which most runs finish.

## How it was measured

Scripted players ("policies") played whole runs in the simulator, each on the same seeds, 1 to 1,000, with the standard loadout. They see only what a player sees. They are not people: read them as a floor and a ceiling.

| Policy    | How it plays                                                                                                                                                                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `random`  | Picks a kind of action at random, then a legal action of that kind. Never closes the mine. The floor.                                                                                                                                                                                                       |
| `greedy`  | Digs the steepest pit the level rule allows in the middle of the map and ignores slumps.                                                                                                                                                                                                                    |
| `camp`    | `greedy`, with a camp founded near the pit and a rest when the crew is hurt.                                                                                                                                                                                                                                |
| `pit`     | Digs a pit in the middle and never takes a mine that would make a square unstable, so its pit grows the level benches its rock needs. Closes the mine before the fuel runs out.                                                                                                                             |
| `terrace` | The nearest to a careful player. Plans a pit to a target depth in a corner, digs it layer by layer, makes supports and places them on the wall before a crack falls, takes every coal block it sees, and closes the mine when the pit is done. `terrace:8` plans a pit 8 deep; the plain `terrace` plans 6. |

What the scripts do not do, and a person might: read a tell and dig somewhere else, pump or dam water, move a camp, or use explosives (no run ever gets the iron for one). So the scripts say reliably how far the fuel and AP reach. They say less about how well a person would cope once hazards appear: in the candidate settings below, the `terrace` script loses its crew in 16% to 24% of runs partly because it digs on through water and gas without reacting.

"Deepest square" is the most levels any one square went down. A square at depth 8 shows a block of layer 8 as its top, so "reached the middle band" means at least one square got to depth 8.

## What the numbers say

### How deep, and how runs end (tables 1 to 3)

- `random` never goes below 1 level and runs out of fuel after about 25 shifts.
- `greedy` is buried in every run, after about 15 shifts, 3 levels down. `camp` lives in 26% of runs and is buried in 74%.
- `pit` always lives, plays about 45 shifts, mines about 108 blocks, and reaches 3 levels (67% of runs), 4 (32%) or 5 (1%).
- `terrace` always lives, is never hurt, plays about 33 shifts, mines about 62 blocks, and reaches 6 levels in 80% of runs.

So the same fuel buys 3 levels in the middle of the map with benches, and 6 in a corner with supports.

### What runs met (table 4)

- Slumps: every `greedy` and `camp` run; no `pit` or `terrace` run (their blocks crack, and they deal with the crack in time).
- Caverns: 9% to 27% of runs break into one, depending on the policy. Nothing comes out of a cavern.
- Mineral traces: 20 `terrace` runs in 1,000. No other policy saw any.
- Everything else, for every policy: 0 runs in 1,000.

### How far a careful player can push (table 5)

The `terrace` policy with deeper targets: 100% finish a pit 4 or 5 deep, 80% finish 6, 45% finish 7, 18% finish 8, 5% finish 9, 0.4% finish 10. A run that aims too deep ends shallower, because the top layers of a big pit use up the fuel: with target 10 the median run ends 3 levels down. Even the 181 runs that reached depth 8 met no water, gas or ore: one square, the pit's bottom, touched the band.

### What a pit costs against what a run has (table 6)

A run has 120 AP at the start. Each coal block mined and burnt gives 15 AP for 3 AP spent; `terrace` runs made 14 to 28 fuel from coal on average, which is 70 to 140 AP more. So a run has roughly 200 to 260 AP in all. Against that, mining alone (no trees, no supports) costs:

| To depth        | In a corner, walls held by supports | In the middle, walls held by supports | In the middle, benched for dirt |
| --------------- | ----------------------------------- | ------------------------------------- | ------------------------------- |
| 6               | 79 AP                               | 203 AP                                | 700 AP                          |
| 8 (middle band) | 174 AP                              | 493 AP                                | 1,768 AP                        |
| 12              | 563 AP                              | 1,762 AP                              | 6,183 AP                        |
| 20 (deep band)  | 2,667 AP                            | 9,021 AP                              | 22,104 AP                       |

The deep band, where the design doc puts crystal, relics and the keystone, costs about 11 times a run's whole budget in a corner and about 40 times in the middle of the map.

## The owner's three options

Each was played, not only worked out on paper: the simulator changed the numbers in its own memory and played seeds 1 to 200 with `pit`, `terrace:6`, `terrace:8` and `terrace:10` (tables 7 and 8). The percentages below are for the policy that did best.

### (a) Bring the depth bands shallower

In `src/data/world.ts` (`WORLD.depthBands`).

| Change                       | Reached the middle band | Saw damp stone or pitted rock | Released water or gas | Mined iron or copper |
| ---------------------------- | ----------------------- | ----------------------------- | --------------------- | -------------------- |
| Today (middle band at 8)     | 19%                     | 0                             | 0                     | 0                    |
| Middle band at 6, deep at 16 | 79%                     | 2%                            | 2%                    | 2%                   |
| Middle band at 4, deep at 12 | 100%                    | 7%                            | 4%                    | 8%                   |

It gets runs to the band cheaply and does not lengthen them. But the band is nearly empty where a pit touches it: the whole middle band holds about 10 water pockets and 7 gas pockets, and a pit 6 or 8 deep has only its bottom 4 to 20 blocks in a band that starts at 4. It also brings the deep band (lava, unstable ore) no nearer in practice: 12 is still out of reach.

### (b) More fuel and AP

In `src/data/loadouts.ts` (`fuel`) and `src/data/shift.ts` (`apPerShift`).

| Change                | Reached depth 8 | Released water or gas | Mined iron or copper | Shifts played by `terrace:8` (median) |
| --------------------- | --------------- | --------------------- | -------------------- | ------------------------------------- |
| Today (24 fuel, 5 AP) | 19%             | 0                     | 0                    | 45                                    |
| Fuel 48               | 70%             | 0                     | 1%                   | 62                                    |
| Fuel 96               | 100%            | 2%                    | 7%                   | 61 (107 for `terrace:10`)             |
| 8 AP a shift          | 67%             | 1%                    | 2%                   | 39                                    |
| Fuel 48 and 8 AP      | 100%            | 2%                    | 5%                   | 38 (66 for `terrace:10`)              |

It gets runs to depth 8 and makes them longer, which moves them toward the design doc's 150 to 250 shifts (today's careful run is 33 to 45; the benched `pit` player with fuel 96 plays 135). It does not make them meet anything, for the same reason as (a). More AP per shift also makes every hazard countdown easier to beat, since a crack still gives two shifts.

### (c) Larger slump limits for rock

In `src/data/blocks.ts` (`slumpLimit`).

| Change                               | `pit`: median depth | `terrace:8`: reached depth 8 |
| ------------------------------------ | ------------------- | ---------------------------- |
| Today (dirt 1, stone 2, hard rock 3) | 3                   | 19%                          |
| Dirt and rubble 2                    | 4                   | 19%                          |
| Every limit 1 higher                 | 4                   | 22%                          |
| Every limit 2 higher                 | 4                   | 27%                          |

This is the weakest of the three. A player who uses supports already has what it gives; a player who benches gains one level. It would also soften the one hazard that runs do meet today.

### Combinations (tables 7 and 9)

- (a) and (b) together, middle band at 4 and fuel 48: 10% of runs release water or gas, 20% mine ore. Better, still rare.
- Adding four times as many pockets to bands at 6 and fuel 48: 15% release water or gas.

The coordinator asked for the mildest settings under which a careful player meets water, gas or lava in about half of runs and mines ore in most, with a greedy player still punished. Three were found and then measured on 200 seeds (table 9). All three change the same four things; they differ in how far the bands move against how long runs get.

| Candidate | Bands (middle, deep) | Fuel | Pockets | Iron and copper veins | Careful player: released water or gas | mined ore | crew lost | Greedy player | Shifts (median) |
| --------- | -------------------- | ---- | ------- | --------------------- | ------------------------------------- | --------- | --------- | ------------- | --------------- |
| Today     | 8, 20                | 24   | x1      | x1                    | 0%                                    | 0%        | 0%        | buried 100%   | 33 to 48        |
| A         | 2, 10                | 48   | x4      | x2                    | 56%                                   | 65%       | 22%       | buried 100%   | 63              |
| B         | 3, 11                | 48   | x6      | x3                    | 49%                                   | 71%       | 16%       | buried 100%   | 63              |
| C         | 4, 12                | 72   | x6      | x3                    | 60%                                   | 75%       | 24%       | buried 100%   | 90              |

"Careful player" is `terrace:8` for A and B and `terrace:10` for C. Things to know before choosing one:

- **Nothing here reaches lava or unstable ore.** In every candidate the deep band starts at 10 to 12, and no run gets there. "Water, gas or lava" was met as water or gas only.
- **The crew losses are the script's, in part.** It does not react to a tell or to water in the pit. A person should do better; how much better is a question for the playtest round, not for the simulator.
- **The benched `pit` player** releases water or gas in 29% to 57% of runs under these settings and loses its crew in 0.5% to 11%.
- **Pocket and ore numbers are [Default] values in `src/data/generation.ts`,** as the bands and fuel are, so all of this is within what the owner said may be tuned. They were not among the three options in the issue, which is why they are called out.
- **Candidate A makes iron and copper the surface game:** with the middle band at layer 2, the first ore is two levels down.

## Found on the way

### A corner pit costs a third of a middle pit

The cube's bedrock sides do not count for the level rule (question 84, an assumed default). So a pit in a corner needs a quarter of each ring. To depth 8: 120 blocks in a corner, 204 against a side, 344 in the middle. Every careful player will dig in a corner once they see this. If that is not wanted, the fix is a rule choice (the wall counts as ground level), which would put depth 8 at about 500 AP for everyone. Question 129.

### The starting camp does not pay for itself

Table 10: the `terrace` policy aiming 7 deep reaches it in 48% of runs without a camp and 41% with one. A camp burns 1 fuel every 4 shifts; one fuel is one shift, 5 AP. It saves 1 AP on each block that costs 2 or more and lies within 4 steps, and the pit soon spreads past 4 steps. Founding also costs the rest of a shift. Changing one number at a time:

- upkeep every 8 shifts: 45%; every 16 shifts: 47% (still just below no camp);
- 2 AP off instead of 1: 41%, no change, because a mine never costs less than 1 AP and most blocks near the surface cost 1 or 2;
- reach of 8 steps instead of 4: 43%;
- reach of 8 steps and upkeep every 8 shifts: 51%, the first setting where the camp is worth founding.

The camp's other use, rest, matters only to a player who gets hurt; the careful script never is. Question 130.

### Coal is the real clock

Each coal block is worth 3 shifts. Careful runs find 5 to 9 of them, and a run's length is set almost entirely by how much coal its pit happens to cross. This is why run lengths vary so much for `pit` (27 to 150 shifts).

## What this survey cannot tell

- How people play. The scripts bound it from both sides; the M2 playtest round is the place to learn the rest. With today's numbers a playtester will meet slumps and caverns and nothing else.
- Anything about contracts (M4) or the deep band. No setting tried here gets a run to layer 12, let alone 20.
- The what-if trials used 200 seeds a row, so their percentages are good to about 5 points either way. The main tables used 1,000.

## How to run it again

```bash
npm run sim:old -- --survey depth --runs 1000      # tables 1 to 8; about 55 minutes on 4 cores
npm run sim:old -- --survey candidates --runs 200 --max-shifts 400   # table 9
npm run sim:old -- --survey camp --runs 300        # table 10
```

The same command always prints the same tables. The trials are in `tools/whatIf.ts`, the candidates in `tools/survey.ts`. The three commands above reproduce tables 1 to 10 only on the commit that merged this survey (PR #113): the trials are written as changes from the numbers of that day, and the numbers have since changed. To measure the game as it is now, use `npm run sim -- --survey depth-now --runs 300`.

## The tables

Everything below is the output of the three commands, pasted unchanged.

Depth survey: engine 0.4.0, seeds 1 to 1000 (1000 runs for each policy), standard loadout, shift cap 300.

### Table 1. How deep runs get

The deepest square is the most levels any one square went down by mining. 0 is untouched ground; the middle band, where water, gas, iron and copper begin, starts at 8.

| Policy  | Runs | Deepest square: median (min to max) | mean | Shifts played: median (min to max) | Blocks mined: median (min to max) | Trees cut: median |
| ------- | ---- | ----------------------------------- | ---- | ---------------------------------- | --------------------------------- | ----------------- |
| random  | 1000 | 1 (1 to 1)                          | 1.00 | 25 (21 to 34)                      | 16 (3 to 33)                      | 14                |
| greedy  | 1000 | 3 (3 to 4)                          | 3.02 | 15 (7 to 29)                       | 37 (21 to 76)                     | 13                |
| camp    | 1000 | 3 (3 to 7)                          | 3.33 | 19 (9 to 92)                       | 49 (21 to 214)                    | 14                |
| pit     | 1000 | 3 (3 to 5)                          | 3.34 | 45 (27 to 150)                     | 108 (51 to 379)                   | 33                |
| terrace | 1000 | 6 (4 to 6)                          | 5.79 | 33 (26 to 43)                      | 62 (51 to 82)                     | 15                |

### Table 2. How runs end

| Policy  | Mine closed (alive) | Out of fuel | Crew lost: buried | Crew lost: drowned | Crew lost: burned | Crew lost: poisoned | Still going at the shift cap |
| ------- | ------------------- | ----------- | ----------------- | ------------------ | ----------------- | ------------------- | ---------------------------- |
| random  | 0                   | 1000        | 0                 | 0                  | 0                 | 0                   | 0                            |
| greedy  | 0                   | 0           | 1000              | 0                  | 0                 | 0                   | 0                            |
| camp    | 259                 | 0           | 741               | 0                  | 0                 | 0                   | 0                            |
| pit     | 1000                | 0           | 0                 | 0                  | 0                 | 0                   | 0                            |
| terrace | 1000                | 0           | 0                 | 0                  | 0                 | 0                   | 0                            |

### Table 3. The deepest square, run by run

Each cell is the number of runs whose deepest square was at that depth.

| Deepest square | random | greedy | camp | pit | terrace |
| -------------- | ------ | ------ | ---- | --- | ------- |
| 0              | 0      | 0      | 0    | 0   | 0       |
| 1              | 1000   | 0      | 0    | 0   | 0       |
| 2              | 0      | 0      | 0    | 0   | 0       |
| 3              | 0      | 980    | 706  | 673 | 0       |
| 4              | 0      | 20     | 259  | 315 | 15      |
| 5              | 0      | 0      | 31   | 12  | 185     |
| 6              | 0      | 0      | 3    | 0   | 800     |
| 7              | 0      | 0      | 1    | 0   | 0       |

### Table 4. What runs met

Each cell is the number of runs in which it happened at least once.

| Policy  | Saw mineral traces | Mined iron, copper or crystal | A block cracked | A block slumped | Broke into a cavern | Saw damp stone | Released water | Saw pitted rock | Released gas | Saw warm glow | Released lava | Saw unstable ore | Crew was hurt |
| ------- | ------------------ | ----------------------------- | --------------- | --------------- | ------------------- | -------------- | -------------- | --------------- | ------------ | ------------- | ------------- | ---------------- | ------------- |
| random  | 0 (0%)             | 0 (0%)                        | 0 (0%)          | 0 (0%)          | 85 (8.5%)           | 0 (0%)         | 0 (0%)         | 0 (0%)          | 0 (0%)       | 0 (0%)        | 0 (0%)        | 0 (0%)           | 0 (0%)        |
| greedy  | 0 (0%)             | 0 (0%)                        | 1000 (100%)     | 1000 (100%)     | 114 (11%)           | 0 (0%)         | 0 (0%)         | 0 (0%)          | 0 (0%)       | 0 (0%)        | 0 (0%)        | 0 (0%)           | 1000 (100%)   |
| camp    | 0 (0%)             | 0 (0%)                        | 1000 (100%)     | 1000 (100%)     | 150 (15%)           | 0 (0%)         | 0 (0%)         | 0 (0%)          | 0 (0%)       | 0 (0%)        | 0 (0%)        | 0 (0%)           | 1000 (100%)   |
| pit     | 0 (0%)             | 0 (0%)                        | 965 (97%)       | 0 (0%)          | 266 (27%)           | 0 (0%)         | 0 (0%)         | 0 (0%)          | 0 (0%)       | 0 (0%)        | 0 (0%)        | 0 (0%)           | 0 (0%)        |
| terrace | 20 (2.0%)          | 0 (0%)                        | 994 (99%)       | 0 (0%)          | 146 (15%)           | 0 (0%)         | 0 (0%)         | 0 (0%)          | 0 (0%)       | 0 (0%)        | 0 (0%)        | 0 (0%)           | 0 (0%)        |

### Table 5. The terracing policy, by the depth it plans for

The terracing policy plans its pit for one target depth and closes the mine when the pit is finished, so no run goes deeper than its target. The `terrace` column of tables 1 to 4 is target 6.

| Target depth | Runs that reached it | Deepest square: median (min to max) | Shifts played: median (min to max) | Blocks mined: median | Fuel made from coal: mean | Supports placed: mean | Trees cut: median | Crew was hurt |
| ------------ | -------------------- | ----------------------------------- | ---------------------------------- | -------------------- | ------------------------- | --------------------- | ----------------- | ------------- |
| 4            | 997 (100%)           | 4 (3 to 4)                          | 14 (10 to 25)                      | 26                   | 0.3                       | 5.6                   | 7                 | 0 (0%)        |
| 5            | 995 (100%)           | 5 (4 to 5)                          | 23 (17 to 32)                      | 41                   | 5.7                       | 10.9                  | 11                | 0 (0%)        |
| 6            | 800 (80%)            | 6 (4 to 6)                          | 33 (26 to 43)                      | 62                   | 13.8                      | 16.4                  | 15                | 0 (0%)        |
| 7            | 445 (45%)            | 6 (3 to 7)                          | 45 (27 to 58)                      | 87                   | 20.1                      | 17.3                  | 19                | 0 (0%)        |
| 8            | 181 (18%)            | 5 (2 to 8)                          | 45 (27 to 76)                      | 105                  | 24.0                      | 13.8                  | 24                | 0 (0%)        |
| 9            | 53 (5.3%)            | 5 (2 to 9)                          | 45 (27 to 100)                     | 116                  | 26.4                      | 9.0                   | 29                | 0 (0%)        |
| 10           | 4 (0.4%)             | 3 (1 to 10)                         | 48 (27 to 120)                     | 117                  | 28.0                      | 4.9                   | 33                | 0 (0%)        |

### Table 6. What a pit costs, on paper

A run starts with 24 fuel: 24 shifts of 5 AP, 120 AP in all. One coal block costs 2 AP to mine and 1 AP to craft, and gives 3 more shifts. The table is arithmetic, not simulation: blocks in the cheapest pit that reaches each depth, and the AP to mine them at the mean cost of each layer's rock. It leaves out trees (2 AP each), supports (2 AP each, plus the timber and stone), and coal found on the way.

| Depth | Where  | Steepest pit, walls held by supports: blocks | AP    | Benched for stone (limit 2): blocks | AP     | Benched for dirt (limit 1): blocks | AP     | Steepest pit as a share of the starting AP |
| ----- | ------ | -------------------------------------------- | ----- | ----------------------------------- | ------ | ---------------------------------- | ------ | ------------------------------------------ |
| 4     | corner | 20                                           | 27    | 29                                  | 39     | 50                                 | 68     | 0.2 x                                      |
| 4     | side   | 30                                           | 41    | 46                                  | 62     | 84                                 | 113    | 0.3 x                                      |
| 4     | middle | 44                                           | 59    | 72                                  | 97     | 140                                | 188    | 0.5 x                                      |
| 6     | corner | 56                                           | 79    | 93                                  | 130    | 161                                | 224    | 0.7 x                                      |
| 6     | side   | 91                                           | 127   | 159                                 | 221    | 286                                | 397    | 1.1 x                                      |
| 6     | middle | 146                                          | 203   | 270                                 | 374    | 506                                | 700    | 1.7 x                                      |
| 8     | corner | 120                                          | 174   | 214                                 | 308    | 372                                | 534    | 1.4 x                                      |
| 8     | side   | 204                                          | 294   | 380                                 | 544    | 680                                | 973    | 2.4 x                                      |
| 8     | middle | 344                                          | 493   | 672                                 | 958    | 1,240                              | 1,768  | 4.1 x                                      |
| 10    | corner | 220                                          | 329   | 410                                 | 608    | 715                                | 1,058  | 2.7 x                                      |
| 10    | side   | 385                                          | 572   | 745                                 | 1,099  | 1,320                              | 1,948  | 4.8 x                                      |
| 10    | middle | 670                                          | 989   | 1,350                               | 1,983  | 2,442                              | 3,593  | 8.2 x                                      |
| 12    | corner | 364                                          | 563   | 699                                 | 1,070  | 1,222                              | 1,868  | 4.7 x                                      |
| 12    | side   | 650                                          | 998   | 1,289                               | 1,964  | 2,216                              | 3,389  | 8.3 x                                      |
| 12    | middle | 1,156                                        | 1,762 | 2,374                               | 3,599  | 4,044                              | 6,183  | 14.7 x                                     |
| 16    | corner | 816                                          | 1,340 | 1,628                               | 2,651  | 2,856                              | 4,643  | 11.2 x                                     |
| 16    | side   | 1,496                                        | 2,441 | 2,953                               | 4,813  | 4,776                              | 7,866  | 20.3 x                                     |
| 16    | middle | 2,736                                        | 4,435 | 5,390                               | 8,785  | 7,936                              | 13,280 | 37.0 x                                     |
| 20    | corner | 1,540                                        | 2,667 | 3,145                               | 5,404  | 5,430                              | 9,355  | 22.2 x                                     |
| 20    | side   | 2,840                                        | 4,900 | 5,385                               | 9,368  | 8,276                              | 14,623 | 40.8 x                                     |
| 20    | middle | 5,252                                        | 9,021 | 9,222                               | 16,264 | 12,032                             | 22,104 | 75.2 x                                     |

| Layer | Mean AP to mine one block of its rock |
| ----- | ------------------------------------- |
| 0     | 1.30                                  |
| 2     | 1.47                                  |
| 4     | 1.64                                  |
| 6     | 1.81                                  |
| 7     | 1.90                                  |
| 8     | 2.20                                  |
| 12    | 2.38                                  |
| 16    | 2.56                                  |
| 19    | 2.70                                  |
| 20    | 2.80                                  |
| 26    | 2.88                                  |
| 31    | 2.95                                  |

### Table 7. What each option would change: the best result of each trial

Each trial changes one set of numbers in the simulator's memory only (tools/whatIf.ts) and plays seeds 1 to 200 (200 runs) with each of the policies pit, terrace:6, terrace:8, terrace:10. Each cell is the share of runs for the policy that did best on that count, with its name. "Reached the middle band" means the deepest square reached the first layer of the middle band as that trial has it.

| Trial                                                                                                                  | Reached the middle band: best policy | Saw damp stone or pitted rock: best | Released water or gas: best | Mined iron or copper: best | Crew was hurt: most | Crew lost: most |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------- | --------------------------- | -------------------------- | ------------------- | --------------- |
| The game as it is                                                                                                      | 19% (terrace:8)                      | 0                                   | 0                           | 0                          | 0                   | 0               |
| (a) Middle band starts at layer 6 (now 8), deep band at 16 (now 20)                                                    | 79% (terrace:6)                      | 2% (terrace:8)                      | 2% (terrace:10)             | 2% (terrace:8)             | 2% (terrace:10)     | 0               |
| (a) Middle band starts at layer 4 (now 8), deep band at 12 (now 20)                                                    | 100% (terrace:6)                     | 7% (terrace:10)                     | 4% (terrace:8)              | 8% (terrace:8)             | 3% (terrace:8)      | 1% (terrace:8)  |
| (b) Starting fuel 48 (now 24)                                                                                          | 70% (terrace:8)                      | 1% (terrace:8)                      | 0                           | 1% (terrace:10)            | 0                   | 0               |
| (b) Starting fuel 96 (now 24)                                                                                          | 100% (terrace:8)                     | 5% (terrace:10)                     | 2% (terrace:10)             | 7% (terrace:10)            | 2% (terrace:10)     | 0               |
| (b) 8 AP a shift (now 5)                                                                                               | 67% (terrace:8)                      | 1% (terrace:10)                     | 1% (terrace:10)             | 2% (terrace:10)            | 1% (terrace:10)     | 0               |
| (b) Starting fuel 48 and 8 AP a shift                                                                                  | 100% (terrace:8)                     | 4% (terrace:10)                     | 2% (terrace:10)             | 5% (terrace:10)            | 2% (terrace:10)     | 0               |
| (c) Dirt and rubble hold a fall of 2 (now 1)                                                                           | 19% (terrace:8)                      | 0                                   | 0                           | 0                          | 0                   | 0               |
| (c) Every slump limit 1 higher: dirt 2, stone 3, hard rock 4                                                           | 22% (terrace:8)                      | 1% (terrace:10)                     | 0                           | 0                          | 0                   | 0               |
| (c) Every slump limit 2 higher: dirt 3, stone 4, hard rock 5                                                           | 27% (terrace:8)                      | 1% (terrace:10)                     | 0                           | 0                          | 0                   | 0               |
| (a+b) Middle band starts at layer 6, deep band at 16, and starting fuel 48                                             | 100% (terrace:6)                     | 6% (terrace:10)                     | 5% (terrace:10)             | 6% (terrace:10)            | 3% (terrace:10)     | 1% (terrace:10) |
| (a+b) Middle band starts at layer 4, deep band at 12, and starting fuel 48                                             | 100% (terrace:6)                     | 16% (terrace:10)                    | 10% (terrace:10)            | 20% (terrace:8)            | 9% (terrace:10)     | 2% (terrace:8)  |
| (other) Middle band starts at layer 6, deep band at 16, starting fuel 48, and four times as many water and gas pockets | 100% (terrace:6)                     | 24% (terrace:10)                    | 15% (terrace:10)            | 7% (terrace:8)             | 14% (terrace:10)    | 2% (terrace:10) |

### Table 8. What each option would change: every policy

The same trials, one row for each policy (200 runs a row).

| Trial                                                                                                                  | Policy     | Deepest square: median (min to max) | Reached the middle band | Saw damp stone or pitted rock | Released water or gas | Mined iron or copper | Crew was hurt | Crew lost | Shifts played: median |
| ---------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------- | ----------------------- | ----------------------------- | --------------------- | -------------------- | ------------- | --------- | --------------------- |
| The game as it is                                                                                                      | pit        | 3 (3 to 4)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 45                    |
| The game as it is                                                                                                      | terrace:6  | 6 (4 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 33                    |
| The game as it is                                                                                                      | terrace:8  | 5 (2 to 8)                          | 37 (19%)                | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 48                    |
| The game as it is                                                                                                      | terrace:10 | 3 (1 to 10)                         | 7 (3.5%)                | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 48                    |
| (a) Middle band starts at layer 6 (now 8), deep band at 16 (now 20)                                                    | pit        | 3 (3 to 5)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 45                    |
| (a) Middle band starts at layer 6 (now 8), deep band at 16 (now 20)                                                    | terrace:6  | 6 (4 to 6)                          | 158 (79%)               | 2 (1.0%)                      | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 34                    |
| (a) Middle band starts at layer 6 (now 8), deep band at 16 (now 20)                                                    | terrace:8  | 6 (2 to 8)                          | 101 (51%)               | 4 (2.0%)                      | 1 (0.5%)              | 4 (2.0%)             | 1 (0.5%)      | 0 (0%)    | 48                    |
| (a) Middle band starts at layer 6 (now 8), deep band at 16 (now 20)                                                    | terrace:10 | 3 (1 to 9)                          | 54 (27%)                | 4 (2.0%)                      | 3 (1.5%)              | 3 (1.5%)             | 3 (1.5%)      | 0 (0%)    | 48                    |
| (a) Middle band starts at layer 4 (now 8), deep band at 12 (now 20)                                                    | pit        | 3 (2 to 5)                          | 77 (39%)                | 12 (6.0%)                     | 1 (0.5%)              | 2 (1.0%)             | 0 (0%)        | 0 (0%)    | 45                    |
| (a) Middle band starts at layer 4 (now 8), deep band at 12 (now 20)                                                    | terrace:6  | 6 (4 to 6)                          | 200 (100%)              | 8 (4.0%)                      | 4 (2.0%)              | 15 (7.5%)            | 3 (1.5%)      | 0 (0%)    | 35                    |
| (a) Middle band starts at layer 4 (now 8), deep band at 12 (now 20)                                                    | terrace:8  | 5 (2 to 8)                          | 156 (78%)               | 12 (6.0%)                     | 7 (3.5%)              | 16 (8.0%)            | 6 (3.0%)      | 2 (1.0%)  | 45                    |
| (a) Middle band starts at layer 4 (now 8), deep band at 12 (now 20)                                                    | terrace:10 | 3 (1 to 8)                          | 77 (39%)                | 14 (7.0%)                     | 4 (2.0%)              | 5 (2.5%)             | 4 (2.0%)      | 1 (0.5%)  | 45                    |
| (b) Starting fuel 48 (now 24)                                                                                          | pit        | 4 (3 to 5)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 75                    |
| (b) Starting fuel 48 (now 24)                                                                                          | terrace:6  | 6 (5 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 32                    |
| (b) Starting fuel 48 (now 24)                                                                                          | terrace:8  | 8 (6 to 8)                          | 139 (70%)               | 1 (0.5%)                      | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 62                    |
| (b) Starting fuel 48 (now 24)                                                                                          | terrace:10 | 7 (3 to 10)                         | 55 (28%)                | 1 (0.5%)                      | 0 (0%)                | 1 (0.5%)             | 0 (0%)        | 0 (0%)    | 75                    |
| (b) Starting fuel 96 (now 24)                                                                                          | pit        | 5 (4 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 135                   |
| (b) Starting fuel 96 (now 24)                                                                                          | terrace:6  | 6 (5 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 32                    |
| (b) Starting fuel 96 (now 24)                                                                                          | terrace:8  | 8 (8 to 8)                          | 200 (100%)              | 3 (1.5%)                      | 1 (0.5%)              | 0 (0%)               | 0 (0%)        | 0 (0%)    | 61                    |
| (b) Starting fuel 96 (now 24)                                                                                          | terrace:10 | 10 (8 to 10)                        | 200 (100%)              | 9 (4.5%)                      | 4 (2.0%)              | 14 (7.0%)            | 3 (1.5%)      | 0 (0%)    | 107                   |
| (b) 8 AP a shift (now 5)                                                                                               | pit        | 4 (3 to 7)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 51                    |
| (b) 8 AP a shift (now 5)                                                                                               | terrace:6  | 6 (5 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 20                    |
| (b) 8 AP a shift (now 5)                                                                                               | terrace:8  | 8 (5 to 8)                          | 133 (67%)               | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 39                    |
| (b) 8 AP a shift (now 5)                                                                                               | terrace:10 | 7 (2 to 10)                         | 90 (45%)                | 2 (1.0%)                      | 1 (0.5%)              | 4 (2.0%)             | 1 (0.5%)      | 0 (0%)    | 51                    |
| (b) Starting fuel 48 and 8 AP a shift                                                                                  | pit        | 5 (4 to 7)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 87                    |
| (b) Starting fuel 48 and 8 AP a shift                                                                                  | terrace:6  | 6 (5 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 20                    |
| (b) Starting fuel 48 and 8 AP a shift                                                                                  | terrace:8  | 8 (8 to 8)                          | 200 (100%)              | 3 (1.5%)                      | 1 (0.5%)              | 0 (0%)               | 0 (0%)        | 0 (0%)    | 38                    |
| (b) Starting fuel 48 and 8 AP a shift                                                                                  | terrace:10 | 10 (7 to 10)                        | 187 (94%)               | 8 (4.0%)                      | 3 (1.5%)              | 10 (5.0%)            | 3 (1.5%)      | 0 (0%)    | 66                    |
| (c) Dirt and rubble hold a fall of 2 (now 1)                                                                           | pit        | 4 (3 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 45                    |
| (c) Dirt and rubble hold a fall of 2 (now 1)                                                                           | terrace:6  | 6 (5 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 32                    |
| (c) Dirt and rubble hold a fall of 2 (now 1)                                                                           | terrace:8  | 6 (2 to 8)                          | 38 (19%)                | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 48                    |
| (c) Dirt and rubble hold a fall of 2 (now 1)                                                                           | terrace:10 | 3 (1 to 10)                         | 6 (3.0%)                | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 49.5                  |
| (c) Every slump limit 1 higher: dirt 2, stone 3, hard rock 4                                                           | pit        | 4 (3 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 45                    |
| (c) Every slump limit 1 higher: dirt 2, stone 3, hard rock 4                                                           | terrace:6  | 6 (5 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 31                    |
| (c) Every slump limit 1 higher: dirt 2, stone 3, hard rock 4                                                           | terrace:8  | 6 (2 to 8)                          | 43 (22%)                | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 48                    |
| (c) Every slump limit 1 higher: dirt 2, stone 3, hard rock 4                                                           | terrace:10 | 3 (1 to 10)                         | 22 (11%)                | 1 (0.5%)                      | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 49.5                  |
| (c) Every slump limit 2 higher: dirt 3, stone 4, hard rock 5                                                           | pit        | 4 (3 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 48                    |
| (c) Every slump limit 2 higher: dirt 3, stone 4, hard rock 5                                                           | terrace:6  | 6 (5 to 6)                          | 0 (0%)                  | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 29                    |
| (c) Every slump limit 2 higher: dirt 3, stone 4, hard rock 5                                                           | terrace:8  | 7 (2 to 8)                          | 53 (27%)                | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 48                    |
| (c) Every slump limit 2 higher: dirt 3, stone 4, hard rock 5                                                           | terrace:10 | 3 (1 to 10)                         | 22 (11%)                | 1 (0.5%)                      | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 48                    |
| (a+b) Middle band starts at layer 6, deep band at 16, and starting fuel 48                                             | pit        | 4 (3 to 6)                          | 1 (0.5%)                | 0 (0%)                        | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 78                    |
| (a+b) Middle band starts at layer 6, deep band at 16, and starting fuel 48                                             | terrace:6  | 6 (6 to 6)                          | 200 (100%)              | 2 (1.0%)                      | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 32                    |
| (a+b) Middle band starts at layer 6, deep band at 16, and starting fuel 48                                             | terrace:8  | 8 (5 to 8)                          | 199 (100%)              | 10 (5.0%)                     | 4 (2.0%)              | 9 (4.5%)             | 3 (1.5%)      | 0 (0%)    | 64                    |
| (a+b) Middle band starts at layer 6, deep band at 16, and starting fuel 48                                             | terrace:10 | 7 (3 to 10)                         | 163 (82%)               | 12 (6.0%)                     | 9 (4.5%)              | 11 (5.5%)            | 6 (3.0%)      | 1 (0.5%)  | 78                    |
| (a+b) Middle band starts at layer 4, deep band at 12, and starting fuel 48                                             | pit        | 4 (3 to 6)                          | 195 (98%)               | 17 (8.5%)                     | 7 (3.5%)              | 4 (2.0%)             | 5 (2.5%)      | 0 (0%)    | 75                    |
| (a+b) Middle band starts at layer 4, deep band at 12, and starting fuel 48                                             | terrace:6  | 6 (6 to 6)                          | 200 (100%)              | 8 (4.0%)                      | 6 (3.0%)              | 16 (8.0%)            | 5 (2.5%)      | 0 (0%)    | 34                    |
| (a+b) Middle band starts at layer 4, deep band at 12, and starting fuel 48                                             | terrace:8  | 7 (6 to 8)                          | 200 (100%)              | 20 (10%)                      | 13 (6.5%)             | 40 (20%)             | 12 (6.0%)     | 4 (2.0%)  | 66                    |
| (a+b) Middle band starts at layer 4, deep band at 12, and starting fuel 48                                             | terrace:10 | 5 (3 to 10)                         | 190 (95%)               | 31 (16%)                      | 19 (9.5%)             | 27 (14%)             | 17 (8.5%)     | 4 (2.0%)  | 72                    |
| (other) Middle band starts at layer 6, deep band at 16, starting fuel 48, and four times as many water and gas pockets | pit        | 4 (3 to 6)                          | 1 (0.5%)                | 2 (1.0%)                      | 0 (0%)                | 0 (0%)               | 0 (0%)        | 0 (0%)    | 75                    |
| (other) Middle band starts at layer 6, deep band at 16, starting fuel 48, and four times as many water and gas pockets | terrace:6  | 6 (6 to 6)                          | 200 (100%)              | 17 (8.5%)                     | 6 (3.0%)              | 0 (0%)               | 0 (0%)        | 0 (0%)    | 33                    |
| (other) Middle band starts at layer 6, deep band at 16, starting fuel 48, and four times as many water and gas pockets | terrace:8  | 8 (6 to 8)                          | 200 (100%)              | 45 (23%)                      | 24 (12%)              | 14 (7.0%)            | 23 (12%)      | 0 (0%)    | 64                    |
| (other) Middle band starts at layer 6, deep band at 16, starting fuel 48, and four times as many water and gas pockets | terrace:10 | 7 (3 to 10)                         | 154 (77%)               | 48 (24%)                      | 30 (15%)              | 9 (4.5%)             | 27 (14%)      | 3 (1.5%)  | 78                    |

Candidate settings: engine 0.4.0, seeds 1 to 200 (200 runs a row), standard loadout, shift cap 400. Each setting changes numbers in the simulator's memory only.

- **A: shallow bands**: `set:middle=2,deep=10,fuel=48,pockets=4,ore=2`

- **B: in between**: `set:middle=3,deep=11,fuel=48,pockets=6,ore=3`

- **C: bands moved least, longer runs**: `set:middle=4,deep=12,fuel=72,pockets=6,ore=3`

### Table 9. The candidate settings

| Setting                           | Policy     | Deepest square: median (min to max) | Released water, gas or lava | Saw damp stone, pitted rock or warm glow | Mined iron or copper | Crew was hurt | Crew lost  | Shifts played: median |
| --------------------------------- | ---------- | ----------------------------------- | --------------------------- | ---------------------------------------- | -------------------- | ------------- | ---------- | --------------------- |
| The game as it is                 | greedy     | 3 (3 to 4)                          | 0 (0%)                      | 0 (0%)                                   | 0 (0%)               | 200 (100%)    | 200 (100%) | 15                    |
| The game as it is                 | pit        | 3 (3 to 4)                          | 0 (0%)                      | 0 (0%)                                   | 0 (0%)               | 0 (0%)        | 0 (0%)     | 45                    |
| The game as it is                 | terrace:6  | 6 (4 to 6)                          | 0 (0%)                      | 0 (0%)                                   | 0 (0%)               | 0 (0%)        | 0 (0%)     | 33                    |
| The game as it is                 | terrace:8  | 5 (2 to 8)                          | 0 (0%)                      | 0 (0%)                                   | 0 (0%)               | 0 (0%)        | 0 (0%)     | 48                    |
| The game as it is                 | terrace:10 | 3 (1 to 10)                         | 0 (0%)                      | 0 (0%)                                   | 0 (0%)               | 0 (0%)        | 0 (0%)     | 48                    |
| A: shallow bands                  | greedy     | 3 (2 to 4)                          | 38 (19%)                    | 88 (44%)                                 | 30 (15%)             | 200 (100%)    | 200 (100%) | 16                    |
| A: shallow bands                  | pit        | 4 (3 to 5)                          | 114 (57%)                   | 168 (84%)                                | 103 (52%)            | 101 (51%)     | 22 (11%)   | 69                    |
| A: shallow bands                  | terrace:6  | 6 (4 to 6)                          | 60 (30%)                    | 105 (53%)                                | 81 (41%)             | 55 (28%)      | 17 (8.5%)  | 38                    |
| A: shallow bands                  | terrace:8  | 6 (3 to 8)                          | 111 (56%)                   | 144 (72%)                                | 129 (65%)            | 107 (54%)     | 43 (22%)   | 63                    |
| A: shallow bands                  | terrace:10 | 4 (2 to 9)                          | 113 (57%)                   | 153 (77%)                                | 121 (61%)            | 105 (53%)     | 27 (14%)   | 66                    |
| B: in between                     | greedy     | 3 (3 to 4)                          | 18 (9.0%)                   | 59 (30%)                                 | 2 (1.0%)             | 200 (100%)    | 200 (100%) | 15                    |
| B: in between                     | pit        | 4 (3 to 5)                          | 91 (46%)                    | 150 (75%)                                | 77 (39%)             | 78 (39%)      | 9 (4.5%)   | 72                    |
| B: in between                     | terrace:6  | 6 (5 to 6)                          | 57 (29%)                    | 78 (39%)                                 | 74 (37%)             | 50 (25%)      | 7 (3.5%)   | 35                    |
| B: in between                     | terrace:8  | 6 (5 to 8)                          | 98 (49%)                    | 123 (62%)                                | 142 (71%)            | 96 (48%)      | 31 (16%)   | 63                    |
| B: in between                     | terrace:10 | 5 (3 to 9)                          | 110 (55%)                   | 148 (74%)                                | 101 (51%)            | 106 (53%)     | 30 (15%)   | 69                    |
| C: bands moved least, longer runs | greedy     | 3 (3 to 4)                          | 0 (0%)                      | 10 (5.0%)                                | 0 (0%)               | 200 (100%)    | 200 (100%) | 15                    |
| C: bands moved least, longer runs | pit        | 5 (4 to 6)                          | 58 (29%)                    | 121 (61%)                                | 33 (17%)             | 49 (25%)      | 1 (0.5%)   | 102                   |
| C: bands moved least, longer runs | terrace:6  | 6 (6 to 6)                          | 33 (17%)                    | 53 (27%)                                 | 50 (25%)             | 23 (12%)      | 0 (0%)     | 33                    |
| C: bands moved least, longer runs | terrace:8  | 8 (6 to 8)                          | 79 (40%)                    | 104 (52%)                                | 118 (59%)            | 75 (38%)      | 21 (11%)   | 67                    |
| C: bands moved least, longer runs | terrace:10 | 7 (5 to 10)                         | 119 (60%)                   | 143 (72%)                                | 150 (75%)            | 116 (58%)     | 48 (24%)   | 90                    |

Camp survey: engine 0.4.0, seeds 1 to 300 (300 runs a row). The terracing policy plans a pit 7 deep, without a camp and with one founded beside the pit on the first shift.

### Table 10. What a camp is worth

| Trial                                                                     | Policy         | Runs that reached depth 7 | Deepest square: mean | Blocks mined: mean | Shifts played: mean |
| ------------------------------------------------------------------------- | -------------- | ------------------------- | -------------------- | ------------------ | ------------------- |
| The game as it is (upkeep 1 fuel every 4 shifts; 1 AP off within 4 steps) | without a camp | 144 (48%)                 | 5.98                 | 84.4               | 41.5                |
| The game as it is (upkeep 1 fuel every 4 shifts; 1 AP off within 4 steps) | with a camp    | 122 (41%)                 | 5.65                 | 81.8               | 39.3                |
| Upkeep 1 fuel every 8 shifts                                              | with a camp    | 135 (45%)                 | 5.86                 | 83.5               | 40.3                |
| Upkeep 1 fuel every 16 shifts                                             | with a camp    | 140 (47%)                 | 5.93                 | 84.1               | 40.8                |
| 2 AP off a mine near the camp                                             | with a camp    | 122 (41%)                 | 5.65                 | 81.8               | 39.3                |
| Cheaper mining reaches 8 steps                                            | with a camp    | 128 (43%)                 | 5.79                 | 83.0               | 37.3                |
| Reaches 8 steps and upkeep every 8 shifts                                 | with a camp    | 152 (51%)                 | 6.03                 | 84.9               | 38.4                |

## After the owner's choice: the main tables again

The output of `npm run sim:old -- --survey depth-now --runs 300` on the data of decision note 0040, pasted unchanged but for the table numbers (A1 to A5).

Depth survey: engine 0.4.0, seeds 1 to 300 (300 runs for each policy), standard loadout, shift cap 300.

### Table A1. How deep runs get

The deepest square is the most levels any one square went down by mining. 0 is untouched ground; the middle band, where water, gas, iron and copper begin, starts at 4.

| Policy         | Runs | Deepest square: median (min to max) | mean | Shifts played: median (min to max) | Blocks mined: median (min to max) | Trees cut: median |
| -------------- | ---- | ----------------------------------- | ---- | ---------------------------------- | --------------------------------- | ----------------- |
| random         | 300  | 1 (1 to 1)                          | 1.00 | 73 (72 to 91)                      | 51 (28 to 72)                     | 41.5              |
| greedy         | 300  | 3 (3 to 4)                          | 3.03 | 15 (8 to 24)                       | 35 (22 to 65)                     | 14                |
| camp           | 300  | 3 (2 to 7)                          | 3.78 | 17 (9 to 115)                      | 48 (23 to 273)                    | 15                |
| pit            | 300  | 5 (4 to 6)                          | 4.78 | 99 (75 to 228)                     | 248 (168 to 569)                  | 68                |
| terrace        | 300  | 6 (6 to 6)                          | 6.00 | 34 (29 to 44)                      | 61 (56 to 76)                     | 14                |
| terrace:8      | 300  | 8 (6 to 8)                          | 7.86 | 67 (46 to 78)                      | 124 (109 to 140)                  | 24                |
| terrace:8:camp | 300  | 8 (6 to 8)                          | 7.92 | 58 (46 to 75)                      | 125 (110 to 140)                  | 24                |

### Table A2. How runs end

| Policy         | Mine closed (alive) | Out of fuel | Crew lost: buried | Crew lost: drowned | Crew lost: burned | Crew lost: poisoned | Still going at the shift cap |
| -------------- | ------------------- | ----------- | ----------------- | ------------------ | ----------------- | ------------------- | ---------------------------- |
| random         | 0                   | 300         | 0                 | 0                  | 0                 | 0                   | 0                            |
| greedy         | 0                   | 0           | 300               | 0                  | 0                 | 0                   | 0                            |
| camp           | 32                  | 0           | 267               | 1                  | 0                 | 0                   | 0                            |
| pit            | 299                 | 0           | 0                 | 0                  | 0                 | 1                   | 0                            |
| terrace        | 300                 | 0           | 0                 | 0                  | 0                 | 0                   | 0                            |
| terrace:8      | 268                 | 0           | 0                 | 0                  | 0                 | 32                  | 0                            |
| terrace:8:camp | 282                 | 0           | 0                 | 1                  | 0                 | 17                  | 0                            |

### Table A3. The deepest square, run by run

Each cell is the number of runs whose deepest square was at that depth.

| Deepest square | random | greedy | camp | pit | terrace | terrace:8 | terrace:8:camp |
| -------------- | ------ | ------ | ---- | --- | ------- | --------- | -------------- |
| 0              | 0      | 0      | 0    | 0   | 0       | 0         | 0              |
| 1              | 300    | 0      | 0    | 0   | 0       | 0         | 0              |
| 2              | 0      | 0      | 1    | 0   | 0       | 0         | 0              |
| 3              | 0      | 292    | 182  | 0   | 0       | 0         | 0              |
| 4              | 0      | 8      | 55   | 73  | 0       | 0         | 0              |
| 5              | 0      | 0      | 18   | 221 | 0       | 0         | 0              |
| 6              | 0      | 0      | 32   | 6   | 300     | 11        | 5              |
| 7              | 0      | 0      | 12   | 0   | 0       | 21        | 13             |
| 8              | 0      | 0      | 0    | 0   | 0       | 268       | 282            |

### Table A4. What runs met

Each cell is the number of runs in which it happened at least once.

| Policy         | Saw mineral traces | Mined iron, copper or crystal | A block cracked | A block slumped | Broke into a cavern | Saw damp stone | Released water | Saw pitted rock | Released gas | Saw warm glow | Released lava | Saw unstable ore | Crew was hurt |
| -------------- | ------------------ | ----------------------------- | --------------- | --------------- | ------------------- | -------------- | -------------- | --------------- | ------------ | ------------- | ------------- | ---------------- | ------------- |
| random         | 0 (0%)             | 0 (0%)                        | 0 (0%)          | 0 (0%)          | 82 (27%)            | 0 (0%)         | 0 (0%)         | 0 (0%)          | 0 (0%)       | 0 (0%)        | 0 (0%)        | 0 (0%)           | 0 (0%)        |
| greedy         | 159 (53%)          | 0 (0%)                        | 300 (100%)      | 300 (100%)      | 41 (14%)            | 16 (5.3%)      | 0 (0%)         | 2 (0.7%)        | 0 (0%)       | 0 (0%)        | 0 (0%)        | 0 (0%)           | 300 (100%)    |
| camp           | 210 (70%)          | 29 (9.7%)                     | 300 (100%)      | 300 (100%)      | 65 (22%)            | 52 (17%)       | 23 (7.7%)      | 22 (7.3%)       | 9 (3.0%)     | 0 (0%)        | 0 (0%)        | 0 (0%)           | 300 (100%)    |
| pit            | 297 (99%)          | 47 (16%)                      | 300 (100%)      | 0 (0%)          | 164 (55%)           | 140 (47%)      | 58 (19%)       | 78 (26%)        | 30 (10%)     | 0 (0%)        | 0 (0%)        | 0 (0%)           | 74 (25%)      |
| terrace        | 219 (73%)          | 69 (23%)                      | 300 (100%)      | 0 (0%)          | 51 (17%)            | 44 (15%)       | 30 (10%)       | 35 (12%)        | 20 (6.7%)    | 0 (0%)        | 0 (0%)        | 0 (0%)           | 35 (12%)      |
| terrace:8      | 278 (93%)          | 170 (57%)                     | 299 (100%)      | 0 (0%)          | 78 (26%)            | 107 (36%)      | 72 (24%)       | 83 (28%)        | 60 (20%)     | 0 (0%)        | 0 (0%)        | 0 (0%)           | 118 (39%)     |
| terrace:8:camp | 279 (93%)          | 170 (57%)                     | 300 (100%)      | 0 (0%)          | 78 (26%)            | 108 (36%)      | 72 (24%)       | 83 (28%)        | 60 (20%)     | 0 (0%)        | 0 (0%)        | 0 (0%)           | 118 (39%)     |

### Table A5. The terracing policy, by the depth it plans for

The terracing policy plans its pit for one target depth and closes the mine when the pit is finished, so no run goes deeper than its target. The `terrace` column of tables 1 to 4 is target 6.

| Target depth | Runs that reached it | Deepest square: median (min to max) | Shifts played: median (min to max) | Blocks mined: median | Fuel made from coal: mean | Supports placed: mean | Trees cut: median | Crew was hurt |
| ------------ | -------------------- | ----------------------------------- | ---------------------------------- | -------------------- | ------------------------- | --------------------- | ----------------- | ------------- |
| 4            | 300 (100%)           | 4 (4 to 4)                          | 14 (9 to 22)                       | 25                   | 0.0                       | 5.2                   | 7                 | 0 (0%)        |
| 5            | 300 (100%)           | 5 (5 to 5)                          | 22 (17 to 32)                      | 40                   | 0.0                       | 10.0                  | 10                | 8 (2.7%)      |
| 6            | 300 (100%)           | 6 (6 to 6)                          | 34 (29 to 44)                      | 61                   | 0.0                       | 16.0                  | 14                | 35 (12%)      |
| 7            | 295 (98%)            | 7 (6 to 7)                          | 48 (41 to 59)                      | 89                   | 0.0                       | 23.3                  | 19                | 71 (24%)      |
| 8            | 268 (89%)            | 8 (6 to 8)                          | 67 (46 to 78)                      | 124                  | 2.7                       | 30.1                  | 24                | 118 (39%)     |
| 9            | 119 (40%)            | 8 (5 to 9)                          | 87 (48 to 102)                     | 166                  | 17.0                      | 32.9                  | 28.5              | 156 (52%)     |
| 10           | 20 (6.7%)            | 7 (5 to 10)                         | 90 (55 to 137)                     | 199                  | 22.9                      | 22.6                  | 33                | 179 (60%)     |
