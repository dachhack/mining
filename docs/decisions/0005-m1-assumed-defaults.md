# 0005 — M1 assumed defaults and rule readings

Date: 2026-11-18. Status: assumed by the coordinator under agent plan section 6; every item is an assumed reading of a [Default] or of a point the design doc leaves unspecified, and the owner can change any of them. No [Decided] item is changed. Item 23 applies a [Decided] section (9.4, salvage) as written to the milestones before contracts exist; the owner should look at that one in particular (question 20).

## Context

Milestone M1 (engine core) needs answers to owner questions 1–6, 11, and 14, and to a few gaps found while splitting M1 into tasks (questions 18–21). The owner has not answered yet. So that every developer builds on the same reading, the coordinator fixed one here. Each number below lives in `src/data`, so changing an answer later is a data edit or a small rule change, not a rewrite.

Section numbers refer to `docs/game-design-doc.md`.

## Decision

### World

1. **Bedrock (Q1).** The whole 32×32×32 grid is minable. Bedrock is an implied wall outside the grid: any cell beyond the four sides or below `z = 31` is solid and unmineable, and is never stored.
2. **Surface.** `z = -1` is the surface: a 32×32 layer of open air in daylight that the avatar can walk on (standing on the `z = 0` blocks). The avatar cannot leave that 32×32 area. It starts at `(16, 16, -1)`.
3. **What M1 generates.** Dirt, stone, hard rock, coal, timber-root, iron ore, copper ore, and crystal, in the depth bands of 3.1, with ore in connected veins. Blocks whose rules arrive later are not generated yet: unstable ore, caverns, and pockets (M2), relics and keystones (M4).
4. **"Hard stone" (Q18).** The band table (3.1) lists "hard stone" for the middle band, but the block table (3.2) has no such block. Reading: the middle band is a mix of stone and hard rock, with more hard rock deeper; the deep band is mostly hard rock.

### Avatar, movement, gravity

5. **Size and footing.** The avatar fills one cell. It is held up by a solid block below it or by a ladder in its own cell. On the surface it stands on the `z = 0` blocks like anywhere else, so it falls if the block under it is mined.
6. **Moves (1 AP each).** Walk to one of the 4 orthogonal neighbours on the same level if that cell is open. Step up 1: to an orthogonal neighbour one level up, if that cell is open, the block under it is solid, and the cell above the avatar's head is open. On a ladder: climb to the cell above if it is open and has a ladder; climb down to the cell below if it is open and either has a ladder or is a drop of at most 2 (item 7). No diagonal moves.
7. **Falling.** After any action, if the avatar has no footing it falls until it has. Walking into a cell with no floor is the "drop down 1–2 blocks" action of 4.1: it is legal only when the drop is 1 or 2 blocks, and the action list shows the depth. A longer fall is never offered as a move; it can only happen when the avatar mines the block it stands on above a void. Damage follows 5.2: 1–2 blocks free, 3–5 blocks 2 damage per block beyond 2, 6 or more fatal.
8. **Health in M1.** Only falls hurt in M1. Air, and every other hazard, arrives in M2.
9. **No block falls in M1.** Cave-ins, including dirt falling when unsupported, are M2.

### Mining and reveal

