# 0032 — T10: water and lava on squares

Date: 2026-11-20. Status: accepted for the code as it stands (issue #99, task T10 of decision note 0025; it reworks issue #54). It builds design doc v0.2 sections 6.3 and 6.4, with 4.2 (mining), 5.2 (the crew) and 6.2 (lava sources), all [Default] (questions 80, 83 and 91). The owner chose to keep "water floods the pit" and "lava". The readings below are the developer's, made where the design doc leaves a detail open; the ones an owner might want to change are questions 103 to 106 in `docs/owner-questions.md`. None changes a [Decided] item, and the design doc is not changed.

## Context

After T9 a breach put a pocket's water or lava on the mined square, and it stayed there: it did not spread, hurt the crew, or make mining dearer. Step (b) of the cube phase was empty.

## Decision

### The rules as built

1. **Levels.** A square `depth` levels down with `units` of water on it has its water surface `depth - units` levels below ground: each unit raises the surface by one level. A dry square's level is its depth. Lava has its own levels, counted the same way.
2. **The flow rule** (`stepFluids` in `src/engine/cube/fluids.ts`). Squares are visited row by row (y, then x). A square gives one unit to its lowest face neighbour (ties north, east, south, west) if that neighbour's level is at least `HAZARDS.water.flowMinDrop` (2) lower than its own, and repeats while that holds, with the levels as they are at that moment. A square gives away only units it held when the step began, so a unit moves at most one square a shift. The cube's walls are not squares: nothing flows off the map.
3. **Lava** flows by the same rule in the cube phase of every shift whose number divides by `HAZARDS.lava.flowEveryShifts` (2): the even-numbered shifts.
4. **Ground level.** A square holds at most `depth` units of water and at most `depth` units of lava. What is over that drains away (`fluidRemoved`, reason `reachedSurface`), at the start of the step, every shift, for both. A move never fills a square over its brim, so only a breach, a source or rubble landing on the square can put it there. Water and lava never flow onto a square at ground level.
5. **Lava sources.** On every lava step a source square gets `HAZARDS.lava.sourceUnitsPerStep` (1) more (`lavaPoured`). A source square always keeps `HAZARDS.lava.sourceKeepsUnits` (1): it never gives away its last unit. Lava that leaves the square is ordinary lava.
6. **Water meets lava.** On a square that holds both after the flows, one unit of water and one of lava become one stone block (`stoneFormed`), which raises the square by 1, again and again until one of the two is used up. This is checked every shift. Each fluid already fits under ground level, so the square never rises above it. The lava left on the square is no longer a source.
7. **What is destroyed.** Lava destroys the support, pump, vent or explosive, and any camp, on every square it stands on after it has flowed (`structureDestroyed`, `campDestroyed`, cause `lava`), every shift. A destroyed explosive is disarmed, and this happens before step (c). Water entering a square destroys a camp there (cause `water`) and leaves structures alone.
8. **The crew** (T5's `recordDamage`). Water: `CREW.damage.water` (1) for each move onto a worked square. Lava: `CREW.damage.lavaOn` (5) on a worked square and `CREW.damage.lavaBeside` (1) beside one, from where the lava is at the end of the step, every shift.
9. **Mining** (`mineCheck`). A square with water on it costs `HAZARDS.water.floodedMineExtraAp` (1) more; the water stays on the square. A square with lava on it is refused with the reason `lava`. When several things stop a mine the reason is the first of: tree, no block left, lava, the level rule. `supportCheck` also refuses a square with lava on it (design doc 4.1: nothing is placed on lava), which note 0031 left to this task.
10. **Under rubble** (issue #99; review of PR #97). T8 already lifts what stands on a square onto rubble that lands there (question 100). T10 keeps that: nothing is buried, the square comes up 1 and keeps all its water and lava, and what is then above ground level drains in step (b) of the same cube phase.
11. **Order inside step (b):** water drains, water flows; sources pour, lava drains, lava flows; lava destroys; stone forms; the cube is written; lava hurts the crew. The step uses no randomness.
12. **Sources and sinks.** In: a breach (player phase), a source's pour. Out: what drains at ground level, and stone (one unit of each fluid a block). Everything else conserves units. A property test checks this from the events on 150 random pits for 12 cube phases each, with: every move is to a face neighbour, lava moves only on lava steps, nothing stands above ground level, no square holds both after a step, and a source always has lava. A second property test checks that water alone always comes to rest.

### Why a drop of 2

A move across a drop of 2 or more leaves the two squares closer in level. A move across a drop of 1 would swap them, and the unit would move back and forth for ever. With 2, one unit on a flat floor stays, and a pit that has stopped flowing is level to within 1, which is how "until the pit is level" (6.3) is read. Every move lowers the sum over all squares of the surface height squared, so the flowing always stops. `validateData` refuses a `flowMinDrop` below 2.

### Where it is stored, and the state

What stands on a square is the sum over the open cells above its top block, as T9 left it (`contentsOn`). `src/engine/standing.ts` writes a square's water or lava in one fixed place, the open cell directly above the top block, which is the cell a breach writes. The shape of the state did not change, so `STATE_VERSION` stays 11 and the six golden hashes are unchanged. `ENGINE_VERSION` stays 0.4.0.

### Events

`fluidMoved` (one unit, from and to the cells above the two squares' tops), `fluidRemoved` (now with `units`), `stoneFormed` (the new block's cell) and the new `lavaPoured`. `MineRefusalReason` and `SupportRefusalReason` gain `lava`.

### Data

`HAZARDS.water.floodedMoveExtraAp` is now `floodedMineExtraAp`. New: `HAZARDS.water.flowMinDrop` (2), `HAZARDS.lava.sourceUnitsPerStep` (1), `HAZARDS.lava.sourceKeepsUnits` (1).

### Readings where the design doc is silent

1. **Several units may leave a square in one shift**, each going one square. So a tall column of water spreads to its neighbours in one cube phase, and the flood front then advances one square a shift (question 103).
2. **Water and lava each flow by their own levels** and do not push each other aside. They meet only when they are on the same square; standing on neighbouring squares is not meeting (question 105).
3. **A source never runs dry**, so its square always shows lava and can never be mined until it is sealed or turned to stone (question 104). `setLava` already says a cell with no lava is never a source, and this keeps that true.
4. **"Water enters a worked square" is a move in the cube phase.** Water that a breach releases onto the mined square does not hurt the crew, and neither does standing water on a square the player mines: that costs AP. Lava differs, as 5.2 words it: it hurts wherever it is at the end of the step, so breaking into a lava pocket always costs 5 (question 106).
5. **Lava above ground level drains like water.** 6.3 says so for water; note 0025 item 10 says neither stands above ground level.

### Forecast and views

- `previewCubePhase(state).flows` runs step (a) and then step (b) on `knownCube(state)` and returns step (b)'s events. Everything the rule reads is in the open (depths, and what stands on squares), so it is what will happen, as exactly as T8's slump forecast is.
- **Play tool:** the map draws `~` for a square with water on it and `!` for one with lava; the notes give the units and the block under them; the "If you end the shift now" line says where each will flow, what a source pours, what drains, where stone forms and which support the lava destroys. `--help` has a "Water and lava" section.
- **Phone map:** a blue wash with waves and the units for water, an orange wash with flames for lava (a ring round a source's number), and a drop or a flame on each square water or lava will flow onto when the shift ends. The legend names each. Pattern and shape differ as well as colour.
- A test for each view checks that a hidden pocket changes nothing that is shown.

## Hooks for later tasks

- **T11 (gas):** `lavaOn(state, x, y)` says whether lava stands on a square after step (b); `cube/gas.ts` has the note.
- **T13 (pumps):** `stepFluids` marks where pumps act (after the water drains, before it flows); `setWaterOn` takes water off a square.
- **T13 (sealant):** before placing the block, set the square's water and lava to 0 (`setWaterOn`, `setLavaOn`), which also ends a source.
- **T12 (camps):** water and lava call `destroyCampsAt` for every cell of a square's column down to its top block.

## What could not be done: a golden run that floods

Issue #99 asks for a golden run that floods. No recorded run can today: pockets start at layer 8, and on seeds 1 to 400 the `pit` policy dug in a corner (the cheapest place) ended at depth 4 to 6 when its fuel ran out, and `greedy` in a corner was buried at depth 5 to 6. This is question 85's ground and T15's depth survey. Until a policy reaches layer 8, `tests/engine/fluids.test.ts` pins the flow rule with a fixed scenario instead: a hand-built pit, a water pocket and a lava source broken into through `applyAction`, twelve ends of shift, and the hash of the final state.

## Consequences

- A flooded pit floor costs 1 AP more a block until the water is led into a sump; a lava source fills its pit by about one unit every two shifts and cannot be stopped until T13 brings sealant, or water reaches it.
- Two of T8's slump tests changed: their end state now includes the flow step.
- The simulator's numbers do not change: no scripted run meets water or lava yet.
