# 0037 — T14: phone map, tells, forecast and play tool polish

Date: 2026-11-20. Status: accepted for the code as it stands (issue #110, task T14 of decision note 0025; it reworks issues #56 and #68 and takes the notes that the reviews of PRs #87, #97, #98, #101, #102, #105, #106 and #109 left for it). It changes no game rule: `STATE_VERSION` and `ENGINE_VERSION` stay as they are and no golden hash changed. Everything here is in the two views (the phone screen and the play tool), with one data rename and one test hook. The choices an owner might want to change are question 127 in `docs/owner-questions.md`; questions 95, 125 and 126 were updated or added.

## Context

After T13b every rule of design doc v0.2 was built, and every one had some mark on the phone map, added a task at a time. Seen together at 390 × 844 they did not read: the map began more than half-way down the first screen; a tick sat on some 80 squares round a camp; three kinds of number on a square were the same white digits; the hazard tells of design doc 3.7 had no mark at all (they were a line of text); and the text under the map named squares as "x17 y12" on a map with no coordinates, and named play-tool commands nobody can type on a phone.

## The phone map

One rule for every mark: it differs from every other in colour **and** in shape, it is drawn with a dark edge so that it shows on any rock, and the legend under the page explains each one that is on screen.

| What                               | Mark                                                   | Before                                           |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Damp stone (water under or beside) | two blue drips from the top edge                       | text only                                        |
| Pitted rock (gas under or beside)  | three dark pits with a pale rim                        | text only                                        |
| Warm glow (lava within 2)          | three orange heat lines rising from the bottom edge    | text only                                        |
| Hairline glow (unstable ore)       | a thin pale ring round the ore's cross                 | text only                                        |
| Worked this shift (question 95)    | four white corners                                     | not marked                                       |
| Mining is cheaper (a camp is near) | one dashed green line round the area, drawn over water | a green tick on every square, hidden under water |
| Depth                              | a plain white number, bottom right                     | the same                                         |
| Units of water, of lava            | a number in a blue, or a dark red, badge, top left     | plain pale digits                                |
| A lava source                      | a bright ring round its badge, inside the square       | a ring that spilled onto the squares beside it   |
| A crack's countdown                | a number in a red badge, top right (grey when stopped) | plain red digits                                 |
| Gas                                | a wash and bubbles, no number                          | a number that flipped by one every shift         |
| Water flows here                   | a round blue drop with a white edge                    | a pale drop, a speck on the whole map            |
| Lava flows here                    | an orange flame with two tongues and a yellow heart    | a pale triangle, the shape of the camp's tent    |
| Gas spreads here                   | three bubbles, no wash                                 | one ring                                         |

- **Order.** A square is drawn from the bottom up: rock, tells, a camp, what stands on it, the cheaper-area line and the worked corners, traces and scan marks, a structure or a charge, what is coming, the blast frame, and last the crack and the number badges, which nothing covers.
- **The whole-map zoom.** Below 16 pixels a square the numbers are left out (they cannot be read) and the "coming" marks are drawn bigger. Colour and shape still tell each mark apart there.
- **Gas has no number** (question 127a). The rules read only whether a square is gassy; settled gas swaps a unit between level squares every shift (question 120), so the number flickered and said nothing. Inspect, or a hold, says the units.
- **Rulers.** A strip along the top and one down the left name the squares' x and y (every square at the default zoom, every fifth on the whole map), so "x17 y12" in the text can be found. The squares start 14 pixels in; the canvas says so in `data-origin-px` for the tests.
- **Where the map opens** (`openingSquare`). On a new or resumed run: the middle of the dug squares; with nothing dug, the open-ground coal nearest the middle of the map (design doc 3.2 promises one); failing that the nearest open ground. It reads depths, trees and seen top blocks only.
- **The page.** The map comes first, right under the gauges, so that it is on the first screen. The tool bar moved under the map (in reach of a thumb, and it no longer pushes the map down); its buttons are shorter ("Support (2)"). The zoom buttons share a line with the label.

## The text

- **The forecast is a list**: one line for each thing that will happen when the shift ends, the most dangerous first. The order is a table in `describe.ts` (`FORECAST_RANK`): the run ending; the crew hurt or a camp lost; explosions; slumps; lava; water; gas; things destroyed; new cracks; good news (pumps, vents, rest, regrowth); the fuel. It is presentation, not a rule, so it lives with the views. The sentences are the ones the views already had. `PlayerView.forecastLines` holds them; `forecast` is the same lines joined.
- **The Hazards list** has one line for each hazard. A running crack is "due at the end of this shift", not "falls": an earlier slump of the same end of shift can fill the hole first, and the forecast's "THE PIT WALL SLUMPS" names the ones that will fall. After the countdowns it says how many squares water, lava and gas stand on, so that a pit with gas in it never reads "Hazards: none known".
- **A full lava source** is one sentence ("is full to ground level: the 1 lava it pours will drain away") where there were two that read as a contradiction.
- **The phone's own wording.** `buildView`, `describeEvents` and `tooLittleApNote` take an `audience` (`'playTool'`, the default, or `'phone'`). On the phone: the camp note and the line after founding a camp name the buttons under "Other actions", not `rest 17,12`; mineral traces are "three gold dots", not "D, % or h"; a choice that costs too much AP is named by its button ("Craft Support (2 AP)"); the small print of a button is its cost, without the typed name. The phone's notes leave out what its map draws (what stands on a square, tells, pumps, vents, the cheaper squares). Refusals that named a craft command now name the recipe as both views list it ("Craft Support" on the list of actions).
- **The play tool** prints the same two lists, a heading and one indented line each, and its help says so. Its tells keep their short names in sentences ("Stone, damp"); the note under its map ties them to the design doc's names ("damp: damp stone, ...").

## Data, tests and CI

- **`HAZARDS.lava.flowMinDrop`** (2). Lava read `HAZARDS.water.flowMinDrop`; it has its own entry now, with the same value and the same limit in the validator. No hash changed.
- **A prepared state** (`PREPARED_KEY` in `previewSession.ts`). If the browser's storage holds a serialised state under that key, the screen opens on it instead of on the saved run, says so, and saves nothing; "New run" and "Restart" remove it. Nothing in the game writes it. It lets an e2e test reach what a short played run cannot (a camp, a tool, the vent), and it is how the screenshots are made: `tests/e2e/showcase.ts` draws one state that holds every mark.
- **e2e:** fingers drag and pinch the map (sent through the browser's touch input); the vent path on the prepared state; every mark, its legend entry and the forecast's order on the prepared state. **Unit:** the new tile fields, the opening square, the forecast's order, the phone's wording, and the tells data table (issue #88 item 5).
- **CI** keeps the Playwright browser in a cache keyed by the Playwright version, and installs Chromium's system packages only if the browser does not start.

## Not done here

- The crew's danger is forecast for explosions only (as before). Whether a slump, water, lava or gas will hurt the crew is shown by the worked corners on the map, not by a line of the forecast: that needs the engine's forecast to report the damage, which is an engine change.
- The secondary 3D view of design doc 11 is M3.
