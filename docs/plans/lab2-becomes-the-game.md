# Plan: Lab 2 becomes the game

Status: proposed, for the owner. No code has changed yet. Questions 145 to 154 in `docs/owner-questions.md` are open for you; each one says the default this plan assumes.

## What you asked for

- "Lab 2 is a UI success", then "Bring Lab 2 into the real game".
- **Scope:** "Lab 2 becomes the game." Lab 2's rules and look replace the game:
  - fog of war;
  - 3 × 3 camps that light a circle, upgraded to see further and dig harder rock;
  - the surface: grass, trees, apple trees, animals;
  - the costs in wood, grass, clay and stone;
  - the recipe book, Undo, and the layout.

  The old game's other rules come back one at a time, in the order you choose.

- **Turns:** "Keep shifts." The game is paced in shifts, and crew health and upkeep come back with them.
- **Labs:** "Remove both." The start screen goes straight to the game. Lab 1 and Lab 2 are removed.

## The short version

1. **Move the rules first.** Lab 2's rules move into the engine (`src/engine`), next to the old game. For a while the app has both, and Lab 2's screen runs on the engine. Nothing is removed yet, so the APK always works.
2. **Then add shifts:** an action budget each shift, an End shift button, animals and apples that move on with the shifts, crew health and upkeep.
3. **Then switch:** the start screen opens the new game. The old game screen and both labs go.
4. **Then tidy up:** the old rules, tools and tests that nothing uses any more are removed, and the design doc becomes v0.3.

About 14 small pull requests, in four phases (section 6). Each one ships a working APK.

---

## 1. The rules move into the engine

The engine is the part of the code that holds the rules. Its own rules are what make the game the same every time for a seed:

- it has no clocks or timers;
- randomness comes only from a seeded generator kept in the game state;
- every number lives in `src/data`;
- it never touches the screen.

Lab 2's rules are already written as pure functions in `src/app/lab/`, so most of them move across with small changes.

### What moves into the engine

