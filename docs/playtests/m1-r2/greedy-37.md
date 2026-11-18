# Playtest: greedy, seed 37

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface at shift 52)
- Shifts played: 52
- Deepest layer reached: 24
- Carried out: 5 Crystal, 7 Raw iron ore (pack 19/20), 3 ladders. Fuel left 6, health 9/10.
- Replay: `Final state hash: 7755fd2612d8fd68`, `Outcome: salvage (left)`, matches the log (262 choices).

## What I was trying to do

Third run. What I brought from seeds 11 and 23: coal decides how deep I can go, and it is all visible on the surface map at shift 1; timber decides how deep the ladders reach; a shaft is one layer a shift; traces do not say which ore; seed 23 failed to find crystal at layer 20 because it arrived with no fuel to look around.

So this time I spent the opening on supplies: 5 timber near the start, then a walk of 14 steps east to the largest coal patch on the map. Then one shaft to the deep band with enough fuel left to search. The plan held all the way.

## Key moments

- Shifts 1 to 3: 5 timber from two patches north of the start.
- Shifts 3 to 6: walked the surface to x26 y16. Fourteen move actions with nothing to look at.
- Shifts 6 to 15: 16 coal from two patches at the east edge, some of it one layer down under the first blocks. I started the shaft at x30 y14, one cell from the cube's edge, because that is where the last coal was.
- Shift 12: I let the lamp go out by miscounting the oil tick (the preview did say "1 -> 0"; I was chaining actions and did not read it). One craft on shift 13 relit it. No harm, but the placing of a ladder north and the step onto it were done in the dark.
- Shifts 16 to 36: the shaft, layers 1 to 22. I passed iron at layers 9 and 14 to 15 and left it for the return.
- Shift 35 (layer 21): three traces at once: north wall, west wall, floor; east and south plain. I tried to place one ore block that fitted all of them and could not, which puzzled me.
- Shift 36 (layer 22): three Crystal showed on layer 23, each exactly 2 below one of the three marked cells. The traces were right; my assumption of a single block was wrong.
- Shifts 37 to 42: mined 5 crystal (3 AP each), following the vein west and north and down one layer to 24. Crystal weighs 1, half of an ore.
- Shift 43: spent a shift on a probe one block further west. The fresh rock there showed no traces, so I took the vein as finished and left.
- Shifts 46 to 50: 7 iron from the ladder on the way up.
- Shift 52: on the surface with fuel to spare, I mined the dirt under my feet on purpose to see the fall rule. "You lost your footing and fell 1 block. You lost 1 health from the fall (now 9)." Stepped back up and left.

## How it ended

Alive with 6 fuel unused. I did not push the fuel this time: the vein ran out before the fuel did, and I had no trace I trusted to chase.

## Confusing

- Stale traces again, and here it cost me a decision. After the crystal was gone the whole area on layers 22 to 24 was covered in "%". I could not tell which marks were still true. The only test I found was to dig into unmarked ground and see whether new rock got marked (shift 43), at 4 AP a look.
- Shift 35: three separate traced cells with plain rock between them. The help says traces mean ore within 2 steps; I assumed one block and should have thought of several. Nothing wrong with the rule, but it was the one time the tell stumped me.
- Value, a third time. Crystal is half the weight of iron and costs 3 AP against 2. Whether 5 crystal and 7 iron beats 10 iron I do not know, and the end screen only lists the pack.
- The fall rule: in three runs I lost health only when I chose to, on the last shift, to see it happen. The list line before the action and the result line after it were both clear and they agreed. But as a rule it never touched my play: a ladder in my cell removes it completely, and ladders were never short.

## Tedious or automatic

- Shifts 16 to 36: twenty-one shifts of the same four actions. I ran them from one saved command line and read the result for traces. This is by far the largest part of the run and there was nothing to decide in it except which craft to make.
- Shifts 3 to 6 and the coal mining on shifts 6 to 15: slow but at least each coal block was a small choice (is it worth the steps).
- Crafting 16 coal took 16 AP, most of it one a shift in the spare AP of a shaft shift. In hard rock there was no spare AP, so coal sat in the pack as weight.
- The climb: 23 "up" actions over shifts 44 to 51.

## Interesting

- Shift 1, reading the surface map. Where the coal and timber lie set the whole run, and choosing the far, large coal patch over the near, small one was a real choice. I would not have seen it without two runs behind me.
- Shift 36: seeing "x Crystal" after 20 shifts of rock. A good moment, and it came from the traces at layer 21 making me pay attention.
- Following the vein block by block (shifts 37 to 42): each block mined lit the next one or two, and I had to pick an order that did not drop the floor out from under my route.
- Shift 42 to 43: stay and search with 9 spare shifts, or take the certain iron upstairs. I took one look and left.

## Possible bugs

- None seen.
- One thing to check against the design doc rather than a bug: I never used the health stat for anything. With 10 health and a 1-per-block cost I could have dug the last few layers without ladders if timber had run out, but then there is no way back up, so the option is not real.
