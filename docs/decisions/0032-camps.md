# 0032 — T12: camps

Date: 2026-11-20. Status: accepted for the code as it stands (issue #100, task T12 of decision note 0025; it reworks #57). It builds design doc v0.2 section 8 and the camp rows of 4.1, whose base decision the owner made ("field crafting plus camps at depth"; question 90: "Mining near it is cheaper"; question 63: a camp kit in the standard loadout) and whose numbers are [Default]. The readings below are the developer's, made where the doc leaves a detail open. None changes a [Decided] item.

## Context

After T5 the camp actions were stubs, `applyRest` did nothing, and a camp was still the v0.1 shape (3 × 3 cells on 2 layers round the miner's cell). Decision note 0014 items 25 to 30 described camps for a miner who stood in one; 0025 kept the kit, the recipes, rest and upkeep, dropped the stash and the air line, and added the mining discount.

## Decision

### The rules as built

1. **A camp** is a centre square and the depth of its patch (`Camp.pos`: x, y, and z for the depth) plus the shift it was founded in. It covers the 3 × 3 squares round the centre (`campSquares`). Camps do not overlap, so a square belongs to at most one (`campAtSquare`).
2. **Founding** (`foundCamp x,y`; `foundCampCheck` in `src/engine/camps.ts`): one camp kit; the whole patch on the map; no tree; all 9 squares at one depth; a block left to stand on; no water, lava or gas; no structure; no other camp. The first of these that fails is the reason given, with the squares in the way. It costs all the AP left (at least `CAMPS.foundMinAp`, 1). Founding does not make the squares worked squares: design doc 5.2 does not list it.
3. **Camp squares cannot be mined** while the camp stands (`mineCheck` refuses with the reason `camp`), and nothing is placed on them (`supportCheck`; design doc 4.1).
4. **Mining near a camp is cheaper** (`mineDiscountAt`): 1 AP less, never below 1, on a square within 4 steps of a camp square (Manhattan distance to the patch) and no more than 4 levels deeper than the camp. Squares above the camp get it too. Two camps near one square give it once. `MineCheck.campDiscount` says how much came off, so the views can say why a mine is cheap. The four numbers are in `src/data/camps.ts`.
5. **Rest** (`rest x,y`, naming the camp): costs all the AP left (at least 1). The action records the camp in `state.crew.restingAt` and marks its 9 squares as worked squares **at once**, in the player phase. So they are worked all through steps (a) to (d) of the cube phase, which is the T5 reviewer's point: step (e) applies the damage, then the rest, then forgets the worked squares. In step (e), if the crew is alive and the camp still stands, health goes to full (`healthRestored`).
6. **Camp recipes** (design doc 7.2: both ingots, drill, pump, vent, scanner charge, sealant, explosive, camp kit) are on the craft list while at least one camp stands, for `ACTION_COSTS.campCraft` (1 AP). A camp's functions work from anywhere on the map, because the crew is abstract. The drill, pump, vent, scanner charge, sealant and explosive can be made but do nothing until T11 and T13.
7. **Upkeep:** each camp burns 1 fuel at the end of every 4th shift, counting the shift it was founded in as the first (0014 item 28 stands). It never takes more fuel than there is; a crew at 0 then has its one last shift (0017 item 8 stands). `UpkeepForecast.campFuelConsumed` says how much of the shift's fuel is the camps'.
8. **Decommissioning** (`decommissionCamp x,y`, 1 AP): the camp is gone, with its upkeep, discount, recipes and its hold on the squares.
9. **Destruction.** `destroyCampsAt` removes the camp at the moment of the event. Slumps (T8) already call it for the square a block leaves and the square it lands on. Water and lava (T10) and explosions (T11) call the same function when they are built; nothing else needs to change here.
10. **The loadout** carries one camp kit (owner, question 63). `loadouts.ts` had 2 timber only.

### Readings where the doc is silent

1. **The issue and the design doc differ on the discount.** Issue #100 says "within 4 face steps of a camp square"; section 8 adds "and no more than 4 levels deeper than the camp". The doc is built, and the coordinator was told. Under the level rule the depth limit binds only where a hazard has broken the rule, as section 8 itself says.
2. **A stump on the patch is cleared for good** at founding, as mining the square would clear it (question 103). Otherwise a tree would grow on a camp square after 10 shifts.
3. **Each camp action names its camp** by the centre square. With an abstract crew there is no "the camp the miner is in", and with two camps the player must be able to say which one to rest at or take down.
4. **No rest at a camp destroyed in the same cube phase** (question 104). The crew resting there is on worked squares, so it takes the hazard's damage, and then finds no camp to rest at.
5. **The kit is not given back** when a camp is decommissioned (question 105).
6. **A patch with a cracked square may be founded on** (question 106): a crack is not on section 8's list, and it is in plain sight.
7. **The discount comes before the flooded-square surcharge** that T10 adds (question 107). T12 builds only the discount.
8. **A patch on the bedrock floor is refused** (`bottom`): there is no block to stand a camp on, and the state stores a camp's depth as a layer of the cube.
9. **`restStarted` is a new event**, so that the play tool and the phone can say the crew is resting; `healthRestored` follows in the cube phase.

### State

`crew.restingAt` (a square or null) replaces the flag `crew.resting`; a camp's `pos` now means centre square and depth. `STATE_VERSION` is 12 (T8 took 11); a version-11 save is refused with the usual version error. `ENGINE_VERSION` stays 0.4.0 (the batch T2 to T15). The play-log format stays 3: `foundCamp`, `rest` and `decommissionCamp` entries now carry `x` and `y`, and no earlier log holds one, because the engine never offered them.

### Tools

- **Play tool.** `camp X,Y` founds a camp and is named by square like a mine (there can be hundreds of sites); a refusal names the squares in the way. `rest X,Y` and `decommission X,Y` are lines of the list, once for each camp, and can also be typed. Camp squares are drawn `A`. The notes list each camp with its upkeep, the squares where mining is cheaper (by row), and a resting crew. The end-shift line counts camp upkeep, says what a rest will restore, and says when a slump will destroy a camp. `--help` has a "Camps" section and the camp recipes.
- **Phone map.** A "Found camp (n)" tool beside the support tool: with it on, a tap founds a camp round the tapped square; a refused tap outlines the squares in the way in red. Camp squares carry a tent; squares where mining is cheaper carry a green tick; both are in the legend. Rest and decommission are buttons under "Other actions"; decommission asks first.
- **Simulator.** A new `camp` policy: the greedy digger, which founds a camp near the middle with its starting kit and rests when crew health is 6 or less. `pit` and `greedy` never found a camp.
- **Golden runs.** See `tests/golden/README.md`: the existing files are re-hashed (the starting stockpile and the state version changed; every recorded decision is still legal), and two `camp` runs are new.

## Consequences

- `legalActions` now lists a `foundCamp` for every legal centre while a kit is held (about 80 to 100 at the start of a run). `foundCampSites` rules most centres out from two tables before asking `foundCampCheck`, and a test pins that the two agree.
- The `random` policy founds camps, rests and decommissions, so its runs burn camp upkeep.
- T10 (water and lava) and T11 (explosions) call `destroyCampsAt` for the squares they reach, and T10 adds the flooded surcharge after the discount in `mineCheck`.
- T13 (camp tools) refuses pumps, vents and sealant on a camp square with `campAtSquare`, as `supportCheck` does.
