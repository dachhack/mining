# Playtest: greedy, seed 23

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface at shift 34, with fuel 0)
- Shifts played: 34
- Deepest layer reached: 20
- Carried out: 9 Raw iron ore, 1 Raw copper ore (pack 20/20), 6 ladders. Fuel left 0, health 10/10.
- Replay: `Final state hash: 9fc217fdea0acbda`, `Outcome: salvage (left)`, matches the log (179 choices).

## What I was trying to do

Second run. What I brought from seed 11: a ladder shaft goes down about one layer a shift; lamp oil drops by 1 every 4 shifts; coal is what limits everything; traces can be reasoned about; the dark is workable on ground I have already seen.

This time the surface map showed a coal seam 4 steps east of the start and timber-root right beside it. Plan: stock up on both, then go for crystal in the deep band (layer 20+), which I assumed is worth more than copper or iron (the game still does not say). The plan held until layer 20, where I found no crystal and fell back on iron.

## Key moments

- Shifts 1 to 5: 5 timber, then 5 coal (four from the surface seam, one under it on layer 1). I left two more coal blocks 2 steps north because fetching each cost nearly a shift.
- Shift 11 (layer 7): traces on two walls and the floor; copper showed at x19 y16 layer 8. Took it (2 AP).
- Shift 12 to 13 (layers 8, 9): three more copper in reach of the ladder. I left them for the way back to save AP for the descent. I never came back for them: the pack was full of iron first.
- Shift 16 (layer 12): two new traces, east and below. I worked out ore at x21 y15 layer 14 or x22 y15 layer 13.
- Shift 17 to 18 (layers 13, 14): iron at x21 y15 layer 14, as predicted, and a body of at least 12 iron blocks over layers 14 to 16 all round the shaft. Hard choice here: fill the pack now and be home by about shift 26, or carry on six more layers for crystal on a fuel budget with no slack. I went on.
- Shift 23 to 24 (layers 19, 20): traces north. No crystal in sight at layer 20.
- Shifts 25 to 26: tunnelled two blocks north on layer 20 through hard rock (3 AP each) after the traces. They led to an iron block over my head at layer 19, which I could not mine from below. Two shifts spent for nothing I could take.
- Shift 26: fuel 8, twenty layers down. Turned back.
- Shifts 28 to 31: mined 8 iron from the ladder on the way up, two a shift plus one climb. The lamp went out at the end of shift 28; it made no difference because every block I wanted had been seen already and stayed on the mine list.
- Shift 33: ended the shift at layer 2 with fuel 1. The preview said "fuel 1 -> 0" and nothing else.
- Shift 34: began with fuel 0 and 5 AP. Two climbs, one step up, leave. The preview now read "THE RUN ENDS: you ran out of fuel and died" if I ended the shift.

## How it ended

Alive, on the last AP-affordable shift. I planned the zero-fuel finish from shift 26 by counting AP, and it came out exactly; one unexpected 3 AP block on the way up would have left me either dead or dropping the last two iron.

## Confusing

- Still no ore values. I spent ten shifts and nearly all my slack going to layer 20 for crystal on the strength of the design doc's band table, not anything the game told me.
- Shifts 23 to 26: traces say ore, not which ore. In the deep band I read them as "crystal near" and they were iron one layer up, in the middle band. Also the ore was above me, where a pick cannot reach; the traces gave no hint of that.
- Shift 33: the "if you end the shift now" line for fuel 1 said only "fuel 1 -> 0". It did not say that the following shift would be my last. I knew from the help text that I could still act at fuel 0; a player who had not done the sum would learn it one shift later from the "THE RUN ENDS" line, possibly too deep to get out.
- The design doc says "Zero fuel at upkeep ends the run". In play, upkeep took my fuel to 0 at the end of shift 33 and the run went on; it would have ended at the end of shift 34. The help text describes what the game does; the doc reads differently to me.

## Tedious or automatic

- Shifts 6 to 24: nineteen shifts of mine-down, drop the stone, ladder-down, down. The only choices were which craft to spend the spare AP on, and in hard rock (5 AP a layer) there was no spare AP at all.
- Dropping stone after every block again. By layer 20 there were 17 loose Stone at the foot of the shaft.
- Shifts 32 to 34: twelve "up" in a row.

## Interesting

- Shift 17 to 18: iron now, or crystal maybe. The best decision of the run, because the fuel sum was close enough that I had to do it properly.
- Shift 26 onward: planning the return so that every shift was two iron and one climb, to land on the surface with fuel 0. Satisfying to get exactly right.
- Splitting 5 coal between fuel (3 shifts each) and lamp oil (8 shifts of light each). I gave 2 to the lamp and that was the right call: light mattered on the way down, not on the way up.

## Possible bugs

- None seen. Health never changed in this run either: the ladder shaft never puts me in a fall.
