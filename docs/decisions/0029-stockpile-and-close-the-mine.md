# 0029 — T4 and T6: the unlimited stockpile, and "close the mine"

Date: 2026-11-20. Status: accepted for the code as it stands (issue #92, tasks T4 and T6 of decision note 0025). Both build [Default]s of design doc v0.2: the stockpile has no limit (4.1, 5.4; question 87), and a run is ended alive by closing the mine (4.1, 9.3; question 88). The readings below are the developer's. None changes a [Decided] item.

## Context

After T2 the carry limit was no longer enforced (temporary rule 2 of note 0026), but everything about carrying was still in the code: the capacity of 20, a weight on every item, loose items and the gravity that moved them, the camp stash, and the pick-up, drop and stash costs. `leave` was offered at any time (temporary rule 4) under its old name.

## Decision

### T4: the stockpile

1. **`state.stockpile` replaces `state.inventory`.** It is the same dict (item id to count) with no limit. Every yield goes into it: a mined block's, a cut tree's, a crafted item's. Crafting and placing take from it. `stockpileEntries(state)` replaces `inventoryEntries`; `countItem`, `addItem` and `removeItem` keep their names.
2. **Removed from the state:** `looseItems`, and `stash` from each camp. `STATE_VERSION` is 10 (T5 took 9); a version-9 save is refused with the usual version error. `ENGINE_VERSION` stays 0.4.0 (the batch T2 to T15).
3. **Removed from the engine:** `inventory.ts` (`canCarry`, `carriedWeight`, `carryCapacity`); `gravity.ts` (`settle` only ever moved loose items, so the dispatcher no longer calls it after an action or after the cube phase); `destroyLooseItems`; the `stashPut` and `stashTake` actions; the events `itemPickedUp`, `itemLeft`, `itemDropped`, `itemFell`, `looseItemsDestroyed`, `itemStashed` and `itemUnstashed`; `looseItems` in `KnownCell`.
4. **Removed from the data:** `weight` on every item; `AVATAR.carryCapacity`, and with it `src/data/avatar.ts` (T5 had left it holding only that number); the action costs `pickUp`, `drop` and `stash`; the loadout weight check in `validateData`; `CAMPS.maxKitsCarried` ("the avatar can carry only one kit" was a v0.1 rule; nothing read the number, and v0.2 section 8 has no such limit).
5. **Regrowth.** Rule 3 no longer waits for "nothing stands on the stump": a tree grows when the count is full. Rule 1 (a stump whose ground was taken without a mine does not grow, and counts again from 0) is kept for the hazards of T8 and T11, and has a hand-built test again (issue #88 item 3).

### T6: close the mine

1. **The action is `{ type: 'closeMine', ap }`**, in `src/engine/actions/closeMine.ts`. It is always legal while the run is going, costs `ACTION_COSTS.closeMine` (0 AP), and ends the run with the outcome `salvage`. `leave` is gone: an old log's `leave` is not a legal action.
2. **The cause is `mineClosed`** (it was `left`). Design doc 5.3 calls this ending "Mine closed". The simulator's report and its JSON count `mineClosed`.
3. **Always salvage for now.** Design doc 9.4 gives "partial" to a mine closed with some deliverables. There are no contracts until M4, so there are no deliverables, and 9.3 says closing is salvage until then. M4 adds the partial outcome.

### Readings

1. **The play tool's name is `close-mine`**, one word like `craft-fuel`, so it cannot be taken for a square choice or typed by accident. `close` and `leave` are refused as unknown.
2. **Play-log format 3.** The action name and the outcome's `stockpile` field (it was `inventory`) changed the file's shape, so `LOG_FORMAT` goes from 2 to 3 and a format-2 log is refused with the usual message. The phone drops a saved format-2 run, says so once, and starts a new run. This happens inside one engine version: `ENGINE_VERSION` is bumped once per batch (CLAUDE.md), so a 0.4.0 log from before this change does not replay to its recorded hash on 0.4.0 after it. No playtest round has run on 0.4.0, so no recorded log is affected.
3. **The phone's confirmation is the browser's own question box** (`window.confirm`), as it already was for leaving and for Restart: "Close the mine? This ends the run now, alive, with what is in the stockpile." Cancel changes nothing and writes nothing to the saved run. A styled, in-page confirmation can come with the tool bar (T14) if the owner wants one.
4. **No risky tap is left, and there was no mechanism left to remove.** T2 had already taken the double tap out of the phone map (note 0026) when it stopped enforcing the carry limit; this task found no "too heavy" code in `src/app`. Design doc 11 brings a second tap back for a mine that would make a square unstable; that is T14, with the slump rule it reads.

### Tools

- **Play tool and phone preview.** The HUD line reads "Stockpile: 2 Timber" (it was "You have:"). The rules text has "The stockpile" and "Closing the mine" paragraphs. The list line is "Close the mine: ends the run alive, with what is in the stockpile".
- **Simulator.** `finalInventory` and `finalInventoryMean` are `finalStockpile` and `finalStockpileMean`, in the report and in `--json`. The `pit` policy closes the mine where it used to leave (`PIT_POLICY.closeMineAtOrBelow`); `random` never does, for the reason it never left.
- **Golden runs.** Recorded again (`npm run golden -- --record-all`): `leave ap 0`, the last decision of the two pit runs, was no longer legal. The new recordings hold the same decisions with `closeMine ap 0` in its place, the two random runs hold exactly the decisions they did, and every run ends as before. All four hashes changed, because the state's shape did. See `tests/golden/README.md`.

## Consequences

- Temporary rules 2, 4 and 6 of note 0026 are replaced by this note.
- Nothing limits what the crew holds. If playtests show the stockpile makes resources too easy, the answer to question 87 decides what limits it; that would be a new rule, not a return of weights.
- A camp is a position and a founding shift. T12 builds camps without a stash.
- `ItemDef` holds only a name. `src/data/items.ts` is still the list of item ids the recipes, loadouts and block yields are checked against.