| Lab 2 today (`src/app/lab/`)                                              | In the engine                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Fog: what is lit, greyed or dark (`sightMap`)                             | A sight map in the state, kept up to date by camp actions                           |
| Camps: 3 × 3 on level ground, levels 1 to 3, radius 9 / 12 / 15, demolish | New camp rules, replacing the old camp kit, rest-only camps and the mining discount |
| What each camp level can mine (dirt to coal, hard rock, ore)              | The same, as data                                                                   |
| The surface: grass, trees, apple trees, harvested by a tap                | Joins the engine's surface (which today has trees and stumps only)                  |
| Clay                                                                      | A real block in `src/data/blocks.ts`, no longer a lab-only overlay                  |
| No timber-root (it becomes dirt) and no surface coal                      | Part of world generation (#131 already did the coal)                                |
| Animals that roam, and one walking in now and then                        | In the state, moved by the engine with its own seeded generator                     |
| Costs: new camp 15 wood + 15 grass, upgrades, recipes                     | In `src/data`, used by both the engine and the recipe book                          |

### What stays in the app (`src/app`)

- How it looks: the map drawing, forests, grass, fog, animals sliding between squares.
- The layout, the tray, the recipe book and its saved pins.
- **Undo.** It stays app-side. Within a shift the world doesn't change by itself (the animals move only when the shift ends, section 2). So to undo, the app replays the shift's actions from the start of the shift, leaving out the last undoable one. The result is exact and the engine stays simple. Catching an animal and picking an apple still can't be undone (your answer to question 141).

### Time: from milliseconds to shifts

Lab 2's animals and apples run on a clock in milliseconds. The engine has no clocks, so they move on with the shifts instead:

- **Animals** take their steps at the end of each shift.
- **New animals** walk in every few shifts.
- **Apples** regrow some shifts after a tree is picked bare.

On screen the animals can still slide from square to square when a shift ends, so the map stays alive. Between shifts they stand still, which also makes them fair to catch. The numbers are questions 149 and 150.

---

## 2. Shifts

### What a shift is

A shift is one turn. The old game's shape still fits:

1. **The player's turn.** The player has a budget of **action points (AP)** to spend. The old default is 5 AP a shift.
2. **End shift**, a button. Then the world moves on: animals step, apples regrow, upkeep is paid, and the crew's health changes.

**Default:** keep AP. Each action costs AP:

- mining costs what its block costs, as in the old game (dirt 1, stone 2 and so on);
- cutting grass, felling a tree, picking an apple or catching an animal costs 1;
- placing, upgrading or demolishing a camp costs the rest of the shift.

The other choices are a fixed number of taps per shift, or no budget at all, where the player ends the shift whenever they like. Questions 145 and 146.

### Upkeep and crew health

Upkeep and crew health come back together. With the hazards gone for now, upkeep is the only thing that can hurt the crew, so it needs to cost something the player gathers.

- **Default:** the crew eats. Each shift's upkeep is food: apples or animals (for example 1 food a shift, plus 1 per camp every few shifts).
- **Unpaid upkeep** costs crew health. Resting at a camp restores it.
- **At 0 health** the run is lost.

The other choice is the old fuel (coal), but coal is underground and the surface no longer has any, so the first shifts would be hard. Questions 147 and 148.

### Undo and shifts

**Default:** Undo works within the current shift only. Ending a shift runs the world on (animals, apples, upkeep, health); undoing across it would turn time back, which you have ruled out. Question 151.

### How a run ends

- **Until contracts are built:** a run ends when the crew is lost, or when the player closes the mine (as now).
- **Saving:** a run is saved every shift and carries on when the app opens again.

Question 152.

---

## 3. The old game's rules

**Default:** dropped for now, able to come back later. Only what shifts, crew health and upkeep need stays.

| Old rule                                                           | Plan               | Why                                                                             |
| ------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------- |
| The level rule (a square at most 1 level below its neighbours)     | **Stays**          | [Decided], and Lab 2 already uses it                                            |
| Mining costs per block type (AP)                                   | **Stays**          | Needed for AP                                                                   |
| Caverns under the surface: breaking in drops the square to rubble  | **Stays**          | Lab 2's mining already does this                                                |
| Close the mine (ends the run alive)                                | **Stays**          | The only way to finish until contracts                                          |
| Resting at a camp restores crew health                             | **Stays**          | Crew health needs a way back                                                    |
| Pit walls slump, cracks, supports                                  | Dropped for now    | A hazard                                                                        |
| Water, lava, gas                                                   | Dropped for now    | Hazards. Their pockets stay in the cube as plain blocks or spaces, with no flow |
| Unstable ore and explosives                                        | Dropped for now    | A hazard and its tool                                                           |
| Tells (damp, pitted, warm stone)                                   | Dropped for now    | Only useful with the hazards                                                    |
| Pumps, vents, sealant, scanner, drill                              | Dropped for now    | Camp tools for the hazards                                                      |
| Smelting ingots, the old camp recipes                              | Dropped for now    | The recipe book replaces crafting. Recipes can be added to it later             |
| Fuel and crafting fuel from coal                                   | Dropped for now    | Unless you choose fuel for upkeep (question 147)                                |
| The old camps: camp kit, mining discount near a camp, decommission | Replaced           | By Lab 2's camps: place, upgrade, demolish, reach                               |
| Depth bands                                                        | **Stays**          | They shape the cube. Ore and keystones stay deep, behind camp levels            |
| Contracts                                                          | Not built yet (M4) | Unchanged plan                                                                  |

So that you can choose **which comes back first**, the dropped list in one line: slumps and supports; water; gas; lava; explosives and unstable ore; tells and scanning; pumps, vents and sealant; the drill; smelting and ingots; fuel. Question 153.

---

## 4. Docs, versions and tools

### The design doc becomes v0.3

The doc is rewritten for the new game, with v0.2 kept in the git history as v0.1 was. These **[Decided]** rows change, which you approved with "Lab 2 becomes the game":

- **Visibility:** "Every square's top block is always shown" becomes fog of war. Camps light a circle, squares once seen stay greyed, and the rest is dark.
- **Hazards:** "All four" becomes none for now, to come back one at a time.
- **Base:** "field crafting plus camps at depth" becomes Lab 2's camps (place on level ground, upgrade, demolish), and the recipe book replaces crafting.
- **Player:** still no avatar, and a tap still mines. A tap now also gathers from the surface.
- **Pacing:** turn-based, in shifts. Unchanged in name; its numbers are questions 145 to 148.

The level rule, the cube, determinism and meta-progression rows stay as they are.

### Versions and golden runs

- **`ENGINE_VERSION`** goes up to **0.6.0** in the first engine PR of the batch (A1 below). It goes up again only for the next batch after a playtest round, as the coordinator says.
- **`STATE_VERSION`** goes up in every PR that changes the shape of the game state (new fields for fog, camps, surface or animals). Old saves are then not loaded.
- **Golden runs** (`tests/golden`) are recorded runs that must replay to the same result.
  - While both rule sets exist, the old ones stay untouched.
  - The new game gets its own golden runs as soon as its rules are in the engine (from A2 on).
  - The old ones are removed with the old rules (C2).
  - Each PR that changes a hash says so and why.

### The tools

| Tool                                                                               | Plan                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run play` (text play, used by playtest agents)                                | **Rewritten** for the new game: fog, camps, the surface, AP and End shift. Playtesting needs it, so it comes early (B2)                                |
| `npm run sim` and its policies (random, pit, greedy, camp, terrace)                | **Rewritten.** Keep `random`; replace the rest with policies that fit the new game: a gatherer that expands its camps, and a digger that heads for ore |
| `npm run sim -- --acceptance` (rules checked after every step, every run replayed) | **Rewritten** for the new rules: same idea, new checks (fog, camp levels, AP, upkeep)                                                                  |
| `npm run sim -- --survey depth` (the depth survey)                                 | **Retired** with the hazards. A new survey (can a run pay its upkeep? how far do camps spread?) once shifts are in                                     |
| `npm run ascii` (prints layers of a cube)                                          | **Stays.** The cube is still a cube                                                                                                                    |
| `npm run golden`                                                                   | **Stays**, on the new golden runs                                                                                                                      |

---

## 5. Removing things

- **Start screen:** it goes straight to the game. The `#game` address stays, so old links and the APK's start page still work. `#lab1` and `#lab2` lead to the game too, until they are removed.
- **Lab 1:** its screen, its code (`src/app/lab/labScreen.ts` and what only it uses) and its e2e tests (`tests/e2e/lab.spec.ts`) are removed.
- **Lab 2:** its screen doesn't vanish; it _becomes_ the game screen. Its code moves out of `src/app/lab/` into the game's own folder, and `tests/e2e/lab2.spec.ts` becomes the game's e2e tests.
- **The old game screen** (`src/app/preview.ts`, `src/app/map/`, the text views it shares with `npm run play`) is removed once the new `npm run play` stands on its own. Its e2e tests go with it: `preview`, `camps`, `crewForecast`, `marks`, `slump`, `tapMap`, `tools`, `touch` and `showcase`. Their useful checks (touch, system bars, layout) are kept on the new screen.
- **`docs/ui-labs/`:** the screenshots stay as a record of how the game was designed, with a line saying the labs are gone. Question 154.
- **The APK keeps working at every step.** No PR removes a screen before the one replacing it is in, and every PR's CI builds the APK.

---

## 6. The pull requests, in order

Each PR is small, keeps the APK working, has its own tests, and says whether it changes a golden hash. "Bumps" means it raises `ENGINE_VERSION`. Only A1 does, for the batch. `STATE_VERSION` goes up wherever the state's shape changes.

### Phase A: the rules move into the engine (the old game still runs)

| PR     | Scope                                                                                                                                                                                                                                                                   | Tests                                                                                   | Version                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| **A1** | The new world's data and generation, beside the old: clay as a real block; wood, grass, apples and animals as items; no timber-root; plants only on dirt; surface features; animals placed at the start; the first camp's patch. A new `createWorld` beside `createRun` | Unit: the same world for a seed; the lab's reachability tests (200 seeds) on the engine | **Bumps** to 0.6.0; STATE_VERSION up |
| **A2** | Fog and Lab 2's camps in the engine: sight, place, upgrade, demolish, camp levels and what they mine. Lab 2's screen switches to them                                                                                                                                   | Unit: Lab 2's camp and fog tests, moved. First new golden runs                          | STATE_VERSION up                     |
| **A3** | The surface in the engine: harvesting grass, trees and apples, catching animals, and mining under the fog and level rules                                                                                                                                               | Unit: Lab 2's surface tests, moved                                                      | —                                    |
| **A4** | Shifts: AP, End shift, animals and apples moving on at the end of a shift, upkeep and crew health, rest, close the mine. Lab 2's screen gets the HUD (AP, health, shift) and End shift                                                                                  | Unit: shift order and upkeep; e2e: a few shifts played                                  | STATE_VERSION up                     |
| **A5** | Undo on the engine: replay the shift without the last undoable action; harvests skipped, as now                                                                                                                                                                         | Unit: exactness; e2e: Lab 2's undo tests                                                | —                                    |

### Phase B: the switch

| PR     | Scope                                                                                                                                                                                  | Tests                                                | Version              |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------- |
| **B1** | The start screen opens the new game (Lab 2's screen, now the game): saved every shift, carried on when the app opens again. The old game is no longer offered; its code is still there | e2e: launch goes to the game; save and resume        | —                    |
| **B2** | `npm run play` for the new game, so playtest agents can play it                                                                                                                        | Unit: the play log replays; the CLI's one-shot modes | —                    |
| **B3** | `npm run sim`: the new policies, the acceptance check, new golden runs recorded with them                                                                                              | The acceptance check over 1,000 runs per policy      | Golden runs recorded |
| **B4** | The design doc v0.3, and the agents' briefs updated for the new game                                                                                                                   | Docs only                                            | —                    |

### Phase C: removing the old

| PR     | Scope                                                                                                                         | Tests                                        | Version          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------- |
| **C1** | Remove Lab 1, the old game screen and their e2e tests; move Lab 2's code into the game's folder                               | e2e: the remaining suite                     | —                |
| **C2** | Remove the old rules from the engine: hazards, tells, the old camps, crafting and fuel; the old golden runs; the depth survey | Unit and golden suites on the new rules only | STATE_VERSION up |
| **C3** | Tidy the docs: the repo plan, the README, `docs/ui-labs` marked as history, old decision notes pointed to v0.3                | Docs only                                    | —                |

### Phase D: the old rules come back, one PR each, in your order

For example: slumps and supports; then water; then gas. Each is its own small batch, playtested before the next.

---

## 7. Risks

- **Two rule sets at once** (phases A and B). The app holds both for a while. A clear folder and naming split in the engine keeps them apart, and C2 removes the old one.
- **Pacing.** AP numbers chosen for hazards may feel wrong for gathering. The new survey (section 4) measures that before you playtest.
- **Saves.** Old saves can't load into the new game (STATE_VERSION). The app starts a fresh run instead of failing.
