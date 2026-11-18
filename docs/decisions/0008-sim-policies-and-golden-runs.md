# 0008 — Simulator policies, metrics, and the golden-run format

Date: 2026-11-18. Status: accepted with M1 task 6 (issue #8).

## Context

M1 task 6 adds `npm run sim`, the acceptance test, and the determinism, property and golden tests. They all need the same things: a way to play a whole run from a script, and a way to write a run down.

## Decision

- **Policies** (`tools/policies.ts`). A policy is an object with a `decide(state)` method that returns a legal action or `'endShift'`. It sees the state only through the engine's public surface. The tests and the simulator share the same policies, so the acceptance test's script is the simulator's `staircase` policy.
- **Three policies, one more than the issue asked for.** `random` picks uniformly among the legal actions and ending the shift, as specified. Because leaving is legal whenever the avatar is on the surface, about four in five `random` runs leave within the first shifts (median run: 2 shifts). `wander` is the same policy with the leave action taken out, so that the simulator and the property tests also see long, deep runs. Both are reported; neither is how a person plays.
- **Policy randomness** comes from the engine's generator (`src/engine/rng.ts`) with a state of the policy's own, seeded from the run's seed mixed with a constant. A policy never draws from `state.rng`. `rng.ts` is not on the engine's public surface, so this is a deep import, the only one in `tools/`; if the public surface should export `createRng` and `nextInt` instead, that is a one-line change to `index.ts`.
- **The staircase** takes two mined blocks and one move per layer and uses no ladders: mine the block beside (headroom for the climb back), mine the block under it, walk in and drop one. It turns right at the edge of the cube and never straight back, which would mine the stair it has to climb. When its next action is not legal it ends the shift; if it is still not legal with full AP it throws, so a stuck script fails loudly.
- **Shift cap.** A simulated run that has not ended after `--max-shifts` shifts (default 300, above the 150–250 target of design doc 12) is stopped and reported as outcome `unfinished`, cause `shiftCap`. These two words are the simulator's, not the engine's.
- **"Shifts at zero fuel"** counts shifts that began with 0 fuel, that is, fuel was 0 after the previous upkeep. Under 0005 item 21 such a shift is the player's last chance to craft or bank fuel.
- **"Legal actions per player phase"** is counted at the start of each phase, with full AP. The count at every decision is reported separately; it is lower, because AP runs down within a shift.
- **The report is reproducible.** The same arguments give the same output, byte for byte; the time taken goes to stderr only.
- **Golden runs** (`tests/golden/*.json`) store the decisions as text: `"endShift"` or the engine's `actionKey` string. A replay looks each key up in `legalActions`, so a golden file needs no parser, reads well in a diff, and fails with "decision N is not a legal action" when a rule change makes a recording impossible. `npm run golden` re-hashes or re-records them (`tests/golden/README.md`).

## Consequences

- A change to `actionKey`'s wording makes every golden file unreadable to the replay, not just differently hashed; they would have to be recorded again.
- The golden files pin cube generation, the rules, the data, `serialise` and the hash together. They do not pin the policies: a policy can change without touching a golden run.
- 1000 `random` runs take about 13 seconds on a cloud container, and 1000 `wander` runs about 35 seconds. Nearly all of it is the engine copying the state on every action (0006).
