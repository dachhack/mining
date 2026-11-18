# 0015 — M2 skeleton: state, cube-phase pipeline, and where each M2 task puts its code

Date: 2026-11-18. Status: accepted with M2 task 1 (issue #50). It builds decision note 0014 items 1–4 and 35 and nothing else of that note. The points under "Readings" are choices this task had to make where 0014 or the issue left room; they are in the pull request for the coordinator to confirm.

## Context

M2 task 1 fixes the shapes the other M2 tasks build on, so that issues #51 to #59 can be worked on at the same time in separate files. After it the game plays exactly as it did in M1: every hazard step is empty and every new action module offers nothing.

## Decision

### State (`src/engine/state.ts`; `STATE_VERSION` 4)

| Field                          | What it holds                                                                              | Read and change it with                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `water`                        | Units of water in each cell, 0 or 1. Replaces M1's unused `fluid`.                         | `waterAt`, `setWater`                                             |
| `lava`, `lavaSource`           | Units of lava, 0 or 1; and 1 where the lava is a source (0014 item 16)                     | `lavaAt`, `isLavaSource`, `setLava(state, pos, units, source)`    |
| `gas`                          | Units of gas                                                                               | `gasAt`, `setGas`                                                 |
| `cracks`                       | 0 for no crack, otherwise the stored timer plus 1 (the number shown; item 7)               | `crackTimerAt` (a timer or `null`), `setCrackTimer`, `clearCrack` |
| `avatar.air`, `avatar.resting` | Air left; and whether the avatar chose to rest this shift (item 27)                        | plain fields                                                      |
| `armed`                        | Armed unstable ore and placed explosives: what goes off in step (c). Sorted, one per cell. | `armedAt`, `armCharge`, `disarmCharge`                            |
| `camps`                        | Active camps: `pos` (the founding cell), `foundedShift`, `stash`. Sorted.                  | `addCamp`, `removeCamp`, `stashEntries`, `campCells`, `campsAt`   |

- Only `state.ts` knows how a cell array is laid out. The readers answer for any position: outside the grid there is never water, lava, gas, or a crack.
- `setBlock` clears the cell's crack and forgets armed unstable ore there, because both belong to the block. So mining a cracked block leaves no crack for rubble that lands there later, and armed ore that is mined out does not go off.
- Save and load keep the lists sorted and each stash like the inventory (sorted, zero counts dropped). A save from state version 3 is refused: "Saved state has version 3; this build reads version 4".
- New structure codes: vent 4, pump 5, safety lamp 6, explosive 7 (support was already 3). New block codes: rubble 13, sealed rock 14. Codes are only ever added.

### The cube phase (`src/engine/shift.ts`, `src/engine/cube/`)

`endShift` runs, in this order: the five steps; `settle` once; upkeep, if the avatar is alive; reveal. An avatar that step (e) killed does not fall in `settle`: it stays where it died, and no `fell` follows `runEnded`. The forecast is not stored: `previewCubePhase` works it out from the new state when asked.

| Step | File                    | Function            | Filled in by                           |
| ---- | ----------------------- | ------------------- | -------------------------------------- |
| (a)  | `cube/caveIns.ts`       | `stepCaveIns`       | M2-3 (#53)                             |
| (b)  | `cube/fluids.ts`        | `stepFluids`        | M2-4 (#54)                             |
| (c)  | `cube/gas.ts`           | `stepGas`           | M2-5 (#55)                             |
| (d)  | `cube/timers.ts`        | `stepTimers`        | M2-3 (#53)                             |
| (e)  | `cube/avatarEffects.ts` | `stepAvatarEffects` | built here; calls `air.ts`, `camps.ts` |

Each step has the signature `(state, events, phase)`. `phase` (`cube/phase.ts`) is the notes of one cube phase; it is made fresh for each `endShift`, is not part of the state, and is never saved or hashed. `CUBE_PHASE_STEPS` in `shift.ts` is the one list of steps; `tests/engine/cubePhase.test.ts` fails if two are swapped.

Step (e) is complete: recorded damage in order; then `updateAir` (`air.ts`, M2-4) and the check for air at 0 (drowned in a flooded cell, suffocated otherwise); then `applyRest` (`camps.ts`, M2-7) if the avatar is resting and alive; then the resting flag is cleared.

### The three helpers every hazard task must use

1. **Hurt the avatar: `recordDamage(phase, amount, cause)`** (`cube/phase.ts`). Never change `state.avatar.health` in steps (a) to (d). Call it at the moment of the event, so the list is in the order things happened. Step (e) applies it: each entry takes at most the health that is left; the first entry to bring health to 0 ends the run with its cause (`rockfall` → crushed, `lava` and `explosion` → burned) and the entries after it are not applied; health is settled before air is looked at. Code outside the cube phase (a fall, in `gravity.ts`) changes health directly, as in M1.
2. **Destroy something at the moment of the event** (`destroy.ts`): `destroyStructure(state, pos, cause, events)`, `destroyLooseItems(state, pos, cause, events)`, `destroyCampsAt(state, pos, cause, events)`. Never queue a destruction for a later step. What a hazard destroys is that hazard's rule; these only do it the same way for everyone. A destroyed explosive is also disarmed. A destroyed camp leaves `state.camps` and its stash is lost.
3. **Read what the player sees** (`known.ts`): `knownCell(state, pos)` gives a revealed cell's block, water, lava, gas, crack timer, structure, armed charge, and loose items, and `null` for an unrevealed cell; `knownCube(state)` is a copy of the state in which every unrevealed cell is plain rock with nothing in it. Anything that decides what the player is shown, offered (`legal…Actions`, an action's AP cost), or forecast reads cells through these two. `waterAt`, `gasAt`, `structureAt` and the rest read the true cube; they are for the cube phase, and for a cell the code has already checked is revealed. The one exception is "the air is fresh / stale" (0014 item 21).

### Forecast (`src/engine/forecast.ts`, filled in by M2-6)

`ShiftForecast` is `{ countdowns, flows, upkeep }` (0014 item 4); M1's `hazards` list is gone.

- `countdowns`: a list of `{ kind: 'fallingBlock', pos, inShifts, path, pathEndsUnseen }`, `{ kind: 'unstableOre', pos, inShifts }`, `{ kind: 'explosive', pos, inShifts }`.
- `flows`: the events that `stepFluids` and then `stepGas` emit when run on `knownCube(state)` with a fresh `newCubePhase()`. They are ordinary engine events, so the forecast and what then happens are described by the same types. This is why steps (b) and (c) must read nothing but the `state` they are given.

### Actions

All M2 action types, their `actionKey`s, and their entries in the dispatcher are defined now, each with a stub module that offers nothing. A task fills in its module and does not edit `actionTypes.ts` or `index.ts` (unless its action needs another field).

| Module                      | Action types                                                     | Task       |
| --------------------------- | ---------------------------------------------------------------- | ---------- |
| `actions/placeSupport.ts`   | `placeSupport`                                                   | M2-3 (#53) |
| `actions/placeExplosive.ts` | `placeExplosive`                                                 | M2-5 (#55) |
| `actions/camp.ts`           | `foundCamp`, `rest`, `stashPut`, `stashTake`, `decommissionCamp` | M2-7 (#57) |
| `actions/campTools.ts`      | `placePump`, `placeVent`, `placeSafetyLamp`, `seal`, `scan`      | M2-8 (#58) |
| `actions/giveUp.ts`         | `giveUp`                                                         | M2-9 (#59) |

Camp recipes use the existing `craft` action; `CAMP_RECIPES` and `findCampRecipe` are in `src/data`, and recipe ids are unique across both tables. `tools/play` has a plain line for each new action so that it compiles; M2-6 words them.

### Events (`src/engine/events.ts`)

All M2 events are defined: `blockCracked`, `blockFell`, `blockDestroyed`, `fluidMoved`, `fluidRemoved`, `stoneFormed`, `gasMoved`, `gasRemoved`, `oreArmed`, `exploded`, `structureDestroyed`, `looseItemsDestroyed`, `cellSealed`, `scanned`, `airChanged`, `healthRestored`, `campFounded`, `campDestroyed`, `campDecommissioned`, `itemStashed`, `itemUnstashed`. `damageTaken` carries the cause (`fall`, `rockfall`, `lava`, `explosion`), and `runEnded` the death (`crushed`, `drowned`, `suffocated`, `burned`, `entombed` are new).

### Data (`src/data`)

- `blocks.ts`: `span` and `shaftLimit` for every block (`null` for open space and bedrock); rubble and sealed rock.
- `hazards.ts`: cave-in, water, gas, explosion, lava, and air numbers, and the block the forecast takes an unseen cell to be.
- `camps.ts`: camp size, costs, upkeep, air-line stretch; scanner numbers.
- `items.ts`, `structures.ts`, `recipes.ts` (`CAMP_RECIPES`), `shift.ts` (`ACTION_COSTS` for the new actions), `tells.ts` (hazard tell distances).
- `validateData` checks all of it. Nothing reads these numbers yet except the tests, `createRun` (full air), `campCells` (camp size), and `knownCube` (the unseen block).

### Where each task puts its code

| Task                        | Its own files                                                                          | Shared files it edits                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| #51 balance                 | `src/data/loadouts.ts`, the sim tools                                                  | none in the engine                                                                                  |
| M2-2 (#52) generation       | `src/engine/generation/`, `src/data/generation.ts`, `tools/ascii.ts`                   | `createRun` in `index.ts`: the one line that calls `generateCube`, to take water, lava, gas as well |
| M2-3 (#53) cave-ins         | `cube/caveIns.ts`, `cube/timers.ts`, new `support.ts`, `actions/placeSupport.ts`       | `actions/mine.ts` (overhead), `actions/move.ts`, `footing.ts` (a support is footing)                |
| M2-4 (#54) water, lava, air | `cube/fluids.ts`, `air.ts`                                                             | `actions/move.ts` (+1 AP into a flooded cell)                                                       |
| M2-5 (#55) gas, explosions  | `cube/gas.ts`, new `explosions.ts`, `actions/placeExplosive.ts`                        | `actions/mine.ts` (arming: `armCharge(state, pos, 'unstableOre')`)                                  |
| M2-6 (#56) tells, forecast  | `tells.ts`, `forecast.ts`, `tools/play/`                                               | none                                                                                                |
| M2-7 (#57) camps            | `camps.ts`, `actions/camp.ts` (or `camp*.ts`)                                          | `actions/craft.ts` (camp recipes), `computeUpkeep` in `shift.ts` (camp fuel)                        |
| M2-8 (#58) camp tools       | `actions/campTools.ts`                                                                 | `actions/mine.ts` (drill), `cube/fluids.ts` (pump), `reveal.ts` (safety lamp as a light)            |
| M2-9 (#59) entombment, sim  | `actions/giveUp.ts`, new `entombment.ts`, `tests/engine/deaths.test.ts`, the sim tools | none in the engine                                                                                  |

Where parallel PRs will still meet, so that the coordinator can order the merges:

- `actions/mine.ts`: three tasks (overhead in M2-3, arming in M2-5, drill in M2-8). `actions/move.ts`: two (M2-3, M2-4). The edits are in different places and small.
- The four golden files and the table in `tests/golden/README.md`: every task that changes play (M2-2 and M2-3 for certain) rewrites the same `expectedHash` lines, and the second to merge must re-hash on top of the first.
- `STATE_VERSION`, if two tasks change the shape of the state.
- `tests/engine/stubs.test.ts`: each task deletes the one test of the module it fills in. Each test is a block of its own with its own import, so the deletions do not touch.

Every task adds its tests in new files under `tests/engine/`. The test helper `buildState` already takes `water`, `lava`, `lavaSources`, `gas`, `cracks`, `supports`, `structures`, `armed`, `camps`, and `air`, and the characters `R` (rubble) and `S` (sealed rock).

Notes for particular tasks:

- **M2-2.** Pockets are written with `setWater`, `setLava(state, pos, units, true)` for sources, and `setGas`.
- **M2-3.** `stepTimers` is yours as well as `stepCaveIns`, because "running" is your rule. A falling block calls `recordDamage`, `destroyStructure` (not for a support), `destroyLooseItems`, and `destroyCampsAt` for each cell it passes through or rests in.
- **M2-4.** For the camp half of item 20, call `campAirLineIntact(state, camp)` in `camps.ts`; it answers `false` until M2-7 fills it in, so neither task waits for the other. You do not need to edit `cube/avatarEffects.ts`: fill in `updateAir` in `air.ts` (it must not end the run; step (e) checks for air at 0), and record lava's damage to the avatar at the end of `stepFluids` (see Readings). Gas is already in the state, so "not breathable" needs no stub: read `gasAt`.
- **M2-5.** `stepGas` goes through `state.armed` and empties it. Placing an explosive sets the structure and calls `armCharge(state, pos, 'explosive')`.
- **M2-6.** `forecastShift` in `shift.ts` already calls `forecastCountdowns` and `forecastFlows`; fill those in. Extend the property test with `knownCube`: the forecast of a state must equal the forecast of any state that differs only in unrevealed cells.
- **M2-7.** Resting sets `state.avatar.resting`; fill in `applyRest` in `camps.ts`. Step (e) clears the flag.

### Versions

`ENGINE_VERSION` is 0.3.0 from this PR until the M2 playtest round (0014 item 35). `STATE_VERSION` is 4; a later M2 task that changes the shape of the state raises it again. The four golden runs were re-hashed, not re-recorded: every recorded decision is still legal, and 360 sim runs (120 seeds each of `random`, `wander`, `staircase`) give the same decisions and the same M1 state on `main` and on this branch.

## Readings

Choices made here where 0014 or the issue left room. Each is small to change.

1. **Lava's damage to the avatar is recorded at the end of step (b).** 0014 item 2 says damage is recorded when its event happens, but "lava in the avatar's cell deals 5 a shift" (item 16) is a standing condition, not an event, and applies on the odd shifts when lava does not move. Recording it once, at the end of step (b), from where the lava then is, puts it in order between rockfall (a) and explosions (c). Nothing in (c) or (d) moves lava or the avatar, so this equals "where the lava is in step (e)".
2. **Damage is capped at the health that is left**, so a dead avatar has exactly 0 health, as with a fall in M1. 0014 says "0 or below"; the death is the same either way.
3. **A placed explosive is both a structure and an entry in `state.armed`** (the issue asks for both). `destroyStructure` keeps them in step, so an explosive destroyed by a rockfall in (a) does not go off in (c).
4. **The forecast's copy keeps the source flag of revealed lava.** 0014 item 3 lists what the player sees of a cell and does not name the flag; without it the flow part of the forecast would be wrong for lava the player can see.
5. **`avatar.resting` is a new field** that 0014 does not name: rest is chosen in the player phase and applied in step (e), so something must carry the choice.
6. **Shaft limits are per block in `blocks.ts`**, beside the spans, not in `hazards.ts` as the issue lists them: both are one number for each material, and one table for each block is checked for completeness by the compiler.
7. **"Iron" and "copper" in design doc 7.2 are read as ingots**, so the camp recipes take `ironIngot` and `copperIngot`, and smelting is two recipes (one for each ore).
8. **Give up costs 0 AP** (`ACTION_COSTS.giveUp`), like leaving. No cost is given anywhere.

## Open points found in 0014

- **When pumps act is not stated.** Item 1(b) orders water, lava, stone; item 12 says a pump removes up to 3 units a shift. Proposed smallest change to item 1(b): "water (item 12), then pumps, then lava (item 16), then water beside lava turns to stone". M2-4 would leave the call in `stepFluids` and M2-8 would fill it in.
- **Two camps may overlap** as item 26 is written (a camp's cells need no structure, water, lava, or gas, and a camp is none of those). The state allows it, and `campsAt` returns every camp a cell belongs to. Proposed: founding is not offered when one of the 18 cells belongs to an active camp. This is M2-7's to settle.

## Consequences

- A save from state version 3 does not load. Play logs recorded on engine 0.2.0 replay with a warning and need not reach their recorded hash.
- Later M2 tasks change no shared type for the usual case, so their PRs should conflict with one another only in the places listed under "Where each task puts its code".
- `tools/sim --json` lists the new item and structure ids in its tallies, all 0 for now. `tools/play` output is unchanged.
- The stub action modules throw if their `apply…` is called. It cannot be: `applyAction` accepts only an action that `legalActions` lists, and the stubs list none (`tests/engine/stubs.test.ts`).
