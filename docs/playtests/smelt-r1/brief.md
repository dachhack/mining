# Playtest brief: smelting and crafting (round smelt-r1)

What to play after smelting and crafting PRs 1 to 4 (engine 0.8.0): the smelter, ingots, the iron pickaxe, the copper lantern, the iron drill and camp level 4 (`docs/plans/smelting-and-crafting.md`). The simulator's numbers are in decision note 0060. Playtesters follow `docs/agents/playtester.md`, and report with the template in `docs/playtests/README.md`.

## Setup

- **Interface:** the text interface (`npm run play`), and the web build on a phone for the owner.
  - The new choices are "smelter N", "make R" (a recipe: `smelt-iron`, `smelt-copper`, `iron-pickaxe`, `iron-drill`, `copper-lantern`) and "lantern N".
  - `npm run play -- --help` lists them with their costs.
- **Seeds:** 11, 23 and 37, as in earlier rounds.
- **Personas:** Cautious, Greedy and Newcomer, one run each on each seed.
- **Length:** 30 shifts, or until the crew is lost or the mine is closed.
  - In the simulator, a steady player has a smelter by shift 4, ingots by shift 13, the pickaxe by 16, the drill by 18 and level 4 by 21. 30 shifts leaves room to use them.

## What we want to learn

1. **Is the way to ingots readable?** Ingots need three things in turn: a level-2 camp for the smelter, then a level-3 camp to mine ore, then ore and coal. Did the player see that chain from the game (the camp panel, the book's notes, the help), or did they stall not knowing why?
2. **Do the tools feel worth it?**
   - The pickaxe doubles every mining tap. Did mining feel different after it?
   - The drill lets every camp mine one level harder. Did the player use it, for example for a new camp, or did it come too late to matter? (Question 166: in the simulator, the drill comes 10 shifts after the first level-3 camp.)
3. **The lantern and crystal (question 165).**
   - Crystal lies only at layer 12 and below, at about 1% of the blocks there. In the simulator, 7 runs in 100 make a lantern, near shift 60.
   - Did the player try for a lantern? How deep did they dig for crystal, and did they find any?
4. **Level 4.** It lights most of the 32 × 32 map from one camp and mines nothing new. Did the player want it? What did they do with their ingots after it?
5. **Apples for level 3.** In the simulator, 11 runs in 100 never reach level 3: they end 1 to 4 apples short of its 10, having felled apple trees for wood. Did any player stall there?
6. **Anything that looked wrong.** For example: a too-hard message that does not mention the drill, a ring that does not grow when a lantern is hung, or a Make button that is on when the recipe cannot be made.

## What not to report on

- Upkeep being easy: it is meant to be, for now (question 160).
- Contracts: there are none yet. The first will ask for ingots (question 164), after this batch.
