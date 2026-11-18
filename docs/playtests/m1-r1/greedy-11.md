# Playtest: Greedy, seed 11

- Interface: text
- Engine version / commit: engine 0.1.0 / 1add9f7
- Outcome: salvage (left alive with 4 Raw copper ore, weight 8 of 20, fuel 0)
- Shifts played: 30
- Deepest layer reached: 23

## What I was trying to do

Get to the deep band (layer 20 and below) by the shortest route, because the design doc puts crystal, rare ore and relics there, and come out with as much of it as I could carry.

The plan at the start: grab the three timber-roots two steps north of the start, sink one straight shaft with a ladder in every cell, and not think about fuel until it became a problem. I did not look for coal and I did not look at the top layer beyond the default map.

How it changed: fuel became the problem at layer 20. From shift 19 on, every choice was "how many more blocks can I afford and still get out". I found nothing in the deep band and came out with only the copper I had passed near the top of the middle band.

## Key moments

- Shift 1. Start at x16 y16. Three Timber-root showed in layer 0 at x15–16 y13 and x16 y14. Walked two north and mined all three from the surface; the third was under my feet, so I dropped into layer 0. Expected timber to be the thing I ran short of; it was not (5 Timber plus 6 Ladder was exactly enough for a shaft to layer 21).
- Shift 2. First Stone went into the pack by itself and weighs 2. I had not expected rock I was only clearing to count against the 20 carry limit. I dropped it; from then on I dropped Stone almost every shift. The dropped Stone fell down the shaft with me each time I dug, so the pile under my feet grew to 20 Stone by layer 21.
- Shift 5–7. At layer 7 the "below" pane showed two Copper ore at x15–16 y13, layer 8. Mined both from layer 7 on shift 6 (2 AP each). On shift 7, at layer 8, I had 2 AP left and Hard rock below (3 AP), so I used them on a third Copper ore at x15 y13, layer 9. A fourth was visible at x15 y12, layer 8; I left it. Raw copper ore weighs 2 each.
- Shift 9–18. Hard rock from layer 9 down: 3 AP to mine plus 1 AP for the ladder, so one layer per shift with 1 AP left over. I saw no coal at any depth. A one-cell shaft only ever shows the 3×3 around it.
- Shift 15. I mined twice and ran out of AP before placing the ladder in layer 16. Nothing warned me; I only saw it because the cell above showed "." instead of "=" on shift 16. Placed it then. Had I not noticed, the shaft would have had a gap I could not climb.
- Shift 19. Reached layer 20 with fuel 9 and 2 ladders; dug to 21 and used the last ladder there. Counted: about 22 AP to get out, so 5 shifts of fuel must be kept back.
- Shift 20–22. No ladders left, so I cut steps instead: mined a side cell and the block below it, walked off the 1-block drop, and relied on "Step up" to return. This worked (layer 22 on shift 21, layer 23 on shift 22). Everything I uncovered was Hard rock or Stone.
- Shift 23–24. Two more blocks east along layer 23, still only rock. On shift 24 the end-of-shift line showed that stopping with 2 unspent AP (counter 1) would refund a fuel, while spending them on walking would not. I ended the shift there. Lamp oil reached 0 at the end of shift 24.
- Shift 28. Climbing, at layer 10 with fuel 2. I had counted 4 spare AP, exactly the cost of stepping off the ladder at layer 8, mining the fourth Copper ore (x15 y12) and stepping back. Did it. Expected it to work only if my count was right; it was.
- Shift 30. Started the shift with fuel 0 at layer 3. Three climbs, two step-ups, then "Leave the cube" with 0 AP left. The end-shift line at that point read "THE RUN ENDS: you ran out of fuel and died."

## How it ended

Left alive on shift 30 with 4 Raw copper ore, fuel 0, health 10/10. No AP and no fuel to spare: one miscounted action on the way up would have been a death by fuel.

## Confusing

- Nothing in the game says what anything is worth. I was told to bring out the most valuable haul and could only go by the doc's "deeper is better". I do not know whether 4 copper is a good or a poor result.
- Shift 2: Stone is picked up automatically and is heavy. It took me a moment to see why Carry had jumped from 5 to 7.
- Shift 3 onward: Stone I drop in the shaft follows me down ("5 Stone fell 1 block"). Harmless, but I kept being offered "Pick up N Stone" and the pile is in the cell I work in.
- Shift 20: with 2 AP left, every Hard rock block vanished from the action list. The help text says unaffordable actions are not listed, so this is as described, but for a moment it looked as if I was walled in by blocks I could not mine.
- Fuel 0 is survivable for one more shift of actions (shift 30). The help text says so if read closely; the design doc reads as if zero fuel at upkeep ends the run. I planned around the help text.
- I never learned whether there was coal on this cube. The default map shows only 4 cells around me and I did not think to widen it.

## Tedious or automatic

- Shifts 2–19 were the same two actions, "Mine below you" then "Place a ladder in the cell above you", with "Drop Stone" in between. There was only one sensible move for a greedy miner; nothing I saw on the way (apart from the copper) asked for a decision.
- Shifts 25–30 were "Climb up the ladder" 20 times.
- Dropping Stone every shift is a chore.

## Interesting

- Shift 19 onward: working out the exact number of AP to the surface and how many shifts that left me. The end-of-shift preview line made this possible and I relied on it.
- Shift 24: seeing that banking 2 AP beat walking 2 cells.
- Shift 28: the 4-AP detour for one more copper with nothing in reserve. It felt like a real gamble.
- Shift 20: finding that cut steps can replace ladders, at the price of a second block per layer.

## Possible bugs

- None that broke a stated rule.
- Shift 1 and later: ending a shift with 3 or more unspent AP costs no fuel at all (the preview shows "-1 shift +1 refund"). That follows the stated banking rule, but it means standing still is free. See the seed 37 report, where waiting on the surface made fuel go up.

## Limits (asked for by the coordinator)

- Fuel: limited everything from shift 19. I reached the deep band with fuel for about 4 working shifts, uncovered roughly 25 cells there and found nothing. What I did about it: counted AP, banked where the preview showed a refund, left with fuel 0.
- Lamp oil: ran out at the end of shift 24. It did not change what I could do; the cells my pick reaches were still shown.
- Carry weight: never a limit (8 of 20 at the end), but only because I kept dropping Stone.
- Ladders: ran out at layer 21 on shift 19. I cut steps for layers 22 and 23 instead.
- Timber: the 5 I had were enough; I never went back for more.
- Only one sensible move: yes, shifts 2–19 (digging) and 25–30 (climbing).

## Better plays I saw and did not take

- Place the ladder in my own cell before mining the block I stand on. I mined about 20 blocks from under myself with "below that is unseen" on every one. Nothing was under any of them in this cube.
- Look over the whole top layer for coal before going down (the map can be widened). A greedy miner does not, until fuel has hurt once. It hurt here, and I did look on the next seed.
- Turn back at layer 20 with fuel in hand and take the copper vein at layers 8–9 properly instead of spending the last fuel on bare rock.
