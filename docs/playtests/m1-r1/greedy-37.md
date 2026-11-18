# Playtest: Greedy, seed 37

- Interface: text
- Engine version / commit: engine 0.1.0 / 1add9f7
- Outcome: salvage (left alive with 1 Raw copper ore and 2 Raw iron ore, weight 6 of 20, fuel 2)
- Shifts played: 79
- Deepest layer reached: 26

## What I was trying to do

Repeat what worked on seed 23: look at the whole top layer, take timber and coal, sink a shaft from the coal to the deep band, and fill the pack with crystal.

The top layer had timber in two small groups north of the start (x15 y11–12 and x18–19 y9–10) and the only large coal seam at the east edge (x27–31, y13–17), eleven cells from the start. I chose to walk to it.

How it changed: the shaft, 26 layers deep and three cells from the east wall, passed nothing but dirt, stone and hard rock. A tunnel of eleven blocks along layer 26 found nothing either. I came up on shift 51 with an empty pack and fuel 1. Rather than leave with nothing, I refuelled from the rest of the coal seam and made a second, shorter trip into the middle band, which found three pieces of ore.

## Key moments

- Shift 1–3. Five Timber-root from two standing spots. Fine.
- Shift 4–7. Sixteen "Move" actions across the surface to the coal. Three shifts in which nothing happened and fuel went from 21 to 18.
- Shift 7–11. Eight Coal (six in layer 0, two in layer 1). Crafted fuel six times and lamp oil once. Fuel 31 at the start of shift 12, 27 ladders' worth of timber and ladders.
- Shift 12–33. Shaft at x28 y16 from layer 1 to layer 26. I read the legend line every shift for anything other than rock. In 22 shifts it never listed an ore, coal, or crystal. Expected at least copper or iron somewhere in layers 8–19, as on seeds 11 and 23.
- Shift 33–43. Last ladder in layer 26, then a tunnel west along layer 26 from x27 to x17: eleven blocks at 3 AP each plus a move, one block per shift. All Hard rock, a few Stone. Lamp oil ran out at the end of shift 40. On shift 43 I had 8 AP of slack over the 37 AP I needed to get out, spent 5 on one last block, and turned round.
- Shift 44–51. Eleven moves east and 26 climbs: eight shifts of nothing but "Move east" and "Climb up". Reached layer 0 on shift 51 with 3 AP, fuel 1, carrying nothing.
- Shift 51–52. Stepped out to the surface beside the untouched half of the coal seam and ended the shift, which took fuel to 0. On shift 52, with fuel 0, mined two Coal from the surface and crafted one into fuel (0 → 3). Expected this to work from the help text, and it did.
- Shift 53–57. Six more Coal from layers 0 and 1 of the seam. Fuel 16 by shift 57, plus one lamp-oil craft.
- Shift 57–60. Back down the existing ladders to layer 9.
- Shift 60–68. Tunnel west along layer 9. Iron ore showed at x21–22 y15 on shifts 64–65; I walked past it, meaning to take it on the way back. On shifts 67–68 Copper ore showed: one at x19 y17 on my layer, and three on layer 8 (x19–20 y16 and x19 y17), directly over my tunnel and over my head.
- Shift 68. Mined the copper on my layer. The three on layer 8 were never on the action list: the pick does not reach the layer above, and I could not step up because the cells I would step into were the ore itself. They were one block from my head and I had no way to take them.
- Shift 69–71. One block south and two more west of the copper, looking for the vein on my own layer. Nothing.
- Shift 73. Two Iron ore on the way back.
- Shift 77–78. On the ladder in layer 0 with fuel 1. The end-of-shift line read "5 unspent AP banked (counter 1 -> 0), fuel 1 -> 2 (-1 shift +2 refund)". I ended two shifts doing nothing to see whether it was true. Fuel went 1 → 2 → 2, and the line for shift 79 promised 2 → 3.
- Shift 79. Stepped out and left.

## How it ended

