# 0036 — T13b: the vent, and follow-ups from the camp tools review

Date: 2026-11-20. Status: accepted for the code as it stands (issue #107; it follows issue #104, PR #106 and decision note 0034, and builds on T11's gas, note 0035). It builds the vent of design doc v0.2 sections 4.1, 6.5 and 7.2, [Default], and takes six notes from the review of PR #106. The reading an owner might want to change is question 125 in `docs/owner-questions.md`. No [Decided] item changes, and the design doc is not changed.

## The vent

### The rules as built

1. **Placing** (`ventCheck` in `actions/campTools.ts`): one vent from the stockpile, `ACTION_COSTS.placeVent` (1) AP, on any square, by the same rules as a pump and in the same order of refusals: no vent, a tree, no block left, a structure already there, lava, a camp square. Gas on the square does not stop it. The square becomes a worked square (design doc 5.2).
2. **What it does** (`runVents` in `cube/gas.ts`). In step (c) of the cube phase, after the gas has spread and before charges go off, gas ignites or gas hurts the crew, each vent clears ALL the gas on the squares within `HAZARDS.gas.ventReach` (2) steps of it, its own square included. A step is to a face neighbour, so this is the same diamond of up to 13 squares as a pump's. Each cleared square gives one `gasRemoved` with the reason `vented`.
3. **So, inside a vent's reach,** gas cannot be lit by lava or a blast that shift, and a crew working there is not poisoned. Gas beyond the reach is left. It spreads back in on later shifts and is cleared again, a smaller amount each time.
4. **What destroys it.** Nothing new: a vent is a structure stored with its top block, like a pump. Mining its square, a slump from or onto it, lava, and an explosion on its square or beside it destroy it; water does not. T11's test of a blast on a vent (`explosions.test.ts`) was written against the structure code and holds as it is. A vent destroyed in step (a) or (b) clears nothing in step (c) of that shift.
5. **The forecast** runs step (c) on what the player sees, so `previewCubePhase(state).gas` holds the `vented` events. Everything a vent reads is in the open.

### Why after the spread and before ignition

T11 found that gas never settles to nothing and never leaves a pit by itself (question 120), so the vent is the main counter to gas. Acting before ignition makes it a real one: a vent placed in time prevents the explosion, not only tidies up after it. Acting after the spread means the squares in reach are clean at the moment that matters, when the blasts go off and the crew is counted. The alternative is in question 125.

### State, versions, golden runs

The shape of the state did not change (a vent is the existing structure code 4), so `STATE_VERSION` is as T11 left it. `ENGINE_VERSION` stays 0.4.0. No golden hash changed: no recorded run holds a vent. The property tests now start their tool runs with vents as well, and check that they are used.

### Views

- **Play tool.** `vent X,Y`, shown once a vent is held. The notes say where vents stand; the "If you end the shift now" line says what the vents will clear, before it says where gas will spread. `--help` explains the vent under "Camp tools".
- **Phone map.** "Place vent (n)" on the tool bar. Like a pump it takes two taps: the first marks the range and says how many of those squares are gassy now. A vent is a pale green disc with a "V". Every square a vent will clear when the shift ends carries an arrow pointing up; gas that would spread onto such a square is shown by the arrow instead of the "gas coming" ring, because it will be gone again. Inspecting or holding a vent marks its range.

## Follow-ups from the review of PR #106

1. **Phone wording.** The note about what is known under the tops no longer names the play-tool command in the shared view. The play tool adds `"look X,Y"` when it prints the note; the phone adds "Hold a square, or tap it with Inspect".
2. **A scan on the phone** is laid out as a list, one line for each square (`takeTurnLines`).
3. **A risky seal warns first.** Sealing raises a square by 1, which can leave it at the top of a run of steps that falls further than sealed rock holds (2). The seal is still allowed, as a mine is; the engine's new `unstableAfterSeal` says which squares it would make unstable, the play tool asks for `seal! X,Y`, and the phone for a second tap. Question 112 says so.
4. **Tells on scanned blocks** are now in the repository's own scramble test: one run with scans checks that a tell depends only on hidden cells within its reach of a known block.
5. The comment on `isLegalAction` names the right test files.
6. Question 116 says a pump is refused on a square with no block left.

The two notes for T11 (an explosion destroys a pump; sealant burying armed ore) were taken by T11: see note 0035.

## Consequences

- Every camp-made tool of design doc 7.2 now does something. The "Not in this version" part of the help no longer lists one.
- `legalActions` lists one `placeVent` for each square that allows it while a vent is held.
