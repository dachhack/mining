# 0077: Smelters are loaded and smelt overnight; kits upgrade them

The owner, after the 0.27.0 build: "Let's have you can load up to 20 ore and
10 coal into a smelter and each smelter produces 10 ingots per turn. Smelters
can be upgraded with level 2 and 3 kits you purchase at the market."

Asked, the owner chose:

- the tap-to-smelt recipes are **removed**;
- the ratio stays **as today** (2 raw ore and 1 coal make 2 ingots), so a
  full level-1 load is two nights' work;
- the kits make a smelter **bigger and faster** (40/20/20 a night, then
  60/30/30), at 150 coins from a level-3 camp and 400 from contract stage 4;
- loading costs **1 tap a load**.

What was built (engine 0.28.0, state version 29):

- A camp has `smelterLevel` and its load (`smeltIron`, `smeltCopper`,
  `smeltCoal`). `loadSmelter` and `upgradeSmelter` are actions;
  `nightOfSmelters` runs at End shift after the workers, and the report's
  `smelted` says what was made.
- A night smelts iron before copper. An odd last ingot burns a whole coal,
  so the coal never goes below zero and nothing is left half-burnt.
- A market lot can now wait for a contract stage (`fromStage`).
- The contract board's count of what the world holds (stock.ts) counts the
  loads in the smelters, and works ingots out from the smelter's ratio now
  that there is no recipe to read it from.
- Ingots now take planning: ore loaded today is ingots tomorrow. The
  simulator's players load a smelter whenever a whole batch would go in.
