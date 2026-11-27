# 0072: No crew health, no rest; mushrooms told only in sight; the map's buttons in a row

The owner, after the 0.22.0 build:

- "We don't need crew life anymore. Let's scrap that and the resting."
- "Only tell me about a mushroom if it is in range of a camp. Make the stem
  of the mushroom shorter and place it at random positions in the square.
  Let's have like 7 versions of the mushroom icon."
- "Let's make the place, recipe, contract buttons horizontal across the top
  and a bit larger. Let's also change the look of the contract button when
  one is fillable like we had previously."

Asked what unpaid upkeep should do once health is gone, the owner chose
**fewer taps next shift**.

- `health`, the `rest` action and the 'lost' status are gone from the
  engine (FRONTIER_STATE_VERSION 25). Each item of upkeep that End shift
  cannot pay takes `FRONTIER_SHIFT.tapsLostPerUnpaid` [Default] 10 taps
  from the next shift, never below 0. A run ends only after its last shift
  or when the mine is closed. The shift report's `healthLost` became
  `tapsLost`.
- The idle policy can no longer lose, so its golden run is now
  `idle-seed-2-hungry`, and the golden coverage checks "hungry" (a shift
  with fewer taps) in place of "lost" and "rest". Every golden hash changed:
  the policies no longer rest.
- The night's mushroom line counts only the mushrooms that came up inside a
  camp's circle (`MushroomNight.seen`). The rest come up all the same.
- A mushroom's look (one of 7) and spot in its square come from a small hash
  of the square's number, in the renderer: fixed from frame to frame, and
  nothing in the game's state or generator. The inventory icon is the red one.
- The map's three buttons are a row of 42 px buttons, left to right Place,
  Craft, Contracts, as the owner named them. Without the ♥ in the HUD the
  row fits beside it at 320 px (decision 0071 had them in a column because
  it did not). A contract that can be delivered lights Contracts gold, as the
  old tray button was on a market day.
