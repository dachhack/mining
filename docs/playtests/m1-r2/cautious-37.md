# Playtest: Cautious, seed 37

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface at shift 28 with 9 raw copper ore, 1 timber, 20 ladders; health 10/10, fuel 18, lamp oil 3)
- Shifts played: 28
- Deepest layer reached: 8
- Replay: `Final state hash: 843b885ed940b76e`, `Outcome: salvage (left)`, matches the log (144 choices)

Third run of the round. Carried over from seeds 11 and 23: the oil burn rate, "coal first", the ladder-shaft routine, copper around layer 8, traces going stale once the ore is mined, and that the lamp is cheap to keep lit once there is coal. I avoided the dark again here, on purpose.

## What I was trying to do

Same shape as seed 23: timber and coal from the top layer first (three coal about 7 cells west of the start, at x9–10 y13–14), then a ladder shaft under the coal. I meant to go deeper than layer 11 this time since I expected fuel to be plentiful.

It changed twice. At shift 10 the shaft ran into a coal vein on layers 5–6 and I followed it sideways. At shift 15 I found copper on layer 8 and from then on the run was about pack weight: I never went below layer 8, because the pack filled before the copper ran out.

## Key moments

- **Shift 2.** I chained `w,w,w,w` across the surface and the first "w" walked me into the hole I had just mined and the second stepped me out again. No extra AP, no harm, but I had not read the view between them. My mistake; the tool did what the names said.
- **Shift 5–8.** The shaft at x10 y13 went through a mass of timber-root: nine roots seen on layers 1–4. I took five more than I needed and was carrying 8 timber (weight 8) by shift 8.
- **Shift 9–13.** Coal at layer 5, then more on layer 6 to the east, north-east and south-east. 8 coal in the pack at shift 13, with two more seams in view (x13 y11 and y15, layer 6) that I left.
- **Shift 14.** A whole shift of crafting and nothing else (fuel twice, lamp oil, ladders twice) because the pack was at 16/20 with no ore in it yet.
- **Shift 11 and 15.** First traces at layer 6–7 at shift 11. At shift 15, from the ladder on layer 7, four copper ore on layer 8. Mined all four from the ladder by shift 17. Pack 18/20.
- **Shift 18.** A second all-crafting shift to make room.
- **Shift 19.** I chained `w,mine-w-down` expecting to hit the copper I had seen at x11 y13 layer 9. After the move that copper was under my feet, not west of them; "mine-w-down" was a plain stone one cell further on. 2 AP and a stone I did not want. Again my mistake, and the same kind as shift 2: the names are relative to where I stand and I had worked them out from where I had been standing.
- **Shift 21.** Seventh copper; pack 20/20. Fuel 19.
- **Shift 22.** Third all-crafting shift: the last 3 coal and 2 timber became fuel, oil and ladders, which weigh nothing. Fuel read 24 afterwards, the same as at shift 1.
- **Shift 23–24.** Went back along the vein, which ran north along x11 on layer 8, for an eighth and ninth copper. A tenth was in view at x10 y9. Pack 19/20, each ore weighs 2, so I left it.
- **Shift 27.** At the top of the ladder on layer 0 I chained one "w" too many and walked into the cell where I had mined coal at shift 4, instead of stepping up to the surface. It cost one extra shift.

## How it ended

Alive, by choice, at shift 28, because the pack was full. I had 18 fuel, 3 lamp oil, full health and known copper still in the wall.

## Confusing

- **What limits a run.** On seed 11 it was fuel. Here fuel was at or above 14 at every shift after shift 13, and the 20-weight pack ended the run. I spent three whole shifts (14, 18, 22) doing nothing but crafting to change heavy things into weightless ones. Nothing in the help told me that ladders, fuel and oil being weightless is the important fact about them; I found it at shift 14 by staring at the carry gauge.
- **Shift 21–24:** I did not know whether leaving 18 fuel and a visible ore block behind was a good run or a timid one. The end screen says "Shifts played: 28 | Deepest: layer 8 | Health 10 | Fuel 18" and nothing about what I brought out.
- **Shift 17 onward:** almost every block on layers 7–9 around the vein carried "%". Along a vein the traces say "yes" everywhere, so I found each next ore by walking to the end of the tunnel and looking, not by reading traces.
- **Lamp:** I topped up at shifts 9, 14 and 22 and never saw it below 1. I still do not know from play whether more oil than the starting 3 has any downside or cap.

## Tedious or automatic

- **Shifts 14, 18, 22:** five crafts in a row, three times. Each was the only sensible thing to do and took no thought.
- **Shifts 5–9:** the shaft routine again; by this third run I was chaining a full shift of it at a time and only reading the last view. That habit is what caused the shift 19 and shift 27 mistakes.
- **Timber:** I picked up 12 over the run and ended with 20 spare ladders. After the first few there was no reason to take a root except that it was 1 AP and in reach.
- **Shifts 25–28:** the climb, with two sideways steps where the shaft jogs.

## Interesting

- **Shift 10:** follow the coal sideways or keep going down. Sideways meant leaving the single straight shaft I trust; I did it because each coal was three more shifts. The jog in the shaft is what I later tripped over on the way out.
- **Shift 21–22:** leave with 7 copper and a full pack, or spend a shift converting the last coal and timber to free 5 weight and go back for more. It was safe (fuel 19, lamp lit, ladders all the way), so I went back. This was the one real "is it worth it" decision of the run and I enjoyed it.
- The order of mining around a ladder at shift 19–20: which copper to take from which cell so that I never stood on a block I was about to remove. I used ladder-n to cross a cell whose floor I had already mined out. That small routing puzzle is the part of digging I would want more of.

Not tested in any of my three runs: falls and fall damage. Staying in persona meant a ladder in my cell before every floor I mined, and health never left 10/10. A cautious player gets no information about the new fall rules except from the help text and the "(you are standing on it: you will fall 1 block or more and lose at least 1 health...)" warning in the list, which was clear enough that I never chose it.

## Possible bugs

- None seen. Both wasted actions (shift 19, shift 27) were my own chained choices doing exactly what their names say from the new position.
