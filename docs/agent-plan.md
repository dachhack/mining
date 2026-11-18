# Mining Game — Agent Development Plan (v0.1)

How a team of Claude Code agents builds, plays, and evaluates the game. Read `game-design-doc.md` (the rules) and `repo-plan.md` (the stack and milestones) first. This document says who does what; it does not change any game rule.

## 1. Roles

| Role        | Brief                        | Lifetime               | Output                                         |
| ----------- | ---------------------------- | ---------------------- | ---------------------------------------------- |
| Coordinator | `docs/agents/coordinator.md` | One long-lived session | Task issues, merges, the owner's question list |
| Developer   | `docs/agents/developer.md`   | One session per task   | One pull request with tests                    |
| Reviewer    | `docs/agents/reviewer.md`    | One session per PR     | A review with a verdict                        |
| Playtester  | `docs/agents/playtester.md`  | One session per run    | A playtest report and a replayable play log    |
| Evaluator   | `docs/agents/evaluator.md`   | One session per round  | A ranked findings report                       |

Three separations matter more than anything else in this plan:

1. **Developers do not review their own work.** The reviewer is a fresh session that sees the diff, the design doc, and the conventions, not the developer's reasoning.
2. **Playtesters play the game a player would see.** They use the play interface only and do not read the engine source, the data files, or hidden cube state. A playtester who knows where the water pocket is cannot tell us whether the damp-stone tell works.
3. **Evaluators report; they do not fix.** A finding becomes an issue. The coordinator decides what happens to it.

## 2. The loop

```
Coordinator ── task issue ──▶ Developer ── PR ──▶ CI + Reviewer
     ▲                                                 │
     │                                        merge (section 4)
     │                                                 ▼
 triage (section 5) ◀── Evaluator ◀── reports ── Playtesters
```

- **Build loop** (continuous): the coordinator splits the current milestone into tasks. Each task is one issue, one developer, one small PR.
- **Play loop** (at the end of M1, M2, and M3; continuous in M6): once a milestone's acceptance criteria pass in CI, the coordinator runs a playtest round, then an evaluation, then triages the findings.
- A milestone is done when its acceptance criteria pass **and** its playtest round has no open blocker findings.

## 3. How agents play

### 3.1 Text interface (from M1)

`tools/play.ts`, run as `npm run play`. Each step prints what the avatar can legitimately know and takes one action back.

- **Shows:** revealed blocks near the avatar (as ASCII layers), tells on revealed blocks, the HUD values, the hazard list with countdowns, and the numbered list of legal actions with their AP cost.
- **Never shows:** unrevealed blocks, pocket locations, the RNG state, or anything else a player could not see. This is enforced in the tool, not left to the playtester's restraint.
- **Records:** a play log (`seed`, contract, loadout, action list, engine version). Because the engine is deterministic, any finding can be reproduced exactly from its log.
- It calls only the engine's public surface (`legalActions`, `applyAction`, `endShift`, `previewCubePhase`), so it also tests that surface.

### 3.2 Web build (from M3)

Some playtesters drive the real build with Playwright on a phone-sized viewport: screenshot, decide, tap. This is slower and costs more, so it is used for what the text interface cannot see: readability of tells, tap targets, the end-shift preview, whether the HUD makes the state clear.

### 3.3 Personas

Each playtest run uses one persona, so the reports cover different ways of playing.

| Persona      | Plays like                                                | Finds                                        |
| ------------ | --------------------------------------------------------- | -------------------------------------------- |
| Cautious     | Scans, braces, and supports before every risky block      | Whether safe play is viable or just slow     |
| Greedy       | Takes the shortest route to ore; ignores tells until hurt | Whether hazards punish fairly and legibly    |
| Speed-runner | Minimises shifts; skips camps where possible              | Dominant strategies and degenerate shortcuts |
| Newcomer     | Has only the in-game rules text, not the design doc       | What the game fails to teach                 |

### 3.4 Round size [Default]

4 playtesters (one per persona) × 3 seeds each = 12 runs per round. All personas play the same 3 seeds, so their reports can be compared. The coordinator may shrink a round, and must ask the owner before growing one.

