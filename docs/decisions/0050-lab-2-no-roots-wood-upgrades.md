# 0050 — Lab 2: no timber-root, and every upgrade costs wood

Date: 2026-11-22. Status: implemented (PR #129). The owner asked for this after playtesting the PR #128 build. It changes Lab 2's own data and world setup only: no game rule, game data number or golden hash changes, and nothing under `src/engine` changed.

## What the owner said

"Let's get rid of the roots square. Let's make timber needed for each camp upgrade." They then answered the coordinator's follow-up questions:

- The roots are removed in Lab 2 only.
- "Wood is timber": wood and timber are one item, from trees and apple trees.
- Every upgrade costs it.

That also answers question 135.

## What

- **No timber-root.** Lab 2 builds its own cube from the game's (`labCube` in `campWorld.ts`). Every timber-root cell, in any layer, becomes dirt there (`LAB_SURFACE.timberRootBecomes`). The game's cube and Lab 1 are unchanged.
  - Timber-root sits in layers 0 to 3, next to stone (54% of its neighbours) and dirt (34%).
  - Level 1 no longer lists it among the blocks it mines, and the key never shows it.
  - Nothing in Lab 2 gives or costs Timber.
- **Wood in every upgrade:**

  |          | Wood | Was                                              |
  | -------- | ---- | ------------------------------------------------ |
  | New camp | 15   | 15 (unchanged)                                   |
  | Level 2  | 20   | none (+ 10 clay, 15 stone, 1 animal)             |
  | Level 3  | 40   | none (+ 20 clay, 40 stone, 3 animals, 10 apples) |

- **The cost row scrolls.** With wood added, level 2 costs four kinds of item. On a narrow phone the cost chips in a camp's panel used to cut the last one off; now they scroll sideways, with a fade at the right edge, as the counter does.

## Why dirt

- Roots grow in soil.
- Dirt costs the same to mine as timber-root (1), so digging is no harder.
- At the surface, plants can grow where the roots showed.

Stone would make digging harder, and would add stone to costs that are already easy to pay in stone.

## Why 20 and 40, and is it payable?

These figures are on seeds 1 to 200, harvesting only, with the second camp placed where it lights the most:

- After paying 15 for the second camp, the first two rings leave at least 45 wood (10th percentile 89, median 121). So 20 for level 2 is always there.
- With the first camp's level-2 ring as well, there is at least 87 wood before paying for level 2. That leaves at least 67 after it, so 40 for level 3 is there too.

Each step costs more than the one before (15, 20, 40), and level 3 is a real saving-up.

## Tests

- **Unit:**
  - Lab 2's cube has dirt for every timber-root cell, in any layer, and only the planned changes.
  - Upgrades cost wood, more than a camp, and level 3 more than level 2. Nothing costs timber.
  - The 200-seed test for level 2 now also checks its 20 wood.
- **E2e:**
  - The key shows five kinds on seed 110, and no Timber-root.
  - The counter never shows Timber.
  - The level-2 test pays wood too.
  - At 320 px wide, the last chip of the level-2 cost can be scrolled fully into view, and the Upgrade button stays whole on screen.
