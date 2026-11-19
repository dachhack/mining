# 0024 — No gravity for the miner; ladders removed

Date: 2026-11-19. Status: accepted (owner, issue #80).

## Context

PR #79 made a tap on the phone map mine a block instead of opening a chooser. The coordinator then asked the owner how a phone player should climb out of a hole. Owner: "Let's scrap the movement in space limits for the miner. Ladders and scaffolding are not needed." Asked to choose, the owner picked **no gravity at all**, and for the tap: **a tap on a solid block mines it, a tap on an open cell moves there**.

## Decision

1. **Moving.** The miner moves 1 block (`ACTION_COSTS.move`, 1 AP) into any open face neighbour: north, east, south, west, up or down (`legalMoveActions` in `src/engine/actions/move.ts`, in the order of `FACE_OFFSETS`). A move is judged by its target cell alone, which the miner always touches, so the move list cannot depend on an unseen cell. A tree's cell is never entered, from beside it or from a hole dug under it.
2. **No falling.** The miner never falls, whatever is under it, after an action or after the cube phase. `settle` (`src/engine/gravity.ts`) now moves loose items only. Gone: uncontrolled falls, fall damage, the fatal fall, the `fell` event and the `Fell` death (`RunEndCause`), the `fall` damage cause, chosen drops of 1–2 blocks, the step-up rule and "climbing more than 1 needs a ladder or cut steps". The `MoveAction.drop` field is gone, so a move's `actionKey` is now `move to x,y,z ap N`. `src/engine/footing.ts` is deleted. Data removed from `AVATAR`: `freeFallBlocks`, `fallDamagePerBlock`, `uncontrolledFallDamagePerBlock`, `fatalFallBlocks`, `maxChosenDropBlocks`, `safeDigDownBlocks`.
3. **Digging down** (coordinator's reading in issue #80). Mining the block underfoot moves the miner into the cell it dug, in the same action (`applyMine`, which emits `moved` after the yield's events), so digging down stays one action (issue #75). It goes no further: with open cells under the dug one, the miner stays where it now is.
4. **Ladders removed:** the item, the field recipe, the structure, the `placeLadder` action and its AP cost, and the 6 ladders in the standard loadout. Structure code 1 (the ladder's) is retired, not reused, so an old save cannot be misread.
5. **Saves.** `STATE_VERSION` is 6. A version-5 save could hold a ladder (structure code 1, item `ladder`) or a miner who would now be standing where a fall used to take it; it is refused with the usual version error, as versions 3 and 4 are. No migration.
6. **Unchanged.** Blocks still fall (cave-ins, rubble), and the block overhead is still mined only with a support in the miner's cell (0014 item 9). Hazards, AP, light and visibility are as before. `ENGINE_VERSION` stays 0.3.0: this is part of the batch that bumped it.

## Consequences

- The text play interface: moves read "Move east", "Move up to the surface", "Move down to layer 2"; the block underfoot reads "(you are standing on it: you move down into it)". The "Not on the list" notes now explain only a tree in the way (beside the miner, or over a hole). The help text has no "Falling" section.
- The staircase policy goes back up the way it came (up into the cell it dug down from, then back along the stair). The coal policy walks onto the surface cell over a hole and then moves down into it, where it used to step in with a one-block drop.
- Random policy, 1,000 runs: 792 leave and 208 run out of fuel (837 and 163 before); mean blocks mined 8.7 (6.6). Coal survey (1,000 seeds, 24 fuel): unchanged, every trip gets the fuel back with the margin, and 4 starting fuel would do on every seed.
- Golden runs: all five recorded again; no old recording replays (its moves name a `drop`). The random run moved from seed 25 to 27 and the forest run from seed 182 to 150 (see `tests/golden/README.md`).
- Test seeds changed where shorter runs fell below what a test needs; each change is commented where it is made.
- Paused M2 tasks: drop anything about ladders or falls from their scope. #59 (entombment): a way out is now a path of open cells to the surface, with no ladder count (contract updated in `actions/giveUp.ts`). #53 (cave-ins): a falling block still damages the miner, but the miner does not fall when its floor goes. #54 (lava): there are no ladders to destroy.
