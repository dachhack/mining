# Playtest: newcomer, seed 23

- Interface: text
- Engine version / commit: engine 0.1.0 / 1add9f7
- Outcome: salvage (left the cube alive carrying 8 Raw iron ore and 2 Raw copper ore, pack full at 20/20)
- Shifts played: 32
- Deepest layer reached: 14

This was my second run. I knew what seed 11 had taught me and nothing else.

## What I was trying to do

Same goal as I understood it before: dig down, bring something back. I still did not know what counts as a good haul.

What I did differently from seed 11, and why:

- **Looked at the whole top layer first.** The help says "You know the whole top layer from the start", but the default view shows 9 by 9 cells of it. I started with `--radius 16`. The map showed Coal seam (`c`) and a lot more Timber-root on layer 0. I had not known coal could be on the top layer; on seed 11 I never looked.
- **Gathered before digging.** Timber ran my shaft length last time, so I took 8 Timber and 6 Coal from layer 0 before going down.
- **Dropped Stone at once**, every time, instead of carrying it.
- **Stopped placing a ladder below before climbing.** One ladder per layer: ladder in my cell, mine below, climb down.
- **Did not chain numbered choices after a mine.** I read the list again each time.

The plan changed on shift 27 when my pack filled: from then on the question was what to throw away, and then whether there was any reason to stay.

## Key moments

- **Shifts 1 to 4, surface.** Standing on the surface at x15 y14 my pick reached five Timber-root on layer 0 without my leaving the surface. 8 Timber in four shifts.
- **Shifts 4 to 8, surface.** A column of coal at x20, y12 to y16. Coal costs 2 AP and weighs 1. I used the odd AP at the end of each shift to craft ladders (Timber weighs 1, ladders weigh 0).
- **Shift 9, layer 0.** 6 Coal in the pack. I had to choose: fuel, lamp oil, or keep it as cargo. Nothing told me whether coal is worth more carried out than burned. I made 3 fuel and 2 lamp oil and kept the rest.
- **Shift 15, layers 7 to 8.** Copper ore (`u`) came into view below and to the south-west. **I did not see it.** I was repeating ladder, mine, climb without reading the map, and went on to layer 11 before I noticed on shift 18. I climbed back two layers. That cost me about two shifts and was my own inattention, brought on by ten shifts of the same three actions.
- **Shifts 19 to 21, layers 8 to 9.** Mined 4 copper (2 AP, weight 2 each). On shift 19 carry was 18/20, mostly 9 Timber and 5 Coal. I dropped 5 Timber (it fell down the shaft to layer 11) and crafted 2 Coal into fuel.
- **Shift 23, layer 13.** Iron ore (`i`) on layer 14, four of them inside my pick's reach from the ladder.
- **Shift 24.** I crafted my last 3 Coal into fuel (11 to 20) to free 3 weight. I forgot to keep one for lamp oil, which stood at 3.
- **Shift 26.** Carry 19/20. The list now said `gives 1 Stone (too heavy to carry: it will be left lying there)`. That was clear.
- **Shift 27, layer 14.** Six more iron in view on layer 15 and I had room for one. I dropped my last 3 Timber, then on shift 28 dropped 2 copper to take 3 more iron. I guessed iron is worth more because it is deeper. The game never said.
- **Shift 29, layer 14.** Pack 20/20: 8 iron, 2 copper. About five iron still in sight. Fuel 15. I went home.

## How it ended

I chose to leave on shift 32 with fuel 12, lamp oil 1, health 10. The end screen said `Shifts played: 32 | Deepest: layer 14 | Health 10 | Fuel 12` and "salvage". It did not list what I carried or say what it was worth.

## Confusing

- **The default map hides the top layer's coal and timber.** (shift 1) I only found them because I happened to try `--radius`. A player who does not would play seed 11's run again.
- **Is coal cargo or fuel?** (shift 9, shift 24) I burned all six. I do not know if that was right.
- **Copper against iron.** (shift 28) I threw away copper for iron on a guess.
- **Is there any reason to bring back more than a full pack, or to go deeper once it is full?** (shift 29) I could not think of one, so the run ended with half my fuel unused.
- **Timber falls down the shaft.** (shift 20) I dropped 5 Timber on a ladder and it fell two layers. The help does say a ladder does not hold loose items; I had not connected that with "drop into your own cell".
- **Lamp oil.** It fell from 6 to 1 again and I still could not see what difference it made. The end-of-shift line on shift 32 said `lamp oil 1 -> 0`; I left before finding out.
- **"salvage".** Two runs, one with five stones and one with a full pack of ore, got the same word.

## Tedious or automatic

- Shifts 9 to 18 (layers 1 to 11): the same loop as seed 11, one layer per shift. It was dull enough that I stopped reading the map and missed the copper.
- Shifts 29 to 32: "Climb up" fourteen times.
- Shifts 4 to 8 on the surface were slow (walk, mine, walk) but I was choosing where to stand, so they did not feel automatic.

## Interesting

- **Shift 1:** where to stand on the surface so that one spot reaches the most timber. I enjoyed that.
- **Shift 9:** how to split coal between fuel, lamp oil and the pack.
- **Shift 19:** carry 18/20 with ore in reach, and what to give up: timber I might need for ladders, or coal I might need for fuel.
- **Shifts 27 to 28:** a rich iron seam and no room. Dropping copper for iron was the one moment in three runs that felt like a real trade.

## Did fuel, lamp oil, carry weight, ladders or timber limit me?

- **Carry weight:** yes, and it was the only real limit. It bit on shift 19 and again from shift 26. I dropped Timber, burned Coal, and then dropped copper. It ended the run on shift 29.
- **Fuel:** never. Six Coal became 18 fuel. I left with 12.
- **Lamp oil:** not that I could tell. It nearly ran out because I forgot it.
- **Ladders and timber:** a surplus. I dropped 8 Timber.

## Possible bugs

- None seen. Every rule in the help held where I tested it.
- The fuel refund for unspent AP that I noted on seed 11 was there again (shift 32: `3 unspent AP banked ... fuel 12 -> 12`).
