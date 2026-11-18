# Playtest: speed-runner, seed 11

- Interface: text
- Engine version / commit: 0.1.0 / 1add9f7
- Outcome: salvage (left alive at the surface; the course was **not** completed: I never found any iron or copper ore)
- Shifts played: 33
- Deepest layer reached: 14

Course for this round (no contract in this build): stand on layer 12 or deeper, pick up at least one iron or copper ore, return to the surface and leave, in as few shifts as possible. This was my first run, so it is also the one where I learned the rules the hard way.

## What I was trying to do

Plan at the start: dig a straight shaft down from the start cell (x16 y16) by mining the block under my feet every time. Falling one block is free, so going down costs only the mining AP. Use ladders for the way back up. The kit is 6 ladders and 2 timber, and 1 timber makes 3 ladders, so I counted 12 ladders and thought that was enough for layer 12.

How it changed:

- No ore showed up beside the shaft, so from shift 6 the run turned into an ore search at layers 12 to 15 (a tunnel east, test pits under it, a short probe west). I found nothing and turned back at shift 15.
- At shift 12 I worked out that I was one ladder short (see Key moments). From shift 19 the run turned into a search for timber-root just under the surface, with fuel running out. I got out at shift 33.

## Key moments

- **Shift 1.** Mined the stone under me from the surface (2 AP), fell into layer 0, mined down twice more. Expected the fall to cost something; it did not. At layer 2 after one shift.
- **Shift 3 to 4.** I had 1 AP left at layer 7 and spent it on "Place a ladder in your cell", expecting to keep falling on the next shift. On shift 4, "Mine below you" said "your ladder holds you, you will not fall", and I had to pay 1 AP to climb down. After that I only ever placed ladders "in the cell above". Cost: 1 AP.
- **Shift 6.** Reached layer 12 with 3 AP left. I had seen the 3×3 block of cells around the shaft on every layer from 8 to 13 and none of it was ore. I expected ore to be common in the "middle" layers. It was not.
- **Shifts 6 to 10.** Tunnelled east along layer 12 from x16 to x22. Each cell cost 2 AP to mine and 1 AP to walk into, and showed me about 6 new cells (three on my layer, three below). Six cells of tunnel, no ore, no coal.
- **Shifts 10 to 13.** Tried test pits: mine the floor of the tunnel, drop one block, see nine cells of the next layer, then step up into the next tunnel cell on the way back (so the pit costs only its mining AP). Pits at x22, x19 and x18, then one more layer down to layer 14 (my deepest) to look at layer 15. Nothing.
- **Shift 12.** In the pit at x19 the list offered "Step up east" and "Step up west"; I took east by mistake and had to come back through the pit. Cost: 2 AP. My slip, not the game's.
- **Shift 12 (planning the return).** Counted ladders properly. A shaft whose bottom cell is on layer 12 has 13 cells (layers 0 to 12), and climbing needs a ladder in my own cell and in the cell above, so 13 ladders; I had 12. I had assumed I could "step up" out of the top of the shaft without a ladder. That is true from layer 0 to the surface, but to get from layer 1 to layer 0 without a ladder I would have needed an open side cell on layer 0, and the pick cannot reach the layer above. So nothing I could do from below would fix it, except find timber.
- **Shifts 14 to 15.** Short probe west of the shaft on layer 12 and one pit. Nothing. By now I had seen roughly 220 cells between layers 8 and 15 with no ore and no coal. Started climbing at the end of shift 15 with fuel 10.
- **Shift 19.** At layer 1 on the top ladder with no ladders left, fuel 6. Tunnelled under the timber-roots I could see on layer 0 at x15–16 y13–14, expecting the roots to continue downward. They did not: layer 1 under them was dirt and stone.
- **Shifts 21 to 23.** Dug a small staircase down from layer 1 to layer 5 through dirt, hoping for timber-root in the "upper layers". None in about 120 cells of layers 1 to 6.
- **Shift 24 to 25.** Fuel reached 0 at the end of shift 24 and the lamp went out. I expected to die at the end of shift 25. Instead the "If you end the shift now" line read "5 unspent AP banked, fuel 0 -> 0 (-1 shift +1 refund)". Leaving 3 AP unspent pays for the shift. From here I spent 2 AP per shift and banked 3, and the game let me carry on indefinitely.
- **Shift 29.** Tunnelled on layer 1 to under the other nearby layer-0 root (x14 y19). This one did continue down: timber-root at x14 y19 on layers 1 and 2. Mined one (1 AP), crafted 3 ladders.
- **Shift 33.** Back at the shaft, ladder into layer 0, climbed, stepped up to the surface, left with 2 ladders and 3 stone.

## How it ended

Left alive from the surface on shift 33 with no ore. Health 10/10 throughout; nothing in this build ever threatened it. Fuel 0, lamp out.

## Limits: fuel, lamp oil, carry weight, ladders, timber

