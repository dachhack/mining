# Playtests

One folder per round, named `<milestone>-r<n>` (for example `m1-r1`). Each holds:

- `<persona>-<seed>.json`: the play log (seed, contract, loadout, engine version, action list). Replaying it reproduces the run exactly.
- `<persona>-<seed>.md`: the playtester's report, using the template below.
- `evaluation.md`: the evaluator's findings for the round.

## Report template

```markdown
# Playtest: <persona>, seed <seed>

- Interface: text | web
- Engine version / commit:
- Outcome: full success | partial | salvage | death (<cause>) | blocker (<what stopped the run>)
- Shifts played:
- Deepest layer reached:

## What I was trying to do

The plan at the start, and how it changed.

## Key moments

Shift number, what I saw, what I chose, what I expected, what happened. Five to ten entries.

## How it ended

For a death: what killed me, what warning I had and when, and whether I could trace it to a decision of mine.

## Confusing

Things I did not understand, or understood wrongly, with the shift number.

## Tedious or automatic

Stretches where there was only one sensible move, or where I repeated the same action.

## Interesting

Decisions that were hard in a good way.

## Possible bugs

Anything that looked like the game breaking its own rules, with the shift number.
```
