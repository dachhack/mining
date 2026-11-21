# 0043 — UI lab 2: the surface (wood, grass, apples, animals), clay, and new camp costs

Date: 2026-11-21. Status: implemented (issue #121). Builds on 0042 (Lab 2). No game rule, game data number or golden hash changes; `ENGINE_VERSION` stays 0.4.0, and nothing under `src/engine` changed.

## What

- **The surface ("zero level")**, in `src/app/lab/surface.ts`. Squares at ground level carry a feature, generated from the world's seed: grass on most, trees in clumps, a few apple trees.
  - Grass: a tap gives 1 grass and leaves bare ground.
  - Tree: a tap fells it for 2 wood.
  - Apple tree: 1 apple a tap, up to 3. When empty it regrows its apples 60 seconds later; while empty, a tap fells it for 2 wood.
  - A square must be cleared before its block can be mined: the first taps harvest, later taps mine.
  - Features obey the fog: not drawn in fog, drawn grey on greyed ground, and taken only inside a ring.
  - A new camp is built over whatever grows on its 3 × 3; that is cleared and gives nothing.
- **Roaming animals** (sheep, drawn from above). 8 at the start; each steps to a face neighbour every 2 to 3 seconds of lab time, only onto ground-level squares with no tree and no other animal, so never into a pit. One new animal walks in at the map's edge every 60 seconds while there are fewer than 8. A tap on an animal on a lit square catches it (+1 animal), even on a camp's ground. Animals are drawn only on lit squares.
- **Clay**, a lab-only block: blobs of it replace dirt and stone in layers 1 to 3. Mined like dirt (any camp level), it gives 1 clay, with its own reddish texture and a key entry.
- **Costs** (replacing the stone-only costs):

  |          | Cost                                       |
  | -------- | ------------------------------------------ |
  | New camp | 5 wood + 5 grass                           |
  | Level 2  | 10 clay + 15 stone + 1 animal              |
  | Level 3  | 20 clay + 40 stone + 3 animals + 10 apples |

- **Counter and key.** Wood, grass, apples, animals and clay have their own icons in the counter (still one row at a fixed height) and in the cost chips. The key adds clay, grass, trees and apple trees when they are in sight.
- **The three optional fixes from the review of PR #120:**
  - the would-be camp's gold ring and wash are hidden when the target is refused;
  - "Ground not level" (and the other refusals) are said once, in the panel;
  - the preview's depth lookup skips squares off the map.

## Choices

- **Clay is not added to the game's blocks.** The rules say the game's data must not change, and a new block in `src/data/blocks.ts` would. Instead the lab keeps a set of cube cells that count as clay. The cube still holds dirt or stone there, so the level rule and the depth table work as before. When such a cell is mined, Lab 2 gives clay in place of the block's yield.
- **Time and randomness stay out of the engine.**
  - **Lab clock:** the screen keeps a lab clock (`performance.now()` since the world opened) and calls `advanceWorld(world, now)` every 250 ms and before every tap.
  - **Event order:** `advanceSurface` takes every animal step, new animal and apple regrowth due by `now`, in time order, each at its own scheduled time. So the result depends only on `now` and the taps between, not on how often the screen calls it. A unit test compares one jump to 30 s against 120 small steps.
  - **Randomness:** it comes from a seeded generator whose state lives in the world, so a seed and a list of lab times always give the same animals.
  - **E2e tests:** they pause the page's clock (`page.clock`) and run it on when they want the animals to move.
- **Animals may stand on a camp's ground.** Forbidding it could trap an animal on a camp's middle square, where every neighbour is camp. A tap there catches the animal before it opens the camp's panel.
- **The first animal starts inside the first camp's ring**, so every world has an animal to catch near the start. With only random placement, 5 of 200 seeds had none come by within 10 minutes.
- **The first camp** goes on a 3 × 3 within 4 squares of the middle whose ring holds the wood and grass for a new camp, preferring the most dirt, then the nearest.
- **Margins (200 seeds, every lit square cut, picked, felled, caught and dug).**

  | Check                              | Needed | Lowest | 10th percentile | Median |
  | ---------------------------------- | ------ | ------ | --------------- | ------ |
  | Wood, first ring                   | 5      | 6      | 14              | 38     |
  | Grass, first ring                  | 5      | 19     | 34              | 45     |
  | Clay, first ring + one more camp   | 10     | 14     | 23              | 35     |
  | Stone, first ring + one more camp  | 15     | 37     | 45              | 56     |
  | Animals starting in the first ring | 1      | 1      | 1               | 2      |

  Wood is the tight one: one seed has exactly one tree to spare. Two unit tests check the first two rows and the next two (with the animal) on all 200 seeds.

- **Wood is not the game's timber.** Timber-root blocks still give the game's "Timber"; trees give the lab's "Wood". See owner question 135.