Left alive on shift 79 with 1 Raw copper ore and 2 Raw iron ore, fuel 2, health 10/10. Nothing hurt me in 79 shifts. The poor result traces to one decision of mine on shift 4: putting the shaft where the coal was, at the edge of the cube, and then trusting a single column and a single tunnel to hit something.

## Confusing

- Shift 12–43: I could not tell whether I was unlucky or looking in the wrong way. A shaft shows a 3×3 column; a tunnel shows a strip three wide on my layer and the layer below. Nothing told me how near a miss was, or whether ore is rarer near the cube wall.
- Shift 67–68: ore visible overhead and no action for it. I understood the rule from the help text; what I did not expect was that there is no way at all to go up through rock, so anything seen on the layer above a tunnel is lost unless a second tunnel is dug to it from a shaft.
- Shift 51–52: fuel 0 with a full shift still to play. It reads as dead and is not.
- Shift 77: fuel going up for doing nothing. I checked the line twice before believing it.
- As on the other seeds, nothing says what a material is worth, so I cannot say how bad 1 copper and 2 iron is.

## Tedious or automatic

- Shifts 4–7: walking to the coal.
- Shifts 12–33: 22 shifts of the same dig-and-ladder pair with nothing to see. Only one sensible move.
- Shifts 34–43: ten shifts of "Mine west / Move west / Drop Stone / End". Only one sensible move once I had chosen a direction, and no information to choose the direction by.
- Shifts 44–51: eight shifts of pure travel with an empty pack. This was the low point of the three runs.
- In all, about 50 of the 79 shifts offered no decision.

## Interesting

- Shift 43: counting slack AP against fuel and deciding how many more blind blocks to buy.
- Shift 51: empty pack, fuel 1, coal within reach. Leave with nothing, or let fuel hit 0 and bet on the next shift's coal? I bet.
- Shift 57: where to spend the second trip. I chose the middle band at layer 9 over the deep band because it is ten climbs away instead of twenty-six and stone is cheaper than hard rock.
- Shift 64: iron in the wall and fuel for perhaps six more blocks. Take it now, or tunnel on first? I tunnelled on and it led to the copper.

## Possible bugs

- Shift 77–78: waiting makes fuel. Ending a shift with all 5 AP unspent banks 5 AP; every 3 banked AP is 1 fuel; the shift costs 1 fuel. Over three idle shifts that is +5 −3 = +2 fuel. It matches the stated banking rule, so it may be intended, but it means fuel can never run out for a player willing to stand still, anywhere in the cube. I stopped after two shifts; I could have waited my way back to a full tank.
- Related, all three seeds: ending a shift with 3 unspent AP is always free ("-1 shift +1 refund").
- Nothing else looked wrong. No errors, and the action list was never empty.

## Limits (asked for by the coordinator)

- Fuel: the limit throughout. It set how far I could tunnel at layer 26 (eleven blocks) and at layer 9 (twelve). What I did about it: 16 Coal over the run, 13 crafted into fuel; counted AP home each time; banked spare AP.
- Lamp oil: ran out on shift 40 and again on shift 64 after refills. No effect I could notice in one-wide tunnels.
- Carry weight: never a limit; I carried no ore at all until shift 68. Stone still had to be dropped constantly.
- Ladders: 27, the last placed at layer 26. One was spent on layer 0, as on seed 23. Ladders did not stop me; rock I could not dig upward through did.
- Timber: five was enough.
- Only one sensible move: shifts 4–7, 12–51 and the climbs, as listed above.

## Better plays I saw and did not take

- Dig the shaft near the middle of the cube and carry the fuel there, rather than dig where the coal is. I took the shortest route to the fuel and it put me against the wall.
- Take the middle band seriously on the first trip. I went straight through layers 8–19 in a one-cell shaft because the doc says the best material is deeper.
- When I saw copper on layer 8 from layer 9, a patient player could have waited on the surface for fuel (see Possible bugs), gone down to layer 8 and dug a second tunnel to it. I judged it at about 16 more shifts on top of some 25 of waiting, and left.
- Place the ladder before mining under myself. Again nothing was under any of the 26 blocks.
