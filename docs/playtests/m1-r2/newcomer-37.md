# Playtest: newcomer, seed 37

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface at shift 22 carrying 5 Raw copper ore, 3 Raw iron ore, 5 Ladder)
- Shifts played: 22
- Deepest layer reached: 15
- Replay: `Final state hash: af5a4b3a7680e768`, `Outcome: salvage (left)`, matches the log (115 choices)

Third run. I knew the routine from seeds 11 and 23, and both of those had ended safe, full and with fuel to spare. So this time I was deliberately less careful: no trip for surface timber or coal, straight down from the start cell, and I tried the unprotected `mine-down` once to see what a fall is actually like.

## What I was trying to do

Get deeper, faster, and see whether there is anything below layer 14 besides iron. I counted on finding coal underground as in seed 11. I found two coal at layers 4-5 and no more, ran short of ladders (started with 6 plus 2 timber, never found timber underground), switched to staircases through stone at one layer per shift, reached copper at layers 15-16, and climbed out with the lamp dead for the last two shifts.

## Key moments

- Shift 1: skipped the timber (4 cells north) and the coal (7 cells west) on the surface map and started digging steps where I stood.
- Shift 2, layer 1: Dirt under me, 1 AP. The list said "you will fall 1 block or more and lose at least 1 health; below that is unseen". I chose it to find out. Result line: "You lost your footing and fell 1 block. You lost 1 health from the fall (now 9)." As promised. What I had not thought about: the next action list had no move on it at all. I was in a one-cell pit with rock on four sides and open space only overhead. There was no "Not on the list" note about it. I worked out from the help that `ladder-here` plus `ladder-up` would get me out, spent 2 ladders and 2 AP on that, and did not dig under my own feet again.
- Shifts 3-4, layers 3-4: coal showed one layer down to the south-east two shifts running; mined both from the ladder. That was all the coal I ever saw. Used one for lamp oil (shift 8) and one for fuel.
- Shift 7, layer 7: four iron on layer 8, one of them under my feet. I took one (to make the next step) and decided to leave the others for the way back, since they were on my route and weigh 2 each.
- Shift 7: I chained `mine-e, drop-stone, mine-e-down, craft-lamp-oil` with only 4 AP. The tool stopped at the fourth choice: "Refused choice 4 of 6 ("craft-lamp-oil"): it is not on the action list as it stands now ... Nothing was done from it on." Clear, and nothing was lost.
- Shift 9, layer 9: with 2 AP left, `mine-e` was simply missing from the list although the map showed `%` to the east like the `%` cells north and south that were offered. It took me a while to see why: that block was Hard rock (3 AP) and unaffordable actions are left off. Next shift it was there: "Hard rock, mineral traces".
- Shifts 10-14, layers 10-14: staircase through Stone, 5 AP a layer, nothing found. The `%` trail I had been following east from layer 10 stopped at layer 12 (no `%` anywhere in view at shift 13) and I never found what it pointed to.
- Shift 15, layer 14: two Copper ore one layer down. Five copper over shifts 15-17 (layers 15-16).
- Shift 16: the "If you end the shift now" line read "lamp oil 2 -> 1". No coal. I knew from the gauge history that it drops every fourth shift, so about four shifts of light left and roughly four shifts of climbing.
- Shifts 18-20: climbed nine step-ups, stopped at layer 8 for two of the three remaining iron (the third was the block under my staircase, x17 y14; I left it).
- Shift 20, layer 5 on the ladder: "lamp oil 1 -> 0" in the end-of-shift line. Ended the shift: "The lamp is out." The gauge line became "Lamp oil 0 (LAMP IS OUT: you know only the six cells touching yours. No diagonal mining, no looking down a drop, no moves you cannot judge)".
- Shifts 21-22: four ladder climbs, one step-up, one more step-up, leave. In the dark the route I had already seen was all still on the list.

## How it ended

Left by choice at shift 22: carry 16/20, health 9/10, fuel 6, lamp oil 0. The closest thing to danger in three runs was the pit at shift 2, and that cost 1 health and 2 ladders. The lamp going out sounded alarming and changed nothing, because I was already on my own ladder five layers from the top. Had it gone out at layer 15 it would have been a different story, and I can trace the near miss to skipping the surface coal at shift 1.

## Confusing

- Shift 2: after the fall, an action list with no moves and no explanation. Every other dead end I met had a line saying why ("No climb up: the cell above you has no ladder"). Here I had to infer "you are in a pit" from the absence of `n e s w`.
- Shift 21: the lamp-out banner says "No diagonal mining", and the action list under it offered `mine-ne`, `mine-sw`, `mine-nw`, `mine-ne-down`, `mine-se-down`, `mine-sw-down`, `mine-nw-down`. The help explains it (blocks seen earlier can still be mined), but the banner and the list contradict each other on the same screen.
- Shift 9: an action missing because of AP looks exactly like an action missing because of a rule. There is no note for "you cannot afford this", and with `%` hiding the rock type I could not tell from the map either.
- Shifts 10-13: the trace trail going cold. I followed `%` east and down for three layers and at layer 12 there were none. I do not know whether I walked past the ore, under it, or whether it was the iron pocket at layer 8 all along.
- Shifts 21-22: standing on layer 0 under an open hole, and then on the surface itself, the gauge still said LAMP IS OUT with the full warning. On the surface the whole map was drawn as usual, so the warning was simply not true there.

## Tedious or automatic

- Shifts 10-14: `mine-X, drop-stone, mine-X-down, drop-stone, X` and end. Five shifts, five identical chains except for the compass letter, one layer each, nothing to look at. This was the dullest stretch of the three runs. Ten `drop-stone` inputs in five shifts.
- Shifts 18-22: the climb. 16 moves, two mining actions.
- Health never mattered again after shift 2. It was 9/10 for 20 shifts.

## Interesting

- Shift 1: whether to stock up on the surface or just go. I chose wrongly and felt it from shift 8 (last coal spent) to the end. This is the first decision in three runs whose consequence arrived much later.
- Shift 7: taking ore now or on the way back. Leaving three iron in the wall as a deposit for the return trip felt clever, and it worked.
- Shift 14: fuel 14, oil 2, one iron ore to show for fourteen shifts, barren rock for four layers. Turn round or try one more layer? One more layer found the copper.
- Shift 16-17: counting lamp shifts against climbing shifts. The gauge and the "If you end the shift now" line gave me everything I needed to do that sum.
- Shift 19: the third iron was the step I needed to stand next to. I could see that mining it would leave me a block short of the ladder shaft, and that two spare ladders would fix it; I decided the lamp mattered more.

## Possible bugs

- Shift 21: "No diagonal mining" in the lamp-out banner while seven diagonal mine choices are on the list (see Confusing). One of the two is wrong.
- Shifts 21-22: the lamp-out restriction text is shown on layer 0 in daylight and on the surface.
- Shift 2: not a rule being broken, but the only place the "Not on the list" notes failed to appear when no move at all was possible.

## Were the screen's own explanations enough?

For the fall: yes before (the list said what it would cost), no after (nothing said why I could not move). For the light going out: yes, fully. The end-of-shift line warned me one shift ahead both times the oil dropped, and the banner told me what had changed. For "a move I expected that is not on the list" at shift 9: no, I had to guess it was the AP cost.

## What I had learned by now, and what I still had not

After three runs I can descend and return without thinking. I still do not know what the run is for, what any ore is worth, what a hazard is, or what the health gauge is there to protect me from: I lost 1 health in 68 shifts and that was on purpose.
