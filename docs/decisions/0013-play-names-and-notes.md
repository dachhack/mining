# 0013 — Play interface: names for choices, a shorter list, and "not on the list" notes

Date: 2026-11-18. Status: accepted with issues #30 and #20. Amends 0009 (the text play interface); what 0009 says about the play log is unchanged.

## Context

The first playtest round (m1-r1, finding 10) lost five actions in four runs to menu numbers that changed meaning inside a chain, found the action list long where it carried no choice, did not find the top layer the help said was known, and could not tell why a move was missing. Since then decision 0011 (the lamp) added a second reason for a missing move: a cell it is judged by has not been seen.

## Decision

- **Every choice has a name as well as a number.** The name is made from the action alone, seen from where the avatar stands (`e`, `up`, `mine-down`, `mine-ne-down`, `ladder-here`, `craft-lamp-oil`, `take-n-coal`, `drop-all-stone`, `leave`, `end`), so it means the same at every step. `--do` and the prompt take either. A name that is not on the list at that moment is refused and stops a chain; it is never read as another action. Numbers are as in 0009: the engine's order from 1, and `0` for "end shift".
- **The list is still exactly `legalActions` plus "end shift"**, one choice each. Only the printing changed: mine choices with the same block, yield, traces, weight note and AP cost share one line that lists each one's number and name. The block underfoot always has its own line, because that line says what the fall costs.
- **Map.** With no `--radius`, the map is the whole cube (and one cell round it) while the avatar stands on the surface, and 4 cells each way underground as before. The "Map:" line says whether the player has seen cells of the drawn layers that are off the map, and which `--radius` shows them all; it reads only the revealed flags.
- **Labels.** Each layer's column is as wide as its map or its labels, whichever is wider (issue #20).
- **"Not on the list" notes.** One line for each move a player might look for that the engine does not offer: a walk into an open cell (the drop is too long, or what is under the cell is unseen), a step up onto rock whose top is unseen, a climb up with no ladder above, a climb down with a drop too long or unseen. A plain wall gets no line, and nothing is said when the avatar has no AP to move. Where a ladder in the cell would make the move possible the note says so, except on the surface, where nothing can be placed.
- **The notes explain; they do not decide, and they add no knowledge.** They are worked out in `tools/play/missing.ts` from revealed cells only, in the same order the engine judges a drop, and stop at the first unseen cell with "you have not seen ...". A test changes every unseen cell (rock to open, open to rock, ladders and loose items added) and requires the whole view text to stay the same.

## Consequences

- The play log is untouched: it holds the engine's actions, not numbers or names (format 1). Logs from m1-r1 were written by engine 0.1.0 and stop replaying part-way on engine 0.2.0, on `main` as well as here; that comes from the rule changes of 0010 to 0012, not from this change.
- `missing.ts` repeats the engine's drop walk (`knownFallDistance`), which is not on the engine's public surface. If the move rules change, the notes must be changed with them. A note is only ever given for a direction with no legal move, so a stale note can be wrong about the reason but cannot offer or hide an action.
- The first view of a run is longer (34 map rows instead of 9). It is that long only while the avatar is on the surface.
