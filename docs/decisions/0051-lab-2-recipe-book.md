# 0051 — Lab 2: the recipe book row

Date: 2026-11-22. Status: implemented (PR #132). This comes from the owner's playtest of the PR #128 build. Lab 2 only: no game rule, game data number or golden hash changes, and nothing under `src/engine` changed.

## What the owner said

> "Let's revamp the 'what you are building' row. We need a recipe book on that line. You can go into the recipe book and select which item or upgrade you are gathering resources for. It then adds that item's icon and needed materials to that row in the UI. The row is scrollable horizontally."

To start with, the book holds New camp and the camp upgrades (to level 2 and to level 3).

## Which row

The tray's top row, the one showing what you are building: until now, the ⛺ New camp button, its cost chips (wood and grass as have/need) and "1 camp · or hold a lit square". The counter row at the top of the screen shows what you have, not what you are building, so it is unchanged.

## What

- **The row** is, left to right:
  - 📖, the recipe book;
  - the camp tool, a tent with a "+": tap it, then choose where on the map, as before;
  - the pinned recipes, in a strip that scrolls sideways, with a fade at its right edge.
- **The row has a fixed height,** so pinning and unpinning never move the map or the tray.
- **A pinned recipe** is a card showing:
  - its icon: a tent, with a gold tag for the level an upgrade makes;
  - each material it needs, as have/need, red while short, filled in as the player gathers;
  - an × to unpin it.

  Several recipes can be pinned.

- **A tap on a pinned card** goes to where that recipe is built:
  - New camp: the camp tool.
  - An upgrade to level N: the panel of a camp at level N − 1, if there is one; otherwise a hint ("No level 1 camp to upgrade yet.").
- **The book** opens in the tray. It lists each recipe with its icon, its name and its costs (have/need), and a Pin / Pinned ✓ button.
  - Its list scrolls inside the tray, so the tray never grows.
  - × closes it, and a tap on the map closes it and acts as a tap.
- **One source for costs.** The recipes (`src/app/lab/recipes.ts`) are made from `LAB_NEW_CAMP_COST` and `LAB_CAMP_LEVELS` in `src/data/labCamps.ts`. These are the same values the camp tool and a camp's panel use, so the book and the actions always agree. A unit test checks it.
- **Placing and upgrading** work as before, from the map, the camp tool and a camp's panel.

## Choices (question 143, answered)

- **New camp is pinned at first,** so the row starts out showing what it showed before the book.
- **Pins stay through New world and Undo,** because they are the player's plan, not part of the world.
- **Pins are saved** (owner, question 143: "Pins should save when you close the app"). They are kept in the browser's localStorage under `mining-game.lab2.pins` and come back when Lab 2 opens again.
  - Reading and writing are wrapped so a browser without storage still works; the pins then last until Lab 2 closes.
  - If nothing was saved, or what was saved cannot be read, the first pins (New camp) are used. Ids the book doesn't know are dropped, and each id counts once (`parsePins` in `recipes.ts`).
  - An empty list is kept, because the player unpinned everything.
- **The camp tool and the pinned New camp card are separate.** The tool is always there, even when nothing is pinned. The card only tracks what a camp needs; a tap on it also opens the tool.

## Tests

- **Unit (`tests/app/recipes.test.ts`):**
  - the book holds New camp, then an upgrade to each level above 1, in order;
  - each recipe's cost is the data's own;
  - New camp is pinned at first.
- **Unit (`parsePins`):** saved pins are read back in order; an empty list is kept; nothing saved, or bad data (not JSON, not a list, not names, only unknown ids), gives the first pins; unknown ids and repeats are dropped.
- **E2e:**
  - Pin both upgrades and unpin New camp, then reload the page: the same two are pinned, in order, and New world keeps them.
  - Open the book: every recipe shows its costs. Pin both upgrades, close the book: three cards. Gather eight times: every pinned material's have/need matches the counts. Unpin level 3: its card goes. Tap the New camp card: the camp tool opens. Tap the level-2 card: a level-1 camp's panel opens. Through all of it, the map and the tray never move.
  - At 320 px wide, with three cards pinned, the strip scrolls sideways (the page does not). The last card's × can be reached and works, and the tray keeps its height.
  - The existing system-bar tests still check the tray at rest, with its new row, above the gesture bar.
