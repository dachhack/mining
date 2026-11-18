# 0003 — Development by a team of agents

Date: 2026-11-18. Status: accepted; merge policy and defaults policy await the owner's confirmation (questions 15–17 in `docs/owner-questions.md`).

## Context

The owner wants the build run by agents: one that coordinates, some that develop, some that playtest, and some that evaluate quality and engagement.

## Decision

Roles, the loop between them, and the limits on each are in `docs/agent-plan.md`, with one brief per role in `docs/agents/`. The points that shaped it:

- Agents playtest through a text interface to the engine (`tools/play.ts`, added in M1) that shows only what a player could know. This makes playtesting possible before there are graphics, cheap enough to repeat, and exactly reproducible from a play log.
- Review, playtesting, and evaluation are each done by sessions that did not write the code and are not given the developer's reasoning.
- Findings are routed by kind. Bugs and [Default] balance changes go to developers; anything about the design itself, or a [Decided] item, goes to the owner.
- Agents assess fairness, clarity, and variety. Whether the game is fun remains the owner's judgement at the M3 phone test.

## Consequences

- M1 grows by the play interface and a JSON output from `sim`.
- M1–M3 each end with a playtest round, capped at 2 fix-and-replay rounds before the owner is asked.
