# 0049 — Lab 2: Undo

Date: 2026-11-22. Status: implemented (PR #128). Revised for the owner's answer to question 141 (PR #130). Lab 2 only: no game rule, game data number or golden hash changes, and nothing under `src/engine` changed.

## What

- **The button.** A "↶ Undo" pill floats over the map's bottom-right corner, near the thumb.
  - It takes no room from the tray and never moves the map.
  - It is off (faded) when there is nothing to undo.
  - A square under the pill is covered: the player drags the map a little to reach it.
- **What can be undone.** Each tap undoes the player's last undoable action, as far back as the start of the world. The undoable actions are:
  - digging a block;
  - cutting grass;
  - felling a tree (an empty apple tree too);
  - placing a camp;
  - upgrading a camp;
  - demolishing a camp.
- **What cannot be undone** (owner, question 141: "animal and apple harvest cannot be undone"):
  - Catching an animal and picking an apple never enter the history. Undo steps past them, and they stay done: no animal comes back to the map, and no apple leaves the counts or goes back on its tree.
  - Example: dig A, catch an animal, dig B, then Undo twice. That undoes B, then A, and the animal stays caught.
- **What undo never touches** (owner: "Leave animals alone", "Leave apples alone too"): the animals, the apples on the trees, the regrowth timers' running and the lab clock. Time never goes back.
- **New world** clears the history. A prepared world (the e2e tests') starts with none.
- **The hint** says what was undone, e.g. "Undone: the tap at 16, 17." Undoing the last action adds "Nothing more to undo."

## When undo says no

- **A tree under an animal.** A felled tree, or a tree a camp was built over, cannot come back where an animal now stands, because animals never stand on trees. Undo says "An animal is standing where the tree was. Undo again once it moves." and leaves the history as it was. This is the one clash between a harvest-era change and an earlier action. A dig can't clash, since an animal never stands in a dug square.
- **Counts going below zero.** If taking back what an action gave would leave a count below zero, undo refuses. It shouldn't happen: undo goes newest first, so anything that spent those items has been undone already, and harvests only add to the counts.

## Choices

- **A restored apple tree comes back as it was.** If the undone action removed an apple tree, by felling it or by placing a camp over it, undo puts the tree back with the apples and regrowth timer it had. Restoring what the player destroyed is part of undoing their change. No other apples are touched.
- **Timers that came due while the tree was gone.** If the timer came due in the meantime, the tree regrows at the next tick, because the clock was never turned back.

## How it works

For each undoable action, `src/app/lab/undoHistory.ts` keeps only what that action changed:

- the cells of the cube's arrays and their old values;
- the depths;
- what it added to or took from each count;
- the camps and next camp id before it;
- the squares it lit for the first time;
- the plants it removed.

Undo puts those back on the world as it is now, so the animals, apples, harvests and clock stay as they are. Each record holds only the few cells an action changed, so the history stays small on a phone. This replaces the first version's copies of the whole world plus replays.

## Tests

- **Unit (`tests/app/undoHistory.test.ts`).** On seed 110, with lab time passing so the animals move, the main test plays taps that pay for a camp, places it and demolishes the first camp, then undoes every action. After each undo:
  - the player's state matches exactly what it was before that action: the cube's hash, depths, blocks mined, camps, fog, plants, and the counts other than apples and animals;
  - the animals, apples, timers, harvest counts and clock are exactly what they were just before the undo.

  Other tests:
  - Dig, catch an animal, pick an apple, dig: only the digs are undoable, the catch and the pick stay done, and the player's state is exact after stepping past them.
  - A felled tree is not put back under an animal, and undo says why.

- **E2e:**
  - Taps are undone one by one, matching the model, past any harvests, until Undo is off.
  - Undoing while the animals move: they stay where they are, and the clock does not go back.
  - A placed camp is undone: the camp, its cost and its light.
