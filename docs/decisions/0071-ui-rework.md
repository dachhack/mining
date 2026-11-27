# 0071: The UI rework

The owner's requests:

- "Let's rework the UI. Don't need the close mine button."
- "We do need: Three small buttons where close mine used to be: Contracts,
  Recipe book/Craft, Place button."
- "Inventory scroll bar - still at top."
- "Square Legend at bottom. Pinned bar above pinned bar."
- "When crafting, we need to show inventory."
- "When placing a camp, you should be able to drag the square around the
  map."

Asked, the owner chose: Place opens a tray of **everything placeable** (the
⛺, 🌱 and 🔨 buttons go into it), and the pinned bar sits **above the
legend**.

- The three buttons sit in a **column** down the map's top-right corner. In a
  row, at 320 px they ran into the HUD. They keep the old buttons' test ids
  (`lab2-goals`, `lab2-book`) so the tests and habits carry over. Place is
  `lab2-place-tool`.
- Close mine is gone from the screen. The engine's `close` action stays for
  saved runs and the tools. A run saved closed still opens closed.
- The tray's top row is just the pinned bar. The legend is below it.
- The recipe book's card has the store's chips in a row under its title,
  with their own test ids (`book-lab-res-…`).
- Dragging a camp: the map's gestures gained an optional "grab". A press
  that starts on the chosen 3 × 3 moves it, keeping the same square of it
  under the finger. A grab that does not move is a tap. A press anywhere
  else pans, as before. A middle square out of sight or on a camp is
  skipped.

No rule changed: the engine version stays 0.21.0.