## 4. Merge policy [Assumed; owner to confirm]

- The coordinator may merge a PR when **all** of these hold: CI is green on the head commit, the reviewer's verdict is `APPROVE`, there are no unresolved review threads, and the PR does not touch a [Decided] item.
- The **last PR of each milestone** is merged by the owner, after reading the coordinator's milestone summary.
- GitHub does not let an account approve its own pull request, and all agents act through the owner's account. So the reviewer's verdict is a line in a review comment (`Verdict: APPROVE` or `Verdict: CHANGES`), not a GitHub approval.
- No agent merges with red CI, skips or disables a test to get green, or force-pushes `main`.

## 5. Triage of findings

Every evaluator finding becomes a GitHub issue with a label, and the coordinator routes it:

| Kind                                                                          | Label     | Route                                                                              |
| ----------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| Engine or UI defect (crash, soft-lock, rule not matching the design doc)      | `bug`     | Developer task. Failing test first.                                                |
| A [Default] number is off (too lethal, never used, target missed)             | `balance` | Developer task limited to `src/data`. The PR shows `sim` results before and after. |
| The rule works as written but plays badly, or a [Decided] item is in question | `design`  | Owner's question list. No code until the owner answers.                            |
| Unclear from the reports; needs more play                                     | `watch`   | Carried into the next round's playtest brief.                                      |

To bound spend, a milestone gets at most **2 fix-and-replay rounds**. If blockers remain after that, the coordinator stops and writes to the owner.

## 6. The owner's part

- **Question list:** `docs/owner-questions.md`. Agents add questions there instead of guessing at design intent.
- **Unanswered [Default] questions do not block work** [Assumed; owner to confirm]. The coordinator picks a default, records it in the question list as "assumed", and puts the value in `src/data` so changing it later is a data edit. Questions about [Decided] items always block.
- **Milestone gates:** the owner merges each milestone's last PR.
- **The M3 phone test stays with the owner.** Agents can measure fairness, clarity, and variety. They cannot tell us whether the dig is fun; that judgement is made by a person, on a phone.

## 7. What changes in the repo plan

- **M1** adds `tools/play.ts` (section 3.1) and a machine-readable metrics output from `tools/sim.ts` (`--json`).
- **M1, M2, M3** each end with a playtest round and an evaluation. **M6** runs them continuously.
- **M3** adds the Playwright play harness for web-build playtesters, and the in-game rules text the Newcomer persona reads.
- New paths: `docs/agents/` (role briefs), `docs/playtests/` (reports and play logs), `docs/owner-questions.md`.

## 8. Running it in Claude Code

- The coordinator is one cloud session started with the prompt below. It starts each other agent as its own session (or sub-agent) with a short task message that points at the role brief; the brief is in the repo so every agent reads the same text.
- Each cloud session pushes to its own branch, so parallel developers do not collide. The coordinator gives parallel developers tasks that touch different files.
- State lives in GitHub and the repo, not in any session's memory: tasks are issues, work is PRs, reports are files. A fresh coordinator session can pick up from the issue list.

### Kick-off prompt for the coordinator

> You are the coordinator for this repo. Read `docs/agent-plan.md`, `docs/agents/coordinator.md`, `docs/repo-plan.md`, and `docs/game-design-doc.md`. Start with milestone M1. You may merge pull requests under the merge policy in section 4 of the agent plan; I will merge the last PR of each milestone myself. Put questions for me in `docs/owner-questions.md` and tell me when a milestone is ready for my review or when you are blocked.

## 9. Risks

- **Agents optimise what is measured.** The metrics in the evaluator brief are evidence, not targets. Developers are never given a metric to hit, only a finding to address.
- **Playtesters that play too well, or too alike.** Personas and the Newcomer's restricted reading help. If reports converge, vary the personas before adding runs.
- **Cost.** Playtesting is the expensive part. Round size is fixed in section 3.4 and rounds per milestone in section 5.
- **Drift from the design doc.** Reviewers check each PR against it; `design` findings go to the owner, not to a developer.
