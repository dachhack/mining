# 0011 — Light matters: with the lamp out the miner knows only the six cells it touches

Date: 2026-11-18. Status: the owner's direction ("make light matter", the answer to questions 22 and 40 after playtest round m1-r1, finding 4, issue #24), in the form the coordinator assumed in issue #33. The form is for the owner to confirm.

**Changed by 0022 (owner, issue #75):** lamp lit or not, only light and touch reveal cells now: the 17-cell reach, the cell overhead and looking over an edge (`edgeLookCells`) reveal nothing, and the pick reaches the face neighbours only. The "lamp out" rules below for touch now hold with the lamp lit too.

## Context

Under 0005 item 10 the 17 cells in reach, the cell overhead, and the cells a drop is judged by were revealed whatever the light. In a one-cell shaft or tunnel that is everything a lamp would show, so in round m1-r1 running out of lamp oil cost the player nothing, and no torch was ever worth placing.

## Decision

"The lamp is lit" means lamp oil is above 0.

- **Lamp lit: as before.** The 17 cells in reach, the cell overhead, and the cells a drop is judged by are revealed (0005 item 10).
- **Lamp out: the miner works by touch.** Reach reveals only the six cells that share a face with the miner's cell. The four diagonals and the eight cells around the one below are not revealed by reach, and looking over an edge reveals nothing.
- **The light radius without oil is 0**: only the miner's own cell is lit. A cell touching a lit cell is revealed (0005 item 14), which gives the same six cells.
- **Torches and daylight are unchanged.** Cells they light, and the cells touching those, are revealed with the lamp out too. This is now the reason to place a torch.
- **No mineral traces are noticed by touch.** Knowing a block by touch is not seeing it in light. With the lamp out, the lamp gives no light for mineral traces (0012) at all, so none are noticed on the six touched blocks. Torches and daylight still show traces, and traces already seen stay on the map.
- **Only revealed blocks can be mined** (unchanged). In the dark the diagonals and the ring below cannot be mined unless something else revealed them.
- **A move is offered only when every cell it is judged by is revealed.** The cells are:
  - walk: the neighbour; then, unless it holds a ladder, the cells under it in turn down to the first solid one, at most `maxChosenDropBlocks + 1` cells;
  - step up: the neighbour, the cell on top of it, the cell overhead;
  - climb up a ladder: the cell overhead;
  - climb down a ladder: the cell below; then, unless it holds a ladder, the cells under it in turn down to the first solid one, at most `maxChosenDropBlocks` cells.
    With the lamp lit all of these are revealed and nothing is removed. In the dark a move whose cells are not all revealed is not on the list.
- Revealed cells stay revealed (unchanged).
- **Issue #19 is replaced.** It wanted the data validator to require a light radius without oil of at least 1, because the step-up target was revealed only by light. The step up now checks that its target is revealed, so radius 0 is safe and the validator still allows it.

## Consequences

- **In the dark the miner cannot walk into a cell it has just dug open beside it**, because the floor of that cell is one of the ring below and is not known. It can go back along what it saw earlier, dig straight down (and drop into the hole), or carry on where a torch shows the floor. So with the lamp out a horizontal tunnel cannot be extended at all without a torch. This is the largest effect of the rule and is listed for the owner in the pull request.
- Mining the block underfoot in the dark is a fall of unknown depth: the cell under it is not known. Since 0010 (uncontrolled falls) that fall costs health from the first block, so in the dark it is both unknown and costly. The play tool says how far the fall is known to be, the least health it will cost, and "below that is unseen". A ladder in the miner's own cell holds it while it mines below.
- The action list still never depends on an unrevealed cell. The property check in `tests/engine/properties.test.ts` runs with the lamp lit, out, and running out, and now also tries a ladder in each unseen cell.
- With today's numbers (light radius 3 with oil, longest chosen drop 2) the lamp's own light already reaches every cell that looking over an edge reveals. The look is kept: it is what makes the move list safe if either number changes. (Since 0022 the look is gone. The move list is still safe without it: `knownFallDistance` returns `null` for any unseen cell, so a drop is offered only when every cell it is judged by has been seen.)
- The golden run `wander-seed-9` was recorded again: its old decisions include diagonal mining after the lamp went out, which is no longer legal.
