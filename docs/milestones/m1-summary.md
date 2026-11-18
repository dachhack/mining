# Milestone M1 summary: engine core

Written by the coordinator for the owner, 2026-11-18. This is the summary agent plan section 4 asks for before the owner merges the last PR of the milestone.

## What I need from you

1. **Merge this PR** if you are satisfied with M1. It holds only documents: the playtest round, its evaluation, the question-list updates, and this summary. All M1 code is already on `main`.
2. **Answer question 23 (fuel) before M2 is planned in detail.** M2's camp upkeep and entombment test are both written in terms of fuel, and as the rules stand fuel can be had by waiting. I will not specify those two M2 tasks until you answer. The rest of M2 can start without it.
3. **Look at the other three major findings** (questions 41, 42, and 22) when you can. None blocks M2 from starting; each shapes what M2 feels like.
4. **Confirm or change the standing policies** (questions 15–17): the merge policy, proceeding on assumed defaults, and the playtest round size. I worked under all three as written.

## Owner's answers (2026-11-18, after this summary was written)

The owner answered the questions above the same day. They are recorded in `docs/owner-questions.md` and are being built as four tasks:

| Decision                                                            | Question  | Task |
| ------------------------------------------------------------------- | --------- | ---- |
| No fuel refill: unspent AP is lost                                  | 23        | #32  |
| Make light matter: in the dark the miner knows only what it touches | 22, 40    | #33  |
| A one-block shaft should be dangerous                               | 42        | #34  |
| Ore hints are wanted: rock near a vein shows mineral traces         | 41        | #35  |
| The standing policies stand; leaving from the surface is salvage    | 15–17, 20 | none |

