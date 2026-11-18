# Playtest: newcomer, seed 23

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface at shift 24 carrying 4 Raw copper ore, 6 Raw iron ore, 17 Ladder)
- Shifts played: 24
- Deepest layer reached: 14
- Replay: `Final state hash: 64128f36cf0c7703`, `Outcome: salvage (left)`, matches the log (128 choices)

Second run. What I carried over from seed 11: coal is 3 fuel or 2 lamp oil for 1 AP; a ladder in my cell lets me mine the floor safely; timber can be turned into weightless ladders; stone is dead weight; the pack, not the fuel, was what stopped me last time.

## What I was trying to do

Same as before but better stocked: take timber and coal from the top layer first (both were on the surface map within five cells of the start), then go down by ladder shaft in stone and by steps in dirt, and try to get deeper than layer 14 or find something other than iron. I got copper at layers 8-9 and iron at 14-15, filled the pack at layer 14 again, and left with 10 fuel.

## Key moments

- Shift 1: four timber-roots beside the start, mined two from the surface and two from inside the hole. 6 Timber.
- Shifts 2-4: the top-layer map showed a column of `c` at x20. Walked three cells east on the surface and mined three coal with `mine-e-down`, `mine-ne-down`, `mine-se-down` without going down at all. I had not realised in seed 11 that the surface map was a shopping list. 5 coal by shift 4.
- Shift 7, layer 4: `mine-n` was offered on a Timber-root that was the block under my previous step (x19 y16). I saw that mining it would take the floor out of my own staircase. The list gave no hint; I only caught it because I looked at the map column by column. I did not mine it.
- Shifts 7-9, layers 4-7: ladder shaft, 4 AP a layer. `%` at layer 6; one AP on the dirt to the north showed nothing; kept going down.
- Shift 10, layer 7: `u Copper ore` appeared one layer down to the north. First non-iron ore. Four copper by shift 13 (layers 8-9), three of them mined from the ladder without moving.
- Shift 11: with the floor of the shaft mined out and no ladder below, the list offered `down: Climb down the ladder to layer 8`. I remembered the help's "or a short drop" and placed `ladder-down` first so I could get back. The list did not say that climbing down there would leave me unable to climb up; the help does, if you read "to climb up, there must be a ladder in your own cell and in the cell above" carefully.
- Shifts 13-17, layers 9-13: Stone and Hard rock only. One layer per shift.
- Shift 17, layer 13: stepping onto layer 13 showed four `i` on layer 14 at once (NW, NE, E, SE of the shaft). Mined all four from the ladder over two shifts.
- Shift 20, layer 14: five more iron visible on layer 15 and one on 14. Room for two. Took two, left four.
- Shifts 21-24: climbed out. Two ladder runs joined by a short walk and three step-ups.

## How it ended

Left by choice at shift 24: 20/20 carry, health 10/10, fuel 10, lamp oil 2. Again nothing ever endangered me. Same end screen as seed 11; it does not say whether copper is worth more than iron, so I do not know if leaving four iron behind to keep four copper was right.

## Confusing

- Shift 11 and shift 13: the action list called a `%` cell "Hard rock, mineral traces" while the map drew it the same as a traced Stone cell. At shift 13 `mine-sw` and `mine-nw` were both 3 AP for that reason. I still cannot plan AP from the map when traces are about.
- Traces again pointed nowhere I could find for long stretches. `%` at layer 6 (shift 9) was answered by copper at layer 8, two layers down and one cell north: fair. But at shift 16, `%` east of the shaft at layer 12 and under me at layer 13 turned out to be iron at layer 14 in four different directions. "Ore is near" was true and no use for choosing a direction.
- With the pack nearly full the stone pile under me showed "Pick up 1 Stone from your cell" while the "Loose in your cell" line said 3 Stone (shift 19). It is the "as much as fits" rule from the help, but the number looked like a mistake until I worked that out.
- Still do not know what a "hazard" would be: "Hazards: none known" for 24 shifts.

## Tedious or automatic

- Shifts 13-17: five consecutive shifts of `mine-down, drop-stone, ladder-down, down`, then one AP to spare. I used the spare AP to craft a ladder each time, which needed no thought.
- By shift 19 I had 17 ladders and nothing to do with them. Converting timber to ladders was only a way to shed weight.
- The climb out, shifts 21-24: no decisions.
- The whole run was calmer than seed 11 because I knew the routine. From shift 7 on I was never unsure what to do next except at the three moments under "Interesting".

## Interesting

- Shifts 2-3: spending two shifts on the surface for coal before going down. It cost 2 fuel and returned 15 fuel-or-oil's worth. Easy in hindsight; at the time I was not sure walking away from the hole was allowed to be a good idea.
- Shift 7: noticing the staircase block. Not a hard decision, but the only moment in two runs where I felt I could have wrecked my own way out.
- Shift 19: 16/20, fuel 15, iron in sight. Go one layer further for two more ores, or leave? I went; it cost three shifts.
- Shift 20: which ore to leave behind. I had no information to decide with, so it was a coin toss rather than a judgement.

## Possible bugs

- None seen. Falls, drops and ladder holds matched the list lines every time. The chain stopped where I expected whenever I ran out of AP.

## Were the screen's own explanations enough?

For everything I did, yes. I did not meet a single "Not on the list" note in this run except the ladder one I already knew. What the screen does not explain is anything about value or purpose, and it does not warn before I mine a block my route depends on.
