# 0014 — M2 assumed defaults and rule readings

Date: 2026-11-18. Status: assumed by the coordinator under agent plan section 6, except where an item quotes the owner. Every assumed item is a reading of a [Default] or of a point the design doc leaves open, and the owner can change any of them. No [Decided] item is changed. Section 8 (camps) is [Decided]; items 19–24 fill in numbers it does not give and do not alter it.

## Context

Milestone M2 (hazards and camps) needs answers to owner questions 4 and 8–13, and a concrete form for two answers the owner gave on 2026-11-18 after playtest round m1-r2: "Straight shafts should have cave in risk" (question 52) and "Start with fuel to get to coal so we don't need to have close coal necessary" (question 53). So that every developer builds on the same reading, the coordinator fixed one here. Every number below lives in `src/data`. Section numbers refer to `docs/game-design-doc.md`.

A developer who finds that an item here cannot work as written says so in the task's PR and proposes the smallest change; the coordinator updates this note.

## Decision

### The cube phase

1. **Order.** `endShift` runs the cube phase and then upkeep, as design doc 4 says. The cube phase, in this fixed order: (a) support check and falling blocks (cave-ins, items 3–8) → (b) fluids flow (water, then lava, then water meeting lava) → (c) gas spreads, then ignition and explosions → (d) timers tick (crack countdowns, armed unstable ore, placed explosives) → (e) damage and other effects on the avatar (contact damage, air, rest), then on structures and camps → death checks. Then upkeep (fuel, camp fuel, lamp oil; out of fuel), then the forecast for the next shift. Within a step, cells are visited in index order. Nothing in the cube phase uses the RNG.
2. **Forecast.** `previewCubePhase` reports every hazard event that will happen at the end of this shift if the player ends it now and that the player can know of: it is built only from revealed cells and from countdowns already shown. A countdown is shown for every cracked block, every flow front the player has seen, and every armed unstable ore.

### Cave-ins (6.1, question 8)

3. **Supported.** A block is supported if (a) the cell below it is solid or is bedrock, or (b) it is within its material's span of a block supported by (a), counted in steps through solid blocks on its own layer, or (c) a placed support holds it. Span does not chain: a block held only by span does not lend span to others. Ores count as stone; rubble has span 0.
4. **Supports.** A support is placed (1 AP, 1 support) in the avatar's own cell or an open face neighbour on its level. It holds the block directly above it and the four blocks beside that one (a plus shape). It is a structure: a cell holds one structure, and a support can be walked through but not stood on.
5. **Cracking and falling.** An unsupported block becomes cracked at the cave-in step and falls 2 shifts later (crack timer 2, shown as a countdown). If it becomes supported again before then, the crack stays but the countdown stops. A falling block drops until it rests, becomes rubble (1 AP to clear, no yield), and deals 4 damage to an avatar in any cell it passes through or lands in; ladders, torches, and supports in those cells are destroyed.
6. **Mining overhead (question 4).** Legal only when a support is in the avatar's own cell.
7. **Straight shafts (question 52; owner: "Straight shafts should have cave in risk").** 6.1 alone never makes a shaft dangerous, because a shaft's walls rest on the rock below them. Added rule, in the spirit of 6.1: an open cell is _tight_ when at least three of its four side neighbours are solid. A vertical run of tight open cells with no support in it is an _unlined shaft_. When an unlined shaft is longer than the limit for the weakest material in its walls (dirt 3, stone 5, hard rock 8 cells), one wall block of the run's top cell cracks, with the usual tell and countdown, and when it falls it falls into the shaft and down it. This repeats, one block at a time, while the run is still too long. A support placed in a shaft cell lines the shaft for 2 cells above and below it. A stepped dig, or a shaft two cells wide, is never tight. Ladders do not line a shaft. Which wall block cracks is fixed by index order among the weakest.
8. **Rubble and the route out.** Rubble that lands in a shaft can block it and destroys the ladders it passes. That is the intended cost.

### Water, gas, lava, unstable ore (6.2–6.5, questions 10, 11)

9. **Water.** A pocket holds one unit per cell. When a face of the pocket is opened, each shift every water cell with an open cell below moves down; otherwise it spreads one cell sideways if that lowers it or levels it. Water is conserved. A flooded cell costs +1 AP to enter and drains air. A pump removes 3 units per shift from cells within 2 steps of it. Sealant (1 AP) turns one open face neighbour back into a solid "sealed" block.
10. **Gas.** A pocket cell holds 4 units. Each shift, each gas cell shares its units evenly with its open face neighbours (whole units; remainders stay). A cell with 1 or more units is gassy and drains air. Gas that reaches the surface is gone. A vent removes all gas within 2 steps each shift if an open path joins it to the surface.
11. **Ignition (question 10).** The avatar's own lamp does not ignite gas. A torch, lava, or an explosive in or beside a gassy cell ignites it at the reactions step: every connected gassy cell explodes. A safety lamp is a placed light, like a torch, that does not ignite.
12. **Explosions.** An explosion deals 6 damage to an avatar in the cell or a face neighbour, destroys structures there, removes the gas, and runs the cave-in check at once for the blocks around it. An explosive item (placed, 1 AP; goes off at the next cube phase) also removes the solid blocks in radius 1 with no yield.
13. **Lava.** Flows like water but one step every 2 shifts, and is not conserved from a pocket of more than 8 cells (it keeps coming). Contact deals 5 damage a shift, a face neighbour 1. It destroys ladders, torches, supports, vents, pumps, and camp cells. Water and lava in the same or neighbouring cells both become stone.
14. **Unstable ore.** Braced when a support stands in a face-neighbour cell. If a face neighbour is mined while it is unbraced, it is armed and detonates at the end of the next cube phase as an explosion (item 12) centred on it. Mined directly, it yields as the block table says and does not detonate.
15. **Tells (6.2–6.5).** Shown on revealed blocks, lit or not, because they are surface texture a miner can feel: damp stone within 1 of water, pitted rock within 1 of gas, warm glow within 2 of lava, hairline glow on unstable ore itself, cracks on cracked blocks. (Mineral traces keep their own rule: lit only, decision note 0012.)

