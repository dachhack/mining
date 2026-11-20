# 0025 — Design doc v0.2: top-down terrain, no miner, the level rule, crew health

Date: 2026-11-20. Status: the six choices under "Owner's decisions" are the owner's (issue #82) and are [Decided]. Everything else in design doc v0.2 that the owner did not choose is a [Default] proposal or a numbered owner question (73–94 in `docs/owner-questions.md`). This note changes no code. The milestone plan at the end is a proposal: the coordinator files the issues after the owner approves it.

## Context

Owner, 2026-11-20: "Can we only always show the top level. No going down or up. Mining a block can't be done unless the block above it is gone. No block can be mined more than one level differential from any adjacent block."

Asked to choose, the owner picked:

| Question                                                  | Owner's choice                                                                                                                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The level rule                                            | **After mining, at most 1 step.** A square's top block may be mined only if, afterwards, that square is no more than 1 level lower than each of its 4 face neighbours (diagonals do not count). Going deep means digging a terraced pit |
| Miner                                                     | **No miner, just select.** The player taps any top block on the map to mine it. No avatar, no walking, no escape                                                                                                                        |
| Cave-ins ("You still need to reinforce walls", issue #80) | **Pit walls slump.** A steep or tall pit wall of weak material can slump into the pit. A support placed on a wall square stops it                                                                                                       |
| Visibility                                                | **Whole surface.** Every square's top block is always shown. Only what lies under the top is hidden                                                                                                                                     |
| Win and lose                                              | **Keep a "crew" health bar.** Hazards in the pit damage it. The run ends at 0; the player wins by finishing the contract                                                                                                                |
| Hazards to keep                                           | **All four:** pit walls slump, water floods the pit, lava, gas                                                                                                                                                                          |

These change three [Decided] rows of design doc section 2 (World, Player, Win condition), and add three (Level rule, Visibility, Hazards). The owner made the choices knowing that.

## Decision: what design doc v0.2 says

By section of `docs/game-design-doc.md`:

1. **Section 2** records the six choices with the owner's words.
2. **The terrain (3.1).** The cube is still generated in 3D. The player sees it as a heightmap: each of the 32×32 squares shows its top block, at `z = depth`. Mining removes the top block and lowers the square by 1. A fully mined square shows bedrock. [Default] the side walls are not neighbours (question 84).
3. **The surface (3.2).** Trees, meadows, paths and outcrops stay; nobody walks, so there is no start clearing and paths are scenery. Tapping a tree cuts it (2 AP, 2 timber) and shows the block under it. A tree hides the block under it and holds its square against slumping. Regrowth as in 0020, except that a square once mined never grows a tree again. Coal in sight becomes "at least one coal top block on open ground at the start".
4. **What the player knows (3.4).** Every top block, always, with its tells. Under the level rule the top block is a square's only exposed block, so this is also "only exposed faces are known". Anything below is hidden until it becomes the top or is scanned.
5. **Tells (3.7)** need no light: mineral traces and the four hazard tells show on every known block. Counting in 3D, a pocket one block under a top block shows its tell before the mine that breaches it.
6. **Mining (4.1, 4.2).** Any square, no reach. The level rule, in one line: a square may be mined only when none of its face neighbours is higher than it. It limits the player's mining only; hazards may leave steeper steps, which then slump. AP by block type is unchanged; +1 on a flooded square; a square under lava cannot be mined (question 91).
7. **The crew (5).** Crew health 10 replaces the avatar's health, air, light and carrying. A hazard hurts the crew when it reaches a **worked square**: one the player mined, cut, or built on in the shift that is ending. Damage [Default]: slump 3, water 1, lava 5 on / 1 beside, gas 1, gas explosion 3, explosion 6 (the owner's "gas less powerful than the explosive", question 64). Each kind of hazard hurts at most once per shift. Resting at a camp restores full health. A run ends with the crew lost (buried, drowned, burned, poisoned), out of fuel, the contract finished, or the mine closed.
8. **Wall slump (6.1)** replaces cave-ins, spans and the unlined-shaft rule. A square is unstable when it is tall (its drop, the depth difference to the deepest square within 3 steps, is more than its top block's slump limit: dirt and rubble 1, most rock 2, hard rock and crystal 3) or steep (2 or more levels above a neighbour, which only hazards can make). An unstable square cracks with a countdown of 2, then its top block falls as rubble onto its lowest neighbour. A support on the square holds it. Everything the rule reads is visible, so a slump can always be seen coming.
9. **Breaking into an underground space (6.2)** [Default, question 80]: the cavern or pocket collapses to rubble at once, and its contents are pushed out onto the mined square. The level rule is never broken by it. Large lava pockets become a source until sealed.
10. **Water, lava, gas (6.3–6.5)** stand on squares and spread across low squares. Water and lava flow downhill, one square a shift (lava on even shifts), and never stand above ground level. Gas is heavier than air (question 94), spreads to squares no higher than itself, and blows away at ground level. Lava and explosions ignite gas; there are no torches.
11. **Unstable ore and explosives (6.6)** re-expressed for squares: ore is armed by a same-layer mine beside it while it is known and unbraced; a charge clears the top blocks of 5 squares. Relics survive a blast with a probability (question 65).
12. **Crafting (7).** Torches, lamp oil and the safety lamp are gone. Scanning reveals 3 blocks under the tops of a 3×3 patch of squares (question 93). Sealant places a block of sealed rock: a dam or a plug.
13. **Camps (8).** A flat 3×3 patch at one depth; rest and camp recipes; no stash, no air line. Camp kit in the standard loadout (question 63). How the [Decided] "camps at depth" applies is question 90.
14. **Contracts (9).** Won when the last deliverable reaches the stockpile. Without an escape there is no Act 2 [Default]; outcomes become full, partial and salvage by closing the mine (question 89). Before contracts, closing the mine is salvage (question 88).
15. **Interface (11).** One top-down map of the whole surface, shaded by depth; no layers. One tap mines or cuts; other actions come from a tool bar.
16. **Depth (12).** Under the level rule a pit to depth 20 costs about 1,500 blocks in a corner and 5,300 in the middle, against roughly 500–800 blocks a run can afford. The deep band, where the keystone is, is out of reach with today's numbers (question 85).

## What is superseded

Nothing is deleted. Each note named below now starts with a line pointing here.

### Decision notes

| Note                                 | Superseded                                                                                                                                                                                                    | Still stands                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 0005 M1 defaults                     | Items 2, 5–11, 13–19, 22 (lamp oil, ladders), 23 (leaving; see question 88)                                                                                                                                   | 1, 3, 4, 12, 20, 21, 24, 25                                                                                  |
| 0006 engine skeleton                 | The surface layer `z = -1` reading, carry weight in the skeleton                                                                                                                                              | The rest (state, copying, hash, RNG)                                                                         |
| 0008 sim policies                    | The `staircase` and `wander` policies' moves                                                                                                                                                                  | Golden-run format, policy rules, the report                                                                  |
| 0009 and 0013 play interface         | The layer map round the avatar, move names, the "not on the list" notes, ladder and drop wording                                                                                                              | One view function, the log format, refusals, the leak test                                                   |
| 0010 uncontrolled fall               | All (there are no falls)                                                                                                                                                                                      | —                                                                                                            |
| 0011 light matters                   | All (there is no light)                                                                                                                                                                                       | —                                                                                                            |
| 0012 mineral traces                  | The light condition (traces now show on every known block)                                                                                                                                                    | The rule, distance 2, traces stay once seen                                                                  |
| 0014 M2 defaults                     | Items 2, 5–11 (cave-ins, spans, shafts, overhead), 12 and 16 (3D flows), 13 (3D gas), 14 (lamp, torches), 20–24 (air, entombment), 26 and 29 (founding, air line), 31 (weights, 3D scan), 32 (hauling timber) | Items 1 (in outline), 3 and 4 (re-expressed), 15, 17 (re-expressed), 18, 19 (in part), 25, 27, 28, 30, 33–36 |
| 0015 M2 skeleton                     | `avatar.air`, the air step, the `giveUp` and `stash` actions, the per-task file table                                                                                                                         | The cube-phase pipeline, `recordDamage`, destroy helpers, `knownCell`/`knownCube`                            |
| 0016 starting fuel                   | The walking survey (no one walks)                                                                                                                                                                             | Fuel 24; the rule that starting fuel must reach coal                                                         |
| 0017 M2 owner answers                | Readings 5 and 6 (air line), 7 (stash), 9 (carrying a kit), 15 (air), 17 (loose items); the carry-overs for #53, #54, #59                                                                                     | Owner answers 1–4; readings 8, 10–14, 16, 18–21                                                              |
| 0019 preview tap map                 | Layers, taps that move, the camera that follows the miner                                                                                                                                                     | Tiles from `knownCell`, colour plus pattern, pinch zoom                                                      |
| 0020 surface forest                  | Walking, trees blocking the way, the start clearing, path wear, coal within reach of the start, loose items on stumps                                                                                         | Trees, cutting, hidden ground under trees, regrowth count                                                    |
| 0021 top layer known where seen      | All (the whole surface is seen)                                                                                                                                                                               | —                                                                                                            |
| 0022 face-only mining, exposed faces | All (any square's top can be mined; tops are known)                                                                                                                                                           | —                                                                                                            |
| 0023 preview one tap, top view       | The surface over the top view as a separate miner layer, walks and cuts on it                                                                                                                                 | One tap, no menu; double tap for a risky tap                                                                 |
| 0024 no gravity                      | The miner's movement, digging down, ▲ Go up / ▼ Go down and Look up / Look down                                                                                                                               | Ladders removed; blocks and rubble still fall                                                                |

### Owner questions

Rows marked "Superseded by 0025" in `docs/owner-questions.md`: 4, 5, 6, 8, 9, 10, 12, 13, 20, 21, 22, 24, 27, 28, 29, 30, 32, 34–40, 42, 43, 45–50, 52, 55–60, 67, 68–72. Partly superseded: 2, 11, 25, 26, 31, 66 (trees no longer block walking). Still standing: 1, 3, 7, 14–19, 23, 33, 41, 44 (now with 85), 51, 53, 54, 61–65.

### Issues (for the coordinator to close or rework once the owner approves)

- Obsolete with the miner: #23 (shaft dominates), #24 (lamp), #26 (stone auto-collected, carry), #28 (no ladder up), #29 (fall warning), #42 (revealed checks for ladder, torch, pick-up), #46 (play tool follow-ups about ladders, drops and the layer map).
- Still relevant: #22 (finding ore: now the whole surface and traces), #25 (top-layer timber and coal: re-measure on the new model), #27 (run targets, with question 85), #68 (map hazards: rework, below).
- The M2 tasks #52–#59: below.

## Milestone plan (proposal)

### The paused M2 issues

| Issue                                   | Proposal                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #52 generation                          | **Rework** as T7: caverns, pockets and unstable ore stay; drop the span and shaft limits of "at rest"; a fresh cube is flat, so it is at rest by itself; coal in sight and path cells as 3.2 |
| #53 cave-ins and shafts                 | **Close**; replaced by T8 (wall slump and supports)                                                                                                                                          |
| #54 water, lava, air                    | **Rework** as T10: flows on squares; air dropped                                                                                                                                             |
| #55 gas, explosions, unstable ore       | **Rework** as T11 for squares                                                                                                                                                                |
| #56 tells, forecast, play tool          | **Rework** as T14                                                                                                                                                                            |
| #57 camps                               | **Rework** as T12: flat 3×3, no stash, no air line (after question 90)                                                                                                                       |
| #58 camp tools                          | **Rework** as T13: pump, vent, sealant, scanner, drill; safety lamp and the #42 hardening dropped                                                                                            |
| #59 entombment, deaths, sim, acceptance | **Close**; replaced by T15 (every way a run ends, sim, acceptance)                                                                                                                           |
| #68 map hazards                         | **Rework** as part of T14                                                                                                                                                                    |

### Implementation PRs, in order

Each is one small PR with its tests. T1–T6 change the model; T7–T15 are the M2 work on it. `ENGINE_VERSION` is bumped once for the batch, in the PR the coordinator names (CLAUDE.md); T2 is the natural one.

1. **T1 Heightmap helpers.** `depthAt(square)`, `topBlockAt(square)`, `mayMine(square)` (the level rule) as pure functions over the existing cube, with tests. No behaviour change.
2. **T2 Mine by square.** Replace the avatar's reach and moves with "mine any square's top block" under the level rule; cut any tree; every top block revealed; the avatar's position and moves removed; play tool and preview adapted to a top-down map just enough to play. Golden runs re-recorded.
3. **T3 Remove light.** Lamp oil, torches, light radius, the light condition on traces; data and loadout updated.
4. **T4 Remove carrying.** Carry capacity, weights, loose items, pick-up and drop; yields go to an unlimited stockpile.
5. **T5 Crew health.** Avatar health becomes crew health; air removed; worked squares recorded each shift; `recordDamage` hurts the crew only for hazards that reach a worked square, once per kind; loss causes renamed.
6. **T6 Close the mine.** Replaces leaving; ends the run as salvage.
7. **T7 Generation** (#52 reworked).
8. **T8 Wall slump and supports** (replaces #53): drop, slump limits, steep steps, cracks and countdowns, the slump, cascades, supports.
9. **T9 Breaking into underground spaces:** collapse to rubble, contents released on the mined square, lava sources.
10. **T10 Water and lava on squares** (#54 reworked).
11. **T11 Gas, ignition, unstable ore, explosives** (#55 reworked).
12. **T12 Camps** (#57 reworked).
13. **T13 Camp tools** (#58 reworked).
14. **T14 Tells, forecast, play tool and phone map** (#56 and #68 reworked): the depth-shaded map, the tool bar, the "would make unstable" marks.
15. **T15 Every way a run ends, sim and acceptance** (replaces #59): one scenario test per hazard and per loss cause; a `random` policy and a terracing policy; 1,000-run acceptance; a **depth survey** that measures how deep a run gets, for question 85.

Then the M2 playtest round, as agent plan section 2 says. The repo plan's M2 and M3 wording (avatar, slice view, entombment) should be updated when the issues are filed.

## Consequences

- Almost every engine module changes. The cube phase pipeline, `recordDamage`, the destroy helpers, `knownCell`/`knownCube`, the RNG, hash, serialise and data validation carry over.
- Every golden run and every play log becomes unreplayable at T2; the logs of rounds m1-r1 and m1-r2 stay as history.
- The playtest personas still fit (cautious, greedy, speed-runner, newcomer), but the Cautious line "scans, braces, and supports before every risky block" now means supports on wall squares.
- The deep band is out of reach with today's numbers (question 85). It does not block T1–T15; it blocks contracts (M4), whose keystone lives there.
