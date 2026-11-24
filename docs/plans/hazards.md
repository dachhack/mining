# Hazards: the plan

Status: **agreed** (owner, 2026-11-24, in conversation; decision note 0064). Owner's answers: water and gas both from depth 4 (question 181); one APK build when all the hazards are in (question 192). PRs 1 to 5 (rain, water and the pump, gas and fire, dragons and the sword, marauders and defenses) are built (engine 0.13.0).

The owner's direction:

> Rain overnight washes clay and soil into low areas and covers them.
>
> Pockets of gas can explode starting at level 4. This blows away blocks and starts fires on combustible squares. You need to put out each fire with a click.
>
> You can hit water starting at level 3. It fills the area and you need to purchase a pump to remove it by clicking it and waiting.
>
> Wandering dragons can eat your sheep and apples and set fire to things. They don't go away until you get a sword and drive them away.
>
> Marauders can come and steal things from your camps and remove their upgrades and put them back to basic. If the camp has defenses though, they can be turned away. The strength of the marauders depends on how far you have dug. The damage they do depends on what level of defense your targeted camp has.

This changes the design doc's Hazards row (section 2: "None for now") and section 10, with the owner's approval. Every number below is a **[Default]**, held in `src/data/frontier.ts`, for the owner to tune. Owner questions 181 to 192 list the choices made without the owner; each states its default.

## 0. Common ground

- **Water and gas both start at depth 4** (owner, question 181: "Let's do depth 4 for water and gas explosion"): a square at depth 4 has had four blocks dug from it, and its top block is in the cube's middle band, where the generated water and gas pockets begin. Ordinary camps stand at depth 0 to 2.
- **Everything happens by the seeded generator** in the state, as the animals do: the same seed and the same actions always give the same rain, blasts, dragons and raids.
- **The night tells the player** (the End shift report and the night scene): "Rain filled 6 squares", "Marauders turned away at camp 2", and so on.
- **Harm stays hunger only** (question 182): no hazard costs the crew health. They cost ground, goods, upgrades and taps.
- **What burns** (combustible squares, used by gas, fire and dragons): a tree, an apple tree, grass, a stump or a planted sapling, and a camp's ground.
- **The order of End shift** gains, after upkeep and breeding: fires spread and burn; pumps drain; dragons move, eat and set fires; marauders come; rain falls. (Rain last, so the morning shows where it fell.)

## 1. Rain (PR 1)

- **When:** at End shift, with a chance of `FRONTIER_RAIN.chance` (1 in 5) each night.
- **What it does:** it fills **low spots**: dug squares (depth 1 or more) that no face neighbour is deeper than, and that at least one face neighbour is shallower than. Each low spot is filled with a chance of `fillChance` (1 in 2): one block is put back on top of it, so it is 1 shallower. The block is clay with a chance of `clayChance` (1 in 3), otherwise dirt. Filling only low spots keeps the level rule true everywhere (each filled square was lower than or level with all its neighbours, and goes up by 1).
- **"Covers them":** what was the top block is buried under the new one, not lost: dig the new block off and it is there again. Cut grass waiting to grow back on a filled square still waits.
- **Not filled:** a camp's ground, a flooded square (section 2) and a square with a fire.
- **Remedy:** dig it out again. It costs a tap, but gives the clay or dirt.
- **Engine:** the cube gains a way to set a block back on a square (`unmine`). `mined` (Dug) does not go down.
- **Screen:** a rain sweep in the night scene and "Rain filled N squares".

## 2. Water and the pump (PR 2)

- **Where:** the cube's water pockets, from depth 4: the old game's pockets in the middle band (depth 4 to 11). No pockets are added (question 183 is superseded).
- **Hitting water:** when a tap mines a block and the square's new top cell is in a water pocket, the water floods: that square and every dug square joined to it by face neighbours at **the same depth or deeper**, up to `maxSquares` (12), nearest first. Today the frontier treats a pocket as rubble; this replaces that for water.
- **A flooded square** cannot be mined, a camp cannot be placed on it, rain does not fill it, and animals do not walk on it. It is drawn as water.
- **The pump:** bought at the market (`FRONTIER_PUMP`: 30 coins), from the start. Tap a flooded square with a pump in the store to set it there (1 tap); it starts pumping. At each End shift it drains `drainPerShift` (2) squares of its flood, the farthest from it first (so what is left stays joined to it), its own square last. When the flood is dry, the pump comes back to the store: it is used again (question 184). Tapping a working pump picks it up again (1 tap), leaving the rest flooded.
- **After draining:** the square can be mined again; the pocket's cells are dry.
- **Screen:** water squares, the pump drawn on its square with how many squares are left, and the pump in the market and the counter.

## 3. Gas, blasts and fire (PR 3)