### The avatar (5.1, 5.3, questions 9, 12)

16. **Air (question 9).** Air is 10. The avatar has connected air when an open path of cells that are neither flooded nor gassy joins its cell to the surface, or to an active camp whose air line is intact (item 22). With connected air it refills fully at the avatar step; without, or in a flooded or gassy cell, it loses 1. At 0 the run ends: drowned in water, suffocated otherwise.
17. **Death causes.** Crushed (rockfall takes the last health), drowned, suffocated, burned (lava or explosion takes the last health), fell, out of fuel, entombed. One scenario test for each.
18. **Entombment (question 12).** At the start of each player phase the engine searches for a route to the surface using only moves that are legal now or would be with the ladders and timber the avatar carries (no mining). If there is none, the action list offers "give up", which ends the run as entombed. It is offered, never forced, so a player who can dig out still can; and it means a miner in a pit with no ladders can always end the run (issue #28). Fuel is not part of the test.

### Camps (section 8, [Decided]; numbers assumed)

19. **Kit and founding.** A camp kit weighs 8. Founding costs the whole shift's remaining AP (at least 1) and needs the cleared 3×3 area, 2 high, with a solid floor, centred on the avatar.
20. **Functions.** At a camp (inside its 3×3×2 cells): camp recipes (7.2), each 1 AP; put into and take from the stash (0 AP, no limit); rest (the whole shift: health and air to full).
21. **Upkeep.** As design doc 4 gives it: each active camp burns 1 fuel every 4 shifts, counted from the shift it was founded, in addition to the avatar's own. Decommissioning (1 AP, at the camp) stops it, ends the camp's functions, and leaves the stash where it is as loose items.
22. **Air line.** Intact when an open, unflooded, gas-free path joins a camp cell to the surface, or to a vent that itself has one; a vent may also be joined to another vent within 8 steps through open cells.
23. **Destruction.** A camp is destroyed when water, lava, or an explosion reaches any of its cells, or a falling block lands in one. Its stash is lost. Gas alone does not destroy it but cuts its air.
24. **Camp items.** Drill: carried, hard rock costs 2 AP. Scanner charge: used (1 AP), reveals the 3×3×3 region centred up to 3 steps away in a straight line. Pump, vent, safety lamp: placed structures (1 AP). Ingots weigh 1.

### Supply (questions 13, 53)

25. **Timber (question 13).** Timber-root stays in layers 0–7; hauling timber down is the intended cost of supports, ladders, and camp kits.
26. **Starting fuel (question 53; owner: "Start with fuel to get to coal so we don't need to have close coal necessary").** Coal need not be near the start. Starting fuel must let a player reach coal and work it on any seed: a balance task measures, over at least 1,000 seeds, the shifts a sensible route needs to reach the nearest coal (surface or underground) and return fuel-positive, and raises starting fuel in `src/data/loadouts.ts` if the worst seeds cannot. Coal density is not changed.
27. **Zero fuel (question 19; owner: "Zero fuel is a almost certain death sentence in a tunnel").** The rule stands: fuel is tested at upkeep before the shift's fuel is taken, so a miner gets one last shift at zero. The sentence in design doc 4 is reworded to say so.

### Code

28. **Versions.** `ENGINE_VERSION` becomes 0.3.0 in the first M2 PR (the skeleton task) and stays there until the M2 playtest round. `STATE_VERSION` rises with each change to the shape of the state.
29. **Sim.** The M2 acceptance run is 1,000 random-policy runs with no exception and no soft-lock; the sim reports death causes and, for each death, whether a tell or countdown for its cause was on screen beforehand.

## Consequences

- A straight ladder shaft, the cheapest descent in both M1 playtest rounds, now needs a support every few cells or it sheds its walls onto the ladders. Supports cost timber and stone, so stone has a use (question 43) and timber is contested (question 13). The M2 playtest brief asks first whether the descent has stopped being automatic.
- Item 7 is the largest addition to the design doc's rules in this note. It is for the owner to confirm or replace (question 56).
- Items 9–13 choose the simplest flow rules that are deterministic and conserve what should be conserved. Balance comes in M6.
