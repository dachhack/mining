# Mining Game — Game Design Doc (v0.3)

Working title: **Mining Game**. A turn-based roguelike for Android and iOS. The player looks down on a 32×32×32 cube from above. Camps light the ground around them; the rest is fog. Shift by shift, the player gathers from the surface, digs a terraced pit under the level rule, and pushes camps out into the dark, while feeding the crew.

**How to read this doc**
- **[Decided]** marks a choice the designer (Matt) has made. Do not change these without asking.
- **[Default]** marks a proposed starting value or rule. These are expected to change in playtesting, and every number here must live in data files, not in code. The new game's numbers are in `src/data/frontier.ts`.
- Numbered questions ("question 147") are rows in `docs/owner-questions.md`.

**What changed from v0.2** (owner, 2026-11-22: "Lab 2 becomes the game", "Keep shifts", "Remove both"; plan `docs/plans/lab2-becomes-the-game.md`; decision notes 0053 to 0056). The game is UI lab 2, made the game:
- **Fog of war:** camps light a circle, ground once lit stays greyed, the rest is dark.
- **The surface:** grass, trees, apple trees and roaming animals, gathered with a tap; clay just under the ground.
- **Camps** are placed on level ground, upgraded to see further and dig harder rock, and demolished; a recipe book shows what things cost.
- **Shifts of 100 taps**, every tap costing 1, with upkeep in wood and food; hunger is the only harm.
- **The old hazards** (slumps, water, lava, gas, explosions), tells, AP, fuel and crafting are gone for now. Wall slumps and supports are gone for good (question 153, decision note 0053). Fuel and depth bands come back first.

v0.2 is in the git history, as v0.1 is.

**Coming next: progression in five phases** (owner, 2026-11-23; plan `docs/plans/progression-phases.md`, decision note 0061). A run of 100 shifts, from placing camps on the surface, through farming and planning the pit, to contracts in three tiers paid in coins at a market. It changes, with the owner's approval, what each camp level mines and where camps may stand (sections 2 and 6), what the smelter is for (section 6), and how a run ends (sections 5.1 and 8). This doc's rules below are what is built; each section changes as its part of the plan is built.

---

## 1. Pillars

1. **Every tap counts.** A shift has only so many taps, and the crew must eat. Each tap is a choice between gathering, digging and building.
2. **The pit is the plan.** No square may be mined more than one level below its neighbours, so every level down costs a wider pit. The shape the player digs is the strategy.
3. **Light is earned.** The world is dark until a camp lights it. Where to put the next camp, and when to upgrade one, decides what the player can reach.
4. **Deterministic and seeded.** The same seed and the same inputs always produce the same run.

## 2. Core decisions [Decided]

