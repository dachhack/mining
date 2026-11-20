# 0026 — T2: mine by square, and the temporary rules until T3–T9

Date: 2026-11-20. Status: accepted for the code as it stands (issue #86, task T2 of decision note 0025). The numbered temporary rules below are the developer's, made because the issue asked for "a clear temporary rule" wherever something needed the miner's position. Each ends with the task that replaces it. None changes a [Decided] item.

## Context

Design doc v0.2 (decision note 0025) removes the miner: the player looks down on the cube and taps a square to mine its top block, under the level rule. T1 (#84) added `depthAt`, `topBlockAt` and `mayMine`. T2 makes the rules use them. It is the first PR that changes the rules and the shape of the state, so it bumps `ENGINE_VERSION` for the whole batch T2–T15.

## Decision

### The rules as built

1. **Mine.** `{ type: 'mine', x, y, ap }` removes the top block of square (x, y): the block in layer `depthAt(state, x, y)`. There is no reach. `mineCheck(state, x, y)` (`src/engine/actions/mine.ts`) says whether the rules allow it and, if not, why: `tree` (cut it first), `bottom` (no block left), or `neighbourHigher` with the list of neighbours that are too high, which is what a refused tap shows the player (design doc 4.2). AP by block type is unchanged. `legalActions` lists one mine for every allowed square it can afford, row by row.
2. **Cut.** `{ type: 'cutTree', x, y, ap }` cuts the tree on any square (2 AP, 2 timber, from `SURFACE.cutTree`). It leaves a stump and shows the block under it.
3. **What the player knows** (`src/engine/reveal.ts`, rewritten). Every square's top block, and the open cells above it, are revealed, except on a square with a tree. A revealed cell stays revealed, so a tree that grows back hides its block on the map but the block stays known. Nothing below a top is ever revealed. `knownSquare(state, x, y)` (`src/engine/known.ts`) is the one function a view reads a square through: depth, tree, surface kind, the top block if known, and traces.
4. **Mineral traces** show on every known top block. This is already the final rule (design doc 3.7), not a temporary one: the light condition of note 0012 is gone.
5. **No regrowth on a mined square.** Mining a square that has a stump turns its surface cell to meadow, and a meadow never grows a tree.
6. **Removed:** `avatar.pos`; the `move`, `pickUp`, `drop` and `placeTorch` actions; reach, adjacency, dig-down and "mine up with a support"; the `moved` event; the light flood fill (`litCellsFrom` and friends). `STATE_VERSION` is 7; a version-6 save is refused with the usual version error. `ENGINE_VERSION` is 0.4.0.

### Temporary rules

1. **Breaking into an open space** (coordinator's reading in issue #86, following the [Default] of question 80; until **T9**). If the cell under the mined block is open, that cell and the open cells directly below it in the same column fill with rubble, down to the first solid block. So the square drops exactly 1 level and the level rule holds. The `roofCollapsed` event names the square's new top cell and nothing else, so it does not say how deep the space was. Water, lava and gas stored in those cells are left as they are: no generated cube has any yet, and contents and pockets are T9.
2. **Carrying** (until **T4**). The carry limit is not enforced. Every yield (mine, cut, craft) goes into the inventory, and crafting is never refused for weight. Reason: with no position there is no way to pick up or drop, the capacity is 20 and stone weighs 2, so a player would be stuck after ten stone and could not even craft fuel. `looseItems`, the item weights, `inventory.ts` and `settle` stay in the code untouched, and nothing produces a loose item.
3. **Light** (until **T3**). Light does nothing. `lampOil` still burns at upkeep and the torch and lamp-oil recipes are still craftable, but neither has any effect. Placing a torch needed a position and is removed.
4. **Leaving** (until **T6**). `leave` is offered at any time, at 0 AP, and ends the run as salvage. It used to need the miner on the surface.
5. **Air** (until **T5**). Nothing changes air. If it ever reached 0 the cause would be "suffocated": "drowned" needed the avatar's cell.
6. **Regrowth** (until **T4**). "Something stands on the stump" now means loose items only, and there are none.
7. **Coal in sight** (design doc 3.2; the rest of surface generation is **T7**). The old rule ran the light reveal from the start cell. Now: if no square on open ground has coal in layer 0, one plain-rock layer-0 block under open ground (not an outcrop) becomes coal, picked with the seeded generator. The start clearing, the paths laid out from `WORLD.startPosition`, and path wear are unchanged; v0.2 drops the clearing and the wear, and T7 does that.
8. **Not built here**, because their hazards are not: a flooded square costs 1 AP more and a square under lava cannot be mined (T10); a camp's squares cannot be mined (T12); mining takes a support away (T8).

### Tools

- **Simulator.** The walking policies (`staircase`, `wander`, `coal`) are gone. `random` picks among the legal actions other than leaving, and "end the shift". `pit` digs a terraced pit round the middle of the map, cuts the trees in its way, crafts fuel from the coal it finds, and leaves when fuel is about to run out. This replaces the policy paragraphs of note 0008; its golden-run format and report stand. The metric `deepestLayer` is now `deepestSquare`, and `treesCut` is new.
- **Coal survey removed** (`tools/coalSurvey.ts`, `npm run sim -- --survey coal`). It measured a walk from the start cell to coal and back, and nobody walks (note 0025, row 0016). Coal is in sight on open ground on every seed (tested on 1,000), and any square can be mined, so the first coal costs 2 AP.
- **Golden runs** are re-recorded: every old run moved a miner. See `tests/golden/README.md`.

## Consequences

- Hidden information is now one rule with one test: scramble everything below the tops and under never-cut trees, and nothing the player is offered or shown may change (`tests/engine/properties.test.ts`). Mineral traces are the deliberate exception, as before.
- A fresh map offers about 1,000 mines or cuts at once, so the views name a square instead of listing actions.
- `legalActions` builds that list on every call, and `applyAction` calls it to check legality. The simulator runs about 0.15 s per `pit` run (about 3 minutes per 1,000 runs; note 0008 measured 13–35 s per 1,000 with a miner). Fast enough for now; if T15's surveys need more, check one action directly instead of building the list.
- The `pit` policy reaches depth 4–7 before its fuel runs low and never reaches ore. T15's terracing policy and depth survey are the real measurement (question 85).
