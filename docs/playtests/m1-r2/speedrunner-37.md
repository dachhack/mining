# Playtest: speed-runner, seed 37

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface carrying 2 raw copper ore)
- Shifts played: 7
- Deepest layer reached: 7 (the ore was in layer 8, mined from layer 7)
- Health lost: 5 (10 -> 5), five chosen 1-block falls
- Replay: `Final state hash: 91a49800bd9fefdc`, `Outcome: salvage (left)`, matches the log (38 choices)

## What I was trying to do

Third run, using everything from seeds 11 and 23: steps where both blocks are dirt (I believed this cost the same AP as falling; it is 1 AP more, see the comparison below, but it saves health and a ladder), a straight fall shaft where the rock is stone, never turn a staircase back under itself, follow the traces, mine the ore from the layer above it, and count the way out before spending spare AP. One new idea: use leftover AP at the end of a shift to put a ladder in the cell above me, never in my own cell, because a ladder in my own cell stops the free fall and turns it into the dearer ladder-first way.

The plan did not change. It was the first run that felt planned from start to finish.

## Key moments

- Shift 1: dirt east-down from the surface and walk in (2 AP); dirt step south (3 AP). Layer 1.
- Shift 2: dirt step east to layer 2 (3 AP). There every step was 4 AP (one stone, one dirt) and the block under me was dirt, so I switched to the shaft: mine-down, fall, health 9. 1 AP left: ladder-up into layer 2, which the way out needs anyway.
- Shift 3 (layer 3): ladder-up, then mine-down through coal (got 1 coal), then mine-down coal again: layer 5, health 7, 2 coal I never needed.
- Shift 4 (layer 5): ladder-up, mine-down stone to layer 6. Traces on the east wall and on the floor, not on the north, south or west walls. Worked out two candidates: x20 y17 layer 7 or x19 y17 layer 8. Mined down to layer 7 (health 5) and saw copper at east-down and north-east-down in layer 8.
- Shift 5: counted the way out: 3 ladders still to place, 5 climbs, 3 steps up = 11 AP, and 15 AP left in shifts 5 to 7. So a second copper (2 AP) fitted exactly. Mined both from layer 7, placed a ladder in my cell.
- Shifts 6 to 7: ladder-up, up, ladder-up, up, up; up, up, step west, step north, step west to the surface, leave. Every AP of the last three shifts was used.

## How it ended

Alive, by "leave" at the end of shift 7, with 2 raw copper ore, health 5, fuel 18, lamp oil 2.

## Confusing

- Nothing new this run. What had confused me before I now worked around: I treated "#" on diagonal cells as "unknown for traces", and I read each "n/e/s/w" line before using it.
- I still have not met the dark or the fuel limit: 7 shifts used 6 of 24 fuel and 1 of 3 lamp oil. For this goal those two rule changes might as well not exist. The 2 coal I picked up were dead weight.
- The warning "you will fall 1 block or more ... below that is unseen" was on every mine-down in all three runs, and every fall was exactly 1 block. By this run I was ignoring it. I kept health above 4 because of it, but I have no idea how likely a longer fall is.

## Tedious or automatic

- From layer 2 down it was the same three commands each layer (ladder-up, mine-down, drop the stone), and the way out was again ladder-up, up repeated. With the method settled there was no decision between shift 2 and the traces at shift 4.

## Interesting

- The switch point from steps to shaft at layer 2: comparing a 4 AP step against a 1 AP fall that will cost 2 AP later and 1 health.
- The ladder-above trick with leftover AP: it turns AP that would be lost at the end of a shift into work the way out needs.
- Fitting the second ore into the exact AP budget at shift 5.

## Ways down compared (all three runs)

| Run     | Way down                                               | Shifts                   | Health lost | Ladders placed                         |
| ------- | ------------------------------------------------------ | ------------------------ | ----------- | -------------------------------------- |
| Seed 11 | fall shaft (one test step, one test ladder)            | 10                       | 6           | 9                                      |
| Seed 23 | steps to layer 6, ladder shaft below                   | 9 (8 without my mistake) | 0           | 8 (2 by design, 6 to repair the stair) |
| Seed 37 | steps in dirt, fall shaft in stone, ladders pre-placed | 7                        | 5           | 6                                      |

Round trip per layer, from play: fall = mine + 2 AP and 1 health; ladder-first = mine + 3 AP; step = two mines + 2 AP. In dirt the fall is 3 AP, ladder-first 4 and the step 4; in stone the fall is 4, ladder-first 5, the step 5 or 6. I only got this straight when writing the three runs up side by side: during this run I thought dirt steps tied with falls, so my two dirt steps below layer 0 cost 2 AP more than falling would have, for 2 health and 2 ladders saved. So the differences are 1 or 2 AP a layer over about 8 layers: about 2 shifts between the best and worst run, and most of that came from knowing where to stop (layer 7, not 8), from the trace reading, and from not wasting AP at shift ends, not from the choice of way down. There is a real choice, but a narrow one, and after one run it is settled: fall while health lasts, since nothing else in this version wants health. The first layer is the one exception (from the surface a step needs only one mine and ties with the fall). Ladder-first and steps are never the cheapest in AP; a ladder's other use was holding me over the ore.

Seed differences matter too: seed 11's ore was 2 cells sideways at layer 8, seeds 23 and 37 had ore reachable from the foot of the shaft at layer 7.

## Possible bugs

- None seen.
