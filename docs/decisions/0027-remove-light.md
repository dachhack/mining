# 0027 — T3: light is removed

Date: 2026-11-20. Status: built for issue #89 (task T3 of note 0025). It follows design doc v0.2 (sections 3.4, 3.7, 5 and 7) and owner question 86 ("Light is gone", assumed yes). It changes no [Decided] item. It ends temporary rule 3 of note 0026.

## Decision

Nothing in the game is about light any more.

- **State.** `lampOil` is gone from `GameState` and from the save. `STATE_VERSION` is 8; a version-7 save is refused with the usual version error. `ENGINE_VERSION` stays 0.4.0 (bumped once for this batch, in T2).
- **Upkeep.** Ending a shift uses fuel and nothing else. The `lampOilChanged` event and the `lampOilBurned` and `lampOilAfter` fields of the end-shift forecast are gone.
- **Data.** Removed: the torch and lamp-oil field recipes, the safety-lamp camp recipe, the `torch` and `safetyLamp` items and structures, the three light radii, the lamp-oil burn numbers, the loadout's lamp oil, and the `placeTorch` and `placeSafetyLamp` action costs. The field recipes are now support and fuel (design doc 7.1). Fuel is the only gauge.
- **Structure codes 2 (torch) and 6 (safety lamp) are retired**, like code 1 (ladder): they are not given to anything else, so an old save cannot be misread.
- **Actions.** `placeSafetyLamp` is gone from the action types. It was never offered (camp tools are a stub).
- **Tells and traces** already showed on every known top block since T2 (note 0026); no light condition was left in `reveal.ts`, `tells.ts` or `known.ts`, only comments, which now say so.

## Tools

- **Play tool and phone preview text.** The HUD has no "Lamp oil" entry, the "If you end the shift now" line names fuel only, and the rules text no longer mentions lamp oil or torches.
- **Simulator.** The metrics `lampOilAtEnd`, `shiftsInTheDark` and `runsWithAShiftInTheDark` are gone from the report and from `--json`.
- **Golden runs.** Re-hashed (`npm run golden -- --rehash`): the state no longer holds `lampOil`, so all four hashes changed. Every recorded decision was still legal, so the decisions and the endings are unchanged. See `tests/golden/README.md`.

## Consequences

- Coal has one field use, fuel (3 per coal). Before, a player could also turn it into lamp oil or torches, to no effect.
- Notes 0005 (items 13 to 15), 0011 and the light parts of 0012, 0021 and 0022 are history: they describe rules that no longer exist.
- Not done here: issue #88 item 3 (the regrowth rule 1 test). This task did not touch the surface code, so it stays with T4.
