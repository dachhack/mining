# Playtest: greedy, seed 11

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface at shift 23)
- Shifts played: 23
- Deepest layer reached: 11
- Carried out: 5 Raw copper ore, 5 Raw iron ore (pack 20/20), 6 ladders. Fuel left 2, health 10/10.
- Replay: `Final state hash: b025c592b5224c2a`, `Outcome: salvage (left)`, matches the log (120 choices).

## What I was trying to do

First run, knowing only the help text and the design doc. Plan: get to the middle band (layer 8+) by the shortest route, fill the pack with ore, and leave with as little fuel as I dared. I worked out on shift 1 that a ladder shaft (ladder, mine below, climb down) costs 3 to 4 AP a layer and needs one mined block a layer, against two for cut steps, so I dug straight down under the start.

The plan changed twice. The surface coal was 23 moves away, so I decided to do without coal, which meant the lamp was going to go out whatever I did. And the first mineral traces (shift 6) turned the dig from "straight down and hope" into following a vein sideways.

## Key moments

- Shift 1: took 3 timber-root two steps north of the start instead of digging at once. Expected it to pay for ladders; it did (I ended with ladders to spare).
- Shift 4: the end-of-shift line showed "lamp oil 3 -> 2". This was the first I knew of the rate: 1 oil every 4 shifts, so 3 oil meant dark after shift 12. The help only says "a little every few shifts".
- Shift 6 (layer 5 to 6): first "You notice mineral traces". Two cells were marked: the wall north of me on layer 6 and the floor under me. The other three walls were plain. From "within 2 steps" I worked out the ore had to be at x16 y12 layer 7 or x16 y13 layer 8. I kept digging down.
- Shift 7 (layer 7): copper ore showed at x15 y13 and x16 y13 on layer 8, one of my two guesses. The traces led me straight to ore. Mined both on shift 8 without leaving the ladder.
- Shifts 9 to 11: three more copper around the first two (5 in all). At shift 11 I stepped to x14 y12 layer 8 and the rock next to a block I had just mined out showed no traces, so I concluded the vein was finished.
- Shift 12: opening the floor at x15 y13 layer 9 marked one new trace, west on layer 10. I worked out the ore was at x13 or x12, y13, layer 10. The lamp went out at the end of this shift.
- Shift 13 (dark): mined the traced block west. I expected 2 AP; it was hard rock and cost 3 (the "%" on the map hides the rock type).
- Shift 14 (dark): the cell I had dug open could not be entered ("you have not seen what is under that cell. A ladder in that cell would hold you"). I placed a ladder there, stepped in, and my hand found iron ore at x13 y13. The trace had led me to ore again, in the dark.
- Shifts 15 to 16: three more iron by the same ladder-then-step method, one of them under my feet while the ladder held me.
- Shift 19: mining a plain stone block to reach the last iron put a Stone in my pack and took me to 20/20. I noticed only because of the Carry gauge; had I not dropped it, the iron would have been "left lying in the hole".
- Shift 20: took the fifth iron (seen earlier above the tunnel, reached by going round on layer 8). Pack full. Climbed out; left on shift 23 with fuel 2.

## How it ended

Alive. I turned for the surface because the pack was full, not because fuel forced me: I had fuel for two more shifts than I used.

## Confusing

- Nothing in the game says what any ore is worth. I was told to go for the most valuable ore and could not tell copper from iron in value, at any point, including the end screen. I filled the pack half and half by accident of what I found.
- Lamp oil rate (shift 4): the help does not give it. I learned it from the end-of-shift line.
- Stale traces (shifts 8 to 12): the "%" marks around the copper stayed after the copper was gone, while newly lit rock next to a mined-out block showed nothing (shift 11). So a "%" means "ore was near when you looked", and I could not re-check a marked cell. I only understood this because I happened to light a fresh cell beside the old ones.
- Shift 6: cells I knew only through my pick's reach (the ring one layer down) were drawn as plain rock even though one of them was 1 step from copper; it turned to "%" once I was beside it on shift 7. Plain rock on the map can mean "no ore near" or "not looked at closely yet", and the map does not say which.
- Shift 13: a "%" cell does not show whether it is stone or hard rock on the map. The mine list does say, so I could have read it there.

## Tedious or automatic

- Shifts 2 to 7: the shaft. Every shift was mine-down, ladder-down, down, with one spare AP for a craft. No decisions until the traces appeared.
- Every stone block mined went into my pack and I dropped it by hand each time (shifts 3 to 9, 12, 13, 19). About ten free drop actions that I never wanted to think about.
- Shifts 21 to 23: the climb out is "up" thirteen times.

## Interesting

- Working out where the ore was from which walls had traces and which did not (shifts 6 and 12). Both times the answer was one of two cells and I was right. This was the best part of the run.
- The dark (shifts 13 to 20). I expected it to end the useful part of the run. It did not: the "a ladder in that cell would hold you" line taught me how to keep going, and feeling iron one block at a time was tense in a good way. It did cost AP (a ladder per step).
- Shift 18: choosing how to reach an iron block above my tunnel. Going round on layer 8 and mining it diagonally from above was 3 AP cheaper than tunnelling on layer 9.

## Possible bugs

- None that I could be sure of. Health never changed: with a ladder in my cell there was no fall to take, so the new fall damage rule never came up in this run.
