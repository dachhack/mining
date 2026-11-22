# 0049 — Lab 2: Undo

Date: 2026-11-22. Status: implemented (PR #128). The owner asked for an "Undo button" after playtesting the PR #126 build. The change is to Lab 2 only: no game rule, game data number or golden hash changes, and nothing under `src/engine` changed.

## What

- **The button.** A "↶ Undo" pill floats over the map's bottom-right corner, near the thumb.
  - It takes no room from the tray and never moves the map.
  - It is off (faded) when there is nothing to undo.
  - A square under the pill is covered, so a player drags the map a little to reach it.
- **What it undoes.** Each tap undoes the last action, as far back as the start of the world. An action is:
  - a tap that took or mined something;
  - placing a camp;
  - an upgrade;
  - a demolish.

  Taps that change nothing (fog, a refused or too-hard block, opening a panel) are not actions.

- **New world** clears the history. A prepared world (the e2e tests') starts with none.
- **The hint** says what was undone, e.g. "Undone: the tap at 16, 17." Undoing the last action adds "Back at the start."

## Animals and the clock (question 141, assumed)

Undo puts back the **whole** world as it was just before the action: blocks, items, camps, fog, and the surface too. That includes the animals, the apples and the lab clock. The screen sets its clock back to match, so time runs on from there. A caught animal is back where it stood.

The other choice was to keep the animals and the clock where they are now and restore only the player's part. That would not be exact:

- A caught animal would have to be put back somewhere it no longer stands.
- An apple tree's regrowth timer would be left half way.

Going back in time is simple, exact, and the same every time.

## How it works

The history (`src/app/lab/undoHistory.ts`) keeps the steps (`CampStep`), each with the lab time just before it.

A copy of the world before every action would cost too much memory on a phone: each dig copies the 32 × 32 × 32 cube, about 300 KB. So the history keeps a whole copy only every 20 actions. To undo, it starts from the nearest copy and plays the steps after it again (at most 19), each at its own lab time. The lab's rules are deterministic, so the result is exactly the world that was.

## Tests

- **Unit (`tests/app/undoHistory.test.ts`).** On seed 110, with 700 ms of lab time before each action so the animals move, the test plays more than 20 actions: taps that pay for a camp, placing it, and demolishing the first camp. It then undoes every one. Each time, the world matches the one before that action exactly: the cube's hash, depths, counts, camps, fog, features, apples, animals, the surface's random state and the clock. It also checks that undoing nothing gives nothing, and that new actions after an undo are recorded correctly.
- **E2e:**
  - Six taps, then three undos: the counts and lit squares match each time. Tapping the same square again does what it did the first time. Then undo back to the start, where Undo is off; New world also leaves nothing to undo.
  - A placed camp is undone: the camp, its cost and its light are back as they were.
