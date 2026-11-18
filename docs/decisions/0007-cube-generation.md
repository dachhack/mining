# 0007 — Cube generation: rock by weight, ore by grown veins

Date: 2026-11-18. Status: accepted with M1 task 2 (issue #4). The numbers are [Default] values, assumed under owner question 33.

## Context

M1 task 2 fills in `generateCube`. The design doc fixes the depth bands (3.1) and says ore comes in connected veins (3.3), but gives no densities, vein sizes, or method.

## Decision

- **Two passes.** First every cell becomes one of its band's plain rocks, picked cell by cell by weight; the weights slide evenly from the band's first layer to its last (dirt thins out going down the upper band; hard rock thickens going down the middle band, 0005 item 4). Then, band by band and ore by ore, veins replace some of that rock.
- **Stone in the deep band.** Design doc 3.1 lists only hard rock as the deep band's rock, and 0005 item 4 says "mostly hard rock" without saying what the rest is. Reading: the rest is stone, 20% of cells in layer 20 falling to 5% in layer 31, which joins up with the 30% stone at the bottom of the middle band. It matters to play: those cells cost 2 AP to mine, not 3 (about one deep cell in eight). Assumed under owner question 33.
- **A vein** starts at a random rock cell of its band and spreads one block at a time into a random neighbouring rock cell of the same band, until it reaches a size drawn between the ore's `minSize` and `maxSize`. So it is always one 6-connected group, never leaves its band, and never overwrites another vein. A vein that is boxed in below `minSize` is undone and tried elsewhere, up to `veinPlacementTries` times.
- **Vein count** scales with the band: `veinsPer1000Cells` for each 1000 cells, rounded, and at least one.
- **Touching veins.** Two veins of the same ore may touch, and then look like one vein larger than `maxSize`. Nothing prevents it; it is rare at these densities.
- **Other cube sizes.** A cube that is not 32 layers deep gets the same bands in proportion (`generation/bands.ts`). Only tests use this.
- **Numbers** are all in `src/data/generation.ts`: each ore fills about 2% of its band (crystal 1%), in veins of 2 to 9 blocks.

## Consequences

- Plain rock has no structure larger than one cell: no strata, no pockets of dirt. If cave-ins (M2) want coherent dirt layers, pass 1 is the place to change.
- Any change to these numbers, or to the order in which random numbers are drawn, changes every generated cube and so every golden-run hash.
