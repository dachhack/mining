# Playtest: newcomer, seed 11

- Interface: text
- Engine version / commit: engine 0.1.0 / 1add9f7
- Outcome: salvage (left the cube alive carrying 5 Stone and 1 Timber)
- Shifts played: 22
- Deepest layer reached: 17

This was my first run. I had read only `npm run play -- --help`.

## What I was trying to do

From the help text I took the goal to be: "Dig down, collect what the rock gives, and come back up." I did not know what was worth collecting, how much of it made a good run, or how deep I was meant to go. The game itself never told me any of the three. My plan at the start was simply: grab the timber I could see next to me, dig straight down, and see what turns up.

How it changed:

- Shift 9 (layer 9): I was carrying 6 Stone (12 of my 20 carry) and nothing else from the rock. I started to wonder whether Stone was the thing to collect. Nothing on screen said so, so I dropped it.
- Shift 13 (layer 13): still only Stone and Hard rock in view. I suspected ore existed (the help says "different ores lie deeper") but that my shaft was missing it.
- Shift 18 (layer 17): fuel 8, lamp oil 2, one timber left. I gave up and went home.

I never worked out what a good run is. The end screen said `Shifts played: 22 | Deepest: layer 17 | Health 10 | Fuel 5` and "salvage", with no score and no word on whether what I carried was worth anything.

## First twenty actions: what I expected and what happened

| #   | Shift | Action                                          | Expected                                                         | Result                                                                                                                                                                                                                                                                                              |
| --- | ----- | ----------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 1     | Mine north, one layer down (Dirt)               | A hole north of me, nothing gained                               | As expected                                                                                                                                                                                                                                                                                         |
| 2   | 1     | Move north, drop 1 block                        | Land on layer 0 unhurt                                           | As expected. The view grew a third panel (layer 1), mostly `?`                                                                                                                                                                                                                                      |
| 3   | 1     | Mine north: Timber-root                         | +1 Timber                                                        | As expected                                                                                                                                                                                                                                                                                         |
| 4   | 1     | Move north                                      | Stand in the hole I just made                                    | As expected                                                                                                                                                                                                                                                                                         |
| 5   | 1     | Mine north: Timber-root                         | +1 Timber                                                        | As expected                                                                                                                                                                                                                                                                                         |
| 6   | 1     | End the shift                                   | 5 AP again, fuel 24 to 23                                        | As expected                                                                                                                                                                                                                                                                                         |
| 7   | 2     | Mine north-west: Timber-root                    | +1 Timber                                                        | As expected                                                                                                                                                                                                                                                                                         |
| 8   | 2     | Typed 20, meaning "Place a ladder in your cell" | Ladder under my feet                                             | **Wrong.** I had sent `--do 10,20`. After the first action the list was one line shorter, so 20 was now "Place a ladder in the cell north". The ladder went into an empty hole I had no use for, and there is no action to take a ladder back. The help warned about exactly this; I did it anyway. |
| 9   | 2     | Place a ladder in your cell                     | Ladder in my cell                                                | As expected. "Mine below you" changed from "you will fall 1 block or more; below that is unseen" to "your ladder holds you, you will not fall"                                                                                                                                                      |
| 10  | 2     | Mine below you (Dirt), on the ladder            | Stay put, and see down the hole                                  | Stayed put. I saw only the one cell I had opened; I had hoped to see further down                                                                                                                                                                                                                   |
| 11  | 2     | Place a ladder in the cell below                | Needed before I can climb down                                   | It worked, but it was not needed yet: "Climb down the ladder to layer 1" was already on the list before I placed it                                                                                                                                                                                 |
| 12  | 2     | End the shift                                   | Fuel 23 to 22                                                    | As expected                                                                                                                                                                                                                                                                                         |
| 13  | 3     | Climb down the ladder to layer 1                | On layer 1, on a ladder                                          | As expected. Surprise: "Step up north to layer 0" was on the list. I had read the step-up rule as being about getting onto the surface                                                                                                                                                              |
| 14  | 3     | Mine below you: Stone (2 AP)                    | +1 Stone, stay on the ladder                                     | As expected. Stone weighs 2                                                                                                                                                                                                                                                                         |
| 15  | 3     | Place a ladder in the cell below                | Ladder below                                                     | As expected                                                                                                                                                                                                                                                                                         |
| 16  | 3     | Climb down to layer 2                           | On layer 2                                                       | As expected                                                                                                                                                                                                                                                                                         |
| 17  | 3     | End the shift                                   | Fuel 22 to 21                                                    | As expected                                                                                                                                                                                                                                                                                         |
| 18  | 4     | Mine east: Dirt                                 | Open cell east                                                   | As expected                                                                                                                                                                                                                                                                                         |
| 19  | 4     | Mine east, one layer down: Dirt                 | A step down to the east                                          | As expected                                                                                                                                                                                                                                                                                         |
| 20  | 4     | Move east, drop 1 block to layer 3              | A stair instead of a ladder, with "Step up west" as the way back | As expected: "Step up west to layer 2" was on the list                                                                                                                                                                                                                                              |

Nineteen of twenty did what I expected. The one that did not was my own typing.

## Key moments

