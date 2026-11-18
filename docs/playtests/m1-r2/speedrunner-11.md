# Playtest: speed-runner, seed 11

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface carrying 2 raw copper ore)
- Shifts played: 10
- Deepest layer reached: 8
- Health lost: 6 (10 -> 4), all from chosen "mine the block I stand on" falls of 1 block
- Replay: `Final state hash: 3e8bd4d19ed18021`, `Outcome: salvage (left)`, matches the log (56 choices)

## What I was trying to do

Get to layer 8 (the design doc puts iron and copper in layers 8 to 19), take one piece of ore, and get out in as few shifts as possible. This was my first run, so I also wanted to price the three ways down. From the help text alone I worked out before moving:

- Straight shaft, falling: per layer the mine cost and 1 health going down; a ladder (1 AP) and a climb (1 AP) coming back. Round trip: mine + 2 AP, 1 health, 1 ladder.
- Straight shaft, ladder first: ladder (1), mine, climb down (1) going down; climb (1) coming back. Round trip: mine + 3 AP, 1 ladder.
- Steps: two mines (the cell beside me and the one under it) and a move going down; one step up coming back. Round trip: two mines + 2 AP, nothing else.

So the plan was to fall most of the way, since health buys nothing else in this version, and try one layer of each other way to check the arithmetic. The plan held. The checks cost me about 3 AP, which I think was the difference between 10 shifts and 9.

## Key moments

- Shift 1: from the surface the block under me was stone (2 AP, 1 health). Mining the dirt to the east one layer down and walking off was also 2 AP and free of harm, so I did that. Then three dirt blocks straight down: layers 1, 2, 3 for 3 AP and 3 health. Four layers in the first shift.
- Shift 2 (layer 4): tried a stair step: mine north (dirt), mine north-down (dirt), walk north: 3 AP for one layer, against 1 AP for the fall. I had expected a step to need only the lower block; it needs the cell beside me opened as well. That is what makes steps expensive.
- Shift 3 (layer 6): tried the ladder way: ladder-here, mine-down (stone). No fall. The climb down then cost 1 AP at the start of shift 4. As predicted: exactly 1 AP dearer than falling, 1 health saved.
- Shift 4 (layer 8, health 4): the fall into layer 8 printed "You notice mineral traces in the rock", with "%" on the north and west walls only. I expected the ore to be touching me; instead I had to reason about which cells could be within 2 steps of both. I mined west (2 AP).
- Shift 5: stepped west, and now the block that had been drawn as plain stone to the north-west of my old cell was "%". Mined north, stepped in: copper ore to the north, north-west and one below. 1 AP left over, spent on crafting ladders, which I needed anyway.
- Shift 6: mined 2 copper ore (4 AP). I took the second only because I had counted the way out and it fitted in the spare AP of the last shift.
- Shifts 7 to 10: 8 ladders placed and climbed one at a time, one step up where my stair step was, one step up to the surface, leave with 2 AP used in shift 10.

## How it ended

Alive, by "leave" on the surface in shift 10, with 2 raw copper ore, health 4, fuel 15, lamp oil 1.

## Confusing

- Shift 4 to 5, traces on diagonal cells. At shift 4 the cell north-west of me (x16 y14, layer 8) was on the map as "#", plain stone, and in the mine list as "Stone". After I moved one cell it became "%". The help does say traces are noticed "only on rock your light touches", but the map draws a seen-but-unlit block exactly like a lit block with no traces. I read "#" as "no ore near here" and nearly ruled out the direction the ore was in.
- "Within 2 steps" took pencil work. With traces on two walls and not on the others I could narrow the ore to two cells, but only after noticing the point above. The game says ore is near "not which way"; in practice the pattern of which walls show traces does say which way, if you work it out.
- Shift 3: I had dropped a stone in my cell, then mined the floor from a ladder. The line read "Got 1 Stone. 1 Stone fell 1 block to layer 7." For a moment it looked as if the stone I had just got had fallen. It was the one I dropped earlier.
- The lamp-out rules and the fuel rule never came up. Lamp oil went 3 -> 2 at the end of shift 4 and 2 -> 1 at the end of shift 8, so the starting oil lasts about 12 shifts and the starting fuel 24; a 10-shift run touches neither. I cannot say whether the help's explanation of the dark is enough, because I never had to use it.
- Stone weighs 2 and is picked up automatically. I dropped it by hand after every stone block (free, but 6 extra commands). I never needed it.

## Tedious or automatic

- The way out, shifts 7 to 10: "ladder-up, up" eight times. There was nothing to decide; the only thought was counting AP so that the shift boundary did not waste any.
- Shift 1 after the first step: mine-down three times.

## Interesting

- Health as a currency. Each fall saved exactly 1 AP over the ladder way and cost 1 health that nothing else in this version wants. I stopped falling at health 4 only because the list says "1 block or more ... below that is unseen" and I did not want to find a hole with no health in hand.
- Choosing which trace wall to dig through at shift 4, and counting the way out before deciding to take a second ore at shift 6.

## Ways down compared (this run)

| Way                       | Down, per layer | Back, per layer       | Other cost         | Used at                                             |
| ------------------------- | --------------- | --------------------- | ------------------ | --------------------------------------------------- |
| Fall (mine under my feet) | mine            | 2 AP (ladder + climb) | 1 health, 1 ladder | layers 1-3, 4, 6, 8                                 |
| Ladder first              | mine + 2 AP     | 1 AP                  | 1 ladder           | layer 7                                             |
| Step                      | 2 mines + 1 AP  | 1 AP                  | none               | layer 5; layer 0 from the surface needs only 1 mine |

Cheapest in AP was the fall, everywhere: round trip 3 AP a layer in dirt and 4 in stone. Ladder-first is always the fall plus 1 AP, minus 1 health. A step is 4 AP in dirt (the same as ladder-first, with no ladder used) and 5 or 6 in stone. So there was a choice, but a small one: 1 AP a layer between the two shaft ways. What decided the run's length was the 16 AP of ladder work on the way out.

## Possible bugs

- None that broke a rule. The diagonal "#" that later became "%" (shift 4 to 5) follows the stated rule, but the map shows something that looks false.
