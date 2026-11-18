# 0010 — Mineral traces: rock near ore shows a tell

Date: 2026-11-18. Status: the direction is the owner's ("ore hints are good", answer to question 41); the form below is the coordinator's assumed default from issue #35, for the owner to confirm. Every number and block list is a [Default] in `src/data/tells.ts`.

## Context

Playtest round m1-r1 (finding 2, issue #22) found that whether a run finds ore depends on where the first shaft goes: a one-cell shaft from the start cell shows iron or copper by layer 12 on 576 of 1,000 seeds. The player had nothing to go on. Design doc 6 gives every hazard a tell on the blocks near it; this gives ore one in the same way.

## Decision

- **The rule.** A block of plain rock (dirt, stone, hard rock) that lies within 2 steps of an ore block (iron ore, copper ore, crystal) carries **mineral traces**. Steps are counted through the grid (Manhattan distance); rock in between does not matter. Coal and timber-root give no traces, because the top layer already shows them.
- **When the player sees it.** Only on a block that is revealed **and in light**. Light travels through open cells (0005 item 13), so a solid block is "in light" when one of its faces touches a lit open cell: the same blocks light reveals (0005 item 14). The top layer is always in light. A block revealed by the pick's reach alone (a diagonal, say) is not in light and shows nothing, and a traced block stops showing its traces when the light moves on.
- **What it says.** That ore is near: not which ore, how much, or which way. Ore itself never shows traces; where it is revealed it is simply visible.
- **Derived, not stored.** `src/engine/tells.ts` works the answer out from the blocks each time it is asked. Nothing is added to the state, so the state hash, the save format and the golden runs are unchanged, and the answer follows at once when ore is mined. M2's hazard tells belong in the same module.
- **Public surface.** `showsMineralTraces(state, pos)` and `visibleMineralTraces(state)`. Both answer only for revealed blocks. `carriesMineralTraces`, which reads hidden blocks, is used by `tools/ascii.ts --traces` and the tests and is not exported from `src/engine/index.ts`.
- **No new event.** What the player sees changes with the light (a move, a torch, the lamp going out), not only when a block is revealed, and light has no event. A flag on `blockRevealed` would be wrong as soon as the avatar moved. A renderer calls `visibleMineralTraces` after each step, as it must for light itself.
- **Reading the lit cells.** `tells.ts` builds them from the three functions `reveal.ts` already exports (`litCellsFrom`, `avatarLightRadius`, `torchPositions`), so `reveal.ts` is not touched. If the sources of light change there, `lampAndTorchLight` in `tells.ts` must follow.
- **Play tool.** Traced rock is drawn as `%` on the map, in place of the rock's own character (one character per cell), and the mine list says "Stone, mineral traces". `--help` explains it.
- **Sim.** Each run reports `oreBlocksMined` and `tracesSeenBeforeFirstOre`; the aggregate counts the runs.

## Figures

A one-cell shaft dug with the engine from the start cell until the miner stands in layer 12, seeds 1 to 1,000 (`tests/engine/shaftSurvey.ts`):

| What the shaft showed                      | Seeds        |
| ------------------------------------------ | ------------ |
| Ore (as in round m1-r1)                    | 576 of 1,000 |
| Mineral traces                             | 849 of 1,000 |
| Traces, and no ore                         | 273          |
| Ore, and no traces                         | 0            |
| Both, traces at least one layer before ore | 429 of 576   |
| Both, first seen from the same layer       | 147 of 576   |

Traces are first seen from layer 8.4 on average; where both show, traces come 1.1 layers earlier on average. No traces show above layer 5, because no ore lies above layer 8.

## Consequences

- On 273 seeds in 1,000 the shaft now gives a reason to cut sideways where before it gave none. 151 seeds still show nothing by layer 12.
- At a distance of 2, about 23% of the cells in the ore layers (8 to 31) carry traces, measured over seeds 1 to 20. Whether that is a hint or noise is for the next playtest round; the distance is one number in `src/data/tells.ts`.
- The `%` hides which rock a traced block is on the map. The mine list names it for blocks in reach.
- Traces are not remembered. To see them again the player has to light the block again. Remembering them would mean storing them in the state.
- `visibleMineralTraces` costs a flood fill per light source on each call. The sim calls it on every step until traces are seen or ore is mined, which roughly doubles the time of a `random` run that never goes deep.
