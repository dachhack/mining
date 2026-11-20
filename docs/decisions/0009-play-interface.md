# 0009 — The text play interface: what it shows, its menu, and the play log

Date: 2026-11-18. Status: accepted with M1 task 7 (issue #9).

**Partly superseded by 0025 (design doc v0.2):** the map of layers round the avatar and the move wording go with the avatar; the play tool shows a top-down map of the surface. The single view function, the log format, refusals and the leak test stand.

## Context

Playtest agents play through `npm run play` and nothing else (agent plan 3.1). The issue fixed what a step prints and the two ways to drive the tool; these are the choices it left open.

## Decision

- **One function reads the state for the player.** `buildView` (`tools/play/view.ts`) returns plain data and `renderView` prints from that data alone. A cell's contents are read only after `isRevealed` says yes, so an unrevealed cell prints `?` whether it is rock or open, and its ladder, torch or loose items are not shown. Loose items and structures in a revealed cell are shown even when it is no longer lit.
- **The tool adds no knowledge of its own.** The action list is the engine's `legalActions`, in the engine's order, unchanged. The one thing the tool works out itself is the fall after mining the block underfoot, and it does so from revealed cells only: at the first unseen cell it says "N blocks or more; below that is unseen".
- **Menu.** Legal actions are numbered from 1. "End shift" is always choice `0` (or `end`), so its number never moves. In a chain (`--do 3,1,end`) each number is read against the list as it stands at that moment; the chain stops at the first choice not on the list, and the choices before it stay taken.
- **A refused choice** prints why, then the current view, exits with code 1, and does not rewrite the log.
- **Play log, format 1** (JSON): `format`, `engineVersion`, `seed`, `contractId`, `loadoutId`, `actions`, `outcome`. `actions` holds the engine's actions as they are, plus `{ "type": "endShift" }`: not menu numbers, so a log survives a change in menu order. `outcome` is `null` until the run ends; then it holds the engine's outcome and cause, shifts played, deepest layer, inventory and the final state hash, which `--replay` checks.
- **Saving.** Every one-shot command replays the log from its seed, so the log is the only saved state. It is written to `<file>.tmp` and renamed, only when there is something new, and its folder is created if missing. `--seed` refuses to start over an existing log.
- **Modes.** One-shot is the default (it is what agents use); the prompt needs `--interactive`.
- **Map.** The avatar's layer and one above and below, 4 cells each way (`--layers`, `--radius`), trimmed of edge rows and columns that are unseen in every drawn layer. North is up; x grows east, y grows south.
- **Words, not ids.** Views say how a run ended in words; the log and `--replay` keep the engine's ids.
- **Rules text.** `--help` carries the M1 rules for the Newcomer persona. Its numbers are read from `src/data`.

## Consequences

- A change to an action's fields, or to a rule, can make an old log fail to replay. The tool then names the entry and both engine versions; there is no migration.
- Replaying from the start costs time in proportion to the length of the run. It is unnoticeable at M1 run lengths.
- The view's length is mostly the engine's action list (two drop lines per carried item, up to 17 mine lines). Shortening it further means grouping actions, which is left until the first playtest round says it is needed.
