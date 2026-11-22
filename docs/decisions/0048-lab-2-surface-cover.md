# 0048 — Lab 2: plants hide the ground, trees make forests, plants grow on dirt, no surface coal

Date: 2026-11-22. Status: implemented (PR #127). This follows the owner's playtest of the PR #126 build. The changes are in Lab 2 only: no game rule, game data number or golden hash changes, and nothing under `src/engine` changed.

## What the owner said

- "Tree and grass cover entire square so you can't see what's below, trees edges connect to make forest"
- "Grass and doesn't grow on coal or stone"
- "No coal at surface"

(The fourth item, "Undo button", is a separate PR.)

## What

- **Grass covers its whole square.** It is drawn as a lawn, so the block under it is hidden until the grass is cut.
- **Trees make forests.** Tree squares are covered by tree tops and join their tree and apple-tree neighbours at the shared edges, so a group of trees reads as one forest.
  - The tree tops are round blobs on one grid over the whole map (two to a square each way), so the forest has no seams between squares.
  - Toward a neighbour that isn't forest, the square stops at its own edge with a darker rim.
  - An apple tree joins the forest the same way, with its own lighter round crown and its apples in the middle.
- **Plants grow only on dirt** (`LAB_SURFACE.plantsGrowOn`): grass, trees and apple trees never grow on stone, coal seams or timber-root.
  - The owner's words were "Grass and doesn't grow on coal or stone". The coordinator read "and" as "and trees", so the rule covers all three.
  - Tree clumps still draw their chance on every square, so they fall where they did before, minus the rocky squares.
- **No coal at the surface** (`LAB_SURFACE.surfaceCoalBecomes`): a coal seam in the cube's top layer becomes **stone** in Lab 2. Coal below the top layer is unchanged.
  - Lab 2 copies the cube (`withoutSurfaceCoal` in `campWorld.ts`), so the game's generation and Lab 1 are unchanged.
  - Whether the real game should do the same is question 140, open.

## Why stone

On seeds 1 to 50, the top layer is 67% dirt, 29% stone, 2% coal seam and 2% timber-root. Directly under a surface coal seam is more coal 39% of the time, stone 31% and dirt 32%.

- **Stone over dirt:**
  - Seams lie in rock, so stone fits what surrounds them.
  - Plants don't grow on it, so the patch stays bare.
  - A bare stone patch is a fair hint that coal may lie beneath.
- **Dirt would hide that spot under grass,** and add grass to a cost that is already easy to pay in grass.

## Is the 15 + 15 camp still payable?

On seeds 1 to 200, harvesting only, the first ring now holds:

|       | Fewest | 10th percentile | Median |
| ----- | ------ | --------------- | ------ |
| Wood  | 18     | 56              | 84     |
| Grass | 70     | 83              | 94     |

That is down from 30 / 126 wood and 114 / 143 grass, because plants no longer grow on rock. On seeds 1 to 1,000 no seed falls short; the fewest wood is 16. The two 200-seed reachability tests still pass.

## Tests

- **Unit, in `tests/app/surface.test.ts`:**
  - On 50 seeds, every plant stands on dirt, and more than 30% of squares still have one.
  - On 50 seeds, every top-layer coal seam is stone in Lab 2, and every other cell of the cube is unchanged.
  - The game's own cube for a seed hashes the same after Lab 2 builds its world, and Lab 1's cube still has surface coal.
- **E2e:** the key test now expects six kinds in sight on seed 110 (was seven, with coal seam).
