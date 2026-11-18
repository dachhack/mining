# 0012 — Mineral traces: rock near ore shows a tell

Date: 2026-11-18. Status: the direction is the owner's ("ore hints are good", answer to question 41); the form below is the coordinator's assumed default from issue #35, for the owner to confirm. Every number and block list is a [Default] in `src/data/tells.ts`.

## Context

Playtest round m1-r1 (finding 2, issue #22) found that whether a run finds ore depends on where the first shaft goes: a one-cell shaft from the start cell shows iron or copper by layer 12 on 576 of 1,000 seeds. The player had nothing to go on. Design doc 6 gives every hazard a tell on the blocks near it; this gives ore one in the same way.

## Decision

- **The rule.** A block of plain rock (dirt, stone, hard rock) that lies within 2 steps of an ore block (iron ore, copper ore, crystal) carries **mineral traces**. Steps are counted through the grid (Manhattan distance); rock in between does not matter. Coal and timber-root give no traces, because the top layer already shows them.
- **When the player first sees it.** Only on a block that is revealed **and in light**. Light travels through open cells (0005 item 13), so a solid block is "in light" when one of its faces touches a lit open cell: the same blocks light reveals (0005 item 14). The top layer is always in light. A block revealed by the pick's reach alone (a diagonal, say) is not in light and shows nothing until light touches it.
- **Once seen, it stays on the map** (coordinator, on PR #39, following 0005 item 14: what the player has seen stays seen). The state holds one flag per cell, `tracesSeen`, set the first time a revealed block in light carries traces and never cleared. The map stops showing a block's traces only when that block itself is mined. If the ore is mined later, the traces already seen stay: the map shows what was seen, not what is true now.
- **What it says.** That ore is near: not which ore, how much, or which way. Ore itself never shows traces; where it is revealed it is simply visible.
- **One place decides.** `src/engine/tells.ts`. Whether a block carries traces is worked out from the blocks around it and never stored. `updateMineralTraces` sets the seen flags; the dispatcher calls it after every `updateReveal` (new run, every action, every end of shift). M2's hazard tells belong in the same module.
- **State and hashes.** `GameState.tracesSeen` is a sixth cube array, saved and hashed like the others. `STATE_VERSION` goes from 2 to 3, as it does whenever the shape of the state changes. `ENGINE_VERSION` stays 0.2.0, which covers this batch of changes. The three golden runs were re-hashed; every recorded decision is still legal, so none was re-recorded.
- **Event.** `mineralTracesSeen { pos }`, once for each block, in the step its traces are first seen, after that step's `blockRevealed` events. A renderer needs no polling.
- **Public surface.** `showsMineralTraces(state, pos)` and `visibleMineralTraces(state)`. Both answer only for revealed blocks. `carriesMineralTraces`, which reads hidden blocks, is used by `tools/ascii.ts --traces` and the tests and is not exported from `src/engine/index.ts`.
- **Reading the lit cells.** `tells.ts` builds them from four functions `reveal.ts` exports: `isLampLit`, `litCellsFrom`, `avatarLightRadius` and `torchPositions`. With the lamp out (`isLampLit` is false) the lamp gives no light for traces at all, not even in the miner's own cell, so none are noticed on the six blocks it knows by touch (0011); torches and daylight still count. If the sources of light change in `reveal.ts`, `lampAndTorchLight` in `tells.ts` must follow.
- **Play tool.** Traced rock is drawn as `%` on the map, in place of the rock's own character (one character per cell), and the mine list says "Stone, mineral traces". The step in which traces are first seen says so in a ">" line. `--help` explains it.
- **Sim.** Each run reports `oreBlocksMined` and `tracesSeenBeforeFirstOre`; the aggregate counts the runs.
- **Left as they are** (coordinator, on PR #39): one `%` marker for all rock; traces on plain rock only; unstable ore neither gives nor shows traces; the distance stays 2 for the next playtest round.

## Figures

A one-cell shaft dug with the engine from the start cell until the miner stands in layer 12, seeds 1 to 1,000 (`tests/engine/shaftSurvey.ts`). The miner puts a ladder in each cell before mining the block underfoot and climbs down, because an unheld fall now costs health (0010).

| What the shaft showed                      | Seeds        |
| ------------------------------------------ | ------------ |
| Ore (as in round m1-r1)                    | 576 of 1,000 |
| Mineral traces                             | 849 of 1,000 |
| Traces, and no ore                         | 273          |
| Ore, and no traces                         | 0            |
| Both, traces at least one layer before ore | 576 of 576   |

Traces are first seen from layer 7.4 on average; where both show, traces come 2.0 layers earlier on average. No traces show above layer 5, because no ore lies above layer 8.

## Consequences

- On 273 seeds in 1,000 the shaft now gives a reason to cut sideways where before it gave none. 151 seeds still show nothing by layer 12.
- At a distance of 2, about 23% of the cells in the ore layers (8 to 31) carry traces, measured over seeds 1 to 20. Whether that is a hint or noise is for the next playtest round; the distance is one number in `src/data/tells.ts`.
- The `%` hides which rock a traced block is on the map. The mine list names it for blocks in reach.
- Traces seen near ore that has since been mined stay on the map, so an old `%` can point at ore that is gone.
- A save from state version 2 does not load.
- `updateMineralTraces` runs after every step. 1,000 `random` sim runs take 13.2 seconds with it and 11.8 without, and 1,000 `wander` runs 35.7 against 31.3, on a cloud container (before 0010's rule was merged in).
