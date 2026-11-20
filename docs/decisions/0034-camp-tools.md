# 0034 — T13: camp tools (pump, sealant, scanner, drill)

Date: 2026-11-20. Status: accepted for the code as it stands (issue #104, task T13 of decision note 0025; it reworks issue #58). It builds design doc v0.2 section 7.2 with 3.4 (what the player knows), 3.5 (the drill), 4.1 (the actions), 5.2 (worked squares) and 6.3 (pumps), all [Default]; question 93 (the scan) is an assumed default. The readings below are the developer's, made where the design doc leaves a detail open; the ones an owner might want to change are questions 112 to 118 in `docs/owner-questions.md`. None changes a [Decided] item, and the design doc is not changed. The vent is described at the end.

## Context

After T12 the drill, pump, vent, scanner charge and sealant could be crafted at a camp and did nothing: `actions/campTools.ts` was a stub, and its four actions still named 3D cells as in v0.1. Step (b) of the cube phase had a marked place for pumps, and T10 left `setWaterOn` and `setLavaOn` for sealant.

## Decision

### The rules as built

1. **The actions name a square**, like a mine: `placePump x,y`, `placeVent x,y`, `seal x,y`, `scan x,y`. There is no reach. Their AP costs are `ACTION_COSTS` (1, 1, 1, 2).
2. **Drill.** While the stockpile holds a drill, a block with a `mineCostWithDrill` costs that (hard rock: 2 instead of 3). The drill is never used up. The camp discount and the flooded surcharge then apply as to any block (question 117). `MineCheck.drillSaving` says how much came off, so a view can say why a mine is cheap.
3. **Pump** (`pumpCheck`). Placed like a support: one from the stockpile, 1 AP, stored with the square's top block. Refused, in this order, for: no pump, a tree, no block left, a structure already there, lava, a camp square. The square becomes a worked square.
4. **What a pump does** (`runPumps` in `cube/fluids.ts`). In step (b), after the water above ground level has drained and before the water flows, each pump takes up to `HAZARDS.water.pumpUnitsPerShift` (3) units from the squares within `HAZARDS.water.pumpReach` (2) steps, its own square included. It empties the nearest square first; among squares equally far, the lower y and then the lower x. Pumps act one after another, row by row. Each square a pump takes from gives one `fluidRemoved` with the reason `pumped`. A pump does nothing to lava (question 116).
5. **What destroys a pump.** Nothing new was needed: a structure belongs to its top block. Mining the square takes it (`mined`); a block that slumps from the square or onto it destroys it (`rockfall`, T8); lava on the square destroys it (`lava`, T10). Water leaves it alone. Explosions are T11's. It is never given back. A test pins each.
6. **Sealant** (`sealCheck`). One sealant, 1 AP: a block of `CAMP_TOOLS.sealedBlock` (sealed rock) goes into the open cell directly above the top block, so the square comes up 1. All the water, lava and gas on the square are destroyed first (`fluidRemoved` and `gasRemoved`, reason `sealed`), which also ends a lava source. The old top block is buried and loses its crack. The square becomes a worked square. Refused, in this order, for: no sealant; ground level (design doc 4.1; every tree is at ground level); a camp square; a structure on the square; a deeper neighbour.
7. **Scanner** (`scanCheck`, `scanCells`). One charge, 2 AP, aimed at any square: for that square and the 8 round it (`CAMP_TOOLS.scanHalfWidth`), the `CAMP_TOOLS.scanDepth` (3) cells below the top block become revealed. The part of the patch off the map, and cells below the bottom of the cube, are left out. Events: `scanned` (the square and how many cells are new), a `blockRevealed` for each, then `mineralTracesSeen` for the new blocks that carry traces. A scan does not make a square worked.
8. **What the player knows.** `revealed` already meant "the player has seen this cell", and a scan sets it. So the shape of the state did not change. `knownSquare` gains `below`: the revealed cells under the top, from the highest down, each with what the player sees of it, its mineral traces and its hazard tells (design doc 3.7: tells show on scanned blocks). `knownCube`, and so the forecast, keeps a scanned cell as it is. A cell that was a top once and was buried (by rubble, by stone from water and lava, by sealant) was already revealed before this task, and now shows in `below` too: "a revealed block stays revealed" (3.4).
9. **Checking one action directly** (issue #88 item 6). `applyAction` no longer builds the whole action list to check one action: `isLegalAction` asks the action's own rule about that one square (`mineCheck`, `supportCheck`, `pumpCheck`, ...), and looks the few listed kinds (craft, camp actions, close the mine, the explosive) up in their own short list. A property test checks that it agrees with `legalActions`. Thirty runs of `npm run sim -- --policy pit` took 12.4 s before and 10.4 s after: the policies still build the list themselves to choose from, so this is a modest gain, not the whole of item 6.

### Readings where the design doc is silent

1. **Sealing never leaves a step of 2** (question 112). Sealant raises a square. On a square with a deeper neighbour that would make a step of 2, and 6.1 says only a hazard can make such a step. So that seal is refused, and the refusal names the deeper squares. A dam on a level floor is unaffected.
2. **Sealant may be used on lava** (question 113). 4.1 says nothing is placed on lava; 6.2 and 7.2 say sealant plugs a lava source. Sealant is read as "used", not "placed". It is refused on a square that holds a structure, rather than burying it: losing a pump to a mis-tap would be a trap.
3. **Under a tree a scan shows layers 1 to 3** (question 114), because 3.4 says the layer-0 block is unknown until the tree is cut.
4. **Any square may be scanned**, also where nothing new would show (question 115).
5. **The pump's order** (question 116) and **the drill with the camp discount** (question 117), as above.

### State, versions, golden runs

The shape of the state did not change, so `STATE_VERSION` stays 12. `ENGINE_VERSION` stays 0.4.0. No golden hash changed: no recorded run holds a camp tool, and nothing else in the rules moved. Because no policy crafts a tool, `tests/engine/campTools.test.ts` pins a hand-played run instead (seed 1: camp, sealant, seal) by its hash. The play-log format stays 3: `placePump`, `placeVent`, `seal` and `scan` entries now carry `x` and `y`, and no earlier log holds one, because the engine never offered them.

### Events and data

- Events: `scanned` is now `{ x, y, cells }`; `cellSealed` names the new top block's cell; `fluidRemoved` has the reasons `pumped` and `sealed` in use, and `gasRemoved` the reason `sealed`.
- Data: `CAMP_TOOLS.scanReach` and `scanRegionRadius` (v0.1's 3D scan) are replaced by `scanHalfWidth` (1) and `scanDepth` (3); `CAMP_TOOLS.sealedBlock` is new. `validateData` checks them.

### Hidden information

A scan is the one sanctioned way to learn what lies below a top. The tests say so in three places:

- every random run of the property tests checks, step by step, that a cell below a top becomes known only if a scan looked into it (`leakedBelowTops`); it replaces the old invariant "nothing below a top is known";
- the scramble tests now scramble every cell that is not revealed, in runs that scan, seal and pump as well, and nothing the player gets may change;
- the play tool and the phone map each have a test that two cubes differing only where no scan looked print and draw the same.

### Views

- **Play tool.** `pump X,Y`, `seal X,Y` and `scan X,Y` are taken by name like a mine, and their lines show once the tool is held. A scan prints what it showed, square by square. The notes say where pumps stand and what is known under the tops (ore, a pocket, a cavern). `look X,Y` is the play tool's "hold a square": it lists what is known of one square, does nothing, and is not written to the log. `--help` has a "Camp tools" section.
- **Phone map.** The tool bar gains "Place pump (n)", "Seal (n)", "Scan (n)" (each shown while one is held) and "Look". A pump and a scan take two taps: the first marks the range in light blue, the second takes it (question 118). Holding a square for half a second lists its known blocks with any tool. A pump is a blue disc with a "P". A square with known blocks below carries a gold diamond (ore), a blue disc (a pocket), a ring (a cavern) or a grey bar (plain rock); the legend names each.

## The vent

Built last, after T11 (gas): see the section "The vent" added to this note when it lands, or the follow-up issue if it is split off.

## Consequences

- `legalActions` lists one `placePump`, `seal` and `scan` for every square that allows it while the tool is held (up to 1,024 of each). The views never print those lists; `applyAction` no longer builds them.
- A lava source can now be stopped: seal its square.
- T11 (explosions) destroys pumps through `destroyStructure`, like any structure.
