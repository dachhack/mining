# 0055: Undo replays the shift

Date: 2026-11-22. Plan: Lab 2 becomes the game (`docs/plans/lab2-becomes-the-game.md`), step A5. Replaces how note 0049 put changes back; what can be undone is unchanged (question 141).

- **How.** The engine keeps a shift log: the state the shift started from, and every action since that did something (`src/engine/frontier/undo.ts`). Undo leaves out the newest undoable action and plays the rest of the shift again from its start.
- **Why it is exact.** The world moves on only at End shift (A4), so nothing outside the player's actions changes during a shift. The replay gives back exactly the state as if the action had never happened, and its tap comes back with it.
- **What stays done.** Catching an animal and picking an apple are logged but never undone: they are played again, so they stay done (owner, question 141).
- **Within the shift only** (question 151). End shift, rest and closing the mine start a new log.
- **Lab 2's diff-based undo is gone.** It recorded each action's changed cells, counts, camps and plants (note 0049). The "an animal is standing where the tree was" refusal went with it: animals cannot move within a shift now.
