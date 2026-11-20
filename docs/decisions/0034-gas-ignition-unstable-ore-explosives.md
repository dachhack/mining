# 0034 — T11: gas, ignition, unstable ore and explosives

Date: 2026-11-20. Status: accepted for the code as it stands (issue #103, task T11 of decision note 0025; it reworks issue #55). It builds design doc v0.2 sections 6.5 and 6.6, with 4 (step (c) of the cube phase), 4.1 (placing an explosive), 5.2 (the crew) and 8 (camps), all [Default], and the owner's answers to questions 64 ("the gas should be less powerful than the explosive") and 65 (relics in a blast: "probability based"). The readings below are the developer's, made where the design doc leaves a detail open; the ones an owner might want to change are questions 112 to 117 in `docs/owner-questions.md`. None changes a [Decided] item. The design doc is changed in one place, on the coordinator's instruction: section 6.5 ([Default]) no longer lists "digging a channel so the gas can reach ground level" as a counter and says that gas never leaves an open pit by itself, with a pointer to question 112.

## Context

After T9 a breach put a pocket's gas on the mined square, and it stayed there: it did not spread, burn or hurt the crew. Unstable ore was mined like any ore. An explosive could be crafted at a camp and not used. Step (c) of the cube phase was empty.

## Decision

### The rules as built

Step (c) is `stepGas` in `src/engine/cube/gas.ts`; the blast of a charge or of ore is `src/engine/explosions.ts`. In this order:

1. **Gas spreads** (6.5; question 94). Gas stands on squares like water (`gasOn`, `setGasOn` in `standing.ts`). A square with `u` units looks at its face neighbours that are no higher than it: at the same depth or deeper. With `n` of them it gives `floor(u / (n + 1))` to each and keeps the rest (decision note 0014 item 13, on squares). Every gift is worked out from the gas as it stood when the step began. There is no number in this rule, so there is none in `src/data`.
2. **Vents** are task T13. The place is marked in `stepGas`.
3. **Charges and armed unstable ore go off** (6.6): every entry of `state.armed`, in the list's order (by layer, then row by row).
   - _A placed explosive_ blasts its square and every square within `HAZARDS.explosion.blastReach` (1) steps: 5 squares. It destroys the top block of each, with no yield (`blockDestroyed`).
   - _Armed unstable ore_ has the same blast, but only the ore block itself is removed (0014 item 17, which still stands: "no other block is removed").
   - _In every blast square, for both:_ a camp on the square or on a square beside it is destroyed (`destroyCampsAt`); the crew takes `CREW.damage.explosion` (6) if the square was worked this shift; a tree is destroyed; the structure on the square is destroyed.
   - _The level rule does not bind a blast_ (4.2). Each block is removed on its own, and `collapseSpaceUnder` is called right after each one, so a square never drops more than 1 level even over a cavern (the note of the #97 reviewer). A steep step left behind cracks in step (a) of the next cube phase and slumps by 6.1.
4. **Ignition** (6.5). Gas on a square burns if lava stands on that square or on one beside it, or if the square is in a blast of part 3 or beside one. All the gassy squares joined to it through shared sides go off as one explosion: the gas is gone (`gasRemoved`, reason `burnt`); the structure on each of those squares and on each square beside them is destroyed, and a camp there; the crew takes `CREW.damage.gasExplosion` (3) if one of those squares, or a square beside one, was worked. A gas explosion removes no block. One pass is enough: any gas beside a burning patch was part of it.
5. **Gas hurts the crew** (5.2): `CREW.damage.gas` (1) if gas stands on a worked square at the end of the step.

Outside the cube phase:

6. **Arming** (6.6; question 58). `applyMine` arms unstable ore beside the mined block, on the mined block's layer, if the ore is revealed, no support stands on its square and it is not armed already (`oreArmedByMine`, which a view may call: it reads only revealed blocks). Under the level rule such ore is always its square's top block. Mining the ore itself, armed or not, yields and never sets it off.
7. **Placing an explosive** (`actions/placeExplosive.ts`): 1 AP and 1 explosive, on any square with no tree, lava, camp or structure and with a block left. It is stored with the top block, like a support, and armed at once. **It does not mark the square as worked** (5.2), so a charge alone never hurts the crew. `PlaceExplosiveAction` now names a square (`x`, `y`), like `placeSupport`, not a cell.
8. **Relics and keystones** (question 65): a relic or keystone that is the top block of a square in a charge's blast is destroyed with the probability `HAZARDS.explosion.chanceBlockDestroyed` (0.5), drawn from the seeded RNG in the state; otherwise it is left in place (`blockSurvivedBlast`). The blocks are listed in `HAZARDS.explosion.chanceBlocks`. This is the one place the cube phase draws from the RNG. Relics and keystones are not generated until M4, so the rule is tested on hand-built cubes.
9. **Gas and stone.** When water meets lava on a square, the stone forms in the cell that holds the square's gas. The gas is lifted onto the stone (`liftGasOutOf`); if the square comes up to ground level, the gas blows away (`gasRemoved`, reason `reachedSurface`). Rubble that slumps onto a square already lifts its gas (T8).

### Sources and sinks

In: a breach puts a pocket's gas on a square (in the player phase, or when a slump or a blast takes the roof off a pocket). Out: gas that burns; gas on a square that comes up to ground level. Everything else conserves units. Property tests check this from the events on 150 random pits for 12 cube phases each, with: every gift goes to a face neighbour that is no higher, no square holds more than a byte, nothing throws, and a replay gives the same hash.

### What the spread rule does in play, and what it does not

- **A gassy square never empties by spreading.** It gives away at most half of its gas, and thin gas (fewer units than neighbours plus one) gives nothing. So which squares are gassy only ever grows, and stops growing once the gas has run out to the edges of the level floor it lies on. Crew damage and ignition read only _whether_ a square has gas, so they settle too.
- **The units do not settle.** Because the shares are whole numbers, two level squares holding 2 and 1 swap them every shift, for ever. The rule as the design doc words it does this; it is not a bug in the code. The events report the difference only (`gasMoved` is one event for a pair of squares, and none when the two gifts are equal), and both views show only gas reaching a square that had none, so the player is not told about the swapping. Whether to damp it is question 113.
- **Gas never reaches ground level by itself.** Under the level rule every square of a pit is below ground level, and gas does not climb. So "gas that reaches a square at ground level blows away" (6.5) happens only when a gassy square is raised to ground level, and the counter "digging a channel so the gas can reach ground level", which 6.5 listed, cannot work; 6.5 now says so. Today burning it is the only way to be rid of gas; vents come with T13. This is question 112.

### Readings where the design doc is silent

1. **Gas does not look at water or lava** when it spreads. The v0.1 rule that gas never enters a flooded cell went with 3D flows (0025). Gas that spreads onto a lava square, or next to one, burns in the same step.
2. **Charges do not chain.** A charge, or armed ore, in the blast of another is destroyed like any structure or block and does not go off (6.6: "destroys structures in its squares"). Gas does chain to gas, as one explosion.
3. **A support placed after ore is armed does not disarm it** (0014 item 17), and the blast destroys the support.
4. **Armed ore that is no longer its square's top block does not go off.** If rubble slumped onto it, or stone formed on it, between the mine and step (c), it is smothered: disarmed, and still there as ore. The alternative would open a hole under a top block.
5. **A blast destroys trees in every blast square**, for ore as for a charge; 6.6 says so only for charges. A destroyed tree leaves open meadow: no timber, no stump, no regrowth. Under a tree the block stays, except the ore block that went off itself.
6. **Gas hurts from where it stands at the end of step (c)**, as T10 read lava. So gas that burnt hurts by its explosion (3) and not also as gas (1), and breaking into a gas pocket costs 1 health in that shift, because the gas is on the square just mined.
7. **One byte.** A square stores at most 255 units of gas; a gift that would go over stays with the giver. Generated pockets are far below this.
8. **Two charges whose blasts overlap** each take a block from the shared square.

### Events and the state

`gasMoved` and `gasRemoved` now speak of squares (the cell above the top block, as the flow events do). `exploded` gains `kind` (`explosive`, `unstableOre`, `gas`) and `pos`. New: `blockSurvivedBlast`, `blockMayBeDestroyed` (forecast only) and `treeDestroyed`. `oreArmed`, `blockDestroyed` and the destruction cause `explosion` were already defined.

The shape of the state did not change: gas was already stored cell by cell and `armed` already existed. `STATE_VERSION` stays 12, no golden hash changed, and `ENGINE_VERSION` stays 0.4.0.

### Data

New: `HAZARDS.explosion` with `blastReach` (1), `chanceBlocks` (relic, keystone) and `chanceBlockDestroyed` (0.5), checked by `validateData`. Already there and now read: `CREW.damage.gas` (1), `gasExplosion` (3) and `explosion` (6), and `ACTION_COSTS.placeExplosive` (1).

### Forecast and views

- `previewCubePhase(state).gas` is new: the events of step (c), run after steps (a) and (b) on `knownCube(state)`. `countdowns` now lists every placed explosive and armed ore block after the cracks. The three hazard parts are worked out in one pass (`forecastHazards`).
- **The forecast rolls no dice** (0017 item 3). The cube phase is told it is a forecast (`CubePhase.forecast`); a relic or keystone in a blast is then reported as `blockMayBeDestroyed` and left in place, and nothing is drawn from the RNG.
- **How exact it is.** Everything step (c) reads is seen, with the one exception T8 already has: a block that a blast removes shows a new top block, which the forecast takes to be plain rock on solid rock. If it was the roof of a cavern or pocket, the collapse and what comes out are not forecast.
- **Play tool:** the map draws `*` for a square with gas; the notes give the units, a placed explosive and armed ore; the Hazards line lists each charge and each armed ore block with the squares of its blast; the "If you end the shift now" line says where gas will reach, what goes off, what each explosion destroys and whether the crew worked in it. `explosive X,Y` places a charge. A mine that would arm unstable ore is refused the first time with a warning that names the ore and its blast; `mine! X,Y` takes it. `--help` has a "Gas, unstable ore and explosives" section.
- **Phone map:** a green-yellow wash with rings and the units for gas, one ring on a square gas will reach, a round charge with a fuse, a red starburst on armed ore, and a dashed yellow frame on every square of an explosion that the coming cube phase will bring. A "Place explosive" tool appears while the stockpile holds one: the first tap marks the blast, the second places it. A tap that would arm ore asks for a second tap and marks the ore's blast. The legend names each mark; shape differs as well as colour.
- A test for each view checks that a hidden pocket, cavern or ore block changes nothing that is shown.

## Hooks for later tasks

- **T13 (vents):** `stepGas` marks where vents act (after gas spreads, before anything goes off). `gasOn` reads a square's gas and `setGasOn(state, x, y, 0)` takes it away; emit `gasRemoved` with the reason `vented`. A blast and a gas explosion already destroy a vent or pump on their squares, through `destroyStructure`.
- **T13 (sealant):** set the square's gas to 0 before placing the block, as for water and lava.
- **T13 (scanner):** scanned ore below a top block counts as known in `oreArmedByMine` (it reads `isRevealed`), though under the level rule a mine beside it on its layer can only happen when the ore is a top block.
- **T13 (tool bar):** the phone map's explosive tool is one more `MapTool`; the general tool bar can take it over.
- **M4 (contracts):** generating relics and keystones needs nothing more here.

## What could not be done: a golden run that reaches gas

As for T10 (note 0033): no recorded run reaches a gas pocket (layer 8 and below) or unstable ore (layer 20 and below), which is question 85 and T15's depth survey. `tests/engine/explosions.test.ts` pins step (c) with a fixed scenario instead ("a pinned blast"): a hand-built basin, a gas pocket broken into, the gas led onto a second square, unstable ore armed and a charge placed, all through `applyAction`, twelve ends of shift, and the hash of the final state. Treat a change of that hash like a change of a golden hash.

## Noticed, not changed

`npm run sim -- --policy random` throws "The engine crafted an unknown recipe: sealant" on main as well: `recipeOutputId` in `tools/simRun.ts` looks only in the field recipes, and the random policy sometimes founds a camp and crafts a camp recipe. It is outside this task.

## Consequences

- Breaking into a gas pocket costs 1 health and leaves gas in the hole for the rest of the run, or until it is burnt. Digging the floor down round it lets it spread and thin.
- A crew that mines beside known, unbraced unstable ore loses 6 health that shift, because the mined square is in the ore's blast. The warning before the mine says so.
- An explosive takes 5 blocks for 1 AP and no yield, and costs the crew nothing unless it worked in the blast that shift.
- The simulator's numbers do not change: no scripted run meets gas, unstable ore or an explosive yet.
