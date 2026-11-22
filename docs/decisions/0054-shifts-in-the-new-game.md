# 0054: Shifts in the new game

Date: 2026-11-22. Plan: Lab 2 becomes the game (`docs/plans/lab2-becomes-the-game.md`), step A4. Owner's answers: questions 145 to 152.

- **Taps.** A shift has 10 taps ([Default], `FRONTIER_SHIFT.taps`). Every action that does something costs 1: mining, cutting grass, felling a tree, picking an apple, catching an animal, and placing, upgrading or demolishing a camp. A tap that does nothing (fog, too steep, too hard) costs nothing. With no taps left, every action is refused until End shift.
- **End shift**, in this order:
  - each animal takes 3 steps, and every 3rd shift a new one walks in at the edge while there are fewer than 8;
  - an apple tree picked bare regrows 5 shifts later;
  - upkeep is paid: 1 wood every shift, 1 food every 2nd shift (apples first, then animals), and 1 more wood every 4th shift per camp after the first;
  - each item of upkeep that cannot be paid costs 1 health. At 0 the run is lost.
- **Rest** restores full health, then ends the shift (question 156, assumed).
- **Close mine** ends the run. On screen it takes two taps, so it isn't pressed by accident.
- **Undo** works within the shift only. End shift empties it. Undoing an action gives its tap back (question 151).
- **Lab 2's clock is gone.** Animals move and apples regrow only at End shift. Lab 2's world is the engine's state, field for field (`toFrontier` and `fromFrontier` in `src/app/lab/campWorld.ts`), and every action goes through the engine's `frontierAct`.
- **Saving every shift** (question 152) comes with the switch to the new game (B1). Lab 2 still does not save.
