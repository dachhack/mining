# Playtest: Cautious, seed 11

- Interface: text
- Engine version / commit: 0.2.0 / 8f0001a
- Outcome: salvage (left from the surface at shift 18 with 5 raw copper ore, 4 raw iron ore, 1 timber, 6 ladders; health 10/10, fuel 7, lamp oil 0)
- Shifts played: 18
- Deepest layer reached: 10
- Replay: `Final state hash: e908a340b409fbd2`, `Outcome: salvage (left)`, matches the log (91 choices)

This was my first run of the round. I had read the design doc and the `--help` text and nothing else.

## What I was trying to do

Start: take the timber next to the start, then dig one ladder shaft straight down, never mine my own floor without a ladder in my cell, and turn round with enough fuel to climb out. The only coal on the top layer was 13 or more moves away (x9 y10, and a cluster at the north edge), so I decided not to walk for it and to treat the 24 fuel as the whole budget.

It changed at shift 4, when the end-of-shift line first said "lamp oil 3 -> 2". From that I worked out that oil burns 1 every 4 shifts and that the lamp would go out at the end of shift 12. With no coal I could not prevent it, so the plan became: be standing next to something worth mining when it goes out, try the dark for two or three shifts close to my ladders, then leave.

## Key moments

- **Shift 1–2.** Mined three timber-roots on layer 0 from the surface (x15–16 y13–14), dropped into the hole and cut one step to layer 1. I expected to need a ladder to get out of layer 0; I did not, a step up was offered.
- **Shift 4.** "If you end the shift now: ... lamp oil 3 -> 2." This one line was how I learned the burn rate. The help only says "a little every few shifts". I trusted the preview from then on and it was always right.
- **Shift 5.** Mining the floor at layer 5 showed "You notice mineral traces" on the single block under my shaft (x16 y13, layer 6); the eight blocks around it on layer 6 were drawn as plain dirt and stone. I reasoned: ore within 2 of that block but more than 2 from all its neighbours means ore straight below on layer 8. I felt clever.
- **Shift 6.** Standing on layer 6, the block to the west (x15 y13) now read "Dirt, mineral traces". One shift earlier the map had drawn that same block as plain "d". So a block I know but that my light has not touched shows no traces, and my shift-5 reasoning was built on blocks that only looked clean. The copper did turn out to be straight below (and west and north-west of that), so I was right by luck.
- **Shift 7.** From the ladder on layer 7 I saw three copper ore on layer 8 and mined all three from the ladder over shifts 7–8 without leaving it. This was the best moment of the run: the traces had promised something two shifts earlier and delivered.
- **Shift 9–10.** Two more copper (x14 y12 layer 8; x15 y13 layer 9). After that every block around me had traces, including blocks next to ore I had already taken, so the traces stopped telling me anything.
- **Shift 12.** Last lit shift. The block west of my second shaft on layer 10 was drawn "%"; the list called it "Hard rock, mineral traces" at 3 AP. Mining it showed iron ore one cell further west. I stepped next to it and ended the shift on purpose so the lamp would go out with the iron already known.
- **Shift 13 (lamp out).** The header changed to "LAMP IS OUT: you know only the six cells touching yours...". I could still mine the iron I had seen, and walk into the cell it left (I had seen its floor while lit). From there I felt a second iron ore to the west by touch and mined it.
- **Shift 14.** "Not on the list: No move west: you have not seen what is under that cell. A ladder in that cell would hold you." I placed a ladder west and stepped onto it. From that ladder I could feel iron west, below and above. This felt good: slow, one cell at a time, and the game told me exactly why and what would fix it.
- **Shift 15.** Pack at 19/20 after the fourth iron. Walked back (three known cells) and climbed. Left at shift 18 with 7 fuel.

## How it ended

Alive, by choice. I left because the pack was nearly full (19/20), the lamp was out and I had no coal to relight it, and the climb was 14 AP. I had 7 fuel left, so I had about four spare shifts.

## Confusing

- **Shift 5 vs shift 6:** a block I already know can gain traces later when my light reaches it. The help says "You notice them only on rock your light touches", but the map draws known-but-unlit rock exactly like rock that has been lit and has no traces, so I read absence as information when it was not.
- **Shift 9 onward:** traces stay on rock next to ore I have already mined. I could not tell "ore still near" from "ore was near". At shift 10 the newly seen block below me (x15 y13 layer 10) showed traces after I had mined everything I knew about; that one was real (iron two cells west), but I only found it by digging on a guess.
- **Shift 12:** "%" on the map hides what kind of rock it is. I expected stone (2 AP) and it was hard rock (3 AP); only the action list says. It left me 2 AP instead of 3, which is why I could not mine the iron while the lamp was still lit.
- **Shift 13:** the header says "No diagonal mining", but the list still offered mine-ne, mine-se, mine-sw-down and others, because I had seen those blocks earlier. The help text explains this ("plus anything you saw earlier"); the header contradicts it.
- **Lamp oil rate:** never stated as a number anywhere I could read. I learned it from the preview line at shift 4.
- I never learned what fuel is, in the fiction. It is a countdown to the end of the run that I could do nothing about on this seed.

## Tedious or automatic

- Shifts 3–7 and 10–11: ladder-here, mine-down, down, repeated. There was one sensible move each time. I looked at each view and nothing in them asked for a decision until the first "%" at shift 5.
- Shifts 15–18: the climb. Thirteen "up" and "e" choices with nothing to decide.
- Stone is dead weight (2 each) with no use I could find: supports can be crafted but not placed. I dropped it every time.

## Interesting

- Deciding at shift 12 where to be standing when the light went. I had 2 AP and chose position over one more block.
- Working by touch at shifts 13–15. Each ladder placed bought exactly one more cell of knowledge. It was the only part of the run where I thought before every action.
- Whether to walk 13+ moves for surface coal at shift 2. I said no, and it shaped everything: no torch, no oil, a fixed 24-shift run. I do not know whether that was right.

Not tested, because the persona would not: falling. I never mined my own floor without a ladder and never lost health, so I have nothing to say about fall damage.

## Possible bugs

- **Shift 15:** I mined the iron under my ladder at x12 y13 layer 10 in the dark. The message said "1 Stone fell 1 block to layer 11" and the map marked the stone at layer 11. That tells me there is a floor under layer 11 at that spot. In the same view: "No climb down: you have not seen how far the drop under the cell below goes." The game told me the answer and then said I did not know it.
- **Shift 13:** header "No diagonal mining" while diagonal mine choices are on the list (see Confusing). Probably wording, not rules.
