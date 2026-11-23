# Smelting and crafting: a proposal

Status: **proposal**, for the owner to approve or change (questions 161 to 164). Nothing here is built yet. Every number is a [Default] that will live in `src/data/frontier.ts`.

The owner chose this as the next feature after playing a3121a6 (question 159). It replaces "fuel first" in Phase D. By shift 22 of that run, with 7 camps, coal (15), raw iron (34) and raw copper (20) were piling up with nothing to spend them on. This proposal gives them a use that makes the main loop (gather, dig, light more ground) better. It does not add a new chore. Upkeep stays as easy as it is (question 160).

## 1. Where: a smelter at a camp

- **A smelter** is built at a camp of level 2 or more, from that camp's panel: "Build smelter".
  - Cost: [Default] **20 stone and 10 clay**, and 1 tap.
  - One smelter per camp, shown on the camp's marker.
  - It is lost if the camp is demolished, like everything else about a camp.
- **Smelting and crafting need at least one smelter** somewhere. As with camps today, the player doesn't have to be near it; there is no crew position.
- **Why a building, and not "any level-2 camp":** it gives stone and clay a use after the upgrades. It is a visible step on the map, and it is a choice of where to invest.

## 2. Smelting

- **Recipe:** [Default] **2 raw ore + 1 coal → 2 ingots**, one recipe for iron and one for copper. This is the old game's ratio (decision note 0014).
- **1 tap per batch, instant**, like every other action. With 100 taps a shift, smelting a pile takes a handful of taps, not a shift.
- **Undo** works on it, as on any action that is not a harvest.
- Coal finally has a use: it is the smelter's fuel.

## 3. What ingots are for: two things to make, one for later

The aim is to make the loop better: more from each tap, more ground lit from each camp. Both are made in the recipe book, 1 tap each, once a smelter stands.

1. **Iron pickaxe**: [Default] 3 iron ingots + 2 wood.
   - While the store holds one, **every mining tap yields double** (2 stone, 2 coal, 2 raw ore, and so on). Taking from the surface is unchanged.
   - It does not wear out. A second pickaxe adds nothing.
   - It makes digging (the pit is the plan) pay twice as well.
2. **Copper lantern**: [Default] 2 copper ingots + 1 crystal.
   - Hung at a camp from its panel ("Hang lantern", 1 tap), it widens that camp's ring by [Default] **3 squares**, on top of its level.
   - One per camp; it is lost with the camp.
   - It lights more ground without the upkeep of another camp, and it gives crystal its first use.
3. **Later: the first contract.** Ingots are the natural first deliverables, for example "deliver 20 iron ingots and 10 copper ingots" (question 164). That belongs in the contracts batch, not this one.

Not proposed:

- **Ingots for camp level 3:** ore is only mined at level 3, so ingots can't be needed to reach it.
- **Anything that eases upkeep:** the owner wants upkeep left as it is (question 160).

## 4. Interface

- **The recipe book** (the full-screen card) gets the new recipes: smelt iron, smelt copper, iron pickaxe, copper lantern.
  - A recipe that can be made now has a **Make** button. Tapping it makes one, for 1 tap.
  - Without a smelter, or short of an item, the button is off, and the card says what is missing, as the cost chips do today.
- **Pins** work for the new recipes too, so the tray shows progress toward a pickaxe.
- **A camp's panel** gets "Build smelter" (level 2+) and "Hang lantern" (with a lantern in the store), next to Rest, Upgrade and Demolish.
- **The counter** above the map shows ingots, the pickaxe and lanterns, like the other items.

## 5. Engine and state

- **New items:** iron ingot, copper ingot, iron pickaxe, copper lantern. The old game's item ids are reused where they exist (`ironIngot`, `copperIngot`).
- **Camps gain two flags:** `smelter` and `lantern`.
  - The state's shape changes, so `FRONTIER_STATE_VERSION` goes up (6) and old saves start a new run.
  - The rules change, so this batch's first engine PR takes **`ENGINE_VERSION` 0.8.0** (the coordinator's batch rule).
- **New actions:** build a smelter at camp N; make recipe R; hang a lantern at camp N. Each costs 1 tap and is refused, with a reason, when it can't be done.
- **The pickaxe** is a rule in the mining tap: yield × 2 while the store holds one. **The lantern** adds to `campRadius` for that camp.
- **Tools:**
  - the simulator's policies learn to build a smelter, smelt and make a pickaxe;
  - the acceptance check gets the new rules;
  - the golden runs are recorded again.
- **Order of PRs:**
  1. engine: smelter, smelting and the two items, with tests;
  2. app: the recipe book's Make button and the camp panel's buttons;
  3. sim numbers and a short playtest brief.

## 6. Open questions for the owner

Each has a recommended default; the build goes ahead on the default unless the owner says otherwise.

- **161. Where does smelting happen?** Recommended: a smelter built at a level-2+ camp for 20 stone + 10 clay. Alternatives: smelting at any level-2+ camp with nothing to build, or at the first camp only.
- **162. What does smelting cost?** Recommended: 2 raw ore + 1 coal → 2 ingots, 1 tap, instant. Alternatives: it takes coal per ingot (1 + 1 → 1), or a batch is ready only at the end of the shift.
- **163. What are ingots for?** Recommended: an iron pickaxe (mining yields double) and a copper lantern (+3 ring at one camp). Alternatives: tools that let a lower-level camp mine harder rock, or a camp level 4 that needs ingots.
- **164. Are ingots what the first contract asks for?** Recommended: yes, the first contract asks for ingots (for example 20 iron and 10 copper), built after this batch. Alternative: contracts ask for raw ore and relics only, as v0.2 had it.
