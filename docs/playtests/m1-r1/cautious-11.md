# Playtest: cautious, seed 11

- Interface: text
- Engine version / commit: engine 0.1.0 / 1add9f7
- Outcome: salvage (left the cube alive at shift 15 with 6 Coal, 5 Raw copper ore, 4 Timber, 3 Ladder)
- Shifts played: 15
- Deepest layer reached: 8

## What I was trying to do

Get to layer 8, bring back something worth having, leave alive, and never take a risk I could avoid.

The plan from the first view was a staircase, not a shaft: mine the block beside me one layer down, mine the block beside me if it is not already open, walk in and drop 1. Every step can be walked back up with "Step up", so the way home never depends on ladders. I never mined the block under my feet without a ladder in my cell, because the list always said "you will fall 1 block or more; below that is unseen".

The plan did not change. The only additions were short detours for coal and copper that I could see, and a rule I made at layer 4: do not mine anything that is under one of my own stair treads, because I did not know whether rock can fall.

## Key moments

- Shift 1: mined north one layer down from the surface, stepped in, took the timber-root at x16 y14 on layer 0, and was on layer 1 with 0 AP left. Expected one layer per shift at best; got two.
- Shift 3: mining north on layer 2 showed a coal seam at x16 y11. Moving next to it showed three more seams and a timber-root. I changed the stair to run through them. Expected coal to be rare this high; it was a pocket of six.
- Shift 5: I meant to mine the north-east coal and typed 5, which was "Mine west: Dirt". After I mined the north coal, "Move north" had been added at the top of the list and every number below moved by one. Lost 1 AP.
- Shift 6: one coal seam (x18 y11, layer 3) was two cells from me across the hole I had already dug. I walked round through the cells the mined coal had opened (north, east), took it from the diagonal, and dropped into my stair from the north side. Five AP for one coal and the stair step together. This was the most thought any move took.
- Shift 8: second slip. After "Mine south" I chained 1, expecting "Move south"; 1 was still "Step up north to layer 4". I climbed a layer by accident and spent 2 AP getting back.
- Shift 9: reached layer 7 and saw three copper ore on layer 8, one of them directly under me.
- Shift 10: took two copper from layer 7 with "Mine west, one layer down" and "Mine north-west, one layer down", without first opening the cells beside me. I had expected to have to dig down to them.
- Shifts 10 to 11: placed a ladder in my own cell, and the list changed from "you will fall 1 block or more" to "your ladder holds you, you will not fall". Mined the copper under me, placed a ladder in the hole, climbed down: layer 8 on shift 11.
- Shift 12: a fourth copper on layer 8 and a fifth under my feet on layer 9. The list warned "(too heavy to carry: it will be left lying there)" on the fifth, so I dropped 1 Timber (free) and the warning went away. Pack was 20/20 after it.
- Shifts 13 to 15: walked out. 13 AP of climbing, no decisions, left on shift 15 with fuel 10.

## How it ended

I left from the surface on shift 15, health 10/10, fuel 10, lamp oil 3. The run was never in danger. I turned round because the pack was full and layer 8 was reached, not because anything pressed me.

## Confusing

- Shift 1: ending a shift with 3 or more AP unspent shows "fuel 24 -> 24 (-1 shift +1 refund)". So a shift in which I do nothing costs no fuel. At shift 11 the line read "fuel 14 -> 15 (-1 shift +2 refund)": resting would have gained fuel. I did not understand what fuel is meant to limit if waiting is free.
- Shift 2 onward: I did not know whether a block with nothing under it stays up. The help text names only two ways to die, so I guessed it does, but I still avoided mining under my treads (left two timber-roots on layer 5 at shift 6 for that reason).
- Shift 2: below layer 1 the map shrank to three or four columns of known cells with "?" all round. It is correct, but for most of the descent I was choosing a direction from six or eight visible cells.
- Shift 10: "Craft Support" is on the list every shift once I hold stone and timber, although the help says supports cannot be placed. Stone therefore had no use at all, and I dropped it each time I picked it up.
- Lamp oil went 6 to 3 over the run. I never saw what it changed.

## Tedious or automatic

- The climb out (shifts 13 to 15): thirteen moves in a row, each the only sensible one.
- Stair digging on layers 5 to 7, where everything nearby was stone: mine one layer down, mine beside, move, end shift. The only choice was which of two equal directions.
- Dropping stone. Every stone block puts 2 weight in the pack; I dropped it at shifts 9 and 10. The drop action sits near the bottom of the list and its number changes.
- Taking one choice at a time. After two slips I stopped chaining a move after a mine, which made every stair step three separate commands.

## Interesting

- Shift 6: how to reach the coal on the far side of my own hole without a ladder.
- Shift 10: whether to mine the copper under my own stair cell. A ladder made it safe and the list said so in words before I committed; that message is what let me do it.
- Shift 12: what to throw away to fit the last copper.
- Whether to keep going past layer 8 with fuel 13 and six coal in the pack. A less cautious player would have: I left with more than half my fuel and all my coal unburnt. I did not, because the pack was full and my aim was met.

Limits, plainly:

- Fuel: never limited anything. Lowest was 10, on the surface.
- Lamp oil: never limited anything.
- Carry weight: the only real limit. Full at shift 12; it ended the trip.
- Ladders: used 3 of 6, all to mine and visit the copper under my feet. Never short.
- Timber: never used. Carried 4 to 5 the whole way as dead weight and dropped one.

## Possible bugs

- Shift 11 (also the "if you end the shift now" line at shifts 12, 13 and 15): with the banked counter at 1, ending a shift with 5 AP unspent is shown as a net gain of 1 fuel. If fuel is meant to run down with time, resting forever beats it. I did not test it by actually resting.
- Nothing else looked wrong. Falls, ladder holds, the too-heavy warning and loose stone falling into the hole (shift 11, "1 Stone fell 1 block to layer 8") all matched the help text.