All four are now on `main` (PRs #36, #38, #37, #39; engine version 0.2.0). Building them raised questions 45–51 in `docs/owner-questions.md`: what the dark costs (45, 46, 48, 49), how long the lamp lasts against the fuel (47, issue #41), the still-free zigzag descent (50), and how far mineral traces reach (51).

For #33, #34, and #35 the owner gave the direction and the coordinator assumed the exact rule; each issue states it, for the owner to confirm or change. Item 2 under "What I need from you" is therefore settled; item 1 (merging this PR) remains.

## Is M1 done?

Agent plan section 2: a milestone is done when its acceptance criteria pass and its playtest round has no open blocker findings.

| Criterion (repo plan section 8)                                  | Evidence                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A scripted test digs from the surface to layer 8 on a fixed seed | `tests/engine/acceptance.test.ts`: a staircase policy reaches layer 8 on seed 8 by legal actions only, takes no damage, never reaches 0 fuel, climbs back, and leaves. Also passes on five other seeds |
| Determinism tests pass                                           | `tests/engine/determinism.test.ts` (same seed and decisions → same hash; save and reload mid-run → same final hash) and three golden runs in `tests/golden/`                                           |
| Property tests pass                                              | `tests/engine/properties.test.ts`: 14 seeded random runs with invariants checked after every decision, no soft-lock, and a check that changing an unseen cell never changes the legal actions          |
| All of the above in CI                                           | CI on `main` at commit `1add9f7` is green: lint, typecheck, 357 tests, build, Playwright smoke                                                                                                         |
| Playtest round has no open blocker                               | Round `m1-r1`: 12 runs, 0 blockers, 4 major, 6 minor (`docs/playtests/m1-r1/evaluation.md`)                                                                                                            |

The reviewer of the acceptance PR broke the engine 19 different ways locally and confirmed that the tests turn red each time, so these tests can fail.

No fix-and-replay round was used (the plan allows two).

## What was built

Everything in repo plan M1: state model, seeded RNG, cube generation (blocks and veins), movement, gravity, mining, reveal rules, AP and shifts, fuel upkeep, field crafting, inventory and weight, and the three tools.

| PR  | Task                                                                  | Review rounds |
| --- | --------------------------------------------------------------------- | ------------- |
| #2  | Assumed defaults for the M1 questions (decision note 0005)            | 2             |
| #10 | Engine skeleton: data, validator, RNG, state, public surface          | 2             |
| #11 | Shifts, AP, fuel upkeep, field crafting, leaving                      | 1             |
| #12 | Cube generation and `tools/ascii.ts`                                  | 2             |
| #13 | Movement, gravity, ladders                                            | 2             |
| #14 | Mining, light and reveal, pick up and drop, torches                   | 2             |
| #18 | Bug fix: the move list gave away unseen drops with the lamp out (#15) | 1             |
| #16 | `tools/play.ts`, the text play interface                              | 2             |
| #17 | `tools/sim.ts`, acceptance, determinism, property, and golden tests   | 3             |

Each was merged with green CI on the merged commit, a fresh reviewer's `Verdict: APPROVE` on that same commit, and no unresolved review thread. No PR touched a [Decided] item or edited the design doc.

How to try it yourself (Python reader's note: `npm run x -- args` passes `args` to the script, like `python -m x args`):

```bash
npm ci
npm run play -- --help                      # the rules as a player is told them
npm run play -- --seed 11 --interactive     # play in a terminal
npm run sim -- --runs 1000 --policy random  # headless runs and metrics
npm run ascii -- --seed 7 --layers 0-3      # print layers of a cube
```

## What review and playtesting caught

- **A hidden-information leak (issue #15, fixed).** Found by the developer of the play tool: once the lamp ran out, the list of legal moves depended on cells the player had not seen. A random-play check changed unseen cells about 2.25 million times; the action list changed 6,780 times before the fix and 0 times after. That check now runs in CI in a smaller form.
- **A lethal choice the play tool did not describe.** Mining the block you stand on did not say how far you would fall. Fixed before any playtester used the tool.
- **A test that could silently skip itself** in the acceptance PR. Fixed before merge.
- **Foundations pinned down before parallel work**: fixed ordering across save and load, and tests of the order in which rules run after an action.

## The playtest round, in short

Four personas each played seeds 11, 23, and 37 through the text interface: 12 runs, all ended by leaving alive, no deaths, no health lost, no errors. All 12 logs replay to their recorded outcome. The evaluator also ran 3,000 simulated runs.

The engine did what its rules say in every run. What does not work yet is pressure and choice. The four major findings are all questions for you, not defects:

| #   | Finding                                                                                                                       | Question   | Issue |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ----- |
| 1   | Fuel is not a clock: waiting refills it, and a run continues at zero fuel on 2 AP a shift                                     | 23         | #21   |
| 2   | Whether a run finds ore depends on where the first shaft is, and nothing on screen helps choose                               | 41, 33     | #22   |
| 3   | Between the surface and the ore there is one repeated move: the straight shaft is cheapest and the climb out has no decisions | 42, 24, 34 | #23   |
| 4   | Lamp oil, the lamp going out, and torches changed nothing a player could see, because everything in reach is always revealed  | 22, 40     | #24   |

Minor findings: the top layer gives timber and coal without risk (#25, balance, held for questions 13 and 23); stone is auto-collected and thrown away by hand (#26, question 43); the run-length and cube-share targets in design doc 12 cannot both be met with its AP numbers (#27, question 44); a miner below its last ladder cannot get out or end the run (#28, watch, evidence for question 12); the one risk warning was never true in M1 (#29, watch); and the play tool's shifting menu numbers and small default map (#30, bug).

How I routed them, under agent plan section 5: `design` findings went to the question list with no code change; the `balance` finding is held because its direction depends on your answers; the two `watch` findings go into the M2 playtest brief; the `bug` is a developer task.

Some of what the round found is by plan: M1 has no hazards, camps, or contracts, so the rock between the surface and the ore is empty and three of the four pillars could not be fully assessed. The evaluation says where.

## Assumed defaults

`docs/owner-questions.md` now has 44 questions. Under agent plan section 6 I and the developers assumed an answer for each [Default] gap M1 met and kept the numbers in `src/data`. The full reasoning for the first set is in `docs/decisions/0005-m1-assumed-defaults.md`. The ones most worth your eye, because playtesting showed they matter or because they apply a [Decided] section:

- **20:** before contracts exist, a run ends alive by a "leave" action on the surface, counted as salvage (applies [Decided] 9.4 early; does not change it).
- **22 and 40:** everything within the pick's reach, and the cells a drop is judged by, is always revealed. This is what makes the lamp matter so little (finding 4).
- **23:** banked AP, as the design doc's numbers give it (finding 1).
- **24 and 34:** a player may only choose a drop of 1–2 blocks; climbing needs a ladder in the miner's own cell and the one above.
- **33:** ore density (about 2% of a band per ore) and vein size (2–9 blocks), which the design doc does not give.

## Known gaps and open work

Not done in M1, by plan: hazards, air, camps, placing supports, scanners (M2); undo (M3); contracts and the escape (M4).

Open issues that are developer tasks:

- **#30** play tool: stable choices, shorter list, whole top layer on the surface, explain a missing move. To be done before the M2 playtest round.
- **#20** play tool: map labels misalign on narrow maps (cosmetic).
- **#19** data validation: refuse a lamp-out light radius of 0, which would reopen the kind of leak fixed in #15. Today's data is fine.
- **#25** balance of top-layer timber and coal, held for your answers.

Two things the sim does not yet measure, which the evaluator had to estimate from logs: how many legal actions differ in outcome, and never-used items other than placeables.

One limit of the round itself: each persona played its three seeds in one session, so later runs benefit from earlier ones, and the Newcomer drove repeated loops with a script after its first twenty actions. The evaluation weighs both.

## What happens next

When you merge this PR, M1 is closed. I will then plan M2 (hazards and camps) as task issues, starting with the parts that do not depend on question 23, and do #30, #20, and #19 alongside. Agents can measure fairness, clarity, and variety; whether the dig is fun stays with you, at the M3 phone test.
