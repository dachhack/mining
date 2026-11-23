# 0058: 100 taps a shift; a stump under a camp waits

Date: 2026-11-22. The owner's playtest of PR #146: "100 turns per shift. Trees grow back as long as you don't mine the ground directly under them."

- **Taps: 10 → 100** (`FRONTIER_SHIFT.taps`, [Default]). The HUD shows the taps left only ("⚡ 100", with the full count in its label), because "100/100" ran into Close mine on a 320 px phone.
- **Trees.** A tree grows back unless the ground directly under it is mined:
  - mining a stump's square digs it out, as before (0057). Since the owner's playtest of 8842e83 ("The tree ring needs to disappear if you mine the surface level block the tree grows on"), the stump is cleared from the state when the square is mined, so its ring goes at once; before, it stayed in the state, and on the map, until its wait ran out;
  - a camp built over a tree now leaves a stump, as felling does, and a stump under a camp no longer clears: it waits, and grows back the shift after the camp is demolished (if the square was never mined);
  - an animal on the stump still makes it wait a shift.
    Nothing else stops regrowth.
- **The idle policy** (`tools/frontierPolicies.ts`): it gathers nothing, rests once at camp 1, and starves at shift 11. With 100 taps no other policy loses a crew in a 10-shift golden run, so it gives the golden runs the hunger path (a rest, then a lost crew).
- **Golden runs** are recorded for 10 shifts each instead of 30: about 1,000 steps a run with 100 taps.

## What the simulator says (1,000 runs a policy, 40 shifts)

| Policy   | Lost (10 taps → 100) | Hungry runs | Mined (median) | Deepest | Grass held | Camps / top level |
| -------- | -------------------- | ----------- | -------------- | ------- | ---------- | ----------------- |
| random   | 8 → 8                | 296 → 33    | 244 → 1,660    | 2 → 7   | 28 → 108   | 1 / 1 → 1 / 2     |
| gatherer | 0 → 0                | 774 → 115   | 164 → 3,420    | 3 → 11  | 43 → 217   | 3 / 2 → 3 / 3     |
| careful  | 0 → 0                | 282 → 19    | 164 → 3,420    | 3 → 11  | 43 → 216   | 3 / 2 → 3 / 3     |
| digger   | 0 → 10               | 8 → 20      | 321 → 768      | 5 → 5   | 0 → 38     | 1 / 1 → 1 / 1     |

**Upkeep is now close to trivial.** A shift's upkeep (1 wood, and 3 grass every other shift) takes about 2 of 100 taps. Hunger happens only to players that spend everything on camps (the gatherer, 115 runs) or stay at one camp: the digger's 10 lost crews all ran out of wood at shifts 29 to 37, having mined its ring's ground so its trees could not grow back, which is the owner's rule at work. Grass piles up again (over 200 held), and every policy that expands reaches level 3 by shift 40.

Not retuned without the owner. The levers, all [Default] in `src/data/frontier.ts`:

- upkeep per shift (`woodEveryShift`, `foodEveryShifts`, `campWoodEveryShifts`), for example scaled ×10 with the taps;
- the grass rate in `FRONTIER_FOODS`;
- what a tap gives (`woodPerTree`, `grassPerTuft`) or the camp and upgrade costs;
- `treeRegrowShifts`, if wood should run short again.
