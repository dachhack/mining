# 0030 — T7 and T9: generation for the terrain model, and breaking into underground spaces

Date: 2026-11-20. Status: accepted for the code as it stands (issue #95, tasks T7 and T9 of decision note 0025; T7 reworks issue #52). Everything here builds a [Default] of design doc v0.2 (sections 3.2, 3.3, 3.6, 3.7 and 6.2; question 80). The numbered readings are the developer's; the ones an owner might want to change are questions 96 to 98 in `docs/owner-questions.md`. None changes a [Decided] item, and the design doc is not changed.

## Context

After T2 a generated cube was solid rock and ore: no cavern, no pocket, no unstable ore. Mining the roof of an open space (which only a hand-built test cube had) filled the column under it with rubble (temporary rule 1 of note 0026). The surface still had the start clearing and the paths of a miner who no longer exists, and coal in sight read a hidden cell (temporary rule 7; issue #88 item 1).

## Decision

### T7: generation

1. **Underground spaces** (`src/engine/generation/spaces.ts`, numbers in `src/data/generation.ts`). After rock and veins, `generateSpaces` opens caverns and pockets, band by band, in the bands of design doc 3.3:

   | Band (layers) | Kind   | In a full-size cube | Cells each | Holds          |
   | ------------- | ------ | ------------------- | ---------- | -------------- |
   | Upper (0–7)   | Cavern | 12                  | 2–5        | nothing        |
   | Middle (8–19) | Water  | 10                  | 3–10       | 1 water a cell |
   | Middle        | Gas    | 7                   | 2–6        | 4 gas a cell   |
   | Middle        | Cavern | 7                   | 4–12       | nothing        |
   | Deep (20–31)  | Lava   | 10                  | 4–12       | 1 lava a cell  |
   | Deep          | Cavern | 5                   | 10–30      | nothing        |

   Every space is one connected group of open cells inside one band. It replaces plain rock only, never ore, so every ore block is where it was before for a given seed. It is sealed: rock on all six sides of every cell, and no two spaces touch. A cavern is empty (note 0017 item 21).

2. **No space reaches layer 0.** So every square of a fresh cube is at depth 0, the surface is flat, and a flat cube is at rest by itself (note 0025). The span and shaft limits of note 0014 item 19 and the "settle the cube" safety net are dropped; nothing was built for them.

3. **Unstable ore** is a vein in the deep band (about 54 blocks a cube, in groups of 2 to 4). It is listed last, so no other block moved for a given seed: on seed 7 the cube differs from the old one in those 55 blocks and nowhere else (checked when this was written).

4. **Lava sources are decided when a pocket is broken into,** from its size, not marked at generation. Design doc 6.2 puts the source on the mined square, so there is nothing to mark on the pocket's cells. With sizes 4 to 12 and the limit of 8, about 4.5 of a cube's 10 lava pockets are sources.

5. **The surface** (`src/engine/surface/generation.ts`). The start clearing, `WORLD.startPosition`, the "meadows keep away from the start" rule and path wear are removed. Meadows are placed anywhere inside the edge margin. Paths start from the middle of the first meadow and run to every other meadow and to two edges. A path is open ground over whatever block is there. About 67% of the surface is trees (it was about 65%).

6. **Coal in sight** reads only layer-0 blocks on open ground: the layer-1 check is gone (issue #88 item 1). A test changes every hidden block and checks that the same block is picked.

7. **Survey** (200 seeds, `createRun`): every cube got all 51 spaces asked for; 372 open cells a cube on average (1.1% of the cube); 32 of the 1,024 squares (3%) have a cavern somewhere in layers 1 to 7 under them. In 200 runs of the `pit` policy (which reaches depth 4 to 7), a mine broke into a cavern in 58 runs. No run reached a pocket: those start at layer 8.

### T9: breaking into an underground space

8. **The rule** (`collapseSpaceUnder` in `src/engine/breach.ts`). When the cell under a mined block is open, the whole space collapses: every open cell that can be reached from that cell through faces, staying below the tops, becomes rubble at once. The mined square's new top is rubble one level down, so the square drops exactly 1 and the level rule holds. This replaces temporary rule 1 of note 0026.

9. **Contents.** The water, lava and gas of every cell are added up and put on the mined square. A lava pocket of more than 8 cells makes the lava there a source.

10. **Where "on a square" is stored.** The state already keeps water, lava and gas cell by cell. What stands on a square is what the open cells above its top block hold, added up (`contentsOn`). A breach puts everything in one cell, the one the mined block was in. A cell stores one byte, so the data validator refuses a pocket size that could hold more than 255 units. The shape of the state did not change, so `STATE_VERSION` stays 10. T10 and T11 are free to keep this or spread the units over the cells above a top; `contentsOn` reads either.

11. **The event** is `spaceCollapsed` (it was `roofCollapsed`): the square's new top cell, the units of water, lava and gas that came out, and whether the lava is a source. It names no other cell. For a cavern all the amounts are 0, so the event does not say how big the cavern was. For a pocket the amount says how big it was, as design doc 6.2 intends.

12. **The hook for other tasks.** `collapseSpaceUnder(state, cell, events)` takes the cell a block was just removed from. T8 (a slump takes a top block away) and T11 (an explosion does) should call it right after removing the block, so that the square never drops past a space.

### Tells

13. **Hazard tells** (`hazardTellsAt` in `src/engine/tells.ts`, distances in `src/data/tells.ts`). Damp stone within 1 step of a water pocket, pitted rock within 1 of a gas pocket, warm glow within 2 of a lava pocket, hairline glow on unstable ore itself; steps are counted through the grid, down as well as sideways. They are worked out from where the pocket is now and never stored (note 0014 item 18), so a tell goes away when its pocket has collapsed. `KnownSquare.tells` gives them for a known top block.

14. **A pocket means underground.** Water, lava or gas standing on a square in the open gives no tell: it is seen as what it is (`KnownSquare.contents`). Otherwise a flooded pit would show damp stone on every block round the water.

15. **Display is the minimum.** The play tool lists the tells and what stands on squares under the map, and names them when a block is uncovered; the tap messages on the phone use the same words. The phone map draws no mark for either yet. Marks are T14.

## What a player can meet until T10 and T11

- **Caverns** (from the first shifts): a mine over one leaves rubble as the new top, which costs 1 AP and gives nothing. The play tool says the roof fell in.
- **Water and gas pockets** (from depth 7): the tell shows on the block above first. Breaking in puts the water or gas on the mined square, and it stays there. It does not spread, does not hurt the crew, does not make mining dearer, and is not cleared by anything.
- **Lava pockets** (from depth 19; the `pit` policy never gets there): as water, with a warm glow from two levels above. A source is marked as one and does nothing yet. A square with lava on it can still be mined.
- **Unstable ore** (deep band): shows the hairline glow when it is a top block, is mined like any ore, and gives rare ore. It is never armed.

## Consequences

- Every cube changed, so the four golden runs were recorded again; a fifth, `pit-seed-24-caverns`, breaks into two caverns.
- Hidden information. The property test still scrambles everything below the tops and compares all the player gets, with the hazard tells left out, as mineral traces always were. A new test scrambles only the cells more than 2 steps from every top block and checks that the tells do not change either.
- The level rule on generated cubes (issue #88 item 2): a test digs terraced pits down to a cavern, a water pocket and a gas pocket on three seeds, and to a lava pocket on one, through `applyAction`, and checks the rule after every mine.
- The simulator reports how many runs broke into a space (`runsThatBrokeIntoASpace`, and `spacesBrokenInto` for each run).
