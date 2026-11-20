# 0006 — Engine skeleton: state layout and module seams

Date: 2026-11-18. Status: accepted with M1 task 1 (issue #3). The readings marked "assumed" are owner questions 25–28.

**Partly superseded by 0025 (design doc v0.2):** the surface layer `z = -1` and carry weight go with the avatar. The state layout, copying, canonical order, hash and RNG stand.

## Context

M1 task 1 fixes the shapes the other M1 tasks build on, so that they can work in separate files at the same time.

## Decision

- **Data.** `src/data` is plain TypeScript constants, one file per table, with `validateData()` checking ids and ranges. Ids are strings; block and structure codes (the small numbers stored in the cube) are part of the save format and are only ever added to.
- **State.** `GameState` is one plain object. The cube is five `Uint8Array`s (block, revealed, fluid, gas, structure), one entry per cell, with the cube's size held in the state. Only `src/engine/state.ts` knows the array layout.
- **Outside the grid.** `blockAt` answers for any position: the stored block inside the grid, open air on the surface layer `z = -1`, and bedrock everywhere else, including above and beside the surface layer. Structures exist only inside the grid, so nothing can be placed on the surface (assumed, question 28).
- **Who copies the state.** `applyAction` and `endShift` in `index.ts` copy the state once, and the rule modules change that copy in place and append to an event list. No rule module copies the state or returns a new one.
- **Who checks AP.** Every action carries its AP cost in an `ap` field. Rule modules list actions as if AP were unlimited; `index.ts` drops the ones the avatar cannot afford and takes the AP off before the rule module runs. `applyAction` accepts an action only if it equals, field for field, one in `legalActions(state)`.
- **Order of an action.** Rule module, then `settle` (gravity), then `updateReveal`. Order of an end of shift: `runCubePhase`, `settle`, `runUpkeep` (if the run is still going), `updateReveal`.
- **Canonical order.** Two states with the same hash must behave the same, including the order of `legalActions`, before and after a save and load. So `state.looseItems` is always kept canonical (one entry per cell and item, sorted by z, y, x, item id) and changed only through `addLooseItems` / `removeLooseItems`; and rule code walks the inventory only through `inventoryEntries(state)` (sorted by item id), never through the dict's own key order.
- **Carry weight** (`inventory.ts`) is implemented in the skeleton, not left to task 4, because tasks 4, 5, 6 and 7 all need it.
- **Preview.** `previewCubePhase` returns `{ hazards, upkeep }`: the hazard forecasts (none until M2) and what upkeep will do to fuel and lamp oil. (As first written this also covered banked AP, which the owner's decision in issue #32 removed: unspent AP is now lost.) This widens the `HazardForecast[]` sketched in the repo plan 3.1, so that task 5 can report upkeep without changing a shared type.
- **Hash.** `hashState` hashes `JSON.stringify(serialise(state))` with a 64-bit non-cryptographic hash written with 32-bit integer arithmetic. `serialise` sorts the inventory, merges and sorts the loose items, and drops zero counts, so two states that mean the same thing hash the same.
- **RNG.** mulberry32; its state is one unsigned 32-bit number in `GameState.rng`.
- **Raw ore** is two items, iron and copper (assumed, question 25).

## Consequences

- Changing the RNG, the hash, `serialise`, or a block or structure code changes every golden-run hash. Tests pin the first three to known values.
- A cube is cloned on every action (about 160 KB for 32×32×32). If the simulator shows this matters, the copy can become copy-on-write behind the same `index.ts` functions.
- A saved state carries `version`; `deserialise` refuses any other version. There is no migration yet.
