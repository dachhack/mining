# Mining Game — Game Design Doc (v0.1)

Working title: **Mining Game**. A turn-based roguelike for Android and iOS in which the player mines a 32×32×32 cube from the top down, fulfils a contract, and escapes.

**How to read this doc**
- **[Decided]** marks a choice the designer (Matt) has made. Do not change these without asking.
- **[Default]** marks a proposed starting value or rule. These are expected to change in playtesting, and every number here must live in data files, not in code.

---

## 1. Pillars

1. **Every block is a bet.** The player sees only exposed faces. Mining reveals neighbours. Hazards give readable tells, so a death is traceable to a decision.
2. **The dig is the escape route.** Whatever the player carves on the way down is what they climb out through.
3. **Resources buy options, not power.** Materials become tools, supports, and camps. Nothing makes the avatar simply stronger.
4. **Deterministic and seeded.** The same seed and the same inputs always produce the same run.

## 2. Core decisions [Decided]

| Topic | Decision |
|---|---|
| World | One 32×32×32 cube, mined from the top down by selecting blocks |
| Genre | Resource gathering and management; roguelike, with run-ending hazards |
| Pacing | Turn-based |
| Player | An avatar on the board that can be hurt, trapped, and killed |
| Base | Middle path: field crafting for basics, plus buildable camps at depth |
| Win condition | Contract plus escape: collect the contract's deliverables, then get out |
| Meta-progression | Unlocks only (new options between runs); no permanent stat upgrades |
| Platforms | Android and iOS |

## 3. The cube

