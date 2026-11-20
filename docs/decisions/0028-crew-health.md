# 0028 — T5: crew health, worked squares, air removed

Date: 2026-11-20. Status: accepted for the code as it stands (issue #90, task T5 of decision note 0025). It builds design doc v0.2 section 5, which the owner chose ("Keep a 'crew' health bar") and whose numbers are [Default] (question 83). The readings below are the developer's, made where section 5 leaves a detail open. None changes a [Decided] item.

## Context

After T2 the state still held `avatar: { health, air, resting }`, damage was recorded for a miner that no longer stands anywhere, and the loss causes were the avatar's (crushed, suffocated, entombed). Section 5 replaces all of it: the crew is abstract, it is hurt where it has been working, and there is no air.

## Decision

### The rules as built

1. **Crew health.** `state.crew = { health, resting }` replaces `state.avatar`. Health starts at `CREW.startHealth` (10, `src/data/crew.ts`). The run is lost when it reaches 0.
2. **Worked squares.** `state.worked` has one entry per square, like the surface arrays: 1 if the crew worked the square in the shift that is going on. Mining a square and cutting a tree mark it (`markWorked` in `src/engine/crew.ts`). The actions that are still stubs say in their contracts what they must do when built: a support, pump, vent or sealant marks its square; an explosive does not (design doc 5.2: the crew withdraws); scanning and crafting do not. Worked squares are saved and hashed, because a run can be saved in the middle of a shift.
3. **A hazard hurts only on a worked square.** `recordDamage(state, phase, cause, amount, x, y)` (`src/engine/cube/phase.ts`) writes the damage down only if square (x, y) is worked, and returns whether it was. `recordDamageBeside(...)` does the same for "one of the four squares beside (x, y) is worked", for the two hazards that reach one square further: lava (5 on / 1 beside) and a gas explosion (on or beside). The hazard steps (T8–T11) call these for every square a hazard reaches and need not know where the crew is.
4. **Once per kind, by the largest amount.** The phase's notes hold at most one entry for each kind of hazard. A second record of the same kind does not add an entry; it raises the amount if it is larger. The entry keeps the place where the kind was first met.
5. **Applied in step (e)**, in the order of the notes; the first entry that brings health to 0 names the loss: buried (slump), drowned (water), burned (lava, gas explosion, explosion), poisoned (gas). Then rest (still a stub: T12), then the worked squares are cleared, also when the run was just lost.
6. **Numbers** (`CREW.damage`, all [Default]): slump 3, water 1, lava on 5, lava beside 1, gas 1, gas explosion 3, explosion 6. The old numbers they replace are removed from `HAZARDS` (rockfall 4, explosion 6, lava 5 / 1), so each number is in one place.
7. **Removed:** `avatar.air`, `HAZARDS.air`, `air.ts`, `airLine.ts`, `CAMPS.airLineMaxBadStretch`, the `airChanged` event; the `giveUp` action, its cost and the `entombed` cause (design doc 5.4: no entombment and no "give up"); the causes `crushed` and `suffocated`. `STATE_VERSION` is 9 (T3 took 8); a version-8 save is refused with the usual version error. `ENGINE_VERSION` stays 0.4.0 (the batch T2–T15).

### Readings where section 5 is silent

1. **The kinds are the rows of the table in 5.2.** So lava on a square and lava beside it are one kind (5, not 6), and a gas explosion is a different kind from the explosion of a charge or unstable ore: both in one shift deal 3 + 6. The doc's own example ("a slump and a gas explosion deal 6") fits.
2. **"Beside" is the four face neighbours**, as for the level rule; diagonals do not count.
3. **The outcome id is `lost`, not `death`** (coordinator, on PR #93). Design doc 9.4 names the outcome "Lost", and nobody dies in the top-down model. `RunOutcome` is `'fullSuccess' | 'partial' | 'salvage' | 'lost'`; the simulator's report and its JSON count `lost` runs, and the playtest report template says `lost (<cause>)`.
4. **The player is not yet shown which squares are worked.** The engine exports `isWorked` and `workedSquares` (they are the player's own actions, so nothing hidden leaks), and the play tool's rules text explains the rule. Marking them on the maps is left to T14 with the other hazard marks (owner question 95).

### Tools

- **Play tool and phone preview.** The gauge reads "Crew health 10/10" (the preview shows the same HUD lines). The end-of-run summary and the damage sentence name the crew; the four loss causes have their own wording. `npm run play -- --help` has a "Crew health" paragraph.
- **Simulator.** `healthAtEnd` now reads crew health. Nothing hurts the crew until T8, so it is always 10.
- **Golden runs** are re-hashed, not re-recorded: every recorded decision is still legal; the shape of the state changed, and a lost run's status now says `lost`. See `tests/golden/README.md`.

## Consequences

- This replaces temporary rule 5 of note 0026 (air) and the `avatar.air`, air-step and `giveUp` rows of note 0015 that 0025 listed as superseded.
- T8–T11 each add one or two `recordDamage` calls and a scenario test; the mechanism (worked square, once per kind, order, loss names) is tested here with hand-made damage events in `tests/engine/cubePhase.test.ts`.
- T12 (camps) fills in `applyRest` and makes a camp's squares worked while the crew rests there.
