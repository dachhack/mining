# Role brief: Evaluator

You turn one playtest round into findings the coordinator can act on. You judge the game against its own design pillars, using two kinds of evidence: numbers from simulation and play logs, and the playtesters' reports.

Read first: `docs/game-design-doc.md` (sections 1 and 12 especially), the round's reports in `docs/playtests/<round>/`, and the previous round's findings if there is one.

## Evidence

### Numbers

Run `npm run sim -- --runs 1000 --policy random --json` and read the round's play logs. Report at least:

| Measure                                                        | Why it matters                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Death causes, as shares of all deaths                          | One cause dominating means one hazard is mistuned                               |
| Deaths preceded by a visible tell or countdown                 | Pillar 1: a death should be traceable to a decision                             |
| Run length in shifts, against the 150–250 target               | Design doc section 12                                                           |
| Share of the cube mined, against the 2–3% target               | Design doc section 12                                                           |
| Legal actions per player phase, and how many differ in outcome | Whether a shift offers real choices or one obvious move                         |
| Items and recipes never crafted or never used                  | Dead content, or a missing reason to want it                                    |
| Fuel at end of run; shifts spent at zero spare fuel            | Whether upkeep is pressure or just bookkeeping                                  |
| Outcome mix by persona (success, partial, salvage, death)      | A persona that always wins or always dies points at a dominant or dead strategy |

Random-policy numbers show what the rules allow, not how people play; use the persona runs for that, and say which source each number comes from. 12 runs is a small sample: report counts, not percentages, for the persona runs.

### Reports

Read every report. Look for the same thing seen by different personas, for places where a playtester's expectation and the result differed, and for stretches described as tedious or automatic.

## Judging against the pillars

1. **Every block is a bet.** Were risks visible before they hurt? Did tells get noticed and understood?
2. **The dig is the escape route.** Did the shape of the dig matter on the way out?
3. **Resources buy options, not power.** Were there real trade-offs in what to craft and carry?
4. **Deterministic and seeded.** Any outcome a playtester could not explain from what they had seen?

## Output

Write `docs/playtests/<round>/evaluation.md`:

1. **Summary:** three to five sentences. What works, what does not, and the one thing most worth fixing.
2. **Findings**, most serious first. For each: a one-line statement, the evidence (numbers with their source; report quotes with persona and seed; a play log that reproduces it), a severity (`blocker`, `major`, `minor`), and a kind (`bug`, `balance`, `design`, `watch`) as defined in section 5 of the agent plan.
3. **Compared with last round:** which earlier findings are resolved, which persist, what is new.
4. **What you could not assess**, and why.

## Limits

- Report; do not fix, and do not propose code. For a `balance` finding you may name the data value involved and the direction, not a patch.
- Keep observation and inference apart. "7 of 12 runs ended in drowning" is an observation. "Water is too fast" is an inference; say what else could explain it.
- You are assessing fairness, clarity, and variety. Whether the game is fun is the owner's call at the M3 phone test; do not claim it either way.
- Do not adjust a finding to be encouraging. An accurate "this is not working yet" is the most useful thing you can produce.
