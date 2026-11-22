# 0052 — No coal at the surface; a minimum of coal in layer 1

Date: 2026-11-22. Status: implemented (this PR). Engine 0.5.0: the first PR of the batch after the 2026-11-22 playtest.

## What the owner said

Question 140, after Lab 2 took coal off its own surface (note 0048): "No coal at surface in the real game, but make sure there is some coal at the first level after the surface."

## What changed

- **No coal on the top layer.** Cube generation turns every coal seam in layer 0 into stone (`GENERATION.surfaceCoal.surfaceBecomes`), after the veins are placed. Stone for the reasons in note 0048: seams lie in rock, and a bare stone patch is a fair hint that coal may lie beneath. No random number is drawn for this.
- **At least 12 coal in layer 1** (`GENERATION.surfaceCoal.firstLayerMinimum`, [Default]). If the veins leave fewer, generation grows more coal veins (normal coal-vein sizes, 3 to 9) in layer 1's plain rock until there are at least 12. If layer 1 already has enough, no random number is drawn, so the rest of that cube, its spaces and its surface are as they would have been with only the layer-0 swap.
  - This runs before the underground spaces are opened. A space replaces plain rock only and never reaches layer 0, so the coal stays.
  - The minimum is written for the 32 × 32 cube; a smaller (test) cube needs the same share of its layer, rounded up.
- **Coal in sight is gone.** Design doc 3.2 said at least one square on open ground showed coal at the start (owner, question 67), and `ensureCoalInSight` put one there if needed. The owner's new answer contradicts it, so it is removed: its code, its data (`coalInSightBlock`, `coalInSightReplaces`) and its tests. It was marked [Default], but it was the owner's request, so the owner's approval of this change is recorded here.
- **Lab 2's own coal swap is removed.** `labCube` (named `withoutSurfaceCoal` in note 0048) turned layer-0 coal into stone on Lab 2's copy of the cube. The game now does exactly that, so that part found nothing to change: dead code. It and `LAB_SURFACE.surfaceCoalBecomes` are gone; `labCube` still turns timber-root into dirt (note 0050). Lab 2 still has no coal at the surface and stone where it was.
- **The map opens on the open ground nearest the middle.** `openingSquare` preferred the coal in sight nearest the middle; there is none at the start now, so that branch could never be taken.

## Why 12

- 12 coal makes 36 fuel (1 coal → 3 fuel), half the standard loadout's 72: enough for real early fuel or several smelts, not a windfall.
- On seeds 1 to 1,000 before this change, layer 1 held 25 coal on the median seed, at least 15 on 95% of seeds, fewer than 12 on about 1 seed in 100, and 4 at the fewest. So 12 is a floor for the poorest seeds and leaves almost every cube untouched.

## What it does to play

Coal is no longer free at the start. To mine a layer-1 block, the square must already be 1 deep and, by the level rule, all four of its neighbours must be at least 1 deep too: about 6 mines (6 AP near a camp, more away from one) for the first coal. Policies that only scratch the surface (`random`) now craft no fuel at all; the acceptance and depth-survey numbers before and after are in the PR description.

## Tests

- `tests/engine/surfaceCoal.test.ts`: on 500 seeds no coal in layer 0 and at least 12 in layer 1; on a hand-built cube, the swap, the top-up staying in layer 1 and in plain rock, no random number drawn when layer 1 has enough, the minimum scaled to a small cube; the data validator's new checks.
- `tests/engine/generation.test.ts`: the cube rules now say no coal in layer 0, and allow a coal group cut short at the top (it reaches layer 1); the pinned seed-7 cube hash changed.
- `tests/app/surface.test.ts`: Lab 2's cube is the game's cube apart from timber-root (dirt in Lab 2), with no surface coal.
- The golden runs were recorded again, and the hand-played camp-tool run (`tests/engine/campTools.test.ts`) and `tools.spec.ts` now dig for their coal.
