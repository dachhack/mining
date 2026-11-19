# 0023 — Phone preview: one tap, no menu; the surface drawn on the top layer

Date: 2026-11-19. Status: accepted (owner, issue #78; coordinator's reading). Amends 0019 for the preview screen only; no rule changes.

## Decision

- **No menu.** The pop-up chooser of 0019 is gone. A tap on a cell does one action at once (`tapAction` in `src/app/map/targets.ts`), picked by a fixed priority: mining or cutting a tree, then moving, then taking items; among equals, the first in the action list. Everything else stays in the full list under the map.
- **Risky taps are double taps** (`tapIsRisky`). A risky tap is a fall the forecast knows will hurt or kill, or a yield too heavy to carry. A walk off a ledge is a chosen drop of at most `AVATAR.maxChosenDropBlocks`, onto ground the miner has seen; one of up to `AVATAR.freeFallBlocks` blocks is free (design doc 5.2), so it is one tap. It is two only if the engine's `fallDamage` says it costs health, or the fall is fatal (review of PR #79). Any other action is risky when `tapActsAtOnce` refuses it: a dig down onto a known fall that hurts, or a yield too heavy to carry. A lone dig down onto unseen ground is still one tap (0022). A risky tap marks the cell with a dashed outline and a hint that says the risk. A second tap on the same cell within `PREVIEW_MAP.doubleTapMs` (3 s) does it, provided it is still the same action (compared by `actionKey`). A tap anywhere else only clears the mark, and does nothing more.
- **The top view.** There is no separate surface layer on the map. Layer 0 is the top view: each tile also carries the surface cell over it (`Tile.surface`). A tree is drawn solid and hides the block under it; a stump, path, meadow or outcrop is drawn as a faint pattern over the block under it. The miner on the surface is drawn on the top view, and the layer buttons go down from it. On the top view a tap reaches the surface too: walks and cuts on the surface over the cell, as well as mines of layer-0 blocks.
- **Hidden information** is unchanged: the top view is built through `knownCell` like every layer, and the surface is always seen. The unseen-cells test covers every map layer, layer 0 as the top view, and compares the action each tap would take.

## Consequences

- In a hole in the top layer, a neighbouring block offers both a mine and a step up onto the surface over it. The tap mines (priority), and stepping up is done from the full list. This lasts until issue #80. The owner chose option (A) on PR #79 (blocker 2), relayed by the coordinator: keep the fixed priority here. In #80 the miner has no gravity, and tapping an open cell moves there, so climbing out becomes a tap.
- 0019's "a move belongs to the layer it ends on" still holds below the top layer.
