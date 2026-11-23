# Playtest brief: progression in five phases (round prog-r1)

What to play after progression PRs 1 to 6 (engine 0.9.0): a 100-shift run, the market and coins, camp gating, saplings, hay and pens, contracts, and the deep camp (`docs/plans/progression-phases.md`). The simulator's numbers are in decision note 0062. Playtesters follow `docs/agents/playtester.md`, and report with the template in `docs/playtests/README.md`.

## Setup

- **Interface:** the web build on a phone for the owner; the text interface (`npm run play`) for the playtesters.
  - New choices: "sell ITEM N", "buy ITEM N", "plant X,Y sapling", "pen N", "penin N", "penout N", "make hay", "take ID", "deliver", "drop", "deep X,Y". `npm run play -- --help` lists them with their costs.
- **Seeds:** 11, 23 and 37, as in earlier rounds; and seed 1, where the simulator's players stall at level 2 for want of apples.
- **Personas:** Cautious, Greedy and Newcomer, one run each on each seed.
- **Length:** the whole run, 100 shifts, or until the crew is lost or the mine is closed. A shorter session should play at least to shift 50: the simulator reaches phase 5 at a median shift of 48.

## What we want to learn

1. **Are the phases readable?** The market card names the phase and its next goal. Did the player know what to aim for at each stage, and when they had moved on? Was "Phase 3: buy an iron drill, take a tier-1 contract" enough to find the board?
2. **Phase 1: is a base camp that cannot dig stone frustrating or clear?** A refused tap says "needs a level 2 camp". Did the player understand why they could only gather and dig dirt and clay at first?
3. **Phase 2: does farming matter?** Grass regrows beside grass, every second tree gives a sapling, and pens breed with hay. Did the player plant, pen animals or make hay because they needed to, or did they ignore it? Did the surface run out?
4. **Apples for level 3 (question 177).** One run in five in the simulator never reaches level 3: it ends a few apples short. Did any player stall there? Did they think to plant apple saplings (3 apples each) or keep apple trees for apples?
5. **The market.** Was its cadence (every 10, 5 or 3 shifts by the best camp) noticed? Did the player sell, and what? Did buying the first drill feel like the right gate for ore?
6. **Contracts.** Did the player take contracts they could fill? Did they keep taking small tier-1 contracts after tier 2 opened, and did that feel right (question 179)? Did anyone reach tier 3?
7. **The deep camp (question 178).** Did the player buy a kit, and where did they put the deep camp? Did anyone place it at the surface as a quick level-3 camp?
8. **The score.** Does ending at shift 100 with a number of coins feel like an ending?
9. **Anything that looked wrong.** For example: the camp panel squeezing the map at level 2 and above (question 180), a market button that glows when nothing can be done, or a contract that cannot be delivered with everything held.

## What not to report on

- Upkeep being easy while the surface lasts: it is meant to be (question 160).
- Prices and contract pay as exact numbers: they are first guesses; say only if one seemed far off.
