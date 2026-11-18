# Playtest: Cautious, seed 23

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface at shift 20 with 4 raw copper ore, 3 coal, 4 timber, 1 stone, 3 ladders; health 10/10, fuel 8, lamp oil 3)
- Shifts played: 20
- Deepest layer reached: 11
- Replay: `Final state hash: c91278696bb608f0`, `Outcome: salvage (left)`, matches the log (104 choices)

Second run of the round. What I carried over from seed 11: lamp oil burns 1 every 4 shifts (out at the end of shift 12 with the starting 3); copper turned up at layer 8; the ladder-shaft routine; traces only show on lit rock; the dark is workable with ladders. I used all of that here.

## What I was trying to do

Having met the dark on seed 11, this time I decided deliberately to avoid it: get coal before going down, keep oil above zero the whole run, and carry a torch as a backup. This seed made that easy: a line of coal on layer 0 four cells east of the start (x20, y12–16). Then one ladder shaft down under the coal, stop when the signs ran out, leave with a fuel margin.

The plan did not change. I stopped going down at layer 11 because two layers in a row showed no traces and no ore.

## Key moments

- **Shift 1–3.** Three timber-roots and three coal mined from the surface without going underground at all. Standing on top and using the "one layer down" reach felt safe and a little too easy.
- **Shift 4–5.** Dropped into my own coal trench; the lamp showed coal directly under it and two timber-roots on layer 1. Took them. 5 coal, 6 timber before the shaft proper began.
- **Shift 5.** Crafted lamp oil at 2: "Lamp oil +2 (crafted), now 4." I expected a cap at the starting 3; there was none that I hit.
- **Shift 5–10.** Shaft at x20 y15 from layer 1 to layer 7. Nothing to see but dirt and stone.
- **Shift 10.** First traces, on the floor and two walls at layer 7, and a copper ore visible at x19 y16 layer 8. Crafted fuel with the spare AP (15 -> 18).
- **Shift 12–13.** From the ladder on layer 8 I could see three copper in a row on layer 9 (x19–21 y16) and mined all three without moving. Four copper in total.
- **Shift 14.** Placed my one torch in the emptied copper gallery (x20 y16 layer 9). I expected it to show me something. The map did not change at all, because the lamp had already lit everything the torch could reach.
- **Shift 15–16.** Layers 10 and 11: hard rock and stone, no traces. At shift 16 the preview said "lamp oil 4 -> 3" after I crafted a second oil at 2; the lamp was never below 2 all run.
- **Shift 16.** Decided to leave: nothing promised below, 12 fuel, a 12-AP climb.
- **Shift 19–20.** On the way out I took the last two coal on layer 0 (x20 y13 and y12) since they were two steps from the ladder top. Left at shift 20.

## How it ended

Alive, by choice, with 8 fuel and 3 coal (9 more fuel if crafted) unspent. The pack was 17/20. Nothing threatened me at any point.

## Confusing

- **Shift 14:** I do not know what the torch did for me. It cost a timber, a coal and 2 AP (craft and place) and showed nothing. The help says a torch placed "before the oil runs out lets you carry on there"; since I had chosen to keep the oil up, the torch had no job. I could not tell from play whether a torch's light is ever better than the lamp's.
- **Shift 12:** "Loose in your cell: 5 Stone" but the action read "Pick up 4 Stone from your cell". I worked out it was offering what would fit in the pack (11 + 8 = 19 of 20). The line does not say so.
- **Shift 14–16:** traces stayed on the three blocks beside the layer-8 copper after I had mined it, and none appeared lower. Was the vein finished, or are there no traces to see because those lower blocks never had ore within 2? I read it as "finished" and left. I had no way to check.
- **Fuel:** on this seed one coal is three shifts. With 7 coal found in 20 shifts, fuel stopped being a limit by shift 5 and I stopped thinking about it. On seed 11 it was the whole run. I could not tell which of those the game means it to be.

## Tedious or automatic

- **Shifts 5–10 and 14–16:** mine-down, down, ladder-here, eleven times. Between layer 1 and layer 7 not one view contained anything to react to.
- **Dropped stone follows the shaft.** Every stone I dropped in my cell fell to the new bottom each time I mined the floor ("7 Stone fell 1 block to layer 11" by shift 16), so I was offered take-here-stone every shift and dropped a new one every shift. It is free, but it is a chore of two extra choices per layer with no purpose.
- **Shifts 17–19:** eleven "up" in a row.
- Avoiding the dark took two crafts (shifts 5 and 16), 2 AP and 2 coal in total. Once I had coal it was not a decision.

## Interesting

- Shift 16: whether to go below layer 11. Fuel said yes (12, plus coal). The rock said nothing. A cautious player leaves when in doubt and I did, but I was aware I was leaving with most of my resources unused, and the game gave me no way to judge what two more layers were worth.
- Shift 5: how to split 5 coal between oil, fuel and a torch. I kept it as coal and converted one at a time when a shift had a spare AP. That felt like the right kind of small decision.

Still not tested: falls. Health was 10/10 throughout.

## Possible bugs

- None that broke a rule. The shift-12 "5 Stone" / "Pick up 4 Stone" mismatch is the only thing that looked wrong, and it has an explanation.
