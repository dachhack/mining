# Playtest: newcomer, seed 11

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface at shift 22 carrying 10 Raw iron ore, 6 Ladder)
- Shifts played: 22
- Deepest layer reached: 14
- Replay: `Final state hash: c944f9b89b4d186e`, `Outcome: salvage (left)`, matches the log (115 choices)

This was my first run. I knew only the `--help` text and "dig down for ore and get back out".

## What I was trying to do

Dig down, find ore, come back before the fuel ran out. The help said timber is the only source of ladders and grows only near the top, so I started by taking the three timber-roots I could see four cells north of the start. After that I cut steps sideways ("the safe way down") because the six starting ladders looked precious. Once I found coal and learned it turns into 3 fuel for 1 AP, fuel stopped worrying me and the plan became "keep going until the pack is full". The pack filled at layer 14 and I walked out with 15 fuel unspent.

## Key moments

- Shift 1: saw `t` three cells north on the layer-0 map, walked over, mined it from the surface with `mine-n-down`, then stepped into the hole. I expected stepping into a hole to hurt; the list said "Move north, then drop 1 block to layer 0" and it did not. Clear.
- Shifts 2-3: worked out the staircase by trial: mine the cell beside me, mine the cell under that, walk in. 3 AP a layer in dirt. On shift 3 I had 1 AP left and found I could pre-mine the lower block of the next step (`mine-w-down`) so the AP was not wasted. That felt like a small discovery of my own.
- Shift 4, layer 4: first coal (`c`) appeared beside me, with more on layers 5-7 in a little diagonal trail. Followed it down for four shifts. Crafted fuel at shift 6 (+3) and realised one coal is three shifts.
- Shift 7, layer 7: "You notice mineral traces in the rock: ore is near. The map marks them `%`." Mined the traced block east, then the traced block under that. More `%` each time and no ore in sight for two shifts.
- Shift 9, layer 8: stepped down and the cell under my feet was Iron ore. Used the help's advice: `ladder-here`, then `mine-down`. The list line changed to "your ladder holds you, you will not fall". That worked exactly as told.
- Shifts 10-12, layers 9-11: a column of iron straight down (five ores). Carry reached 18/20. I noticed ladders weigh 0 and timber weighs 1, so crafting timber into ladders frees weight. Later I just dropped the timber (free).
- Shifts 13-15, layers 12-13: nothing but Stone and Hard rock. One layer per shift. New `%` at layer 13; I mined west (it turned out to be Hard rock, 3 AP), then south, guessing.
- Shift 16, layer 13: iron showed at x11 y15 after the second guess. Five more ores over shifts 16-18.
- Shift 18: 20/20. Shifts 19-22: climbed out the way I came (5 ladder cells, then 8 step-ups), no trouble.

## How it ended

I chose to leave at shift 22 with a full pack, health 10/10, fuel 15, lamp oil 2. Nothing threatened me at any point. The end screen said `RUN ENDED: you left the cube alive with what you carried (a "salvage" run)` and gave shifts, depth, health and fuel. It said nothing about whether 10 iron ore was a good haul, and "salvage" sounded like a consolation prize without saying what the better result would have been.

## Confusing

- Mineral traces after the ore is gone. At shift 9 I mined the iron under me and the game immediately said "You notice mineral traces in the rock: ore is near" about the rock around the hole I had just made. From shift 9 to shift 12 every block I opened produced that message, and I could not tell whether it meant "more ore" or "the ore you just took". At layer 11 the `%` marks were all around me and there was no ore left in view. The help says traces "stay on the map"; it does not say they can be pointing at ore that is no longer there.
- `%` hides what the rock is. At shift 15 I chose `mine-w` on a `%` cell expecting 2 AP of Stone; the result line said "Hard rock, mineral traces" and it cost 3. The action list did say so, but the map could not, and I had planned the shift from the map.
- "Hazards: none known" was on every view for 22 shifts and never changed. I do not know what a hazard is in this game or whether there are any.
- I never understood what I was supposed to bring back. Coal, iron, stone and timber all go in the pack; nothing says what counts.
- Stone: every Stone block puts a 2-weight Stone in the pack. The help lists one recipe that uses it (Support) and then says supports cannot be placed. So stone is only something to throw away, and I had to work that out.

## Tedious or automatic

- Shifts 12-15 (layers 11-13): `mine-down, drop-stone, ladder-down, down` plus one spare AP, every shift, with nothing on the map but `#` and `H`. Four shifts of the same five inputs.
- `drop-stone` after every stone block from shift 8 onward. It is free, so it is not a decision, only an extra input. When the pack was full the list instead said "too heavy to carry: it will be left lying there", which was the behaviour I wanted all along.
- The climb out (shifts 19-22) was 17 moves with no choice in them.
- The last AP of most shifts had nothing worth doing. I spent it crafting when I had coal or timber, and lost it otherwise.

## Interesting

- Shift 3: stone on three sides at layer 3. Ladder shaft (uses ladders) or staircase through stone (4-5 AP a layer)? I counted both and found pre-mining the diagonal block made the staircase cheaper that once.
- Shift 13: what to throw away to make room. I dropped 3 timber and kept 2, betting I would not need more than 6 further ladders. That was a real choice and I was not sure of it.
- Shift 15-16: two traced blocks, west and south, and one shift's worth of AP for one of them. I guessed west first, wrongly.
- Shift 18: I was at 19/20 with three more iron in view. Dropped the last timber to carry one more ore and left two behind.

## Possible bugs

- Shift 9 onward: the "You notice mineral traces ... ore is near" message is printed right after mining the only ore the traces could belong to. If that is intended it reads as wrong information; I list it here because "ore is near" was false as far as I could ever find at layer 11.
- None otherwise. Every move the list offered did what its line said, and the "If you end the shift now" line was right every time.

## Were the screen's own explanations enough?

Yes for moving, falling, ladders, fuel and carrying: the action lines ("then drop 1 block", "your ladder holds you", "too heavy to carry") told me the result before I chose. The one "Not on the list" note I saw ("No climb up: the cell above you has no ladder", shift 9) was exactly the thing I was about to look for. No for traces (above) and for the point of the run.
