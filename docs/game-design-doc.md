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
| Player | No avatar. A tap on a lit square takes what is on it (an animal, grass, an apple, a tree) or mines its top block. An abstract **crew** with a health bar does the work (section 5) |
| Hazards | **None for now** (owner: "Lab 2 becomes the game"). The old ones come back one at a time, fuel and depth bands first; wall slumps and supports are retired (question 153, section 10) |
| Harm | **Hunger only** (owner, question 148): each item of upkeep that cannot be paid costs the crew 1 health (section 5) |
| Base | **Camps** (Lab 2's): placed on a level 3×3 of lit ground, upgraded to see further and dig harder rock, demolished once other camps cover them. The recipe book shows what each costs; there is no crafting for now (section 6) |
| Win condition | Finish the contract (not built yet; section 8). Until then a run ends when the crew is lost or the player closes the mine (question 152) |
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
  - **Apple trees:** 10 are scattered, each with 3 apples.
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

| Block | Yields | Mined by camps of level |
|---|---|---|
| Dirt | — | 1 |
| Rubble | — | 1 |
| Stone | Stone | 1 |
| Coal seam | Coal | 1 |
| Clay | Clay | 1 |
| Hard rock | Stone | 2 |
| Iron / copper ore | Raw iron / raw copper | 3 |
| Crystal | Crystal | 3 |
| Unstable ore | Rare ore | 3 |
| Relic / keystone | Contract item | 3 |
| Sealed rock, bedrock | — | never |

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

### 4.2 End shift [Default]

In this order:

1. **Animals:** each takes 3 steps to an open face neighbour. Every 3rd shift a new one walks in at the map's edge, while there are fewer than 8 (question 149).
2. **Apples:** an apple tree picked bare has its 3 apples back 5 shifts later (question 150).
3. **Trees** (owner, question 157: "Trees regrow slowly"): a felled tree leaves a stump, and the same kind of tree grows back on it 15 shifts later; an apple tree comes back with its 3 apples. A tree grows back unless the ground directly under it is mined (owner, after the playtest of PR #146): nothing grows back on a square mined since, because the stump is dug out. A camp built over a tree leaves a stump, and a stump under a camp waits: it grows back once the camp is demolished. Where an animal stands on the stump, it waits a shift more (decision note 0058).
4. **Upkeep** (owner, question 147: "Food and wood"):
   - 1 wood every shift;
   - 1 food every 2nd shift: 3 grass, else an apple, else an animal (questions 155 and 158; decision note 0057);
   - 1 more wood every 4th shift for each camp after the first.
5. **Hunger:** each item of upkeep that cannot be paid costs 1 health (section 5).
6. The next shift starts with a full set of taps.

### 4.3 Mining and the level rule [Decided; numbers Default]

- Only a square's top block can be mined, and only once nothing grows on it.
- **The level rule** (owner: "After mining, at most 1 step"): after the mine, the square must be no more than 1 level lower than each of its face neighbours. Going deep means digging a terraced pit, about one more ring of squares a level.
- **The camps' levels:** a block can be mined only if a camp whose circle covers the square has a level that mines it (section 3.5). Where several camps cover a square, the best level counts.
- **A camp's own 3×3 is never mined.**
- **The order of the checks:** a tap the level rule forbids says so ("too steep") before saying a block is too hard, so an upgrade never promises a block the level rule still forbids.

### 4.4 Undo

Undo takes back the player's own actions within the current shift, newest first, and gives each one's tap back (question 151). Catching an animal and picking an apple cannot be undone (owner, question 141: "animal and apple harvest cannot be undone"). End shift, rest and closing the mine cannot be undone, and nothing before them can.

## 5. The crew

There is no avatar. The crew is abstract: it has no position, and it does the work the player taps.

- **Health:** [Default] 10.
- **What hurts it:** hunger only, for now (owner, question 148). Each item of upkeep that cannot be paid costs 1 health.
- **Rest**, only at a camp (owner, question 156: "Only at a camp"): the crew has no position, so it rests at the camp whose panel the player opens and taps Rest in. It restores full health, then the shift ends as with End shift, so that shift's upkeep is still paid.
- **At 0 health** the crew is lost and the run ends.

### 5.1 How a run ends, and saving

- A run ends when the crew is lost, or when the player closes the mine (question 152).
- **Saving:** the run is saved at the start of every shift and carried on when the app opens again. Taps within a shift are not saved.

## 6. Camps [Decided: Lab 2's camps]

- **A camp** stands on a 3×3 patch. Its circle covers the squares with `dx² + dy² ≤ r² + r` around its middle, where `r` is its ring. Its ground is never mined.
- **Placing** a new camp needs:
  - a 3×3 that is all lit;
  - level ground (all nine squares at one depth);
  - no other camp's ground in the 3×3;
  - the cost, [Default] 15 wood and 15 grass (question 139).

  What grows on the 3×3 is cleared and gives nothing.
- **Upgrading** widens the ring and adds the blocks the camp can mine:

  | Level | Ring | Mines | Upgrade to this level costs |
  |---|---|---|---|
  | 1 | 9 | Dirt, rubble, stone, coal, clay | — (the first camp is free) |
  | 2 | 12 | + hard rock | 20 wood, 10 clay, 15 stone, 1 animal |
  | 3 | 15 | + iron, copper, crystal, unstable ore, relics, the keystone | 40 wood, 20 clay, 40 stone, 3 animals, 10 apples |

- **Demolishing** a camp needs other camps' circles to cover its whole 3×3 (question 134). It gives nothing back; its ground can then be mined, and what only it lit turns grey.
- **The recipe book** lists what a new camp and each upgrade cost. Pinned recipes show, in the tray, how much of each item the player holds against what is needed. Pins are saved (question 143).

## 7. Resources

- **Items:** wood, grass, apples, animals, clay, stone, coal, and the ores. Everything gathered goes into one store with no limit.
- **What uses them:** camps and upgrades (section 6), and upkeep (section 4.2): wood, and grass, apples or animals as food.
- **For now, coal and the ores have no use.** They are for the rules that come back (section 10) and the contracts (section 8).
- **There is no crafting for now:** the recipe book replaces it, and recipes can be added to it later.

## 8. Contracts [Decided]

Unchanged from v0.2 in intent, and not built yet: a contract asks for deliverables (ore, relics); the run is won the moment the last one reaches the store (owner, question 89: "Done on delivery"). Until contracts exist, a run ends only as in section 5.1.

## 9. Meta-progression: unlocks [Decided]

Payouts are **credits**, spent between runs. Unlocks add options; they never raise base stats. Tools, contract tiers, cube biomes and loadouts, as in v0.2. **Rule:** a fresh save must be able to complete a tier-1 contract.

## 10. The old game's rules

| Rule | Now |
|---|---|
| Wall slumps, cracks and supports | **Retired** (question 153: the level rule leaves no steep walls; decision note 0053) |
| Fuel and coal-fuelled digging; the deeper bands' ore | **First back** (question 153) |
| Water, lava, gas; unstable ore and explosives; tells and scanning; pumps, vents, sealant; the drill; smelting | Dropped for now; they come back one at a time, in an order the owner chooses then |
| AP and per-block mining costs | Replaced by taps, every tap costing 1 |
| The old camps (camp kit, mining discount, decommission) and field crafting | Replaced by Lab 2's camps and the recipe book |

Each rule that comes back is its own small batch, playtested before the next.

## 11. Interface (mobile first)

- **Primary view:** the ground from above. Lit squares show their top block and what grows on them, shaded by depth so the terraces read at a glance. Greyed squares are drained of colour, and the fog is dark. Animals slide to their new squares when a shift ends.
- **Tap:** a tap on a lit square takes or mines (one action, no menu). A tap on a camp opens its panel (rest, upgrade, demolish). A refused tap says why.
- **The camp tool** (⛺+) places a new camp. It previews the ring and the squares it would light, says what is missing, and shows the cost.
- **The recipe book** (📖, in the tray) opens as a card over the whole screen, inside the system bars; × or the phone's back button closes it (owner, after the playtest of PR #146). The pinned row is in the tray.
- **HUD**, over the map so it never moves it: shift, taps left, health. **End shift** at the bottom-left, by the thumb (Rest is in a camp's panel); **Undo** at the bottom-right; **Close mine** at the top-right, with a second tap to confirm.
- **Night** (owner, after the playtest of PR #146): when a shift ends (End shift or Rest), the screen fades to black and white, then to dark, and shows the moon, whose phase steps once a shift through 8 phases from the shift number, with a line on what the shift's end paid and cost. About 2.6 s; a tap skips it; with reduced motion it is a still moon and a quick fade. The game has already moved on when it starts.
- **The resource counter** is one row above the map.
- **Orientation:** portrait, with a landscape layout for phones on their side. One-handed play should be possible.

## 12. Run length targets [Default]

Not set for the new game yet. The simulator (`npm run sim`) measures runs; at the default numbers (100 taps a shift), with scripted players over 40 shifts (1,000 runs each, decision note 0058):
- a player who keeps wood and food back for upkeep places 3 camps, has one at level 3, digs 11 levels down and is short in only 19 runs of 1,000; none lost its crew;
- one who spends everything as it comes is short in 115 runs, and lost its crew in none;
- a player who stays at one camp and digs lost its crew in 10 runs, for want of wood once its ring's ground was mined;
- a random player loses its crew in 8 runs of 1,000.

With 100 taps, upkeep takes about 2 taps a shift: close to trivial (decision note 0058 lists the levers).

The targets come with the contracts (section 8).

## 13. Open questions

1. Run length targets and the contracts (sections 8 and 12).
2. Art direction and audio: pixel art chosen (decision note 0004); details open.
3. Monetisation: not yet discussed.
4. Game title.

Answered by the owner on 2026-11-22, and built (sections 4.2, 5 and 11; decision note 0057): trees regrow slowly (question 157), grass is food (158), animals stay food (155), and the crew rests only at a camp (156).
