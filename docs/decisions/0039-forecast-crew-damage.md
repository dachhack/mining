# 0039 — T16: the forecast reports crew damage

Date: 2026-11-20. Status: accepted for the code as it stands (issue #112, found in the review of PR #111). It changes no game rule: `endShift` does what it did, `STATE_VERSION` and `ENGINE_VERSION` stay as they are, and no golden or scenario hash changed. It replaces the stopgap line "THE CREW IS IN DANGER" of note 0037.

## Context

The forecast named crew damage for explosions only, worked out in the view. With worked squares under a slump, water, lava and gas it said nothing of the crew, and ending the shift took crew health from 8 to 0. Pillar 1 says a loss is traceable to a decision the player could see coming.

## Decision

### The engine reports the damage

`previewCubePhase(state).crew` (`CrewForecast`, `src/engine/forecast.ts`):

- `damage`: one entry for each kind of hazard that will hurt the crew, in the order step (e) applies them: the kind, the amount, how certain it is, and the worked squares where it hurts (each with the amount dealt there).
- `total`, `totalAtLeast` (the part that is certain), `health`, `healthAfter`.
- `runLost`: `'yes'`, `'may'` or `'no'`; and `lossCause`, the name the loss would have.
- `exact`: true if nothing hidden can change any of it.

**It is not a second copy of the rules.** The forecast already ran steps (a) to (c) on `knownCube(state)`, and those steps already called `recordDamage`. The damage was written into the phase's notes and thrown away; now it is read. `recordDamage` and `recordDamageBeside` also note the worked square (`CubePhase.damageSquares`), which step (e) does not read.

### Hidden information: "exact", "at least", "may"

The forecast runs on the copy in which every unrevealed cell is plain rock, so it never reads a hidden cell. It can still be wrong where a top block is taken away and a pocket is under it. The engine marks each amount by what can go wrong (`DamageCertainty`), reading only whether a cell is revealed:

| When                                                                       | Slump | Water, lava, explosion | Gas, gas explosion |
| -------------------------------------------------------------------------- | ----- | ---------------------- | ------------------ |
| Nothing hidden is uncovered                                                | exact | exact                  | exact              |
| Only a blast uncovers a hidden block, or a relic or keystone is in a blast | exact | exact                  | at least           |
| A blast opens a space the player has scanned                               | exact | exact                  | may                |
| A slump uncovers a hidden block                                            | exact | may                    | may                |

- "Uncovers a hidden block": a block slumps away or a blast destroys one, and the cell under it is not a revealed block. A scanned space that will collapse counts too, because the cells of it that were not scanned hold more than the forecast can count.
- **A slump is always exact**: step (a) reads depths, top blocks, trees and supports, all seen, and a collapsed space leaves the square at the same depth as plain rock would.
- **After a slump uncovers a block, everything later is "may"**: a pocket's water, lava or gas stands on that square before steps (b) and (c) run. It can add damage, and it can take some away (water turns lava to stone; lava destroys a charge).
- **After only a blast, gas kinds are "at least"**: steps (a) and (b) are over, the blasts do not depend on what is uncovered, and gas that comes out can only add to what burns or stands.
- **A blast that opens a scanned space makes gas kinds "may"** (review of PR #114). A space collapses once, through whichever roof goes first. If another square of the blast is a roof of the same space that the player has not seen, the gas comes out there and not where the forecast puts it, so the forecast's gas explosion may not happen. The reviewer's five-square case is a scenario test.
- `runLost` is `'yes'` only if the certain part is enough, and `'may'` if the total as far as it can be seen is enough. With no worked square nothing can hurt the crew, so the forecast is exact whatever is uncovered.

The hazard tells are **not** used to narrow this (question 131).

### What the player is shown

- **Forecast lines** (phone and play tool, from the same function): first "THE RUN WILL BE LOST" or "THE RUN MAY BE LOST" when it applies; then one line for each kind, the largest amount first, with the squares ("THE CREW LOSES 5 health: lava on x20 y20…", "LOSES AT LEAST", "MAY LOSE"); then the total and the health left; then, if something hidden may add to it, one line that says so. That last line is shown only when something seen already hurts the crew: a slump uncovers an unseen block on nearly half of all shifts in simulated play, and hidden contents change the damage in under 1 in 200 of those (reviewer's survey). The headline and the total say the certain part and the possible part apart: "it will lose 3 and may lose 7 more"; "Crew health 8 -> 5 for certain, 0 if all that may happen does". The view's own sum for explosions ("THE CREW WORKED THERE: it loses 6 health") is removed.
- **The map** draws a red frame, in place of the white corners, on each worked square where the crew will be hurt, and a dashed red frame where every kind of damage there is only a "may".
- **End shift on the phone**: when the run would or may be lost the button is red and says so. The first tap shows the warning over the button and ends nothing; a second tap ends the shift; any other action withdraws the question. A shift that hurts the crew without losing the run ends at one tap.
- The play tool has no confirm step: its forecast opens with the same warning, and it is driven by typed commands and by agents.

## Consequences

- Most slumps uncover a hidden block, so in a shift with a slump the damage from water, lava, gas and blasts reads "MAY LOSE". The review's scene now opens "THE RUN MAY BE LOST… the crew has 8 health; it will lose 3 and may lose 7 more" and asks for a second tap. That is honest but weaker than it could be; question 131 asks whether to narrow it.
- A forecast that says "no" while a slump or blast uncovers something can still be wrong: the reviewer's fuzz lost the run in 18 of about 46,000 such scenes. With nothing seen reaching the crew, no line says so now.
- Tests: `tests/engine/crewForecast.test.ts` has a scenario for each kind, the "at least" and "may" cases with a real hidden pocket, and a fuzz over 600 hand-built cubes that compares the forecast with `endShift` wherever the forecast claims "exact" or "at least". The existing scramble tests compare the whole forecast, so they cover the new fields.
