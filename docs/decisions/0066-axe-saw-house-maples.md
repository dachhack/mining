# 0066: The axe, the saw house, maples and the sugar shack

Owner, after the 0.17.0 build: "Let's add an axe that gets you 3 wood from
trees instead of 2. And you can build a one-square building saw house that
increases the harvest of all trees within a camp level 1 radius by 1."

- The axe is a tool like the pickaxe: held in the store, never used up
  (`FRONTIER_AXE`). Made at a smelter (2 iron ingots, 2 wood) or bought for
  25 coins from the start, so it helps early, when wood is short.
- The saw house is a new kind of thing on the map: a one-square building,
  kept in the state as `sawHouses` (state version 20), not a camp upgrade, so
  it can stand anywhere lit. It is placed from a 🪚 tool in the tray, as
  saplings are planted from 🌱.
- Its reach is a level-1 camp's radius, read from the camp levels, so it
  follows any change to them. The bonus does not stack (question 198).
- Its square is treated like a camp's ground: never mined, planted on,
  built over, or blasted.
- The gatherer and careful policies buy an axe when they hold 45 coins, and
  build one saw house per newest camp where it reaches 6 or more trees and
  40 wood is left after paying. Engine 0.18.0; every golden run re-recorded
  (the state gained a field, and the policies trade and build differently).

Simulator, gatherer, 40 runs of 100 shifts, before and after: crews lost 3
and 2; it bought an axe in 39 runs and built a saw house in 33 (from about
shift 10); it ended with 5,085 coins on average, not 6,048, and mined 6,360
blocks, not 6,783: the policy spends taps and coins on wood it then has
little use for. That is the policy's choice, not a cost of the rules.

## Maples and the sugar shack

Owner, next: "Let's add maple tree saplings and a one square sugar shack
where you can produce syrup if you harvest sap."

- A maple is a fourth tree kind (`MAPLE_TREE`). It works like an apple tree:
  it holds sap where an apple tree holds apples (the same `apples` list, now
  "what a tree holds"; `cropOf` says which), fills again on the same clock,
  and is felled for wood once dry. `isTree` replaces the "tree or apple
  tree" checks, so maples burn, block camps and get the axe and saw-house
  bonus like any tree.
- The saw house and the sugar shack are both one-square buildings, so the
  state keeps one list, `buildings` (kind and square), in place of
  `sawHouses` (state version 21; the action is `build` with a kind). The
  tray's tool became 🔨 Build with a choice of the two.
- Syrup is made in the recipe book while a sugar shack stands, as smelting
  needs a smelter (`needsSugarShack`). For now its only use is coins
  (question 199).
- The policies buy two maple saplings once (keeping 60 coins), build a
  sugar shack once a maple stands, boil and sell syrup, and leave a dry
  maple standing as they do an emptied apple tree. Gatherer, 40 runs of 100
  shifts: crews lost 2; a sugar shack in 15 runs (from about shift 60);
  5,383 coins on average.
