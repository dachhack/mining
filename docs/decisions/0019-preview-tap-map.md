# 0019 — Phone preview: a coloured tap map

Date: 2026-11-19. Status: accepted (owner's request after trying the preview; issue #66). Builds on 0018.

## Decision

- **The preview's map is a canvas of coloured tiles**, 16 × 16 cells of one layer, in place of the text map. One colour and one pattern per block (`src/app/map/palette.ts`), so no two blocks differ by colour alone. The text map stays in `npm run play`, unchanged.
- **The map draws only from a tile model built from `knownCell`** (`src/app/map/tiles.ts`), the engine's "what the player sees of one cell", which is `null` for an unseen cell. Light is worked out there from known cells only, the way the engine's light spreads. A test changes every unseen cell (open, solid, laddered, with loose items) and requires the same tiles on every layer and the same tap choices.
- **A tap stands for the legal actions that act on that cell** (`targets.ts`): moves into it, mines of it, pick-ups from it; on the miner's own cell also ladder climbs and mining underfoot; with the miner on the surface and the top layer on screen, also the walks on the surface above it. A move that changes layer belongs to the layer it ends on (so "step up east" is a tap on the layer above). Placing, crafting, dropping, leaving and ending the shift stay in the full list, folded under the map.
- **One choice with no warning is done at once; anything else opens a chooser.** A warning (`choiceWarning` in `src/app/text/describe.ts`) is a fall or drop, or a yield too heavy to carry.
- Sizes and timings of the map (16 cells, the drag threshold) are presentation, not rules, so they are in `src/app/map/palette.ts`, not `src/data`.

## Consequences

- A cell is about 23 px on a 390 px phone. The buttons, the chooser and the list keep the 44 px minimum; the cells cannot without showing fewer than 16 across.
- M2's water, lava and gas are not drawn yet; `knownCell` already gives them, so they can be added as marks.
- M3 replaces the preview screen; the tile model and the targeting may carry over.
