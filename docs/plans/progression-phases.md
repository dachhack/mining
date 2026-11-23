# Progression in five phases: the plan

Status: **built, then changed after the playtest build** (decision note 0063: the market opens only after a market day's night; saplings only from the market). **Direction agreed with the owner** (2026-11-23, in conversation; decision note 0061). PR 1 is built (engine 0.9.0): a run of 100 shifts, coins, and the market with selling and buying (design doc sections 5.1 and 6a). PR 2 is built: camp gating, camps only in the top three levels, the iron and steel drills, and tools at the market (design doc sections 3.5, 4.3 and 6). Stone sells at 10 for a coin, not 2: at 2 the simulator's gatherer made 4,500 coins in a run from stone alone. PR 3 is built: cut grass grows back beside grass, saplings from felled trees and the market, apple saplings from apples, and planting (design doc sections 4.2 and 7a). PR 4 is built: hay, pens and breeding, hay as food and in the level-3 upgrade (design doc section 7b). PR 5 is built: the contract board, three tiers, taking, delivering and dropping, and the phases with their goals (design doc section 8). Contracts can also be dropped, for nothing, so one that cannot be filled never blocks the board. PR 6 is built: the deep camp, its kit, and wood and apples at the market after a tier-1 contract (design doc sections 6 and 6a). A deep camp stands only at depth 3 or more (owner, question 178). PR 7 is done: the simulator's numbers for the whole arc (decision note 0062) and the playtest brief (`docs/playtests/prog-r1/brief.md`). Owner questions 177 to 180 came out of it. Rules marked [Decided] are the owner's words. Everything marked [Default] is a starting value filled in for the owner to tune, held in `src/data/frontier.ts` once built. The defaults that are design choices rather than numbers are owner questions 167 to 176, status `assumed`.

This replaces "contracts next" (section 8 of the design doc) with a whole run arc. It changes four [Decided] items of the design doc, with the owner's approval: what each camp level mines (section 6), where camps may stand (section 2, Base), what the smelter is for (section 6), and how a run ends (sections 5.1 and 8). The design doc is updated batch by batch, as each rule is built.

## 1. The arc of a run [Decided]

A run lasts **100 shifts, or until the crew is lost** (owner). Closing the mine still ends it early. The phases are not switched on by a script: they come out of what the camps, tools and market allow. A goals panel names the phase the player is in and what moves them on.

| Phase                                   | The player is…                                                                                                                                                                                                      | What opens the next phase      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **1. Camps and the landscape**          | placing camps across the surface to light it and gather wood, grass, apples, animals and clay. A base camp mines only dirt, clay and rubble.                                                                        | The first level-2 camp         |
| **2. Farming and planning the pit**     | choosing where the main camp and the pit go, demolishing camps and clearing trees that stand in the way, and setting up grass, trees, apple trees and animal pens to keep resources coming. Stone and coal open up. | The first level-3 camp         |
| **3. Tier-1 contracts and tools**       | filling contracts for coal, stone and basic ore, and buying tools at the market to mine harder rock and ore. A smelter lets the player fill ingot contracts and make tools more cheaply than buying them.           | The first tier-1 contract done |
| **4. Tier-2 contracts and a deep camp** | placing the new deep camp below the top three levels, so the whole depth is open. The market now sells food and timber, so farming is optional.                                                                     | The first tier-2 contract done |
| **5. Tier-3 contracts and money**       | filling the richest contracts, for crystal, rare ore and relics, and making as much money as possible before shift 100.                                                                                             | — (the run ends at shift 100)  |

**The score** is the money held when the run ends [Default; question 170]. It is also what pays the between-run credits (design doc section 9).

## 2. Camps

### 2.1 Where camps may stand [Decided]

- **Camps** (levels 1 to 4) may be placed only where the 3×3 is at **depth 0, 1 or 2**, the top three levels. The existing rules still apply: all lit, level, and no other camp's ground in it.
- **The deep camp** (Phase 4) may be placed at any depth. See 2.4.

### 2.2 What each level mines [Decided; costs Default]

| Level    | Ring | Mines              | Upgrade to this level costs                              | Market every            |
| -------- | ---- | ------------------ | -------------------------------------------------------- | ----------------------- |
| 1 (base) | 9    | Dirt, rubble, clay | — (the first camp is free; others 15 wood + 15 grass)    | 10 shifts               |
| 2        | 12   | + stone, coal      | 20 wood, 10 clay, 10 grass, 2 animals (no stone)         | 5 shifts                |
| 3        | 15   | + hard rock        | 40 wood, 20 clay, 40 stone, 3 animals, 10 apples, 10 hay | 3 shifts                |
| 4        | 18   | nothing new        | 40 wood, 8 iron ingots, 6 copper ingots, 20 stone        | 3 shifts [question 167] |

- **The base camp can't mine stone or coal** (owner, question 2 of the conversation), so the level-2 upgrade costs nothing that has to be mined except clay.
- **Ore, crystal, rare ore and relics are mined with tools,** not camp levels (section 4). No camp level mines them on its own.
- **The market's cadence follows the player's best camp:** the highest level of any camp standing.

### 2.3 Where the main camp goes (the pit)

A camp's 3×3 is never mined, and the level rule means the ground around a camp can drop only one level for each square of distance from it. A camp in the middle of the planned pit leaves the pit as a ring around a tower. Trees and stumps do the same, until they are felled and their square mined. So Phase 2's real choice is **where the pit goes**: its main camp belongs on the pit's rim, and the camps and trees inside the pit's footprint must go.

To help the player see this, the camp placement preview shows, as a dashed outline, how deep the ground around the camp could be dug [Default; UI only].

### 2.4 The deep camp [Decided; numbers Default]

- **Placed at depth 3 or more** (owner, question 178), on a level 3×3 of lit ground, like other camps.
- **Costs a camp kit,** which only the market sells [Decided: "yes" to question 6], plus [Default] 20 wood and 20 stone.
- **Ring** [Default] 12. It mines what a level-3 camp mines; tools add the rest, as for any camp.
- It cannot be upgraded [Default; question 168]. It can be demolished like any camp.
- **The market sells camp kits once a tier-1 contract is done** (Phase 4).

## 3. The market [Decided; numbers Default]

- **When:** the market opens at the start of the shift after night, every 10 shifts while the best camp is level 1, every 5 at level 2, and every 3 at level 3 or 4. The count runs from shift 1: with a level-2 camp at best, it opens on shifts 5, 10, 15, … [Default; question 169]. The night screen says "Market day" when it opens.
- **How long:** for that whole shift [Default; question 169]. Market button in the tray, lit on market days.
- **Each trade costs 1 tap,** whatever the quantity, because every action that does something costs a tap (design doc section 2, [Decided]).
- **Money:** one currency, **coins** [Default; question 170]. The run starts with [Default] 0. The player sells surplus to the market at low prices, and contracts pay far more.
- **What it buys:** everything gathered or made, at [Default] prices in `src/data`. Surface goods are cheap; ore, ingots and crystal pay more.
- **What it sells**, by phase [Default; question 171]:
  - **From the start:** saplings, apple saplings, hay, an animal, clay. These are things the player can make or catch, but they help early farming. Stone and coal are not sold, so they stay behind a level-2 camp.
  - **From the first level-3 camp:** the tools (section 4).
  - **From the first tier-1 contract:** wood and food (apples, animals) in bulk, and the camp kit.
- **Stock** is unlimited [Default].
- **Prices** do not change in a run [Default].

## 4. Tools [Decided: bought, or made cheaper with a smelter]

The owner: "buy drills and tools to mine harder rocks and more rare ore", and "building a smelter … lets you craft some items you would otherwise buy at higher cost."

| Tool                  | Does                                                      | Market price        | Made at a smelter from                   |
| --------------------- | --------------------------------------------------------- | ------------------- | ---------------------------------------- |
| **Iron pickaxe**      | Every mining tap yields twice as much (unchanged)         | [Default] 60 coins  | 3 iron ingots + 2 wood (unchanged)       |
| **Iron drill**        | Mines iron and copper ore                                 | [Default] 80 coins  | 4 iron ingots + 2 copper ingots + 2 wood |
| **Steel drill** (new) | Also mines crystal, unstable ore, relics and the keystone | [Default] 250 coins | — (bought only) [question 172]           |
| **Copper lantern**    | Widens a camp's ring by 3 (unchanged)                     | [Default] 40 coins  | 2 copper ingots + 1 coal (unchanged)     |

- **Tools stay in the store** and work at every camp, as now. A drill does not wear out, and a second one adds nothing.
- **The iron drill changes meaning:** it no longer lifts a camp one level. It now unlocks ore. A tap on ore without a drill is refused with "needs an iron drill"; a tap on stone at a base camp, with "needs a level-2 camp". Each refusal has one clear reason, and the level rule's "too steep" still comes first.
- **The first drill has to be bought:** ingots need ore, and ore needs the drill. That is intended: it is Phase 3's first market purchase.
- **What the smelter is for** [Decided]: filling ingot contracts (section 5), making the pickaxe, the iron drill and lanterns more cheaply than buying them, and the ingots for camp level 4. It is otherwise unchanged (design doc section 6).

## 5. Contracts [Decided: three tiers; details Default]

- **The contract board is at the market.** On a market day the player may take one contract, and holds [Default] one at a time [question 173].
- **A contract asks for items** and pays coins **when the last item is delivered** (question 89's "Done on delivery" stays). Delivering takes 1 tap, on any shift, not only market days. The items leave the store. A contract does not end the run any more.
- **Deadline:** none [Default; question 173].
- **Tiers** [Default]:

  | Tier | Opens                          | Asks for (examples)                                                     | Pays            |
  | ---- | ------------------------------ | ----------------------------------------------------------------------- | --------------- |
  | 1    | the first level-3 camp         | coal, stone, raw iron, raw copper; or iron and copper ingots (more pay) | 50–150 coins    |
  | 2    | the first tier-1 contract done | hard-rock stone in bulk, ore, ingots in bulk                            | 200–500 coins   |
  | 3    | the first tier-2 contract done | crystal, rare ore, relics                                               | 600–2,000 coins |

- **The board shows** [Default] 3 contracts of each open tier, drawn from the seeded RNG on the market day. The ones not taken are replaced on the next market day.

## 6. Farming [Decided: all three; numbers Default]

### 6.1 Grass regrows

- **A cut grass square grows grass again** after [Default] 4 shifts, if it is dirt at depth 0, has no camp on it, and has grass on a face neighbour.
- A mined square never regrows grass, as with trees.
- So grass spreads back slowly from what is left. A patch cut bare to its last square does not come back by itself [Default; question 174].

### 6.2 Saplings

- **A sapling** comes from felling a tree: [Default] 1 in every 2 trees felled, counted, not random, so a run replays exactly. The market also sells them.
- **An apple sapling** comes from apples: [Default] in the recipe book, 3 apples make 1 apple sapling, 1 tap. The market also sells them.
- **Planting** a sapling is a tap on a lit square that is dirt at depth 0 with nothing on it, or on a stump, with a sapling in the store: 1 tap. It grows into a tree after [Default] 15 shifts, like regrowth, and an apple sapling into an apple tree with 3 apples after [Default] 20 shifts.
- It follows the regrowth rules (design doc section 4.2): it waits under an animal, and it is lost if its square is mined.

### 6.3 Hay and animal pens

- **Hay** is made in the recipe book from grass: [Default] 3 grass make 1 hay, 1 tap. Hay never spoils. Hay also counts as food for upkeep [question 175].
- **A pen** is built at a camp of level [Default] 2 or more, from its panel, for [Default] 10 wood and 1 tap. (Level 2, as the smelter: farming is Phase 2's, and a base camp's panel has no room for another row.) It holds up to [Default] 4 animals, one pen per camp, and it is lost with the camp (its animals go to the store).
- **Putting an animal in** takes one from the store, 1 tap. **Taking one out** puts it in the store, 1 tap. Animals in a pen are not eaten by upkeep.
- **Breeding:** at End shift, a pen with at least 2 animals and room for another gains 1 animal every [Default] 4 shifts, eating [Default] 2 hay from the store when it does. With no hay, it waits.
- **Wild animals** still walk in at the map's edge as now (design doc section 4.2).

## 7. How a run ends [Decided]

- **At the end of shift 100,** or when the crew is lost, or when the player closes the mine.
- **The end screen** shows the coins held (the score), the contracts filled by tier, and the deepest level reached.
- A lost crew scores [Default] the coins held, like any other end [question 176].

## 8. The build, in small PRs

Each is one PR, with tests, the simulator's policies taught the new steps, and the golden runs re-recorded where rules change. Every PR in this batch changes the rules, so the first takes **`ENGINE_VERSION` 0.9.0**, and the rest of the batch shares it until the next playtest. Old saves start a new run (`FRONTIER_STATE_VERSION` goes up).

1. **The run's end and coins:** 100 shifts, the end screen, coins in the store, and selling at a market that opens on the cadence. Engine, then UI. (A playable step: the market exists and the run has a length.)
2. **Camp gating:** camps only at depths 0–2; the new mining table (2.2), the new upgrade costs, and the refusal reasons. The iron drill unlocks ore; the steel drill; tools on sale at the market. The simulator's numbers show whether phases 1 and 2 hold.
3. **Farming, part 1:** grass regrowth and saplings (with apple saplings).
4. **Farming, part 2:** hay, pens and breeding; hay in the level-3 upgrade.
5. **Contracts:** the board, tiers 1 to 3, delivering, the goals panel.
6. **The deep camp,** the camp kit, and wood and food on sale.
7. **Sim numbers and a playtest brief** for the whole arc: when each phase is reached, and the score, by policy over 100 shifts.

UI comes with each engine change where it stays small; otherwise it is the next PR.

## 9. The owner's answers (2026-11-23)

1. A "day" is a shift.
2. The base camp cannot mine stone: dirt and clay only.
3. A run ends after 100 shifts, or when the crew is lost.
4. A smelter lets the player fill ingot contracts, not only ore ones, and craft some items they would otherwise buy at a higher price.
5. Farming: all three (grass regrowth, saplings, animal pens), with grass made into hay for the animals.
6. The deep camp costs goods only the market sells.

The phases themselves, camps only on the top three levels, and the market's cadence (10, 5, 3 shifts by best camp level) are the owner's opening message.
