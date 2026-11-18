# Playtest: newcomer, seed 37

- Interface: text
- Engine version / commit: engine 0.1.0 / 1add9f7
- Outcome: salvage (left the cube alive carrying 3 Stone)
- Shifts played: 37
- Deepest layer reached: 17

This was my third run.

## What I was trying to do

On seed 23 I filled my pack with iron at layer 14 and went home without knowing what was below. This time I meant to go deeper than 14, see what the next ore was, and bring that back.

What I did differently from seeds 11 and 23, and why:

- **Started with `--radius 16` again** to find timber and coal on the top layer. It worked on seed 23.
- **Took less from the surface.** 6 Timber and 3 Coal, because last time I threw 8 Timber away and never ran short of fuel.
- **Read the map after every layer**, because on seed 23 I walked past copper.
- **Tunnelled sideways** when the shaft showed nothing, because on seed 11 I only went down and found nothing.
- **Tried resting on purpose** to see whether the fuel refund I noticed on seed 11 was real.

None of it found ore. The plan collapsed on shift 20 at layer 14 into "look anywhere", and on shift 31 into "get out".

## Key moments

- **Shifts 1 to 7, surface.** 5 Timber from two standing spots, a 9-cell walk west, then 1 Timber and 3 Coal around x10 y13. Seven shifts before I went underground.
- **Shifts 7 to 20, layers 0 to 14.** Shaft at x9 y14, one layer per shift. Timber-root showed on layers 2 to 4; I had enough and left it. From layer 7 down the map showed only Stone and Hard rock.
- **Shift 20, layer 14.** Fuel 8, 1 Coal, lamp oil 2. This was the depth where seed 23 had iron. Nothing here. I decided to tunnel east rather than keep going down.
- **Shifts 21 to 28, layer 14.** Eight cells east, x10 to x17, about one cell per shift (2 or 3 AP to mine, 1 to move). The tunnel showed me a strip three cells wide on layers 13, 14 and 15. All Stone and Hard rock.
- **Shift 24.** `Lamp oil -1 (the shift), now 0. The lamp is out.` I was holding a Coal that would have made 2 oil. The gauge then read `Lamp oil 0 (lamp is out: you see only one step around you)`. **The map looked exactly as it had the shift before.** On shift 25 I turned the Coal into fuel instead, since the dark had cost me nothing.
- **Shift 28.** I ended the shift with 4 AP unspent to test the refund: `Fuel +2 (banked AP), now 10 ... Fuel -1 (the shift), now 9`. Fuel went from 8 to 9 for doing nothing.
- **Shifts 29 to 31, layers 15 to 17.** A second shaft at x17 y14. Layer 18 below it was Hard rock on every side.
- **Shift 31, layer 17.** Fuel 7. I counted 26 AP to the surface, which is six shifts. I picked up 3 Stone so as not to leave empty-handed, and went.
- **Shifts 32 to 37.** Three ladders, eight cells of tunnel, fourteen ladders, one step. Left on shift 37 with fuel 1.

## How it ended

I chose to leave. Fuel was 1 when I stepped onto the surface, so one more shift underground would have ended the run. I had counted it and it came out as I counted. The line "If you end the shift now" let me check each shift, and I trusted it.

I could trace the empty pack to no decision of mine that I could name. I dug where there was coal on top, went as deep as on the run that found iron, and looked eight cells sideways.

## Confusing

- **Three runs, and I still cannot say where ore is likely to be.** Seed 23 had copper at layers 8 to 9 and iron at 14 to 15, both touching my shaft. Seeds 11 and 37 had nothing touching 17 layers of shaft, and here nothing along 8 cells of tunnel. I do not know whether ore is rare and seed 23 was luck, or common and I dug in two bad places. Nothing in the game hints either way.
- **The lamp.** (shift 24) It went out and I could not find a difference on the map. In a shaft or a one-cell tunnel, "one step around you" is all there is to see anyway. After three runs I do not know what lamp oil is for.
- **Fuel.** (shift 28) The help says the run "ends in death if you ... run out of fuel". But a shift spent standing still gives back more fuel than it uses. I did not know whether I was meant to do this. It felt like cheating, and waiting five or six shifts to gain three fuel would have been very dull, so I did it once and then went home on what I had.
- **Is there any goal beyond leaving alive?** The replay tool printed "contract none" for my log. I do not know what a contract is; the play screen never mentioned one.
- **"Hazards: none known"** was on every view of all three runs. I have never seen a hazard.

## Tedious or automatic

- Shifts 8 to 20: thirteen shifts of ladder, mine below, climb down. Third run of it.
- Shifts 21 to 28: mine east, move east, end shift. Eight shifts, nothing found, nothing to decide.
- Shifts 32 to 37: the walk home, six shifts with no choice in them.
- That is 27 of 37 shifts in which there was one sensible move.

## Interesting

- **Shift 1:** planning the surface walk for timber and coal: how far is worth walking for three coal. I liked this part on both runs where I did it.
- **Shift 20:** down or sideways. A real question, but as on seed 11 I had no information to answer it with.
- **Shift 31:** counting AP to the surface against fuel, with one shift to spare. It was the only tense moment in three runs.

## Did fuel, lamp oil, carry weight, ladders or timber limit me?

- **Fuel:** yes. It was the reason I stopped at layer 17 on shift 31. I burned all 3 Coal for 9 fuel and rested once for 1 more. I left with 1.
- **Lamp oil:** it ran out on shift 24. Nothing changed that I could see, so I did nothing about it.
- **Carry weight:** no. I had nothing to carry.
- **Ladders and timber:** no. I left with 11 ladders unused.

## Possible bugs

- **Shift 28:** resting with 4 unspent AP raised fuel from 8 to 9. As on seed 11 this follows the written rule, but it means fuel cannot run out for a player who is willing to wait.
- **Shift 24:** the lamp going out changed nothing on the map I was shown. The rule says I see "only one step around you"; in a tunnel that may simply be the same cells, so this may not be a bug. I report it because the gauge announced a penalty and I could not find one.
- Nothing else looked like the game breaking its own rules.
