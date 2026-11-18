# Playtest: speed-runner, seed 23

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface carrying 1 raw copper ore)
- Shifts played: 9
- Deepest layer reached: 7 (the ore was in layer 8, mined from a ladder in layer 7)
- Health lost: 0
- Replay: `Final state hash: 582275433346d9c7`, `Outcome: salvage (left)`, matches the log (51 choices)

## What I was trying to do

Second run. From seed 11 I already knew: copper can sit in layer 8, traces show on lit walls only, the per-layer prices of the three ways down, and that the ladder work on the way out is what makes a run long. Seed 11 was nearly all falls, so here I descended by cut steps the whole way, to see what a run with no falls and almost no ladders costs. Steps need no ladder on the way back (1 AP a layer), so I hoped the cheap return would pay for the dear descent.

It changed at layer 6: traces put the ore directly under me, so the last two layers were a ladder shaft. And I broke my own staircase (below), which cost a shift.

## Key moments

- Shift 1: timber-root north-down from the surface (1 AP, gave timber), walk in. Then a dirt step east: mine-e, mine-e-down, e. Layer 1 by the end of shift 1; seed 11 had reached layer 3 by then.
- Shifts 2 to 3: dirt steps south, east, east, 3 AP each. Layer 4 at the end of shift 3, health still 10. Picking the direction was a real small choice each time: which of four sides has dirt both beside and below.
- Shift 4 (layer 5): everything around was stone except a dirt block north-down. A step north cost 2 + 1 + 1 = 4 AP, the same as ladder-first through the stone under me, so I took it. North was back under the cell I had come down through. I did not think about that.
- Shift 4 to 5: mining that step showed traces on the block under the new cell, then on the one under that, and on none of the four walls around me in layer 6. The only cell within 2 of both and not within 2 of a plain wall was two below me. I expected ore at x19 y16 layer 8 and that is exactly where the copper was (seen from layer 7, shift 5). This was the best moment of the three runs.
- Shift 5 to 6: ladder-here, mine-down, down to layer 7; ladder-here, mine-down on the copper (the ladder holds me, the ore goes into the pack), up, step up south to layer 5. Health 10.
- Shift 7: found that my step from layer 4 to 5 was gone. The stair cell at x19 y16 layer 5 was the block I had mined as "north" in shift 4, so the column x19 y16 was open from layer 3 down to the ore. No step up was offered from where I stood, and no "Not on the list" line said why. I placed two ladders and climbed to layer 4 (3 AP).
- Shift 7, my mistake: I then chained "n, w" from memory of the old staircase. "n" was "Move north, then drop 2 blocks to layer 6": it walked me into the open column and I landed on my own ladder two layers down. No health lost (a chosen drop), but 4 AP of climbing thrown away. The list had said what "n" would do; I had not read it.
- Shifts 7 to 9: two more ladders up the column to layer 4, step west twice, north, west, out. Left in shift 9 with 2 AP used.

## How it ended

Alive, by "leave" in shift 9, with 1 raw copper ore, health 10, fuel 16, lamp oil 1. Without the walk into the hole it would have been shift 8.

## Confusing

- Shift 7: a staircase can be undercut by its own next step when the stair turns back on itself. Nothing warned me when I mined the block (shift 4), and nothing explained it when the step up was missing (shift 7). The "Not on the list" line appears for a missing ladder climb ("No climb up: the cell above you has no ladder") but not for a missing step up.
- Shift 4: after "Mine north: Stone" the view said "You notice mineral traces", but the traces were on the dirt under the block I had mined, not on anything I had just been looking at. It took the next view to see where the "%" was.
- Traces above layer 8. The doc says ore starts in layer 8; traces showed at layers 6 and 7. That follows from "within 2 steps", and it is useful (it saved me from sinking a shaft in the wrong place), but I did not expect them that high.
- Lamp and fuel: again never a factor in 9 shifts (fuel 16 and oil 1 left). I still do not know what the dark is like.

## Tedious or automatic

- Steps in dirt, shifts 1 to 3: three commands a layer, the same shape each time, though at least the direction is a choice.
- Dropping stone by hand after each stone block.

## Interesting

- Reading the trace pattern to place the ore exactly (shift 4 to 5).
- Mining the ore from a ladder one layer above it, instead of going down to it: it saves a layer both ways.
- Rescuing the broken staircase: ladder in the hole, or ladder where I stand? I chose badly and then made it worse by not reading.

## Ways down compared (this run)

- Steps, layers 0 to 6: 2 + 3 + 3 + 3 + 3 + 4 + 4 = 22 AP down, 0 health, 0 ladders; the designed return is 1 AP a layer.
- The same seven layers by falling would have been roughly 9 to 11 AP down and 7 health, then 14 AP of ladders back: about 24 AP against the 29 the steps were meant to cost (22 down, 7 back).
- Ladder-first, layers 7 and the ore: 4 AP a layer in stone.

In dirt a step costs 4 AP round trip against 3 for a fall, and uses no health or ladder; in stone it is 5 or 6 against 4. So steps are the dearest way in AP everywhere, by 1 or 2 AP a layer, and what they buy is health and ladders, which this goal does not need. The run was 9 shifts against a possible 8, and the lost shift was my error, not the method. Steps did feel slower early: after shift 1 I was at layer 1, not layer 3.

## Possible bugs

- Shift 7: no "Not on the list" reason for the missing step up, although the help says that line explains moves "you might look for". Possibly intended (it lists drops and unseen cells only), but it is the case where I most needed it.
