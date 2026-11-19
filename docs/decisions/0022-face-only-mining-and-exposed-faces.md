# 0022 — Mining reaches face neighbours only; only exposed faces are known

Date: 2026-11-19. Status: accepted (owner, issue #75).

## Context

Owner, issue #75: mining should work as in Minecraft. Until then the pick reached 17 cells (0005 item 10): the 8 round the miner on its level and the 9 on the level below, diagonals included. With the lamp lit the miner also knew every cell in that reach, the cell overhead, and the cells over an edge (`edgeLookCells`, 0005 item 10 and question 40). Digging out the block underfoot was an uncontrolled fall from the first block (issue #34). The owner asked for face-only reach, a safe one-block drop when digging down, and that only exposed faces be known.

This note sits beside 0021 (the top layer known only where the miner has been): together they are the one visibility rule of design doc section 3. They are kept as two notes because they answer two requests; 0021 says what daylight does, this note says what nothing but light and touch does.

## Decision

1. **Reach: face neighbours only.** The pick reaches north, east, south and west on the miner's level and the block it stands on (`MINE_REACH_OFFSETS` in `src/engine/neighbours.ts`). No diagonals, nothing else on the level below. The block overhead only with a support in the miner's own cell (`MINE_UP_OFFSET`; 0014 item 9). Supports cannot be placed until #53, so `mine-up` is never offered in play today.
2. **Digging down is a safe one-block drop.** Mining the block the miner stands on drops it into that cell. If the cell under it is solid, that is a drop of `AVATAR.safeDigDownBlocks` (1) block, recorded as a `chosenDrop`: no damage. If it is open, the miner falls on, and the whole fall, counted from where it stood, is `uncontrolled` and costs health as before (design doc 5.2). The dispatcher in `src/engine/index.ts` decides this with `isDigDown` (`actions/mine.ts`) and `avatarFallDistance`. A ladder in the miner's cell still holds it.
3. **The player is told only what it knows.** Before a dig down, the action list and the tap map say, unless the miner has seen the cell under the block: "you drop at least 1 block; if there is nothing under it (layer N, unseen) you will fall further and be hurt". Once that cell is seen as rock: "you drop 1 block, no harm". A longer known fall keeps its cost or FATAL. On the phone a lone dig down is taken on one tap, because that cell is almost never known and the chooser would otherwise open on every dig (coordinator's decision on PR #74, `tapActsAtOnce`); a known longer or fatal fall, or a block too heavy to carry, still opens the chooser. The result line after any choice says what happened, in the past tense: it leaves out the forecast of a fall (`ChoiceForm` 'result'), and the event lines say "You dropped 1 block" or give the fall and the health it cost (follow-up to PR #74).
4. **Only exposed faces are known.** A cell is revealed by light (lit, or sharing a face with a lit open cell; lamp, torch, daylight on the surface) or by touch (the six cells sharing a face with the miner's own), nothing else. The lamp no longer shows the cells in reach, the cell overhead, or what lies over an edge: `edgeLookCells` is gone. With the lamp out the miner knows the same six cells by touch (0011), so reach is the same lit or dark.
5. **Stairs.** A stair is dug by mining the block ahead, walking in and digging down; it can be walked back up with step-ups (test in `tests/engine/mine.test.ts`).

This replaces 0005 item 10 (17-cell reach; lamp-lit knowledge of reach, overhead and edges), the "looking over an edge" answer recorded under question 40, the part of 0011 that let a lit lamp show the cells in reach, and the issue #34 rule that a one-block dig down costs health.

## For the paused M2 tasks (#53, #55)

- `legalMineActions` (`src/engine/actions/mine.ts`) lists exactly the targets of decision 1; the overhead target is gated on `structureAt(state, pos) === STRUCTURES.support.code`. #53 makes supports placeable, which turns `mine-up` on with no other change; a support is also footing (0015).
- `isDigDown(state, action)` tells a dig down from any other mine. The fall it causes is resolved by the dispatcher after the mine, like any loss of footing, so a cave-in or explosion that removes the block underfoot is an uncontrolled fall, not a safe drop: only the miner's own dig down is.
- Arming unstable ore (#55: "a block beside unstable ore was mined") is unchanged in kind, but the mines that can trigger it are now only those of decision 1; the block underfoot counts as beside the ore round it.
- `updateReveal` (`src/engine/reveal.ts`) reveals by light and touch only. Anything new that should reveal cells (a scanner, an explosion's flash) needs its own rule there.

## Consequences

- Coal survey (1,000 seeds, 24 fuel): every trip gets the fuel back with the 3-shift margin and never reads below 3 fuel (as before). Coal in the top layer is now mined by digging down onto it, so the cheapest coal costs a little more AP (mean 4.1, at most 5; was 2.7, at most 4) and the smallest starting fuel that keeps the margin on every seed is 4 (was 3).
- Random policy, 1,000 runs: 837 leave, 163 run out of fuel, 0 die by falling (773 / 194 / 33 before). Mean blocks mined 6.6 (was 14.5), deepest layer reached 14 (was 11).
- Coal policy look-holes: a hole now shows only its floor's faces, so `LOOK_HOLE_MIN_UNSEEN_CELLS` is 4 of those 5 (was 10 of the old, wider reveal).
- Golden runs: all five recorded again (recorded diagonal mines are no longer legal). The forest run moved from seed 181, which no longer sees a tree grow back, to seed 182. See `tests/golden/README.md`.
- Test seeds changed where the new rules shortened runs below what a test needs; each change is commented where it is made.
- New property test: along staircase and wander runs, every unseen cell set to open space or to stone changes nothing the player is offered or shown, the dig-down text and tap warnings included.
