# 0053: Wall slumps and supports are retired

Date: 2026-11-22. Plan: Lab 2 becomes the game (`docs/plans/lab2-becomes-the-game.md`), question 153.

The owner first chose wall slumps and supports as the first old rules to bring back. Then they changed it: "With the one level down only rule from the lab, wall slump shouldn't be a thing any more."

- **Decision.** Wall slumps, cracks and supports are removed for good, not deferred. In the new game a square is never more than one level below its neighbours, so there are no steep walls to slump and nothing for a support to hold.
- **First back instead:** fuel and depth bands (coal-fuelled digging and the deeper ore bands), as the first batch of Phase D.
- **Code.** The old slump rules (`src/engine/slump.ts`, slump limits in the block data, the support item) leave with the rest of the old game in C2.
