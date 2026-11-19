# 0021 — The top layer is known only where the miner has been

Date: 2026-11-19. Status: accepted (owner's request after PR #72).

## Context

Owner, after PR #72 was merged: "you can see the entire level when you dig down. we need to only show what has been discovered". Up to then daylight revealed the whole top layer from the start (except under trees, issue #70), so the layer-0 map showed nearly all of it. Deeper layers already showed only what the lamp had found. Asked what "discovered" should mean for the top layer, the owner chose "only near the miner": daylight no longer reveals the whole top layer; a top-layer block is revealed by the miner's light and reach, like any deeper block.

## Decision

1. **No daylight reveal of the whole top layer.** `updateReveal` no longer reveals every layer-0 cell.
2. **On the surface, daylight does the lamp's work** (`hasAvatarLight` in `src/engine/reveal.ts`): while the miner stands on the surface it sees by light whatever its lamp oil, with the lamp's radius (`AVATAR.lightRadiusWithOil`). Light spreads from the miner through open cells, as the lamp's does: over the open surface cells (not into trees), revealing the layer-0 blocks under them, and down into an open hole within that radius (review of PR #74). It gives no light to a miner underground. (Reach and looking over an edge worked as with a lit lamp too, until 0022: since then only light and touch reveal anything, on the surface as anywhere.) Without this a miner with no oil could not walk on the surface at all: a walk needs the floor to be seen. Underground, a miner with no oil still works by touch (0011).
3. **Mineral traces** are noticed on top-layer blocks only when they are in that light, as on any other layer.
4. **Coal in sight at the start** (0020 item 4, owner's decision on PR #72) now means: among the layer-0 blocks the miner sees from its start cell. `ensureCoalInSight` runs in `createRun` once the miner is placed with its lamp, works out the first reveal on a copy of the state, and if none of those blocks is coal turns one of them (not the start cell, not an outcrop) into coal. The 8-step walk of 0020 is gone with its data value.
5. **Views.** The text map's "you have seen more than is drawn: --radius N" hint now counts the top layer like any other layer (issue #46 item 5 left it out because all of it was known). The help text and design doc section 3 say the new rule.

## Consequences

- At the start the miner knows 15 to 25 top-layer blocks round the start clearing (300 seeds), not about 350.
- Coal survey (1,000 seeds, 24 fuel): every trip gets the fuel back with the margin; the cheapest coal costs at most 4 AP, and 3 starting fuel would do on every seed.
- Golden runs re-hashed (`staircase-seed-8.json` re-recorded: its recorded mine of a block beside the stair is now of a block not yet seen). Test expectations that assumed a fully known top layer are updated.
- The property tests (unrevealed cells and the ground under trees do not change what the player gets) still hold, and now cover far more of the top layer.
