# Mining Game — Game Design Doc (v0.2)

Working title: **Mining Game**. A turn-based roguelike for Android and iOS. The player looks down on a 32×32×32 cube from above, mines it from the top down one block at a time by selecting squares, digs a terraced pit, and fulfils a contract while keeping the crew alive.

**How to read this doc**
- **[Decided]** marks a choice the designer (Matt) has made. Do not change these without asking.
- **[Default]** marks a proposed starting value or rule. These are expected to change in playtesting, and every number here must live in data files, not in code.
- Numbered questions ("question 80") are rows in `docs/owner-questions.md`.

**What changed from v0.1** (owner, 2026-11-20; issue #82; decision note 0025). The player no longer controls a miner. The world is seen only from above, as a heightmap of the cube: every square shows its top block, and the player taps a square to mine that block. The level rule keeps neighbouring squares within one level of each other, so going deep means digging a terraced pit. An abstract crew health bar replaces the avatar's health, air, light and carrying. Cave-ins become pit walls that slump. Movement, falls, ladders, air, light, lamp oil, torches, carry weight and the escape are gone. v0.1 is in the git history; decision note 0025 lists what it superseded.

---

## 1. Pillars

1. **Every block is a bet.** The player sees the whole surface but nothing under it. Mining a block reveals the one beneath. Hazards give readable tells on the blocks the player can see, so a loss is traceable to a decision.
2. **The pit is the plan.** No square may be mined more than one level below its neighbours, so every level down costs a wider pit. The shape the player digs (terraces, benches, supports, sumps) is the strategy.
3. **Resources buy options, not power.** Materials become tools, supports, and camps. Nothing makes the crew simply stronger.
4. **Deterministic and seeded.** The same seed and the same inputs always produce the same run.

## 2. Core decisions [Decided]

| Topic | Decision |
|---|---|
| World | One 32×32×32 cube, seen only from above as a heightmap: each of the 32×32 squares shows its top block. The player mines from the top down by selecting a square, which removes its top block (section 3) |
| Level rule | A square's top block may be mined only if, afterwards, that square is no more than 1 level lower than each of its 4 face neighbours (north, east, south, west; diagonals do not count). Going deep means digging a terraced pit (section 4.2) |
| Visibility | Every square's top block is always shown. Only what lies under the top is hidden (section 3.4) |
| Genre | Resource gathering and management; roguelike, with run-ending hazards |
| Pacing | Turn-based |
| Player | No avatar. The player taps any top block on the map to mine it; there is no walking and no escape. An abstract **crew** with a health bar does the work, and hazards in the pit damage it (section 5) |
| Hazards | Pit walls slump; water floods the pit; lava; gas (section 6) |
| Base | Middle path: field crafting for basics, plus buildable camps at depth. Without a miner, "at depth" means mining near a camp is cheaper, so camps move down the pit (owner, question 90; section 8) |
| Win condition | Finish the contract: it is done the moment the last deliverable reaches the stockpile, with no Act 2 (owner, question 89: "Done on delivery"). The run is lost if crew health reaches 0 (section 9) |
| Meta-progression | Unlocks only (new options between runs); no permanent stat upgrades |
| Platforms | Android and iOS |

**The owner's words** (2026-11-20, issue #82). The request: "Can we only always show the top level. No going down or up. Mining a block can't be done unless the block above it is gone. No block can be mined more than one level differential from any adjacent block." The choices that followed:

- Level rule: "After mining, at most 1 step."
- Miner: "No miner, just select." There is no avatar, no walking, and no escape.
- Cave-ins (following "You still need to reinforce walls though to avoid cave ins", issue #80): "Pit walls slump." A steep or tall pit wall of weak material can slump into the pit; a support placed on a wall square stops it.
- Visibility: "Whole surface."
- Win and lose: "Keep a 'crew' health bar." The run ends if it reaches 0, and the player wins by finishing the contract.
- Hazards to keep: "All four": pit walls slump, water floods the pit, lava, gas.

These replace three v0.1 rows: World ("mined from the top down by selecting blocks", which now holds literally), Player ("an avatar on the board that can be hurt, trapped, and killed") and Win condition ("contract plus escape"). The Level rule, Visibility and Hazards rows are new.

## 3. The cube and the terrain

### 3.1 Cube, squares and depth

- **Coordinates:** `(x, y, z)`, each 0–31. `z = 0` is the top layer and `z = 31` is the bottom. "Down" means increasing `z`.
- **Generation:** Fully determined by a seed, generated once at run start. The cube is still fully three-dimensional under the surface: rock, ore veins, caverns and pockets are placed in 3D as in v0.1 (section 3.6).
- **Squares:** the 32×32 columns `(x, y)`. The player acts on squares, never on a block inside the cube.
- **Depth:** a square's depth is how many blocks have been removed from it. Every square starts at depth 0. Its **top block** is the block in layer `z = depth`. Mining a square removes its top block and lowers the square by 1; slumps and other hazards can also raise or lower a square (section 6).
- **Steps:** distances between squares are counted in steps, and a step is to a face neighbour (north, east, south or west; no diagonals). So "within 4 steps" means a Manhattan distance of 4 or less.
- **Level** is the same thing seen the other way: a square at depth 3 is 3 levels down, and is 1 level lower than a neighbour at depth 2. "Higher" means shallower.
- **The bottom:** a square at depth 32 has mined out its whole column; it shows the bedrock floor and cannot be mined further.
- **The sides [Default]:** the bedrock walls round the cube are not squares. A square on the edge has 3 face neighbours (a corner square 2), and the level rule ignores the wall (question 84).
- **Ground level** is depth 0. Nothing ever stands above it: no rubble pile, sealant or stone formed by water and lava may raise a square above depth 0.

### 3.2 The surface: forest, meadows, paths, outcrops

The surface is the open air above `z = 0`, one cell per square. It is mostly forest (owner, issue #70; decision note 0020).

- **Surface cells [Default]:** each square starts as a *tree*, a *meadow*, a *dirt path* or a *stone outcrop*; about 65% start as trees. Meadows, paths and outcrops are open ground: the layer-0 block under them is the square's top block and is seen from the start. With no miner there is no start clearing and nobody walks: paths and meadows are scenery, laid out by the v0.1 generator less its start clearing. A path is open ground over whatever is there (it no longer wears stone to dirt; decision note 0020 Consequences).
- **Coal in sight [Default]:** at least one square on open ground has coal as its top block at the start. Generation turns a plain-rock layer-0 block under open ground into coal if none is (owner, question 67, re-expressed without a start cell).
- **Trees:** a tree is a square's top. It hides the layer-0 block under it, even when a neighbouring square has been dug (question 92). A tree square is at depth 0 and holds its ground: it never slumps (question 92).
- **Cutting [Default]:** tap a tree to cut it: 2 AP, gives 2 timber. It leaves a *stump*, which is open ground, and the block under it becomes the square's top block and is shown.
- **Regrowth:** a stump grows a tree again after 10 shifts (owner), counting the shift of the cut, at the end of a shift (after the cube phase, before upkeep). Once its square has been mined it never grows a tree again (owner: "Trees grow back if their spot isnt mined in a few turns"). A regrown tree hides the block under it again; the block stays known. Meadows, paths and outcrops never grow trees.

### 3.3 Depth bands [Default]

| Band | Layers | Materials | Hazards introduced |
|---|---|---|---|
| Upper | 0–7 | Dirt, stone, coal, timber-root | Slumping dirt, small caverns |
| Middle | 8–19 | Stone and hard rock, iron, copper | Water pockets, gas pockets, caverns |
| Deep | 20–31 | Hard rock, crystal, rare ore, relics | Lava, unstable ore, large caverns |

How deep a run can reach under the level rule is measured before anything is tuned (owner, question 85: "Measure first"): see section 12.

### 3.4 What the player knows

- **Every square's top block is known**, with its tells (section 3.7), from the start and after every change. With the level rule, a top block is the only block of a square with an exposed face, so "the top is known" and "only exposed faces are known" are the same rule.
- **Under a tree** the layer-0 block is unknown until the tree is cut.
- **Anything below the top is unknown** until it becomes the top, or a scan reveals it (section 7.2). A revealed block stays revealed.
- **What the player sees of the pit:** each square's depth, top block, any water, lava or gas on it, cracks and their countdowns, supports, pumps, vents, placed explosives and camps. All of these are visible; none is hidden.
- No legal action, AP cost or forecast may depend on a block the player has not been shown. Tells (section 3.7) are the one deliberate exception, as in v0.1: they report something hidden near a visible block.

### 3.5 Block types [Default]

| Block | Mine cost (AP) | Yields | Slump limit | Notes |
|---|---|---|---|---|
| Dirt | 1 | — | 1 | Weak: slumps at the top of any slope that falls 2 levels or more |
| Stone | 2 | Stone | 2 | Standard |
| Hard rock | 3 | Stone | 3 | 2 AP with a drill. Holds a slope that falls up to 3 levels |
| Coal seam | 2 | Coal | 2 | Fuel source |
| Timber-root | 1 | Timber | 2 | Upper band only; trees on the surface are the other source |
| Iron / copper ore | 2 | Raw iron / raw copper | 2 | Smelt at a camp |
| Crystal | 3 | Crystal | 3 | Deep band |
| Unstable ore | 2 | Rare ore | 2 | Explodes if a neighbour is mined first without bracing (6.6) |
| Relic / keystone | 2 | Contract item | 2 | Placed by the contract generator |
| Rubble | 1 | — | 1 | Left by slumps and by breached spaces |
| Sealed rock | 2 | — | 2 | Made by sealant |
| Bedrock | — | — | — | Cube floor and sides; unmineable |

The slump limit is used in section 6.1.

### 3.6 Pre-generated features [Default]

- **Caverns:** open voids under the surface. When mining breaks into one it collapses (section 6.2).
- **Fluid pockets:** sealed volumes of water or lava, released when breached (6.2).
- **Gas pockets:** sealed volumes of gas, released when breached (6.2).
- **Veins:** ore generates in connected veins, so finding one block suggests more nearby.

### 3.7 Tells [Default]

Tells show on top blocks (and on blocks a scan revealed). There is no light any more, so every tell on a known block is always seen.

| Tell | Shown on | Says |
|---|---|---|
| Mineral traces | Plain rock (dirt, stone, hard rock) within 2 steps of iron ore, copper ore or crystal, counted through the cube in 3D | Ore is near: not which ore, or which way (decision note 0012) |
| Damp stone | Blocks within 1 of a water pocket | Water under or beside |
| Pitted rock | Blocks within 1 of a gas pocket | Gas under or beside |
| Warm glow | Blocks within 2 of lava | Lava near |
| Hairline glow | Unstable ore itself | Brace it or mine it first |
| Crack and countdown | A block that will slump | When it will fall (6.1) |

Traces stay on the map once seen, and misleading hints are acceptable (owner, questions 51 and 54). Because "within 1" counts the block below, a pocket one block under a top block shows its tell before the mine that would breach it.

## 4. Turn structure

A run is a sequence of **shifts**. Each shift has three phases.

1. **Player phase.** The player spends **action points (AP)**. [Default] 5 AP per shift.
2. **Cube phase.** Hazards advance one step, in a fixed order: (a) slumps: cracked blocks whose countdown has ended fall, then newly unstable squares crack (6.1); (b) water and lava flow (6.3, 6.4); (c) gas spreads, vents act, then charges and armed unstable ore go off, then ignition (6.5, 6.6); (d) countdowns tick; (e) damage to the crew is applied, then rest. Structures and camps are destroyed at the moment of the event that destroys them. After the cube phase, stumps regrow (3.2).
3. **Upkeep.** Fuel is consumed. [Default] 1 fuel per shift, plus 1 per active camp every 4 shifts. If fuel is already 0 when upkeep comes, the run ends; otherwise the shift's fuel is taken. So a crew whose fuel reaches 0 has one last shift to craft fuel (owner, question 19).

The player may end the player phase early. [Default] Unspent AP is lost when the shift ends: it does not carry over and does not become fuel (owner, question 23).

### 4.1 Actions [Default]

Every action that targets a square may target any square on the map: there is no reach.

| Action | AP | Other cost |
|---|---|---|
| Mine a square's top block (4.2) | Per block type; 1 less near a camp (section 8); +1 if the square is flooded | — |
| Cut a tree | 2 | — (gives 2 timber) |
| Place a support on a square | 1 | 1 support |
| Place an explosive on a square | 1 | 1 explosive |
| Place a pump or vent on a square | 1 | Crafted item |
| Seal a square | 1 | 1 sealant |
| Scan | 2 | 1 scanner charge |
| Craft (field or camp) | 1 | Materials |
| Found a camp | The rest of the shift (at least 1) | 1 camp kit |
| Rest at a camp | The rest of the shift (at least 1) | Restores crew health |
| Decommission a camp | 1 | — |
| Close the mine | 0 | Ends the run (9.4; question 88) |

- **Yields** go straight into the **stockpile**, which has no limit (question 87).
- **Placing:** a square holds at most one structure (support, pump, vent, explosive). Nothing is placed on a tree, on lava, or on a camp square. Sealant is not used on a square at ground level.
- **Undo:** the player may undo actions within the current player phase as long as they revealed nothing new (question 7 is still open). Every mine reveals a new top block, so in practice only crafting and placing can be undone.

### 4.2 Mining and the level rule [Decided; numbers Default]

- Only a square's top block can be mined. A square with a tree must be cut first; a square with lava on it cannot be mined; a square at depth 32 cannot be mined.
- **The level rule** (owner: "After mining, at most 1 step"): after the mine, the square must be no more than 1 level lower than each of its face neighbours. Put the other way round: a square may be mined only when none of its face neighbours is higher than it.
- So a square at depth 3 can be mined to depth 4 only if every neighbour is at depth 3 or deeper. Going deep means digging a terraced pit, about one extra ring of squares per level.
- **The rule limits the player's mining only.** Hazards (slumps, explosions, a breached cavern) can leave a step of 2 or more; such a step is unstable and slumps (6.1).
- **AP:** the block type's mine cost (3.5). [Default] 1 less (never below 1) near a camp (section 8); +1 if water stands on the square (6.3); a square with lava on it cannot be mined (question 91).
- **What the player is told:** a tap on a square the rule forbids says which neighbours are too high.

## 5. The crew

There is no avatar. The player's crew is abstract: it has no position on the map, does not walk, and cannot be trapped. It does the work the player selects, and it is hurt by hazards where it has been working.

### 5.1 Crew health [Default]

| | Value |
|---|---|
| Start | 10 |
| Lost by | Hazards that reach a worked square (5.2) |
| Restored by | Resting at a camp: restores health to full in step (e) of the cube phase, if the crew is still alive |
| At 0 | The run ends (5.3) |

### 5.2 What hurts the crew [Default]

A **worked square** is a square the player mined, cut, or placed a support, pump, vent or sealant on during the shift that is ending, or a camp square while the crew rests there. Placing an explosive does not make its square worked: the crew withdraws before a charge goes off. In the cube phase, hazards that reach a worked square hurt the crew:

| Hazard | Hurts the crew when | Damage | v0.1 source |
|---|---|---|---|
| Slump (6.1) | A block slumps from a worked square, or comes to rest on one | 3 | Rockfall 4 |
| Water (6.3) | Water enters a worked square | 1 | Air loss in water |
| Lava (6.4) | Lava is on a worked square / beside one | 5 / 1 | Lava 5 / 1 |
| Gas (6.5) | Gas is on a worked square | 1 | Air loss in gas |
| Gas explosion (6.5) | An exploding gas square is a worked square or beside one | 3 | Owner, question 64 |
| Explosion: charge or unstable ore (6.6) | The blast includes a worked square | 6 | Owner, question 64 |

- **Each kind of hazard hurts the crew at most once per shift**, by its largest amount. So two slumps onto worked squares in one cube phase deal 3, not 6; a slump and a gas explosion deal 6.
- Damage is recorded in the order the cube phase meets it and applied in step (e); the first entry that brings health to 0 names the loss.
- The question of what hurts the crew, and how much, is question 83. Water and gas hurt the crew directly now that air is gone.

### 5.3 How a run ends

- **Crew lost:** crew health reaches 0. The loss is named by its cause: buried (slump), drowned (water), burned (lava or an explosion), poisoned (gas).
- **Out of fuel:** fuel is already 0 when upkeep comes (section 4).
- **Contract finished:** the last deliverable reaches the stockpile (9.4).
- **Mine closed:** the player chooses to end the run (9.4).

There is no entombment and no soft-lock: the player can always end the shift, close the mine, or craft.

### 5.4 Removed with the avatar

Movement, falls and fall damage, air, light radius, lamp oil, torches, the safety lamp, carry capacity, item weights, loose items, pick-up and drop, the stash, ladders, mining overhead, entombment and "give up", and the escape. Where a removal left a hole, the [Default] that fills it is in this doc and listed as an owner question: water and gas hurt the crew directly (question 83); mineral traces need no light (question 86); the stockpile has no limit (question 87); a run can be ended alive by closing the mine (question 88).

## 6. Hazards

All hazards are deterministic and advance only in the cube phase. Each active hazard shows a **countdown** or its spread in the UI, and the end-shift preview (section 11) says what the next cube phase will do to everything the player can see.

### 6.1 Pit walls slump [Default]

Owner: "Pit walls slump. A steep or tall pit wall of weak material can slump into the pit. A support placed on a wall square stops it."

- **Slide path.** From a square, the path a loose block would take: step to the square's lowest face neighbour (ties broken north, east, south, west) if that neighbour is deeper than the square the path is on, and repeat; the path ends at its **foot**, the first square with no deeper neighbour. A square's **fall** is how much deeper its foot is than the square itself. Each step goes at least 1 level down, so a path always ends.
- **Unstable.** A square is unstable when either:
  - *tall:* its fall is more than the **slump limit** of its top block (3.5): dirt and rubble 1, most rock 2, hard rock and crystal 3; or
  - *steep:* it is 2 or more levels higher than a face neighbour, whatever its material. Only a hazard can make such a step (4.2).
  
  Either way its fall is at least 2. Trees, supported squares and bedrock are never unstable: a tree's roots and a support hold the square.
- **Warning.** In step (a) an unstable square's top block **cracks** and shows a countdown: [Default] 2, so it falls at the end of the shift after next. The countdown runs only while the square stays unstable and unsupported; otherwise it stops, and goes on from where it stopped if the square becomes unstable again.
- **The slump.** When the countdown ends, the top block slides down the square's slide path (worked out at that moment) and comes to rest on its foot as rubble. The square goes down 1 level and the foot comes up 1. Whatever the block was (ore included) is lost as rubble; a support, pump or vent on the foot is buried and destroyed.
- **Why it always ends, and never rises above ground.** The block starts in layer d (the square's depth) and the foot is at least 2 levels deeper, at depth d + 2 or more, so the block comes to rest in layer d + 1 or lower: strictly lower than where it started. The foot ends at depth 1 or deeper, never above ground level. Every slump moves one block at least one layer down and nothing moves a block up, and no block can go below the bottom, so a cascade always ends, even with no player action.
- **Cascades.** A slump can make other squares unstable; each cracks with its own warning.
- **Supports.** A support placed on a square holds its top block: it does not crack, and a crack already on it stops counting down. Mining the square takes the support away with the block; the support is lost (question 82).
- **What this means in play [Default numbers]:** a run of 1-level steps falls as far as its last step, so slopes need level benches: in dirt a bench after every step, in stone after every second step, in hard rock after every third; or supports on the squares at the top of a run. Everything the rule reads (depths, top blocks, supports) is visible, so the player can always see a slump coming before choosing a mine.
- The exact rule is question 81.

### 6.2 Breaking into an underground space [Default]

An underground space is a cavern, or a water, lava or gas pocket. Mining the block above one would drop the square many levels at once and break the level rule. Proposed rule (question 80):

- When a mine exposes a cell of an underground space (the cell under the mined block is open), the space **collapses**: every cell of it becomes rubble at once. The mined square's new top block is that rubble, so the square goes down 1 level as usual, and the level rule still holds.
- The space's **contents are pushed out onto the mined square**: each water cell gives 1 unit of water, each lava cell 1 unit of lava, each gas cell its units of gas ([Default] 4). They then spread by 6.3–6.5.
- **Lava sources [Default]:** a lava pocket of more than 8 cells keeps pouring: the mined square becomes a lava source that gives 1 more unit on every lava step until the square is sealed (sealant) or turned to stone by water.
- A cavern is generated empty (decision note 0017 item 21), so breaking into one releases nothing and leaves rubble, which is cheap to dig (1 AP, no yield).
- Only the mined square's rubble is shown; the rest of the space stays hidden until each square reaches it. The amount released says how big the space was.

### 6.3 Water [Default]

- **Water stands on squares.** A square's water is a number of units standing in the open cells above its top block. Its **water level** is how high that water stands.
- **Flow:** each shift, water moves at most one square, always towards a neighbour with a lower water level, until the pit is level. Water never stands above ground level: water that would sits on the surface and drains away.
- **Effects:** mining a flooded square costs +1 AP. Water entering a worked square hurts the crew (5.2). Water entering a camp square destroys the camp (section 8).
- **Counters:** pumps ([Default] remove 3 units a shift from squares within 2 steps), sealant (a 1-block dam), and digging a sump lower than the working area so that water collects away from it.
- **Tell:** damp stone on blocks within 1 of a water pocket.

### 6.4 Lava [Default]

- Lava stands on squares and flows like water, but only on even-numbered shifts.
- It destroys supports, pumps, vents, placed explosives and camps it reaches. A square with lava on it cannot be mined. It hurts the crew on or beside a worked square (5.2).
- **Water meeting lava** makes stone: where they would meet, both become a stone block on the square, which raises it by 1 (never above ground level). A source that turns to stone stops.
- **Tell:** warm glow on blocks within 2.

### 6.5 Gas [Default]

- **Gas is heavier than air** and lies in the pit (question 94). Each shift a square's gas spreads to its face neighbours that are no higher than it (at the same depth or deeper), thinning as it goes (each gives an even share and keeps the rest, as decision note 0014 item 13). Gas never climbs, so it never leaves an open pit by itself: it blows away only if its own square comes up to ground level, which happens when stone forms on it where water meets lava (question 119; decision note 0035).
- Gas on a worked square hurts the crew (5.2).
- **Ignition:** lava or an explosion in or beside a gassy square ignites it, and all connected gassy squares go off as one explosion: it removes the gas, destroys structures in and beside those squares, and hurts the crew (3, owner question 64). There are no torches, so lava and explosions are the only sources.
- **Counters:** vents ([Default] clear all gas within 2 steps each shift), burning it off (lava or a blast), and sealant on the square it stands on. Digging a channel to ground level does not work: every square of a pit is below ground level and gas does not climb (question 119).
- **Tell:** pitted rock on blocks within 1 of a gas pocket.

### 6.6 Unstable ore and explosions [Default]

- **Unstable ore** is armed when a block beside it on its own layer (the same-layer block of a neighbouring square) is mined while the ore is known (a top block or scanned) and unbraced. Armed ore goes off in step (c): the ore is destroyed with no yield, and the blast covers its square and the four beside it. Only mines the player could have judged arm it (owner, question 58, re-expressed).
- **Counter:** brace it (a support on its square) first, or mine it before the blocks beside it.
- **Placed explosives** go off in step (c) of the shift they were placed in. The blast removes the top block of its square and of the four squares beside it, with no yield; a tree in the blast is destroyed with no timber and the block under it stays. Blocks removed this way ignore the level rule; any steep step left behind slumps by 6.1.
- **Any explosion** destroys structures in its squares, ignites gas in or beside them, and hurts the crew if it includes a worked square (6, owner question 64).
- **Relics and keystones** in a blast are destroyed with a probability ([Default] 0.5) and are otherwise left in place (owner, question 65).
- **Tell:** hairline glow on unstable ore.

## 7. Resources and crafting

### 7.1 Field crafting (anywhere) [Default]

| Item | Recipe | Use |
|---|---|---|
| Support | 1 timber + 1 stone | Holds a square against slumping; braces unstable ore |
| Fuel (×3) | 1 coal | Upkeep |

Torches and lamp oil are removed (no light).

### 7.2 Camp crafting (camp only) [Default]

| Item | Recipe | Use |
|---|---|---|
| Iron / copper ingot | 2 raw ore + 1 coal → 2 ingots | Smelted; the other camp recipes take ingots |
| Drill | 3 iron | Hard rock costs 2 AP |
| Pump | 2 iron + 1 copper | Removes water (6.3) |
| Vent | 2 copper + 1 timber | Clears gas (6.5) |
| Scanner charge | 1 copper + 1 crystal | One scan |
| Sealant | 1 stone + 1 coal | Places a block of sealed rock on a square (raising it by 1), destroying the water, lava or gas on it: a dam, or a plug for a source |
| Explosive | 2 coal + 1 iron | Clears the top blocks of 5 squares (6.6) |
| Camp kit | 4 iron + 4 timber + 2 copper | Founds a new camp |

- **Scan [Default]:** 2 AP and 1 charge, aimed at any square: reveals, for that square and the 8 round it (3×3), the 3 blocks under each top block. The map shows a mark on a scanned square for what lies beneath (ore, a pocket, a cavern), and the square's known blocks are listed when the player holds it (question 93; the map itself shows only the top level).
- The safety lamp is removed (no light).

## 8. Camps [Decided: field crafting plus camps at depth]

- **Founding [Default]:** a camp kit and a flat 3×3 patch of squares: all at the same depth, none with a tree, water, lava, gas or a structure on it. It costs the rest of the shift. The standard loadout carries one camp kit (owner, question 63).
- **Functions:** smelter and workbench (camp recipes), and rest (crew health back to full). A camp's functions are available from anywhere on the map: the crew is abstract.
- **Mining near a camp is cheaper [Default]** (owner, question 90: "Mining near it is cheaper"): mining a square costs 1 AP less (never below 1) when the square is within 4 steps of a camp square and no more than 4 levels deeper than the camp. So as the pit deepens, the discount runs out and the next camp goes further down: that is what "camps at depth" means without a miner. In practice distance is the limit that binds: under the level rule a square k steps from a camp is at most k levels deeper, so the depth limit matters only where a hazard has broken the rule, and the discount runs out because the pit spreads away from the camp.
- **While a camp stands** its 9 squares cannot be mined.
- **Vulnerability:** a camp is destroyed when water or lava enters one of its squares, an explosion includes or is beside one, or a block slumps from or onto one. A destroyed camp is lost.
- **Upkeep:** active camps consume fuel (section 4). The player can decommission a camp to stop the upkeep; its squares can then be mined.
- There is no stash (the stockpile has no limit) and no air line (there is no air).

## 9. Contracts [Decided]

### 9.1 The contract

- At run start the player chooses 1 of 3 generated contracts.
- A contract has: 2–4 **deliverables** (e.g. 6 copper ingots, 2 crystals, 1 relic), a **survey hint** for each unique item (e.g. "relic signal, north-east, layers 24–28"), a difficulty tier, a payout, and optional **bonus clauses** (e.g. no explosives; finish within 180 shifts).
- The final deliverable is always a **keystone item** in the deep band. Whether the deep band is within reach is measured first (owner, question 85; section 12).

### 9.2 Finishing the contract

- Owner (question 89): "Done on delivery." A contract is finished the moment its last deliverable reaches the stockpile; the run then ends with full success.
- There is no Act 2. v0.1's escape (taking the keystone started an escape while the cube destabilised) is gone; taking the keystone is simply the last deliverable.

### 9.3 Before contracts exist

Until contracts are built (M4), the only way to end a run alive is to close the mine, which ends it as salvage (question 88, replacing question 20's "leave from the surface").

### 9.4 Outcomes (owner, question 89)

| Outcome | Condition | Result |
|---|---|---|
| Full success | All deliverables in the stockpile | Full payout plus bonuses |
| Partial | The player closes the mine with some deliverables | Pro-rated payout |
| Salvage | The player closes the mine with no deliverables | Small fee based on the stockpile |
| Lost | Crew health reaches 0, or out of fuel (5.3) | No payout |

## 10. Meta-progression: unlocks [Decided]

Payouts are **credits**, spent between runs. Unlocks add options; they never raise base stats.

- **Tools:** New camp blueprints (e.g. sonar scanner, rock bolts, foam sealant, shaped charge).
- **Contracts:** Higher tiers and new types (rescue, seal-the-breach, shift-limited).
- **Cubes:** Biomes with their own rules (ice, volcanic, ruins).
- **Loadouts:** Starting kits with trade-offs (e.g. Surveyor: extra scanner charges, less fuel).

**Rule:** A fresh save must be able to complete a tier-1 contract with the starting kit.

**Records:** A mine log (hazards, ores, and tells encountered), run history (seed, contract, deepest square, how the run ended), and a daily seed.

## 11. Interface (mobile first)

- **Primary view:** the whole surface from above: all 32×32 squares, each drawn with its top block's colour and pattern, shaded by depth (deeper is darker) so the terraces read at a glance. There are no layers and no depth slider: only the top level is ever shown (owner: "only always show the top level. No going down or up").
- **Secondary view:** a small rotatable 3D view of the terrain showing the pit, water, lava, gas, camps and cracks.
- **Interaction:** a tap on a square mines it, or cuts its tree (one action, no menu, as in decision note 0023). A tap the level rule forbids says which neighbours are too high. Before a mine, the screen marks the squares it would make unstable. A risky tap (a mine that would make a square unstable, or a mine of a square whose crack falls at the end of this shift) needs a second tap to confirm. Other actions (support, explosive, pump, vent, seal, scan) are chosen from a tool bar and then aimed with a tap. No action needs a precise tap in 3D.
- **HUD:** AP remaining, fuel, crew health, shift number, contract progress, the stockpile, and a hazard list with countdowns.
- **End shift** is an explicit button with a preview of what the cube phase will do to everything the player can see: cracks and their countdowns, slumps, flows, gas, charges, regrowth.
- **Orientation:** Portrait. One-handed play should be possible.

## 12. Run length targets [Default]

- 150–250 shifts for a completed tier-1 contract; 20–40 minutes.
- Roughly 2–3% of the cube mined per run (question 44: these first two targets disagree with the AP numbers).
- **How deep a pit costs (owner, question 85: "Measure first").** Under the level rule, the cheapest pit that reaches depth D is a terraced cone. Blocks to mine, with no slump benches:

  | Depth | Pit in the middle | Pit against a side | Pit in a corner |
  |---|---|---|---|
  | 8 (middle band) | 344 | 204 | 120 |
  | 12 | 1,156 | 650 | 364 |
  | 20 (deep band) | 5,252 | 2,840 | 1,540 |

  At 5 AP a shift and 1–3 AP a block, 250 shifts mine roughly 500–800 blocks. So on paper the middle band is within reach, and the deep band (crystal, relics, the keystone) is not, with today's numbers. Benches for slump safety (6.1) make pits wider still; explosives (6.6) and the camp discount (section 8) make them cheaper. The owner chose to measure first: the bands stay as they are, a depth survey in the simulator measures how deep runs actually get, and the numbers are tuned after that.
- A run can be suspended and resumed at any point (autosave every shift).

## 13. Open questions

1. Resource and recipe tree: the tables above are placeholders and need a balance pass.
2. Slump rule: needs playtesting for readability on a phone (question 81).
3. Art direction and audio: pixel art chosen (decision note 0004); details open.
4. Monetisation: not yet discussed.
5. Whether the crew or company has any persistent identity (name, cosmetic) across runs.
6. Biome rule sets beyond the base cube.
7. Game title.
8. The owner questions raised by v0.2: 80–94 in `docs/owner-questions.md` (85, 89 and 90 answered by the owner; the rest assumed defaults).