- **Shift 2, layer 0.** The wasted ladder (action 8 above). I started with 6 ladders, so this was one sixth of them.
- **Shift 3, layer 1.** Seeing "Step up north to layer 0" taught me that a staircase needs no ladders. I used stairs for layers 2 to 4 and 5 to 6 and ladders for the rest.
- **Shift 4, layer 3.** I had 1 AP left and wanted "Mine south: Stone". It was not on the list. It took me a moment to remember that an action I cannot afford is simply missing, and that I had to end the shift.
- **Shift 6, layer 4.** The end-of-shift line read `5 unspent AP banked (counter 1 -> 0), fuel 19 -> 20 (-1 shift +2 refund)`. So doing nothing for a shift would have left me with more fuel than I started it with. I did not act on it in this run, but from here on I did not believe fuel could really kill me.
- **Shift 6, layer 5.** Out of ladders. I crafted 3 from 1 Timber on shift 7.
- **Shift 7 to shift 17, layers 6 to 17.** One layer per shift, the same three or four actions each shift: place a ladder in my cell, mine below, climb down. The map was a 3 by 3 column (x 17..19, y 14..16) for the whole descent. It showed Stone, then Hard rock from layer 8 (3 AP, "gives 1 Stone"). No ore, no coal.
- **Shift 9, layer 9.** Carry 15/20, of which 12 was Stone I had not chosen to pick up. I dropped all 6. From then on the pile followed me: every time I mined the block under it the log said `6 Stone fell 1 block to layer 10`, and each new view said `Loose in your cell: 10 Stone`.
- **Shift 18, layer 17.** Fuel 8, lamp oil 2, 1 Timber. I tunnelled one cell west to see something other than my column. More Stone and Hard rock. I turned back.
- **Shifts 19 to 22.** Climbed out: 12 ladder cells, a step, a ladder, two steps, two ladders, a step. Left on shift 22 with fuel 5.

## How it ended

I chose to leave. I was not in danger: health 10, fuel 5, and the way up was complete. I left because eleven shifts of digging had shown me nothing but Stone, and I had no way to tell whether ore was two cells to the side or ten layers further down.

## Confusing

- **What am I collecting, and is it worth anything?** (whole run) The help says "collect what the rock gives". The rock gave Stone and Timber. Nothing tells me whether Stone has value. I carried 5 Stone out without knowing if that was the point or a joke.
- **What is a good result?** (shift 22) "salvage" is the only word I got. I do not know what the other outcomes are, or how to get one.
- **Where is the ore?** (shifts 7 to 18) Underground I only ever saw the cells touching my shaft. I had no hint of any kind (no texture, no message, nothing under "Hazards") of what lay one cell further out.
- **The map shrinks.** (shift 4) On the surface the map was 9 by 9. At layer 2 it became 3 columns wide. For a moment I thought the game had forgotten what I had seen higher up; it had only trimmed the unseen cells.
- **Step up.** (shift 3) I misread "Step up one block onto the rock beside you" as a way to reach the surface only. The action list corrected me.
- **Ladder below before climbing.** (shift 2) I thought I needed a ladder in the cell below before I could climb down. I did not; I spent a ladder early on each of the first three layers.
- **"You will fall 1 block or more; below that is unseen."** (shifts 1 to 5) I never took this action in the whole run. "Or more" next to a rule that six blocks kills was enough to make me always place a ladder first.
- **Banked AP.** (shifts 1 to 6) It took me six shifts of reading `counter 0 -> 2` and `-1 shift +1 refund` to understand it. Once I did, it looked like free fuel for standing still.
- **Lamp oil.** It went from 6 to 1. I never saw what it was doing for me. In a one-cell shaft I could not tell what the lamp showed that I would not have seen anyway.
- **"Hazards: none known"** was on every view. I never learned what a hazard is other than a fall.
- **Craft Support** was on the list every turn once I had Stone and Timber, although the help says supports cannot be placed.

## Tedious or automatic

- Shifts 7 to 17 were one move repeated: ladder, mine below, climb down, end shift. I made no decision in those eleven shifts apart from dropping Stone on shift 9 and shift 13.
- Shifts 19 to 22: "Climb up" twelve times, then retracing my own stairs.
- From shift 7 on, every view listed sixteen "Mine ...: Stone, gives 1 Stone" lines that I had no reason to choose between.

## Interesting

- Shift 3 to 4: choosing between a ladder shaft and a staircase once I saw stairs were free of ladders. That was a real choice for about two shifts, until everything around me was Stone at 2 AP and the two cost the same.
- Shift 18: whether to spend my last spare shifts going deeper or sideways. I had nothing to base it on, so it was a guess rather than a decision.

## Did fuel, lamp oil, carry weight, ladders or timber limit me?

- **Fuel:** it set the moment I turned back (shift 18, fuel 8, four shifts from the surface). It never stopped an action.
- **Lamp oil:** no effect that I could see.
- **Carry weight:** only through Stone I did not want. I dropped it for free on shifts 9 and 13.
- **Ladders:** ran out on shift 6 at layer 5; one of the six was wasted by my typing.
- **Timber:** I began with 2 and found 3 beside the start. That made 15 ladders, and I reached layer 17 with 1 Timber left. Timber decided how deep the shaft could go.

## Possible bugs

- Shift 6: ending a shift with all 5 AP unspent raises fuel (`fuel 19 -> 20`). This follows the rule in the help (3 banked AP make 1 fuel), but it means a player who waits never runs out of fuel. I report it because the help says running out of fuel is one of the two ways to die.
- Nothing else looked like the game breaking its own rules.