- **Ladders and timber: yes, this was the whole second half of the run.** I was one ladder short of getting out and there was no other way up. I spent shifts 19 to 32 finding one piece of timber. What I did about it: searched layers 1 to 6 near the shaft, then went to the cell under a second layer-0 root.
- **Fuel: it ran out (shift 24) but it did not limit me in the way I expected.** With 0 fuel I could still play 2 AP per shift for as long as I liked by banking 3 AP. It slowed me from 5 AP a shift to 2; it could not kill me unless I chose to spend the AP.
- **Lamp oil: ran out at shift 24.** In one-wide tunnels it made no difference I could notice, because the cells my pick can reach are always shown anyway.
- **Carry weight: never a real limit.** Stone (weight 2 each) fills the pack in about nine blocks, but dropping is free, so I emptied it whenever it mattered (shifts 4, 9, 19). With the pack full the game just leaves the new stone in the hole.

## Confusing

- **Shift 4:** placing a ladder in my own cell stops the free fall when I mine the block under me. The message on the action is clear once you read it, but I only found out after spending the AP.
- **Shift 12:** how many ladders a shaft needs. The help says "a shaft needs a ladder in every cell you want to climb through", and that includes the layer-0 cell, which I had not counted because I can step up from layer 0 to the surface. Nothing in the game warned me that I was digging deeper than my ladders could bring me back from.
- **Shift 20:** I mined a diagonal neighbour open hoping to see past it. It showed me nothing new: light does not seem to pass diagonally. I had expected an opened cell beside me to show its own neighbours.
- **Ore:** the help says "harder rock and different ores lie deeper" and the design document puts iron and copper in layers 8 to 19. I read that as "ore is around once you are at layer 8". In this cube I saw none in about 220 cells there. I had no clue which direction to search in, at any point.
- **Timber-root "grows only in the upper layers":** under one layer-0 root there was nothing; under another the root went down two more layers. I could not tell which kind a root was from above.

## Tedious or automatic

- **The descent (shifts 1 to 6): one sensible move, repeated.** "Mine below you" thirteen times, with a ladder placed in the cell above whenever 1 AP was left over. I did not make a decision until layer 12.
- **The climb (shifts 15 to 19): one sensible move, repeated.** "Place a ladder in the cell above", "Climb up", twelve times.
- **Shifts 25 to 33 at 0 fuel:** two actions, end shift, two actions, end shift. Nothing could go wrong and nothing changed except the shift number.
- The ore search (shifts 6 to 15) was not automatic, but it felt like guessing: every direction looked the same.

## Interesting

- Working out the cheapest way to look at unseen rock: a test pit under a tunnel shows nine cells for 2 to 3 AP and costs nothing to climb out of, which beat extending the tunnel (about 6 cells for 4 AP counting the walk back). That was a satisfying small discovery.
- Shift 12, realising that a second pit beside the first one would trap me: if I mine the floor next to an existing pit and drop in, the only cell I can step up into has no floor on the way back. I had to plan each staircase so every step still had rock under it.
- Shift 19 onward, deciding where timber might be with 5 fuel left, before I knew fuel could not kill me. That was the only tense stretch of the run.

## Shortcuts, dominant strategies, things that look exploitable

- **Fuel cannot run you out.** Ending a shift with 3 unspent AP refunds the shift's fuel. At 0 fuel I played nine more shifts (25 to 33) this way. Even with fuel in the tank, ending a shift with all 5 AP unspent costs no fuel (shown on shift 1: "fuel 24 -> 24"), so waiting is free. I used this to survive; a player could also use it to never care about fuel or coal at all.
- **Straight shaft, free falls.** Mining the block I stand on and falling one block is the cheapest possible way down: no move cost, no ladders needed going down. I never found a reason to dig any other shape on the way down.
- **Spare AP into ladders.** Any shift that ends with 1 AP left can put a ladder in the cell above for the return trip, so no AP is wasted on the descent.
- **Free dropping makes carry weight meaningless** for anything I do not want to keep.
- **Soft lock that is not a death.** With too few ladders, the pick unable to reach upward, and placed ladders not recoverable, I could have been stuck below layer 0 for ever, alive, at 2 AP a shift. I got out only because a timber-root happened to extend below layer 0 within reach.
- **Not used, but looked open to abuse:** the whole top layer is visible from the start, including every timber-root and coal seam, and the pick reaches layer 0 from the surface. I could have collected timber before digging without going underground. (I did this on seed 23.)

## Possible bugs

- None that I can be sure of. Two things I would flag for someone who knows the rules:
  - **Shift 19:** I mined out layer-1 cells directly under layer-0 dirt, and the dirt above stayed where it was. The design document says dirt "always falls if unsupported"; the `--help` text for this build does not mention it, so I took it as not built yet.
  - **Shift 25 onward:** surviving indefinitely on 0 fuel. The "If you end the shift now" line describes it accurately, so the game is following its own stated rule; it just did not feel like what "run out of fuel and the run ends" was meant to allow.