- **Coordinates:** `(x, y, z)`, each 0–31. `z = 0` is the top layer and `z = 31` is the bottom. "Down" means increasing `z`.
- **Generation:** Fully determined by a seed. Generated once at run start.
- **Visibility: only exposed faces are known** (owner, issue #75 and after PR #72; decision notes 0021 and 0022). A cell is *revealed* in exactly these ways, on every layer, the top layer included; nothing else reveals one. Unrevealed cells render as unknown, whether rock or open. A revealed cell stays revealed.
  - **Light:** a cell that is lit, or that shares a face with a lit open cell. Light spreads from its source through open cells, a step at a time through faces: round corners, never through rock. The sources are the miner's lamp ([Default] radius 3; with the lamp out, radius 0: only the miner's own cell, decision note 0011), torches ([Default] radius 3), and **daylight**, which does the lamp's work round the miner while it stands on the surface, lamp oil or not: it spreads over the open surface cells (not into trees) and so reveals the layer-0 blocks under them. Daylight does not reveal the whole top layer, and does not shine down a hole.
  - **Touch:** the six cells that share a face with the miner's own (north, east, south, west, above, below), lamp lit or not. From the surface that is only the layer-0 block underfoot.
  - **Scanner:** the cells a scan reveals (section 4.1).
  - Not revealed: the cells the pick can reach beyond those six, the cell overhead beyond touch, what lies over an edge or under a floor that no light reaches. (These were revealed with the lamp lit before issue #75: decision note 0005 item 10 and question 40, replaced by 0022.)
- **Surface:** The layer above `z = 0`, one cell per column, where the avatar starts, at the centre. Reaching the surface is how a run is completed. It is open air for water, gas and air, and mostly forest (owner, issue #70; decision note 0020):
  - **Surface cells [Default]:** each is a *tree*, a *dirt path*, a *meadow* or a *stone outcrop*; about 65% start as trees. Paths, meadows and outcrops are open ground: the avatar walks on them, and daylight round the avatar reveals the layer-0 block under them. A path is worn into dirt (ore under it stays), an outcrop stands over stone, a meadow over whatever is there. The start cell and its eight neighbours are meadow, and winding paths join them to the meadows and to at least two edges of the cube. Coal is always in sight at the start (owner, PR #72): at least one coal block is among the layer-0 blocks the avatar sees from its start cell; generation puts one there if none is.
  - **Trees:** a tree blocks walking (and stepping up into it) and hides the layer-0 block under it: neither light nor touch from the surface reveals it, and it cannot be mined from the surface. From underground it is seen and mined like any other block.
  - **Cutting [Default]:** cut a tree in a surface cell beside the avatar (north, east, south or west): 2 AP, gives 2 timber (too heavy to carry is left on the stump, as for mining). It leaves a *stump*, open ground, and the block under it is revealed.
  - **Regrowth:** a stump grows a tree again after 10 shifts (owner), counting the shift of the cut, at the end of a shift (after the cube phase, before upkeep), if its layer-0 block is still solid; while that block is gone the count goes back to 0. If the avatar or loose items stand on the stump when the count is reached, the tree grows at the end of the first shift the stump is clear. A regrown tree blocks walking again; the block under it stays known. Paths, meadows and outcrops never grow trees.

### 3.1 Depth bands [Default]

| Band | Layers | Materials | Hazards introduced |
|---|---|---|---|
| Upper | 0–7 | Dirt, stone, coal, timber-root | Loose rock, small voids |
| Middle | 8–19 | Hard stone, iron, copper | Water pockets, gas pockets, caverns |
| Deep | 20–31 | Hard rock, crystal, rare ore, relics | Lava, unstable ore, large caverns |

### 3.2 Block types [Default]

| Block | Mine cost (AP) | Yields | Notes |
|---|---|---|---|
| Dirt | 1 | — | Cannot span gaps; always falls if unsupported |
| Stone | 2 | Stone | Standard |
| Hard rock | 3 | Stone | 2 AP with a drill |
| Coal seam | 2 | Coal | Fuel source |
| Timber-root | 1 | Timber | Upper band only; trees on the surface are the other source |
| Iron / copper ore | 2 | Raw ore | Smelt at a camp |
| Crystal | 3 | Crystal | Deep band |
| Unstable ore | 2 | Rare ore | Explodes if a neighbour is mined first without bracing |
| Relic / keystone | 2 | Contract item | Placed by the contract generator |
| Bedrock | — | — | Cube boundary on the sides and bottom; unmineable |

### 3.3 Pre-generated features [Default]

- **Caverns:** Open voids. Free movement and exposed ore, but may hold drops, pooled water, or gas.
- **Fluid pockets:** Sealed volumes of water or lava that are released when breached.
- **Gas pockets:** Sealed volumes of gas that spread when breached.
- **Veins:** Ore generates in connected veins, so finding one block suggests more nearby.
  - **Tell [Default]:** Mineral traces. Plain rock (dirt, stone, hard rock) within 2 steps of iron ore, copper ore, or crystal, counted through the grid, shows mineral traces once it is revealed and lit. They say ore is near, not which ore or which way. Traces stay on the map once seen. None are noticed in the dark: with the lamp out underground, only torches show them (on the surface, daylight round the avatar does). (Decision note 0012.)

## 4. Turn structure

A run is a sequence of **shifts**. Each shift has three phases.

1. **Player phase.** The player spends **action points (AP)**. [Default] 5 AP per shift.
2. **Cube phase.** Hazards advance one step, in a fixed order: (a) support check and falling blocks, (b) fluids flow, (c) gas spreads, (d) timers tick, (e) damage is applied to the avatar. Structures are destroyed at the moment of the event that destroys them.
3. **Upkeep.** Fuel is consumed. [Default] 1 fuel per shift, plus 1 per active camp every 4 shifts. If fuel is already 0 when upkeep comes, the run ends; otherwise the shift's fuel is taken. So a miner whose fuel reaches 0 has one last shift to reach the surface and leave, or craft fuel: in a tunnel that is almost always fatal.

The player may end the player phase early. [Default] Unspent AP is lost when the shift ends: it does not carry over and does not become fuel.

### 4.1 Actions [Default]

| Action | AP | Other cost |
|---|---|---|
| Move 1 block (walk, climb a ladder, step up 1) | 1 | — |
| Drop down 1–2 blocks | 1 | — |
| Mine an adjacent block | Per block type | — |
| Cut a tree beside you on the surface | 2 | — (gives 2 timber) |
| Place ladder / support / torch | 1 | Materials |
| Place pump / vent / sealant | 1 | Crafted item |
| Scan | 2 | 1 scanner charge |
| Craft (field or camp) | 1 | Materials |
| Pick up / drop / stash items | 0 | — |
| Rest at camp | Whole shift | Restores health and air |

- **Adjacent** means the face neighbours: north, east, south and west on the avatar's own level, and the block it stands on (owner, issue #75: as in Minecraft; no diagonals, nothing else on the level below). The avatar cannot mine the block directly above its head without a support in its own cell first (it would fall on them). Mining the block it stands on is *digging down* (section 5.2). A stair is dug by mining the block ahead, walking in and digging down, and can be walked back up (section 5.2, step up 1).
- **Undo:** The player may undo actions within the current player phase as long as no new information was revealed by them.

## 5. The avatar

### 5.1 Stats [Default]

| Stat | Start | Lost by | Restored by |
|---|---|---|---|
| Health | 10 | Falls, rockfall, burns, explosions | Resting at a camp |
| Air | 10 | 1 per shift while in gas or water, or cut off from an air source | Refills fully in connected air |
| Carry capacity | 20 weight | — | Stashing at a camp; smelting (ingots are lighter) |
| Light radius | 3 | Lamp oil running out (drops to 0: only the miner's own cell, so it knows just the six cells it touches; decision note 0011) | Lamp oil, torches |

Lamp lit or not, the miner knows the six cells touching its own; light shows the rest (section 3, Visibility).

### 5.2 Movement and gravity

- The avatar stands on solid blocks, ladders, or camp floors.
- A chosen drop of 1–2 blocks is free. An uncontrolled fall, any fall that does not directly follow a move (the miner lost its footing for any reason, such as digging down into open space), is not free: it also deals [Default] 1 damage for each of the first 2 blocks. A ladder in the miner's own cell is footing, so it prevents the fall. A fall of 3–5 deals [Default] 2 damage per block beyond 2. A fall of 6 or more is fatal.
- **Digging down (owner, issue #75):** mining the block the avatar stands on drops it onto the block below that: a safe one-block drop ([Default] `AVATAR.safeDigDownBlocks` = 1), no damage, a chosen drop. If there is nothing under that block the avatar falls on, and the whole fall, counted from where it stood, is uncontrolled. A ladder in its own cell holds it, as ever. Before it digs, the miner is told only what it knows: until it has seen the cell under the block, "you drop at least one block; if there is nothing under it you will fall further and be hurt".
- Climbing up more than 1 block requires a ladder or cut steps.

### 5.3 Ways a run ends in death

- **Crushed:** A falling block hits the avatar and brings health to 0 or below.
- **Drowned / suffocated:** Air reaches 0.
- **Burned:** Health reaches 0 from lava or explosion.
- **Fell:** Fatal fall.
- **Entombed:** No path to the surface exists and the avatar lacks the fuel and materials to make one. The engine must detect this (conservatively) and offer to end the run; it must never soft-lock.
- **Out of fuel:** Fuel is already 0 when upkeep comes (section 4).

## 6. Hazards

All hazards are deterministic and advance only in the cube phase. Each active hazard shows a **countdown** in the UI.

### 6.1 Cave-ins [Default]

- A block is *supported* if it rests on a solid block, or is within its material's horizontal span of a supported block, or is under a placed support.
- Dirt has a span of 0. Stone has a span of 2. Hard rock has a span of 3.
- An unsupported block becomes **cracked**, then falls after 2 shifts. Falling blocks deal damage and become rubble (1 AP to clear, no yield).
- **Tell:** Cracked texture and a countdown number.

### 6.2 Water [Default]

- When a water pocket is breached, water flows 1 block per shift, preferring down, then sideways.
- Flooded cells drain air and cost +1 AP to move through.
- **Counters:** Pumps (remove N units per shift), sealant, walls, or digging a sump lower than the working area.
- **Tell:** Damp stone on blocks within 1 of a water pocket.

### 6.3 Gas [Default]

- Gas expands 1 block per shift into open cells, thinning as it spreads.
- Gas drains air. Gas touching a torch, lava, or an explosive ignites and explodes.
- **Counters:** Vents (need a path to the surface), sealing the breach, using a safety lamp instead of torches.
- **Tell:** Discoloured, pitted rock within 1 of a gas pocket.

### 6.4 Lava [Default]

- Flows 1 block every 2 shifts. Destroys ladders, supports, and camp structures. Deals heavy damage on contact and light damage when adjacent.
- Water meeting lava makes solid stone (which the player can exploit).
- **Tell:** Warm-glow tint on blocks within 2.

### 6.5 Unstable ore [Default]

- If a face neighbour is mined while the ore is unbraced, it detonates at the end of the next cube phase (radius 1).
- **Counter:** Place a support against it first, or mine it directly before its neighbours.
- **Tell:** Hairline glow visible once revealed.

## 7. Resources and crafting

### 7.1 Field crafting (anywhere) [Default]

| Item | Recipe | Use |
|---|---|---|
| Ladder (×3) | 1 timber | Vertical movement |
| Support | 1 timber + 1 stone | Holds up a ceiling; braces unstable ore |
| Torch | 1 timber + 1 coal | Fixed light source |
| Fuel (×3) | 1 coal | Upkeep |
| Lamp oil (×2) | 1 coal | Keeps the avatar's light radius at full |

### 7.2 Camp crafting (camp only) [Default]

| Item | Recipe | Use |
|---|---|---|
| Iron / copper ingot | 2 raw ore + 1 coal | Smelted; half the weight |
| Drill | 3 iron | Hard rock costs 2 AP |
| Pump | 2 iron + 1 copper | Removes water |
| Vent | 2 copper + 1 timber | Clears gas; extends an air line |
| Safety lamp | 1 iron + 1 copper | Light source that does not ignite gas |
| Scanner charge | 1 copper + 1 crystal | Reveals a 3×3×3 region |
| Sealant | 1 stone + 1 coal | Plugs a breached face |
| Explosive | 2 coal + 1 iron | Clears a radius-1 area; triggers cave-in checks |
| Camp kit | 4 iron + 4 timber + 2 copper | Founds a new camp |

## 8. Camps [Decided: field crafting plus camps at depth]

- **Founding:** Requires a camp kit and a cleared 3×3 area, 2 high, with a solid floor. The avatar can carry only one kit.
- **Functions:** Smelter, workbench (camp-only recipes), unlimited stash, rest.
- **Air line:** A camp provides air only while an open path (or vent chain) connects it to the surface.
- **Vulnerability:** Camps can be flooded, gassed, burned, or buried. A destroyed camp loses its stash.
- **Upkeep:** Active camps consume fuel. The player can decommission a camp to stop the upkeep.
- **Intended rhythm:** Push 4–6 layers below a camp, haul back, craft, then move on. A full run has roughly 4–6 camps.

## 9. Contracts and escape [Decided]

### 9.1 Act 1 — the contract

- At run start the player chooses 1 of 3 generated contracts.
- A contract has: 2–4 **deliverables** (e.g. 6 copper ingots, 2 crystals, 1 relic), a **survey hint** for each unique item (e.g. "relic signal, north-east, layers 24–28"), a difficulty tier, a payout, and optional **bonus clauses** (e.g. no explosives; finish within 180 shifts).
- The final deliverable is always a **keystone item** in the deep band.

### 9.2 The trigger

- Picking up the keystone starts Act 2. The player chooses when, and so can prepare the route first.

### 9.3 Act 2 — the escape

- Deliverables must be carried to the surface.
- Each shift the cube destabilises further: [Default] crack timers shorten to 1 shift, a new fluid or gas breach opens every N shifts, and the lowest intact layer collapses every M shifts.
- Camps still function as waystations if they survive.

### 9.4 Outcomes

| Outcome | Condition | Result |
|---|---|---|
| Full success | Reach the surface with all deliverables | Full payout plus bonuses |
| Partial | Reach the surface with some deliverables | Pro-rated payout |
| Salvage | Leave before taking the keystone | Small fee based on materials carried |
| Death | Any cause in 5.3 | No payout |

## 10. Meta-progression: unlocks [Decided]

Payouts are **credits**, spent between runs. Unlocks add options; they never raise base stats.

- **Tools:** New camp blueprints (e.g. sonar scanner, winch, foam sealant, shaped charge).
- **Contracts:** Higher tiers and new types (rescue, seal-the-breach, shift-limited).
- **Cubes:** Biomes with their own rules (ice, volcanic, ruins).
- **Loadouts:** Starting kits with trade-offs (e.g. Surveyor: extra scanner charges, less fuel).

**Rule:** A fresh save must be able to complete a tier-1 contract with the starting kit.

**Records:** A miner's log (hazards, ores, and tells encountered), run history (seed, contract, depth, cause of death), and a daily seed.

## 11. Interface (mobile first)

- **Primary view:** A top-down slice of one layer. Swipe or use a depth slider to change layers. Open space above the current layer is transparent.
- **Secondary view:** A small rotatable 3D view of the cube showing the dig shape, the avatar, camps, and active hazards.
- **Interaction:** Tap a block to select it; a context bar shows valid actions and AP cost. Tap again to confirm. No action should require a precise tap in 3D space.
- **HUD:** AP remaining, fuel, health, air, carry weight, shift number, contract progress, and a hazard list with countdowns.
- **End shift** is an explicit button with a preview of what the cube phase will do to known hazards.
- **Orientation:** Portrait. One-handed play should be possible.

## 12. Run length targets [Default]

- 150–250 shifts for a completed tier-1 contract; 20–40 minutes.
- Roughly 2–3% of the cube mined per run.
- A run can be suspended and resumed at any point (autosave every shift).

## 13. Open questions

1. Resource and recipe tree: the tables above are placeholders and need a balance pass.
2. Exact support and span rules: need playtesting for readability on a phone.
3. Art direction and audio: not yet discussed.
4. Monetisation: not yet discussed.
5. Whether the avatar has any persistent identity (name, cosmetic) across runs.
6. Biome rule sets beyond the base cube.
7. Game title.
