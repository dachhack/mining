# Smelting and crafting: the plan

Status: **agreed with the owner** (2026-11-23, questions 161 to 164). PR 1 (the smelter and smelting, with its UI, so PR 2 too) and PR 3 (the pickaxe and the lantern) are built; the rest is not yet. Every number is a [Default] that will live in `src/data/frontier.ts`.

The owner chose this as the next feature after playing a3121a6 (question 159). It replaces "fuel first" in Phase D. By shift 22 of that run, with 7 camps, coal (15), raw iron (34) and raw copper (20) were piling up with nothing to spend them on. This gives them a use that makes the main loop (gather, dig, light more ground) better, without adding a new chore. Upkeep stays as easy as it is (question 160).

## 1. Where: a smelter at a camp (question 161)

- **A smelter** is built at a camp of level 2 or more, from that camp's panel: "Build smelter".
  - Cost: [Default] **20 stone and 10 clay**, and 1 tap.
  - One smelter per camp, shown on the camp's marker.
  - It is lost if the camp is demolished, like everything else about a camp.
- **Smelting and crafting need at least one smelter** somewhere. As with camps today, the player doesn't have to be near it; there is no crew position.

## 2. Smelting (question 162)

- **Recipe:** [Default] **2 raw ore + 1 coal → 2 ingots**, one recipe for iron and one for copper. This is the old game's ratio (decision note 0014).
- **1 tap per batch, instant**, like every other action. Undo works on it, as on any action that is not a harvest.
- Coal finally has a use: it is the smelter's fuel.

## 3. What ingots are for (question 163: all four)

All four are made with 1 tap each once a smelter stands: the tools in the recipe book, the camp improvements from a camp's panel.

1. **Iron pickaxe** (a tool): [Default] 3 iron ingots + 2 wood.
   - While the store holds one, **every mining tap yields double** (2 stone, 2 coal, 2 raw ore, and so on). Taking from the surface is unchanged.
   - It does not wear out, and a second one adds nothing.
2. **Copper lantern** (hung at a camp): [Default] 2 copper ingots + 1 crystal.
   - Hung at a camp from its panel ("Hang lantern"), it widens that camp's ring by [Default] **3 squares** on top of its level.
   - One per camp; it is lost with the camp. Crystal gets its first use.
3. **Iron drill** (a tool, for harder rock): [Default] 4 iron ingots + 2 copper ingots + 2 wood.
   - While the store holds one, **every camp mines as if it were one level higher**, up to what level 3 mines. A level-1 camp mines hard rock; a level-2 camp mines ore, crystal and relics.
   - The camp's ring stays the ring of its own level.
   - It does not wear out, and a second one adds nothing.
   - It lets new camps dig deep straight away, without paying for every upgrade.
4. **Camp level 4**: an upgrade from level 3, [Default] **40 wood, 8 iron ingots, 6 copper ingots and 20 stone**.
   - Its ring is [Default] **18** (level 3's is 15).
   - It mines nothing new: level 3 already mines every block that can be mined (bedrock and sealed rock never are; section 3.5 of the design doc).
   - It lights most of the 32 × 32 map from one camp, so fewer camps (and less camp wood upkeep) are needed.

**How they fit together** (settled defaults, noted here rather than asked):

- **The drill and level 4 don't overlap.** The drill raises what a camp mines, capped at level 3's blocks. Level 4 raises how far a camp reaches. A level-3 or level-4 camp gains nothing from the drill.
- **The lantern stacks with any level.** It adds 3 to the camp's own ring, so a level-4 camp with a lantern reaches 21. No cap is needed: the map's edge limits how far a ring lights.
- **The pickaxe and the drill are both tools in the store.** They work together: a level-1 camp with both mines hard rock for 2 stone a tap.
- **The level-4 upgrade needs a smelter** somewhere (its cost has ingots), but it does not need one at that camp.

**Later: the first contract (question 164).** It asks for ingots, for example 20 iron and 10 copper. It is built after this batch, in the contracts batch.

## 4. Interface

- **The recipe book** (the full-screen card) lists everything that can be made:
  - smelt iron, smelt copper, iron pickaxe, iron drill, copper lantern;
  - the camp upgrades, now including level 4.
- **A Make button** shows on a recipe that is made from the book (smelting, the pickaxe, the drill, the lantern). Tapping it makes one, for 1 tap. Without a smelter, or short of an item, the button is off, and the card says what is missing, as the cost chips do today.
- **A camp's panel** gets "Build smelter" (level 2+, no smelter yet) and "Hang lantern" (a lantern in the store, none hung there yet). These sit next to Rest, Upgrade and Demolish. Upgrade goes up to level 4.
- **Pins** work for every new recipe.
- **The counter** shows ingots, the tools and lanterns, like the other items.

## 5. Engine and state

- **New items:** iron ingot, copper ingot, iron pickaxe, iron drill, copper lantern. The old game's ids are reused where they exist (`ironIngot`, `copperIngot`, `drill`).
- **Camps gain two flags,** `smelter` and `lantern`, and levels go up to 4.
- **Versions:** the state's shape changes, so `FRONTIER_STATE_VERSION` goes up and old saves start a new run. The rules change, so the batch's first engine PR takes **`ENGINE_VERSION` 0.8.0** (the coordinator's batch rule).
- **New actions:** build a smelter at camp N; make recipe R; hang a lantern at camp N. Each costs 1 tap and is refused, with a reason, when it can't be done. Level 4 is the existing upgrade action.
- **Rules:**
  - the pickaxe doubles a mining tap's yield;
  - the drill adds 1 to the level used for what a camp mines, capped at 3;
  - the lantern adds 3 to that camp's ring;
  - level 4 is a fourth row in `FRONTIER_CAMP_LEVELS`.
- **Tools:**
  - the simulator's policies learn the new steps;
  - the acceptance check gets the new rules;
  - the golden runs are recorded again in each PR that changes the rules.

## 6. The build, in small PRs

1. **Smelter and ingots** (engine, `ENGINE_VERSION` 0.8.0): the smelter flag and its action, the two smelting recipes and the make action, the new items, and tests. If it stays small, its UI is in the same PR.
2. **Their UI:** "Build smelter" in a camp's panel, and the recipe book's Make button for the smelting recipes.
3. **Pickaxe and lantern:** engine and UI.
4. **Drill and camp level 4:** engine and UI.
5. **Sim numbers,** and a short playtest brief.

## 7. The owner's answers

- **161:** a smelter at a level-2+ camp, as proposed.
- **162:** 2 raw ore + 1 coal → 2 ingots, 1 tap, instant, as proposed.
- **163:** all four: the iron pickaxe, the copper lantern, a harder-rock tool (the iron drill) and camp level 4.
- **164:** yes, the first contract asks for ingots, built after this batch.

The drill's and level 4's numbers, and how the four fit together (section 3), are defaults settled here. The owner can tune them at the playtest.
