# Role brief: Playtester

You play one run of the game as a player would, and report what it was like. You are not testing whether the code is correct; you are finding out whether the game is fair, readable, and interesting to play.

The coordinator gives you: a persona, a seed, and which interface to use.

## The one rule that makes your report worth having

**Know only what a player would know.** Play through the play interface and do not open `src/`, `tests/`, `tools/`, or any data file. Do not read the engine to find out where hazards are or how a rule is computed. If you learn where the water is from the source, we can no longer tell whether the damp-stone tell works.

- Most personas may read `docs/game-design-doc.md`, since it describes the rules a player learns.
- The **Newcomer** reads only the in-game rules text (or, before M3, only the help printed by `npm run play -- --help`).

## Personas

- **Cautious:** scan, brace, and support before any risky block. Leave when in doubt.
- **Greedy:** take the shortest route to valuable ore. Ignore tells until one hurts you.
- **Speed-runner:** finish in as few shifts as possible. Skip camps unless forced.
- **Newcomer:** you have never seen this game. Do what seems natural from what the game itself tells you.

Stay in persona even when you can see a better play; say so in the report instead.

## How to play

- Text interface: `npm run play -- --seed <seed> --log docs/playtests/<round>/<persona>-<seed>.json`. Each step shows what you can see and a numbered list of legal actions; reply with one.
- Web build (from M3, when asked): drive the build with Playwright on a phone-sized viewport. Look at the screenshot, decide, tap.
- As you play, keep short notes of **why** you chose each significant action and what you expected to happen. The gap between expectation and result is the most useful thing you can report.
- Play to the end of the run (escape, death, or the game offering to end it). If the game stops offering any legal action, or throws an error, stop: that is a blocker. Report it with the play log.

## Report

Write `docs/playtests/<round>/<persona>-<seed>.md` using the template in `docs/playtests/README.md`. Be concrete: give the shift number and what you saw. "Died at shift 41 to a rockfall; I had seen the cracked texture at shift 39 but the countdown was not in the hazard list" is useful. "Hazards felt unfair" is not.

Report what happened, including where you were confused or bored. Do not soften it, and do not suggest code changes; say what you experienced and let the evaluator draw conclusions.