10. **Diagonal mining (Q5).** Mineable cells are the 4 orthogonal neighbours, the cell below, the 4 diagonals on the avatar's level, and the 8 cells around the one below: 17 in all. No line-of-sight test: a diagonal can be mined even if both cells it shares an edge with are solid, as 4.1 is written.
    - **Reach reveals (Q22).** The 17 mineable cells and the cell overhead are always revealed, whatever the light: the miner can inspect what the pick can reach. Without this, the diagonal cells would usually be unknown rock (none of their faces touches a lit open cell), and their AP cost in the action list would leak their type. Only revealed blocks can be mined, which with this rule is every block in reach.
    - **Looking over an edge (Q40).** The cells a drop is judged by (item 7) are revealed in the same way: the cells straight below each open orthogonal neighbour, and below the avatar when it is on a ladder, down to the first solid block or one cell past the longest drop a move may choose. Without this the move list would leak them when the lamp is out (issue #15).
11. **Mining overhead (Q4).** Not a legal action in M1, because supports cannot be placed until M2. Proposed for M2: a support in the avatar's own cell allows it.
12. **A block is mined in one action.** If the avatar has fewer AP than the block costs, mining it is not legal this shift.
13. **Light (Q6).** A cell is lit if it is on the surface, or can be reached from the avatar through open cells in at most `lightRadius` steps (6-connected flood fill, so light does not pass through rock). A placed torch lights cells the same way from its own cell, out to `torchLightRadius` (3, the same as the lamp).
14. **Reveal (Q6).** A block is revealed when any of its faces touches a lit open cell. Once revealed it stays revealed. So the top layer is revealed at the start.
15. **Lamp oil (Q11).** The lamp burns 1 oil every 4 shifts at upkeep. With oil the light radius is 3; with none it is 1.

### Items and weight

16. **Yield.** Mining puts the yield in the inventory if the carry limit allows. Otherwise the yield is left as loose items in the mined cell.
17. **Loose items.** Pick up (from the avatar's cell or a face neighbour) and drop (into the avatar's cell) cost 0 AP. Loose items fall straight down until they rest on a solid block.
18. **Weights (Q11).** Stone 2, coal 1, timber 1, raw ore 2, crystal 1, support 2, torch 1, ladder 0. Fuel and lamp oil are gauges, not carried items, and weigh nothing. Carry limit 20 (5.1).
19. **Ladders.** Placed (1 AP, 1 ladder) into the avatar's own cell or an open face neighbour. Torches likewise. Supports can be crafted in M1 but not placed until M2.

### Shifts, AP, fuel

20. **Banked AP (Q3). Superseded by the owner's decision in issue #32 (no fuel refill):** unspent AP is lost when the shift ends, it does not become fuel, and there is no banked counter. The reading assumed before that decision was: Unspent AP does not carry into the next shift as AP. It adds to a banked counter that persists across shifts; each time the counter reaches 3, it drops by 3 and 1 fuel is refunded.
21. **Upkeep order (Q19). The banked-AP step is superseded by issue #32;** the rest stands: at upkeep, if fuel is 0 the run ends ("out of fuel"), otherwise the shift's fuel is consumed, then lamp oil burns, and a player may finish a shift on 0 fuel and survive only by crafting fuel before the next upkeep. The reading assumed before that decision was: At upkeep: apply the banked-AP refund; then, if fuel is 0, the run ends ("out of fuel"); otherwise 1 fuel is consumed; then lamp oil burns. So a player may finish a shift on 0 fuel and survive if they craft or bank fuel before the next upkeep.
22. **Starting kit (Q2).** Loadout `standard`: 24 fuel, 6 lamp oil, 6 ladders, 2 timber.
23. **Leaving (Q20).** While on the surface the avatar may leave, which ends the run with the outcome "salvage" (9.4). In M1 this is the only way to end a run alive, because contracts arrive in M4. `createRun` takes a placeholder contract id `none`.

### Code

24. **Data validation (Q14).** A hand-written validator in `src/data`, with no new dependency, run by a unit test in CI and by the tools at start-up.
25. **Seeds.** A seed is an unsigned 32-bit integer. The PRNG state is plain numbers inside `GameState`. The state hash is computed in plain TypeScript (no Node `crypto`), so it gives the same value in Node and in a browser.

## Consequences

- M1's ways for a run to end are: fell, out of fuel, and leaving from the surface.
- Timber is the only source of ladders and exists only in layers 0–7 (question 13). With weightless ladders, timber rather than carry weight is what limits how deep a ladder shaft can go; cut steps need no ladders. The M1 playtest round should show whether that is a real choice.
- **Banking can outrun upkeep (Q23). Superseded by issue #32:** there is no banking any more, so fuel only falls unless it is crafted, and "out of fuel" is a clock again (24 idle shifts from the standard kit; the 25th upkeep ends the run). As written before that decision: With the design doc's own numbers (5 AP per shift, 3 banked AP → 1 fuel, 1 fuel per shift), a shift spent doing nothing gains about two-thirds of a fuel. So fuel can be built up without limit by waiting, and "out of fuel" is not a clock for a player who idles. The numbers are left as the design doc gives them; the M1 playtest brief asks the Speed-runner and Cautious personas to watch for it, and the question is with the owner.
- **A stuck avatar has no way to end the run in M1.** An avatar in a pit with no ladders and no timber can still end shifts, so the engine never soft-locks, but because of the point above the run need not end either (no longer true after issue #32: such a run now ends out of fuel). Entombment detection, which offers to end the run, is M2 (5.3). The sim tool caps the number of shifts.
- If the owner answers a question differently, the coordinator opens a task to change the data or rule, with its test.