| Topic | Decision |
|---|---|
| World | One 32×32×32 cube, seen only from above: each of the 32×32 squares shows what is on it and its top block. The player mines from the top down by tapping a square (section 3) |
| Level rule | A square's top block may be mined only if, afterwards, that square is no more than 1 level lower than each of its 4 face neighbours (section 4.3) |
| Visibility | **Fog of war** (owner: "Lab 2 becomes the game"). Camps light a circle around them. A square once lit and now outside every circle is shown greyed and cannot be mined; a square never lit is dark (section 3.4) |
| Genre | Resource gathering and management; roguelike |
| Pacing | **Turn-based, in shifts of [Default] 100 taps.** Every tap that does something costs 1 (owner, questions 145 and 146: "Fixed number of taps"). End shift moves the world on (section 4) |
| Player | No avatar. A tap on a lit square takes what is on it (an animal, grass, an apple, a tree) or mines its top block. An abstract **crew** does the work (section 5) |
| Hazards | **Coming back** (owner, 2026-11-24; plan `docs/plans/hazards.md`, decision note 0064): rain fills low spots, water and gas from depth 4 (a pump drains water; gas blasts and starts fires, put out with a tap), dragons (a sword drives them off), marauders (camp defenses turn them away). Until each is built, none is in play. Wall slumps and supports stay retired (question 153, section 10) |
| Harm | **Going short only**: each item of upkeep that cannot be paid costs [Default] 10 taps of the next shift (owner, after the 0.22.0 build: "We don't need crew life anymore"; section 5). There is no crew health |
| Base | **Camps** (Lab 2's): placed on a level 3×3 of lit ground **in the top three levels** (depth 0 to 2; owner, 2026-11-23), upgraded to see further and dig harder rock, demolished once other camps cover them. A base camp mines only dirt and clay; ore, crystal and relics need tools (section 6). The recipe book shows what each costs |
| Win condition | **A run lasts 100 shifts** (owner, 2026-11-23: "100 shifts or crew lost"), or ends sooner when the player closes the mine (question 152); the crew is never lost (owner, after the 0.22.0 build). The coins held at the end are the score [Default; question 170]; contracts in three tiers pay most of them (section 8) |
| Meta-progression | Unlocks only (new options between runs); no permanent stat upgrades |
| Platforms | Android and iOS |

The level rule, the cube, determinism and meta-progression rows are unchanged from v0.2. The Visibility, Pacing, Player, Hazards and Base rows changed with the owner's "Lab 2 becomes the game" and the answers to questions 145 to 153; Harm is new.

## 3. The cube and the surface

### 3.1 Cube, squares and depth

- **Coordinates:** `(x, y, z)`, each 0–31. `z = 0` is the top layer and `z = 31` the bottom. "Down" means increasing `z`.
- **Generation:** fully determined by a seed, once at the start of a run. The cube is fully three-dimensional under the surface: rock, ore veins, caverns and pockets are placed in 3D as before.
- **Squares** are the 32×32 columns `(x, y)`. The player acts on squares only.
- **Depth:** how many blocks have been removed from a square. Every square starts at depth 0; its **top block** is the block in layer `z = depth`. Mining removes the top block and lowers the square by 1.
- **Breaking into a cavern or pocket:** the space under the mined block collapses to rubble, so the square still goes down exactly 1 level.
- **The sides** are not squares: an edge square has 3 face neighbours, a corner 2, and the level rule ignores the wall.

### 3.2 The surface [Default]

- **Plants grow only on dirt** at the surface: never on stone, coal or other rock (owner, after the PR #126 playtest).
  - **Trees** grow in clumps: 22 clumps of radius 2, a tree on each square of a clump with chance 0.55.
  - **Apple trees:** [Default] 10 are scattered, each with 3 apples: every world has all 10 (owner, after the 0.23.0 build: "Let's do a floor of 10"), drawn until each stands on a free square of dirt off the first camp. Until engine 0.24.0, 10 draws placed one only where the square was free, so a world had 2 to 9.
  - **Grass** grows on most of what is left (chance 0.65).
- **Animals:** 8 roam the open ground at the start. They never stand on a tree, in a pit, or on another animal. They move only at End shift (section 4.2).
- **No timber-root and no coal at the surface:** timber-root became dirt (owner: "Let's get rid of the roots square"; "Wood is timber"), and the game places no coal in layer 0 (question 140).
- **Clay** lies in blobs in layers 1–3, in place of dirt and stone.
- **The first camp** is free. It stands on the 3×3 within 4 squares of the middle whose ring holds enough wood and grass for a second camp; among those, the one with the most dirt on top wins, then the one nearest the middle.

### 3.3 Depth bands [Default]

The cube keeps its bands; they shape where things lie. Ore, crystal and the contract's relics lie deep, behind the higher camp levels.

| Band | Layers | Materials |
|---|---|---|
| Upper | 0–3 | Dirt, stone, coal (none in layer 0), clay (layers 1–3) |
| Middle | 4–11 | Stone and hard rock, iron, copper |
| Deep | 12–31 | Hard rock, crystal, rare ore, relics |

The old bands' hazards (water and gas pockets, lava, unstable ore) are not in play for now (section 10).

### 3.4 What the player knows

- **Lit squares** (inside some camp's circle) are shown: their depth, their top block, what grows on them, and any animal.
- **Greyed squares** were lit once and are outside every circle now. They are shown as last seen, greyed, and cannot be mined.
- **Dark squares** were never lit: nothing is known of them.
- **Under the top**, nothing is known until it becomes the top.
- No legal action or forecast depends on something the player has not been shown.

### 3.5 Block types [Default]

| Block | Yields | Mined by |
|---|---|---|
| Dirt | — | a camp of level 1 |
| Rubble | — | a camp of level 1 |
| Clay | Clay | a camp of level 1 |
| Stone | Stone | a camp of level 2 |
| Coal seam | Coal | a camp of level 2 |
| Hard rock | Stone | a camp of level 3 |
| Iron / copper ore | Raw iron / raw copper | any camp, with an iron drill (or a steel drill) |
| Crystal | Crystal | any camp, with a steel drill |
| Unstable ore | Rare ore | any camp, with a steel drill |
| Relic / keystone | Contract item | any camp, with a steel drill |
| Sealed rock, bedrock | — | never |

(Progression plan section 2.2, owner 2026-11-23: "You can't dig hard rock or ore unless your camp is upgraded"; the base camp mines neither rock nor coal.)

Every block costs one tap, whatever it is.

## 4. Shifts

A run is a sequence of **shifts** (owner: "Keep shifts").

### 4.1 The player's turn

- **Taps:** [Default] 100 a shift (`FRONTIER_SHIFT.taps`; owner, after the playtest of PR #146: "100 turns per shift").
- **What costs a tap:** every action that does something costs 1 tap. That covers mining, cutting grass, felling a tree, picking an apple, catching an animal, and placing, upgrading or demolishing a camp. An action that does nothing (a tap in the fog, a block too hard or too steep) costs nothing.
- **No taps left:** every action is refused until End shift.
- **End shift** can be pressed with taps left; they are lost.

| Tap on a lit square | Gives |
|---|---|
| An animal on it (even on a camp's ground) | 1 animal |
| Grass | 1 grass |
| An apple tree with apples | 1 apple a tap |
| A tree, or an apple tree with no apples | 2 wood |
| Nothing growing, and the level rule and the camps allow it | The top block's yield (section 3.5) |
| Flooded (hazards plan section 2), with a pump in the store | Sets the pump there |
| A pump | Picks it up again |
| A fire (section 4.6) | Puts it out |
| A dragon (section 4.7), with a sword in the store | Drives it off |

### 4.2 End shift [Default]

In this order:

1. **Animals:** each takes 3 steps to an open face neighbour. Every 3rd shift a new one walks in at the map's edge, while there are fewer than 8 (question 149).
2. **Apples:** an apple tree picked bare has its 3 apples back 5 shifts later (question 150).
3. **Trees** (owner, question 157: "Trees regrow slowly"): a felled tree leaves a stump, and the same kind of tree grows back on it 15 shifts later; an apple tree comes back with its 3 apples. A tree grows back unless the ground directly under it is mined (owner, after the playtest of PR #146): nothing grows back on a square mined since, because mining digs the stump out, and its ring goes from the map at once (owner, after the playtest of 8842e83). A camp built over a tree leaves a stump, and a stump under a camp waits: it grows back once the camp is demolished. Where an animal stands on the stump, it waits a shift more (decision note 0058).
4. **Grass** (owner, after the 0.20.0 build: "Grass should grow on any open dirt space"): a square whose grass was cut grows grass again [Default] 4 shifts later (`FRONTIER_SHIFT.grassRegrowShifts`), if it is still open then; otherwise it waits a shift more. Every other open square comes up in grass with a [Default] 10% chance a night (`FRONTIER_SURFACE.grassSpreadChance`). Open means dirt never dug with nothing on it: no plant, stump or sapling, crop, mushroom, building or camp (an animal may stand on grass). Mining a square ends its wait. (Until engine 0.21.0 cut grass needed grass beside it, so a patch cut bare stayed bare: question 174.) Grass burns, so a fire in a meadow spreads further.
5. **Saplings** planted grow like a felled tree's stump (section 7a).
6. **Upkeep** (owner, question 147: "Food and wood"):
   - 1 wood every shift;
   - 1 food every 2nd shift: 3 grass, else 1 hay, else an apple, else an animal from the store, never one in a pen (questions 155, 158 and 175; decision note 0057);
   - 1 more wood every 4th shift for each camp after the first.
7. **Pens breed** (section 7b), once the upkeep is paid: the crew eats first.
8. **Going short:** each item of upkeep that cannot be paid costs [Default] 10 taps of the next shift (`FRONTIER_SHIFT.tapsLostPerUnpaid`; section 5).
9. **Fires** spread and burn out their squares (section 4.6).
10. **Pumps** drain [Default] up to 12 squares of their flood each: a whole flood (section 4.5).
11. **Dragons** fly, eat and set fires; a new one may come (section 4.7).
12. **Marauders** may raid a camp (section 4.8).
13. **Rain** (hazards plan section 1; owner, 2026-11-24): on [Default] 1 night in 5 it rains (`FRONTIER_RAIN`). Each **low spot** (a dug square that no face neighbour is deeper than, and that at least one is shallower than) is filled with a [Default] 1 in 2 chance: one block of clay (1 in 3) or dirt goes back on top, so it is 1 shallower. What was on top is buried, not lost. A camp's ground, flooded squares and burning squares are never filled. The level rule still holds after it. Dug does not go down.
14. The next shift starts with a full set of taps.

### 4.3 Mining and the level rule [Decided; numbers Default]

- Only a square's top block can be mined, and only once nothing grows on it.
- **The level rule** (owner: "After mining, at most 1 step"): after the mine, the square must be no more than 1 level lower than each of its face neighbours. Going deep means digging a terraced pit, about one more ring of squares a level.
- **The camps' levels and the tools:** a block can be mined only if a camp whose circle covers the square has a level that mines it (section 3.5). Where several camps cover a square, the best level counts. A block no camp level mines (ore, crystal, relics) can be mined on any camp's lit ground while the store holds a tool that mines it; a tool does not help with a block a camp level mines. A refused tap names one thing: the camp level, or the tool.
- **A camp's own 3×3 is never mined.**
- **Filling with dirt** (owner, after the 0.17.0 build: "Fill any square with dirt as a move. No resource restrictions. Height restrictions still apply."): the 🔨 tool's 🟫 Dirt choice puts one block of dirt on top of a lit, dug square, for 1 tap and nothing else. The level rule holds: a square cannot be filled while a face neighbour is deeper than it (fill that one first). Not on a camp's ground, a building, water, fire or a dragon. What was on top is buried, not lost.
- **The order of the checks:** a tap the level rule forbids says so ("too steep") before saying a block is too hard, so an upgrade never promises a block the level rule still forbids.

### 4.4 Undo

Undo takes back the player's own actions within the current shift, newest first, and gives each one's tap back (question 151). Catching an animal and picking an apple cannot be undone (owner, question 141: "animal and apple harvest cannot be undone"). End shift and closing the mine cannot be undone, and nothing before them can.

### 4.5 Water and the pump [Decided: depth 4; numbers Default]

The owner (2026-11-24): "You can hit water starting at level 3. It fills the area and you need to purchase a pump to remove it by clicking it and waiting." Water starts at depth 4 (question 181). Plan: `docs/plans/hazards.md`, section 2.

- **Hitting water:** the cube's middle band (depth 4 and down) holds water pockets. A mine that opens one, leaving its square at depth 4 or more, floods that square and the dug squares joined to it through face neighbours at the same depth or deeper, up to [Default] 12, nearest first (`FRONTIER_WATER`). A camp's ground is never flooded. A pocket opened higher up collapses to rubble, as before.
- **A flooded square** cannot be mined, a camp cannot stand on it, and rain does not fill it. The water does not spread later.
- **The pump** (`FRONTIER_PUMP`): [Default] 30 coins at the market, from the start. A tap on a flooded square sets one from the store there (1 tap); a tap on it picks it up (1 tap). At each End shift a pump drains [Default] up to 12 squares of its flood, a whole flood (owner, on the hazards build: "Pump takes too long") (the flooded squares joined to its own), the farthest from it first so what is left stays joined to it, its own square last. Then it comes back to the store (question 184).

### 4.6 Gas and fire [Decided: depth 4; numbers Default]

The owner (2026-11-24): "Pockets of gas can explode starting at level 4. This blows away blocks and starts fires on combustable squares. You need to put out each fire with a click." Plan: `docs/plans/hazards.md`, section 3.

- **Hitting gas:** a mine that opens one of the cube's gas pockets, leaving its square at depth 4 or more, explodes with a [Default] 1 in 2 chance (question 185; `FRONTIER_GAS`); otherwise the gas vents. A pocket opened higher up collapses, as before.
- **The blast** takes the top block off every other square in the 3×3 round the mined square, row by row, where the level rule allows it then (question 193), giving nothing. Camps' ground, flooded squares, and squares with plants or stumps are not dug. A blast that opens water floods as a mine would.
- **Fires** start on everything that can burn within [Default] 3 squares: grass, trees, apple trees, stumps, saplings and camps' ground.
- **Putting a fire out:** a tap on it, 1 tap, before anything else on the square.
- **A fire left burning** at End shift spreads to what can burn beside it, then burns its own square out: grass grows back as cut grass does; a tree or apple tree leaves a stump that grows back as a felled tree's does; a stump or sapling starts its wait again; a camp loses one upgrade a night (the lantern, the pen and its animals, the smelter, then a level; a deep camp keeps its level). A fire on a square no camp lights cannot be put out, so it burns out without spreading (question 195).

### 4.7 Dragons and the sword [Decided; numbers Default]

The owner (2026-11-24): "Wandering dragons can eat your sheep and apples and set fire to things. They don't go away until you get a sword and drive them away." Plan: `docs/plans/hazards.md`, section 4.

- **When:** from [Default] shift 20, at End shift, a dragon flies in at the map's edge on [Default] 1 night in 12, while fewer than [Default] 1 are on the map (`FRONTIER_DRAGON`).
- **Each night** each dragon flies [Default] 4 squares in a straight line, in one of 8 directions, over anything and bouncing off the map's edge (owner, on the hazards build: "Dragon doesn't seem to move"); eats one animal on or beside its square (or, on a camp's ground, one from its pen) and every apple on the apple trees on or beside it (they come back as if picked); and on [Default] 1 night in 3 sets fire to one thing that can burn on or beside it. "Beside" is the 8 squares round it.
- **In the day** (owner: "Let's make the dragon fly every time you mine"): a dragon keeps its heading and rests for [Default] 3 to 7 mining taps (owner: "Or every 3-7 mines. So it stays put for a bit."; drawn from the run's generator), then flies [Default] 1 square along it, bouncing off the edge, and rests again. A new dragon comes in heading across the map; each night it takes a new heading.
- **The sword** (question 187): made at a camp with a smelter from 3 iron ingots and 2 wood, or [Default] 60 coins at the market from a level-3 camp. A tap on a dragon with a sword drives it off the map (1 tap); the sword is kept. Without one, a tap on a dragon does nothing.

### 4.8 Marauders and defenses [Decided; numbers Default]

The owner (2026-11-24): "Marauders can come and steal things from your camps and remove their upgrades and put them back to basic. If the camp has defenses though, they can be turned away. The strength of the marauders depends on how far you have dug. The damage they do depends on what level of defense your targeted camp has." Plan: `docs/plans/hazards.md`, section 5.

- **Defenses** (`FRONTIER_DEFENSE`; question 189): three levels, built one at a time from a camp's panel for 1 tap each, at a camp of level 2 or more (question 194), deep camps too: [Default] a palisade (15 wood), a stone wall (20 stone, 10 wood), a gatehouse (10 iron ingots, 20 stone). A raid never takes them down (question 191).
- **When:** from [Default] shift 15, at End shift, on [Default] 1 night in 10, marauders raid one camp drawn at random (question 188; `FRONTIER_RAID`).
- **Strength:** from the deepest square on the map: [Default] 1, then 2 from depth 4, 3 from depth 8, and no more: a camp with all 3 levels of defenses always turns them away (owner, after the 0.20.0 build: "Defneses don't seem to do anything"; it was 4 from depth 16 until engine 0.21.0).
- **Turned away** if the camp's defense level is at least their strength.
- **Otherwise** each point of shortfall (strength minus defense) steals [Default] 10% of each goods stack in the store, rounded down, never coins or tools (question 190; `FRONTIER_RAID.neverStolen`), and tears down [Default] 2 of the camp's upgrades: the lantern, the pen and its animals, the smelter, then levels down to 1. A deep camp keeps its level.

## 5. The crew

There is no avatar. The crew is abstract: it has no position, and it does the work the player taps.

- **No health, no rest** (owner, after the 0.22.0 build: "We don't need crew life anymore. Let's scrap that and the resting."): the crew cannot be lost. Each item of upkeep that cannot be paid costs [Default] 10 taps of the next shift (`FRONTIER_SHIFT.tapsLostPerUnpaid`; owner's choice, "Fewer taps next shift"), never below 0. (Until engine 0.22.0 the crew had 10 health, lost 1 for each unpaid item, rested at a camp to heal, and at 0 the run was lost.)
- **Miners** (owner, after the 0.20.0 build: "Let's add miners to the market. You can hire a miner to add to the crew. You just pay them a annual salary when you hire them. They just need food upkeep."): hired at the market for 200 coins each (owner, after the 0.21.0 build: "Miners should be expensive. Like 200."; they were 80), the salary paid once, up to 4 (`FRONTIER_MINERS`); never sold or stolen. Each eats [Default] 1 food whenever the crew eats. The miners held set the crew's level, from the next shift:

  | Miners | Taps a shift | Long press |
  |---|---|---|
  | 0 | 100 | digs the 3 × 3 round the square: 1 tap a square dug |
  | 1 | 125 | the same: 1 tap a square dug |
  | 2 | 135 | digs the 3 × 3 round the square: the lesser of 4 taps and the squares dug |
  | 3 | 150 | the same, the lesser of 3 and the squares dug |
  | 4 | 165 | the same, the lesser of 2 and the squares dug |

  The long-press dig mines each square of the 3 × 3 whose tap would mine it, row by row, exactly as taps would (yields, water, gas, dragons); a square whose tap would do anything else is left alone. It needs as many taps as it costs. A long press always digs (owner, after the 0.21.0 build: "Long press should always be mine everything possible in 3 by 3 at the expense of one move for each square dug unless you have hired miners"); a camp is placed from ⊕ Place. On screen the dig happens on release (owner, after the 0.22.0 build: "Long press, it highlights squares that will get dug and tells you cost. Release and it digs."): while held, the squares it would dig are washed orange, the 3 × 3 is outlined, its cost shows above it (⚡N, red if the shift has too few taps) and in the hint; the 3 × 3 follows the finger; letting go off the map, or a second finger, digs nothing.

### 5.1 How a run ends, and saving

- A run ends after its last shift, [Default] 100 (`FRONTIER_RUN.shifts`; owner, 2026-11-23): when the End shift of that shift is done, the run is **finished**, short of upkeep or not. It ends sooner only when the player closes the mine (question 152).
- **The score** is the coins held when the run ends [Default; question 170]. The end banner shows it.
- **Saving:** the run is saved at the start of every shift and carried on when the app opens again. Taps within a shift are not saved.

## 6. Camps [Decided: Lab 2's camps]

- **A camp** stands on a 3×3 patch. Its circle covers the squares with `dx² + dy² ≤ r² + r` around its middle, where `r` is its ring. Its ground is never mined.
- **Placing** a new camp needs:
  - a 3×3 that is all lit;
  - level ground (all nine squares at one depth), at a depth of [Default] 2 or less (`FRONTIER_CAMP_PLACE.maxDepth`; owner: "Camps can only be placed in the top three levels");
  - no other camp's ground in the 3×3;
  - the cost, [Default] 15 wood and 15 grass (question 139).

  What grows on the 3×3 is cleared and gives nothing.
- **Upgrading** widens the ring and adds the blocks the camp can mine:

  | Level | Ring | Mines | Upgrade to this level costs | Market every |
  |---|---|---|---|---|
  | 1 | 9 | Dirt, rubble, clay | — (the first camp is free) | 10 shifts |
  | 2 | 12 | + stone, coal | 20 wood, 10 clay, 10 grass, 2 animals | 5 shifts |
  | 3 | 15 | + hard rock | 40 wood, 20 clay, 40 stone, 3 animals, 10 apples, 10 hay | 3 shifts |
  | 4 | 18 | nothing new | 40 wood, 8 iron ingots, 6 copper ingots, 20 stone | 3 shifts |

  What each level mines is the owner's (progression plan section 2.2); the costs, rings and level 4 are [Default]. The level-2 upgrade costs no stone, since a base camp cannot mine it. Level 4's ingots need a smelter somewhere first.

- **The deep camp** (progression plan section 2.4; owner: "New camp type can be placed down in deeper areas so now the entire depth is unlocked") is placed on any lit 3×3 and comes with a **concrete foundation** that digs the 3×3 level, down to its deepest square (owner, on the hazards build: "The deep mine should come with a concrete foundation that levels any spot you place it into 3by3"; the dug blocks give nothing, and it is not placed where an animal stands on a square it would dig). That depth must be [Default] **3 or more**, deeper than any other camp may stand (owner, question 178: "min depth required on the deep camp"), for [Default] a camp kit, 20 wood and 20 stone (`FRONTIER_DEEP_CAMP`); only the market sells the kit, after a tier-1 contract. Its ring is [Default] 12; it mines what a level-3 camp mines and counts as level 3 for the market; it is never upgraded (question 168). It can be demolished, and have a smelter, a pen and a lantern, as any camp. On the map its tag says D. The camp tool switches to it ("⛏ Deep") while a kit is held. The recipe book lists it as a camp of its own, after the new camp and not among the upgrades, with its cost (owner: "The deep camp isn't an upgrade. It's a stand alone camp but it still takes advanced resources to build"); its pin opens the camp tool switched to it.
- **Demolishing** a camp needs other camps' circles to cover its whole 3×3 (question 134). It gives nothing back; its ground can then be mined, and what only it lit turns grey.
- **A smelter** (owner, question 161) can be built at a camp of level 2 or more, from its panel, for [Default] 20 stone and 10 clay and 1 tap. One per camp; it is lost with the camp. While one stands anywhere, the recipe book can smelt: [Default] 2 raw ore + 1 coal make 2 ingots, 1 tap (question 162). (`docs/plans/smelting-and-crafting.md`.)
- **Made from ingots** (question 163), in the recipe book while a smelter stands, 1 tap each:
  - **The iron pickaxe**, [Default] 3 iron ingots + 2 wood. While the store holds one, every mining tap yields [Default] twice as much. Taking from the surface is unchanged. It does not wear out, and a second one adds nothing.
  - **The copper lantern**, [Default] 2 copper ingots + 1 coal (coal, not crystal: question 165). Hung at a camp from its panel (1 tap), it widens that camp's ring by [Default] 3 squares on top of its level. One per camp; it is lost with the camp.
  - **The iron drill**, [Default] 4 iron ingots + 2 copper ingots + 2 wood, or bought at the market. While the store holds one, iron and copper ore can be mined on any camp's lit ground (progression plan section 4; until engine 0.9.0 it lifted every camp one level). The first one has to be bought: ingots need ore. It does not wear out, and a second one adds nothing.
  - **The axe** (owner, after the 0.17.0 build: "Let's add an axe that gets you 3 wood from trees instead of 2"), [Default] 2 iron ingots + 2 wood, or [Default] 25 coins at the market from the start. While the store holds one, felling a tree or an emptied apple tree gives 3 wood, not 2. It does not wear out, a second one adds nothing, and marauders never take it.
- **One-square buildings** are built from the 🔨 tool in the tray (choose which, then tap a square), each for its cost and 1 tap, on one lit square of ground never dug with nothing on it (no camp, plant, stump, animal, water, fire, dragon or other building). Its square is never mined, planted or built on, and a gas blast passes it by. They cannot be removed, and fire and marauders leave them be [Default].
- **The saw house** (owner, after the 0.17.0 build: "you can build a one-square building saw house that increases the harvest of all trees within a camp level 1 radius by 1") is one of them, for [Default] 15 wood and 10 stone and 1 tap, on one lit square of ground never dug with nothing on it (no camp, plant, stump, animal, water, fire or dragon). Every tree felled inside the circle of a level-1 camp's radius (9) round it gives 1 more wood: 3 without an axe, 4 with one. A tree in reach of two saw houses gets the bonus [Default] once. Its square is never mined, planted or built on, and a gas blast passes it by. It cannot be removed. While one stands, **lumber** is made in the recipe book from [Default] 2 wood, for 1 tap (owner, after the 0.22.0 build: "Let's make lumber productable if you have a saw house"; asked, 2 wood a lumber); it sells for 2 coins and lumber contracts ask for it.
- **The sugar shack** (owner, after the 0.17.0 build: "Let's add maple tree saplings and a one square sugar shack where you can produce syrup if you harvest sap") is the other, for [Default] 15 wood and 10 clay. While one stands anywhere, the recipe book boils [Default] 3 sap into 1 syrup, for 1 tap. Syrup sells for [Default] 8 coins; sap for 1 coin a 2.
- **Work camps** (owner, after the 0.20.0 build), built from the 🔨 tray like the one-square buildings but **2 × 2** (the square tapped is its top-left square; all four must be free). Workers are hired from the camp's panel (tap the camp), for coins paid once and 1 tap; each worker adds [Default] 3 to the camp's reach (round any square of its 2 × 2). Every night (End shift, after the crops ripen) each camp's workers work within reach:
  - **Lumberjack camp** ("2 by 2 must be placed next to saw house. You can hire a lumber jack to auto-collect wood each shift. Each lumber jack adds 3 to the radius. After 3 you need to buy a horse and lumber jack for further increases. Food upkeep and syrup upkeep required for the lumber jacks and horses."): must touch a saw house; [Default] 20 wood and 10 stone. Lumberjacks [Default] 60 coins each, up to 6; past 3 each needs a horse ([Default] 80 coins) hired first. Each lumberjack fells one plain tree a night (never an apple or maple tree), nearest first, for a felled tree's wood (axe and saw house included); it leaves a stump.
  - **Farm camp** ("2 by 2 that allows you to hire farmers to auto-harvest crops (planted)"): [Default] 20 wood and 10 clay; farmers [Default] 50 coins, up to 3. They harvest **every** ripe crop in reach (owner's choice: "Everything in reach"), with the seed back half the time.
  - **Hermit camp** ("Hire a gatherer to auto harvest sap, mushrooms, apples"): [Default] 15 wood and 5 stone; gatherers [Default] 50 coins, up to 3. They take every apple, every maple's sap and every mushroom in reach.
  - **Upkeep**, on the nights the crew eats: [Default] 1 food for each worker and horse, and at the lumberjack camp 1 syrup for each lumberjack and horse too. If the store cannot pay a camp's whole upkeep, nothing is paid and its workers skip that night (owner's choice: "They skip that night"). The night's news says what the workers brought in, and which camps went unfed.
- **The steel drill** (bought only, question 172): mines what the iron drill does, and crystal, unstable ore, relics and the keystone.
- **One is enough** (owner, after the 0.17.0 build: "Recipe book can hide items where it doesn't help to have a second"): while the store holds an item a second of which adds nothing (the pickaxe, the drills, the axe, the sword; `FRONTIER_MARKET.uselessWhenHeld`), the recipe book leaves out its recipe and it cannot be made, as the market leaves it out.
- **The recipe book** lists what a new camp and each upgrade cost, and what is made with a smelter (with a Make button). Pinned recipes show, in the tray, how much of each item the player holds against what is needed. Pins are saved (question 143).

## 6a. The market [Decided cadence; prices Default]

(Progression plan section 3, `docs/plans/progression-phases.md`; built in its PR 1.)

- **When:** a market day comes every **10** shifts while the best camp standing is level 1, every **5** at level 2, every **3** at level 3 (owner, 2026-11-23), and [Default] 3 at level 4 (question 167). The market opens **after the night that starts a market day, before the day** (owner, decision note 0063): the night says "Market day", the market's card opens, the player trades, and closing it starts the day. That is the only time it is open.
- **Money** is an item, **coins** (question 170). A run starts with none.
- **Trading:** while the market is open, the player sells or buys any whole number of one item's lots, and takes a contract; none of it costs a tap. Nothing else can be done until the market is closed. A lot is [Default] (`FRONTIER_MARKET`):
  - sold: 5 grass, 2 wood, 2 apples or 2 clay for 1 coin; 10 stone for 1 coin; 1 animal for 3; 1 coal for 1; 1 raw iron or copper ore for 2; 1 ingot for 5; 1 crystal for 20; 1 rare ore for 15; 1 relic for 40;
  - bought: 1 animal for 8 coins; 1 clay for 1 coin; 1 sapling for 3, 1 apple sapling for 6; 1 hay for 1; 10 wood for 8 and 5 apples for 5 (from the start: owner, after the 0.17.0 build; until then after a tier-1 contract); once a tier-1 contract is done, a camp kit for 150; and, while the best camp is level 3 or more, an iron drill for 80, a steel drill for 250, an iron pickaxe for 60 and a copper lantern for 40; an axe for 25 and a maple sapling for 6 from the start. Saplings and hay join with farming (plan section 6).
  - grains and vegetables (section 7d): seeds bought from the start; the crops sold.
  - Nothing can be bought and sold back at a profit.
  - An item a second of which adds nothing is not on sale while one is held, and is bought one at a time (owner, after the 0.17.0 build: "If you own an item and it doesn't help to buy another one, remove that item from the market"): the iron pickaxe, the drills (the iron drill also while a steel drill is held), the axe and the sword (`FRONTIER_MARKET.uselessWhenHeld`). Pumps, lanterns, camp kits and saplings stay on sale: more of them help.
- A trade can be undone while the market is open; closing it starts a new Undo history.
- **Interface:** the market's card opens by itself after a market day's night (and when a run saved with its market open is opened); × or the back button closes it and starts the day. A goals card (🎯) beside the recipe book shows the phase and its goal, the contract held (Deliver, Drop) and when the market opens next. Coins are shown next to Dug in the counter.

## 7a. Saplings [Decided; numbers Default]

(Progression plan section 6.2; built in its PR 3.)

- **Where saplings come from:** only the market, which sells saplings and apple saplings (owner, decision note 0063). Felled trees give none, and the recipe book makes none.
- **Planting** costs 1 tap and one sapling, on a lit square of surface dirt that was never mined, with nothing growing on it, no camp and no animal; a stump may be planted over (the new sapling replaces it). Cut grass waiting there no longer grows.
- **Pulling one up** (owner, after the 0.20.0 build: "Click on a block with growing saplings and it removes the sapling, but does not dig the block"): a tap on a planted sapling pulls it up, for 1 tap, and puts it back in the store [Default]; the ground is not dug. The next tap digs. On the map a maple sapling has red-orange maple leaves, unlike the others (owner: "Make the maple sapling look different").
- **Growing:** a sapling becomes a tree [Default] 5 shifts later, an apple or maple sapling a tree full of apples or sap [Default] 8 shifts later (owner, after the 0.20.0 build: "Saplings take way too long"; they were 15 and 20), by the stump rules (section 4.2): it waits under an animal or a camp; a tap on it pulls it up (see above).
- **Maple trees** (owner, after the 0.17.0 build) grow only from maple saplings ([Default] 6 coins at the market from the start; a maple tree [Default] 20 shifts after planting). A maple holds [Default] 3 sap; a tap takes 1, and tapped dry it fills again as an apple tree's apples come back. A dry maple is felled for wood by the next tap, as an emptied apple tree is. Sap is boiled into syrup at a sugar shack (section 6). On the map a maple is red-orange, with a sap bucket while it holds sap.
- **Interface:** while a sapling is held, a 🌱 button in the tray opens the planting mode: choose a sapling, an apple sapling or a maple sapling, then each tap on the map plants one, or the hint says why it cannot. A planted sapling is drawn as a small sprout. Planting can be undone.

## 7c. Mushrooms [Decided; numbers Default]

Owner, after the 0.17.0 build: "If a (non-maple) tree is standing when rain happens, 3-7 days later a mushroom has a chance of emerging. The chance increases for every adjacent space where there is another tree. Contracts for mushrooms in the market and mushrooms sell for gold."

- **When:** on a night it rains, every plain tree (not a maple, nor an apple tree: owner, after the 0.18.0 build: "Let's omit apple trees from mushroom generation") with no mushroom on it or coming gets one coming with a chance of [Default] 2%, plus [Default] 3% for each of the 8 squares round it with a tree of any kind, at most [Default] 30% (`FRONTIER_MUSHROOM`).
- **Where and when it comes up:** on the tree's square, after [Default] 3 to 7 nights (drawn), if the tree still stands there (owner, after the 0.20.0 build: "Mushrooms need uncut trees to grow and appear"); otherwise it is lost. A standing mushroom whose tree is gone (burnt, or cleared for a camp) is lost at the next night too. The night's news says how many came up in sight of a camp (inside a camp's circle); those out of sight come up untold (owner, after the 0.22.0 build: "Only tell me about a mushroom if it is in range of a camp").
- **Picking:** a tap on the square picks the mushroom (1 mushroom) before anything else there; the tree is untouched. On the map it is a small mushroom with a short stalk, in one of 7 looks (red with white spots, brown bolete, golden funnel, white button, violet, orange cone, a little yellow pair), at a spot of its square; the look and spot are fixed by the square, so they never change from frame to frame (owner, after the 0.22.0 build).
- **Use:** sold at the market for [Default] 3 coins each; contracts ask for them: tier 1, 10 mushrooms for 60 coins; tier 2, 30 for 220. The board offers them only once the mushrooms standing, coming and held add up to what they ask.

## 7d. Grains and vegetables [Decided; numbers Default]

Owner, after the 0.19.0 build: "Let's add seeds to the market for a few grains and vegetables. You can plant these in soil and they grow and you can harvest."

| Crop | Seed (market, from the start) | Ripe after | A harvest gives | Food | Sells |
|---|---|---|---|---|---|
| Wheat | 2 coins | 6 shifts | 4 wheat | 2 a meal | 2 for 1 coin |
| Corn | 3 coins | 8 shifts | 3 corn | 1 a meal | 1 coin |
| Carrot | 2 coins | 5 shifts | 3 carrots | 1 a meal | 1 coin |
| Potato | 3 coins | 7 shifts | 4 potatoes | 1 a meal | 1 coin |

(`FRONTIER_CROPS`; every number a [Default].)

- **Sowing:** from the 🌱 tool, as a sapling is planted, for 1 tap: on lit surface dirt never dug, with nothing growing on it and no stump, sapling, mushroom, building, camp or animal. The tool offers only what is held; its row scrolls sideways.
- **Growing:** each End shift brings it a shift nearer ripe; the night's news says when crops ripen. While it grows, a tap on it does nothing and costs nothing, so a stray tap never digs it up.
- **Harvest:** a tap on a ripe crop puts its harvest in the store and leaves bare dirt, ready for another seed. Half the time (owner, after the 0.20.0 build: "When you harvest plants get one seed as well 50% of the time"; `FRONTIER_SEED_BACK`) one of its seeds comes with it.
- **Food:** eaten after apples and before an animal (section 4.2).
- On the map a sown square is dark, furrowed earth with sprouts; a ripe one shows its wheat, corn, carrots or potatoes.

## 7b. Hay and animal pens [Decided; numbers Default]

(Progression plan section 6.3; built in its PR 4.)

- **Hay** is made in the recipe book from [Default] 3 grass, for 1 tap, with no smelter. It is food for the crew (after grass, before apples; question 175), it feeds a pen's new animals, and level 3 costs 10. The market sells it, 1 coin each.
- **A pen** is built at a camp of level [Default] 2 or more (as the smelter), from its panel, for [Default] 10 wood and 1 tap (`FRONTIER_PEN`). One per camp; it goes with the camp, and its animals go back to the store.
- **Animals** are put in from the store, or taken out to it, 1 tap each, up to [Default] 4 in a pen. Upkeep never eats a penned animal.
- **Breeding:** at End shift, after upkeep, a pen with at least 2 animals and room for one more counts down [Default] 4 shifts, then gains an animal and the store gives up [Default] 2 hay. With too little hay it waits, trying again each shift. A pen that may not breed keeps no count.
- **Interface:** a camp's panel has "🐑 Build pen", then the pen's count, when the next animal is due, and In and Out buttons. The night says when an animal is born.

## 7. Resources

- **Items:** wood, grass, apples, animals, clay, stone, coal, the ores, and coins (section 6a). Everything gathered goes into one store with no limit.
- **What uses them:** camps and upgrades (section 6), and upkeep (section 4.2): wood, and grass, apples or animals as food. Stone and clay build smelters; raw ore and coal smelt into iron and copper ingots; iron ingots and wood make the pickaxe; copper ingots and coal make the lantern; both ingots and wood make the drill; ingots pay for camp level 4 (section 6).
- **Coal and raw iron and copper are smelted into ingots** at a smelter. Ingots make the pickaxe, the lantern and the drill, and pay for camp level 4; the first contract asks for ingots (questions 163 and 164). Crystal and the rare ores have no use yet; a later contract may ask for crystal.
- **There is no crafting for now:** the recipe book replaces it, and recipes can be added to it later.

## 8. Contracts [Decided: tiers and delivery; the list Default]

(Progression plan sections 1 and 5; built in its PR 5. This replaces v0.2's single contract that won the run.)

- **The board:** on a market day the market's card shows [Default] 3 to 7 contracts (owner, after the 0.20.0 build: "Contract management. Only 3-7 available to take"), the number drawn for the day: up to 3 of each open tier are drawn, then taken in turn from each tier, highest first, so every open tier is offered, and shown lowest tier first (`FRONTIER_BOARD`). All of it is drawn from the run's seed and the shift: the same seed and shift always show the same board, and the next market day shows another. **Only contracts the world can fill are offered** (owner, on the hazards build: "Let's inventory the entire board so that the contracts offered are not unfillable"; `worldStock`): what is still in the ground under every square down to [Default] 4 levels below the deepest square dug (owner: "Gauge on how deep the player has dug, no keystone or relics etc if they are still far away"; `reachBelowDeepest`), what the store holds, and the ingots its ore and coal could be smelted into must cover every ask. Every world holds [Default] 8 relics (depth 12 and down) and 2 keystones (depth 20 and down), placed from the seed (`FRONTIER_TREASURE`; owner, question 197: "Add relics and key stones"), so the tier-3 contracts can be filled; tier 2's coal contract asks for 40 (owner, question 197: "Lower the contract"), which every world holds. Every world also gets [Default] 25 extra seams of 4 to 9 coal at depth 1 to 11 (`FRONTIER_COAL`; owner: "We need to add more coal. It takes a lot to smelt all the ingots you need for things"), about 160 more: 208 to 265 in all.
- **Tiers open in turn:** tier 1's **surface contracts** from the first market day (owner, after the 0.22.0 build: "We need more surface resource contracts especially early game. Wood, hay, sheep, syrup, apples, mushrooms, crops"; asked, "From the first market day"); the rest of tier 1 while the best camp is level [Default] 3 or more; tier 2 once any tier-1 contract is delivered, a surface one too (owner's choice); tier 3 once a tier-2 one is. Each tier's surface contracts and its others are drawn apart, up to 3 of each, and taken in turn, surface first, so neither crowds the other off the board.
- **Surface contracts** (`surface: true`): tier 1 asks for 30 wood (22 coins), 20 hay (20), 3 animals (20), 20 apples (18), 5 syrup (60), 10 mushrooms (60), 20 wheat (25), 15 corn (30), 10 carrots and 10 potatoes (40), or 10 lumber (40); tier 2 for 30 mushrooms (220), 40 lumber (220), 20 syrup (260), provisions (30 apples, 20 corn, 10 hay: 200) or 10 animals (80). What grows back, or is bought and made (wood, hay, animals, apples, syrup, lumber, crops: `FRONTIER_BOARD.renewable`), always counts as to be had; mushrooms are counted.
- **One of each a market day:** a contract taken or filled leaves that day's board (`boardUsed`, emptied every night), so the same one cannot be filled again and again. **No money pump:** where the market sells everything a contract asks for, it pays no more than buying it would cost (so the firewood, hay, apple and flock contracts pay less than the plan's tier ranges).
- **The contracts** (`FRONTIER_CONTRACTS`, every one [Default]): tier 1 asks for coal, stone, raw ore, ingots or clay, for 40 to 120 coins; tier 2 for the same in bulk, clay too (200 or 400 for a road or a town, owner: "high volume clay contracts for bricks and pottery and roads"), for 150 to 450; tier 3 for crystal, rare ore, relics or the keystone, for 700 to 2,000. Each pays more than its items fetch at the market. The surface contracts are above.
- **Taking** one is done only while the market is open, for no tap. As many may be held at once as the best camp's level (owner, after the market-scene build: "Let's allow multiple contracts at a time. As many as your highest camp level"; a deep camp counts as level 3); each is delivered or dropped by itself. **Delivering** is done on any shift once the store holds everything it asks for, for no tap, even with no taps left (owner, after the 0.20.0 build: "Free, any time"; it cost 1 tap until engine 0.21.0): the items leave the store and its coins arrive ("Done on delivery", question 89). **Dropping** it is free too and gives nothing back. There is no deadline. A contract never ends the run.
- **Filling at the market** (owner, on the hazards build: "Should be able to immediately fill contracts if you have the materials"; engine 0.14.0): while the market is open, a contract on the board whose asks the store already holds can be filled at once: it is delivered without being held, so it needs no free place, for no tap. Contracts held can be delivered at the market too, for no tap. The market's card shows Fill instead of Take for those, and lists the contracts held with Deliver.
- **Phases** (plan section 1): the run is in phase 1 until a camp reaches level 2, phase 2 until one reaches level 3, phase 3 until a tier-1 contract is delivered, phase 4 until a tier-2 one is, then phase 5 (`runPhase`). The market's card names the phase and what moves it on (`FRONTIER_PHASES`).
- **Interface:** the top of the market's card shows the phase and its goal, the contract held (have/need for each item, Deliver and Drop), and the board (Take). The market's button glows when the contract held can be delivered.

Unchanged from v0.2 in intent, and not built yet: a contract asks for deliverables (ore, relics); the run is won the moment the last one reaches the store (owner, question 89: "Done on delivery"). Until contracts exist, a run ends only as in section 5.1.

## 9. Meta-progression: unlocks [Decided]

Payouts are **credits**, spent between runs. Unlocks add options; they never raise base stats. Tools, contract tiers, cube biomes and loadouts, as in v0.2. **Rule:** a fresh save must be able to complete a tier-1 contract.

## 10. The old game's rules

| Rule | Now |
|---|---|
| Wall slumps, cracks and supports | **Retired** (question 153: the level rule leaves no steep walls; decision note 0053) |
| Smelting, and crafting with ingots | **Built** (engine 0.8.0; owner, questions 159 and 161 to 164): a smelter at a camp, ingots from raw ore and coal, an iron pickaxe, a copper lantern, an iron drill and camp level 4. The plan: `docs/plans/smelting-and-crafting.md`. The simulator's numbers: decision note 0060; tuning questions 165 and 166 answered (the lantern takes coal; the drill is unchanged) |
| Fuel and coal-fuelled digging; the deeper bands' ore | Later: it was first back (question 153) until smelting took its place (question 159) |
| Water and gas; pumps | **Coming back** in the frontier's own form: `docs/plans/hazards.md` |
| Lava; unstable ore and explosives; tells and scanning; vents, sealant | Dropped for now; they come back one at a time, in an order the owner chooses then |
| AP and per-block mining costs | Replaced by taps, every tap costing 1 |
| The old camps (camp kit, mining discount, decommission) and field crafting | Replaced by Lab 2's camps and the recipe book |

Each rule that comes back is its own small batch, playtested before the next.

## 11. Interface (mobile first)

- **Primary view:** the ground from above. Lit squares show their top block and what grows on them, shaded by depth so the terraces read at a glance. Greyed squares are drained of colour, and the fog is dark. Animals slide to their new squares when a shift ends.
- **Tap:** a tap on a lit square takes or mines (one action, no menu). A tap on a camp opens its panel (upgrade, demolish). A refused tap says why.
- **Three buttons along the map's top-right edge** (owner, UI rework: "Don't need the close mine button. ... Three small buttons where close mine used to be: Contracts, Recipe book/Craft, Place button"; after the 0.22.0 build: "horizontal across the top and a bit larger"), in a row, 42 px each, left to right: ⊕ **Place**, 📖 **Craft** (the recipe book), 🎯 **Contracts** (the goals card; lit gold, as the old tray button was, when a contract held can be delivered). There is no Close mine button any more; a run ends after its last shift.
- **Place** opens a tray of everything that can be placed (owner's choice): ⛺ Camp, 🌱 Plant (while a sapling or a seed is held), each building, and 🟫 Dirt, in a row that scrolls sideways. Each opens its own tray. **The camp tool** previews the ring and the squares it would light, says what is missing, and shows the cost; a press on the chosen 3 × 3 **drags it** across the map (owner: "When placing a camp, you should be able to drag the square around the map"); a press anywhere else still pans.
- **The recipe book** opens as a card over the whole screen, inside the system bars; × or the phone's back button closes it (owner, after the playtest of PR #146). It shows what the store holds, in a row under its title (owner: "When crafting, we need to show inventory").
- **The tray under the map:** the pinned recipes' bar, then the square legend at the bottom (owner: "Square Legend at bottom", the pinned bar above it).
- **HUD**, over the map so it never moves it: shift and taps left. **End shift** at the bottom-left, by the thumb; **Undo** at the bottom-right.
- **Night** (owner, after the playtest of PR #146): when a shift ends, the screen fades to black and white, then to dark, and shows the moon, whose phase steps once a shift through 8 phases from the shift number, with a line on what the shift's end paid and cost. About 2.6 s; a tap skips it; with reduced motion it is a still moon and a quick fade. The game has already moved on when it starts.
- **The resource counter** is one row above the map (owner, UI rework: "Inventory scroll bar - still at top").
- **Orientation:** portrait, with a landscape layout for phones on their side. One-handed play should be possible.

## 12. Run length targets [Default]

Not set for the new game yet. The simulator (`npm run sim`) measures runs; at the default numbers (100 taps a shift), with scripted players over 40 shifts (1,000 runs each, decision note 0058):
- a player who keeps wood and food back for upkeep places 3 camps, has one at level 3, digs 11 levels down and is short in only 19 runs of 1,000; none lost its crew;
- one who spends everything as it comes is short in 115 runs, and lost its crew in none;
- a player who stays at one camp and digs lost its crew in 10 runs, for want of wood once its ring's ground was mined;
- a random player loses its crew in 8 runs of 1,000.

With 100 taps, upkeep takes about 2 taps a shift: close to trivial, and the owner wants it left that way (question 160).

**With the progression batch** (engine 0.9.0, 100 shifts a run, 100 runs; decision note 0062): a careful player finishes all 100 runs, reaches phase 3 at a median shift of 12, phase 4 at 21 and phase 5 at 42 (97 runs in 100), delivers a median of 29 contracts and ends with a median of about 3,200 coins. Apples are enough for level 3 when apple trees are left standing (question 177); wood is bought at the market late in a run.

## 13. Open questions

1. Run length targets and the contracts (sections 8 and 12): a run is now 100 shifts (owner, 2026-11-23); the progression plan's defaults are questions 167 to 176.
2. Art direction and audio: pixel art chosen (decision note 0004); details open.
3. Monetisation: not yet discussed.
4. Game title.

Answered by the owner on 2026-11-23, to be built next: smelting and crafting (questions 159 and 161 to 164; `docs/plans/smelting-and-crafting.md`), and upkeep stays easy at 100 taps (question 160).

Answered by the owner on 2026-11-22, and built (sections 4.2, 5 and 11; decision note 0057): trees regrow slowly (question 157), grass is food (158), animals stay food (155), and the crew rests only at a camp (156).