- **Where:** the cube's gas pockets, from depth 4 (the middle band already has them).
- **Hitting gas:** when a tap's new top cell is in a gas pocket, it explodes with a chance of `FRONTIER_GAS.explodeChance` (1 in 2); otherwise it vents and nothing happens (question 185). The pocket's cells are then empty either way.
- **The blast:** every other square within `blastRadius` (1: the 3×3 round the mined square) loses its top block, giving nothing ("blown away"), where the level rule allows it, row by row. Camps' ground, flooded squares and squares with plants or stumps are not dug.
- **Fires:** every combustible square within `fireRadius` (3) of the blast catches fire.
- **Putting out a fire:** tap it (1 tap). No tool is needed. A tap on a burning square puts the fire out and does nothing else.
- **A fire left burning** at End shift: it spreads to each combustible face neighbour, then burns its own square out: grass grows back as cut grass does, a tree leaves a stump that grows back as a felled tree's does, a sapling becomes a stump. A burning **camp** loses one upgrade, in the same order as a raid (section 5), and its fire goes out (question 186). A fire on a square no camp lights burns out without spreading (question 195).
- **Screen:** a flash for the blast, flames on burning squares, "N fires" on the counter, and fires in the night report.

## 4. Dragons and the sword (PR 4)

- **When:** from shift `FRONTIER_DRAGON.fromShift` (20), at End shift, a dragon flies in at the map's edge with a chance of `chance` (1 in 12), if none is on the map (`most`: 1).
- **What it does each night:** it flies `steps` (4) squares (over anything: trees, pits, water), then eats: an animal on its square or beside it, or one from the pen of a camp it is on, and every apple on an apple tree it is on or beside. Then, with a chance of `fireChance` (1 in 3), it sets fire to one combustible square beside it.
- **It stays** until it is driven away.
- **The sword:** made in the recipe book at a camp with a smelter, from 3 iron ingots and 2 wood, or bought at the market for 60 coins from camp level 3 (question 187). Tap the dragon with a sword in the store (1 tap): it is driven off the map. The sword is kept. A tap on a dragon without one is refused ("Needs a sword").
- **Screen:** the dragon drawn on its square, a ⚔ chip, and what it ate in the night report.

## 5. Marauders and defenses (PR 5)

- **When:** from shift `FRONTIER_RAID.fromShift` (15), at End shift, with a chance of `chance` (1 in 10). They choose one camp, at random (question 188).
- **Their strength** comes from how far the player has dug, the deepest square on the map: strength 1 above depth 4, 2 from depth 4, 3 from depth 8, 4 from depth 16 (`strengthFromDepth`).
- **Defenses** are a camp upgrade in the camp's panel, 3 levels (`FRONTIER_DEFENSE`): a palisade (level 1: 15 wood), a stone wall (level 2: 20 stone, 10 wood), a gatehouse (level 3: 10 iron ingots, 20 stone). Each costs 1 tap, at a camp of level 2 or more (as the smelter and the pen; question 194), deep camps too (question 189).
- **Turned away** if the camp's defense level is at least the raiders' strength. Nothing is lost.
- **Otherwise** the shortfall (strength minus defense, 1 to 4) sets the damage:
  - **Stolen:** shortfall × 10% of each goods stack in the store, rounded down. Coins are not stolen (question 190).
  - **Upgrades removed:** shortfall × 2 of the camp's upgrades, in this order: the lantern, the pen (its animals are taken), the smelter, then camp levels, one at a time, down to level 1. At a shortfall of 4 or with few upgrades, the camp is back to basic. A deep camp keeps its level; it loses only its fittings. Defenses are not removed (question 191).
- **Screen:** a defense row in the camp's panel (question 180 already says the panel is tall), and the raid in the night report.

## 6. The simulator, the policies and the checks (PR 6, and in each PR)

Each PR adds to:

- the text play interface and its help;
- the acceptance check (for example: rain only fills low spots and the level rule holds after it; flooded squares are never mined; a fire goes out only by a tap or by burning; a raid never takes coins; a raid is turned away exactly when defense ≥ strength);
- the policies: the gatherer puts out fires, buys a pump and sets it on a flood, makes or buys a sword and drives a dragon off, and builds defenses as it digs deeper;
- the golden runs, re-recorded, with the coverage check asking for each hazard at least once.

PR 6 runs the simulator and writes down, as decision note 0062 did, how often each hazard comes, what it costs, and how many runs it ends.

## 7. Engine versions and builds

**`ENGINE_VERSION` 0.13.0** is bumped in PR 1 and covers the whole batch: one APK build when all the hazards are in (owner, question 192). `FRONTIER_STATE_VERSION` bumps in every PR that changes the state's shape (rain may not; water, fire, dragons and defenses do).

## 8. The PRs, in order

| PR  | What                                              | State                   |
| --- | ------------------------------------------------- | ----------------------- |
| 1   | Rain fills low spots                              | none (the cube changes) |
| 2   | Water from depth 4; the pump                      | flooded squares; pumps  |
| 3   | Gas from depth 4; blasts; fire and putting it out | burning squares         |
| 4   | Dragons; the sword                                | dragons                 |
| 5   | Marauders; camp defenses                          | a camp's defense level  |
| 6   | The simulator's numbers                           | none                    |

Fire comes before dragons because dragons set fires.
