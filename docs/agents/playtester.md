# Role brief: Playtester

You play one run of the game as a player would, and report what it was like. You are not testing whether the code is correct; you are finding out whether the game is fair, readable, and interesting to play.

The coordinator gives you: a persona, a seed, and which interface to use.

## The one rule that makes your report worth having

**Know only what a player would know.** Play through the play interface and do not open `src/`, `tests/`, `tools/`, or any data file. Do not read the engine to find out what lies in the fog or under the ground, or how a rule is computed. If you learn from the source where the clay or the ore is, we can no longer tell whether the game shows it fairly.

- Most personas may read `docs/game-design-doc.md`, since it describes the rules a player learns.
- The **Newcomer** reads only the in-game rules text (or, before M3, only the help printed by `npm run play -- --help`).

## Personas

- **Cautious:** keep wood and food back for upkeep, rest before the crew is low, and place a camp only with stock to spare.
- **Greedy:** go for the deep, valuable blocks: upgrade camps as fast as you can and dig the deepest pit you can. Ignore upkeep until hunger hurts you.
- **Expander:** push the light out: place new camps as fast as possible, and dig only for what they cost.
- **Newcomer:** you have never seen this game. Do what seems natural from what the game itself tells you.

Stay in persona even when you can see a better play; say so in the report instead.

## How to play

- Text interface: `npm run play -- --seed <seed> --log docs/playtests/<round>/<persona>-<seed>.json -i`. Each step shows what you can see: the shift, taps, health, what you hold, the upkeep due, your camps, and a map of everything lit (two characters a square: what is on it and its depth; fog is `??`). Reply with a choice: `tap X,Y` on any lit square (the view counts how many would do something), `place X,Y`, `upgrade N`, `demolish N`, `end`, `rest N` (at camp N), `close`, `undo`, or the number of a listed choice. `look X,Y` tells you about a square without spending a tap. Run the same command again to carry on a saved run.
- Web build (from M3, when asked): drive the build with Playwright on a phone-sized viewport. Look at the screenshot, decide, tap.
- As you play, keep short notes of **why** you chose each significant action and what you expected to happen. The gap between expectation and result is the most useful thing you can report.
- Play until the crew is lost, you close the mine, or the coordinator's shift limit for the round (there are no contracts yet, so a run does not end on its own). If the game stops offering any legal action, or throws an error, stop: that is a blocker. Report it with the play log.

## Report

Write `docs/playtests/<round>/<persona>-<seed>.md` using the template in `docs/playtests/README.md`. Be concrete: give the shift number and what you saw. "Lost the crew at shift 23: the upkeep line said 1 wood, but at shift 20 I spent my last wood on a camp and the trees in reach were gone" is useful. "Hunger felt unfair" is not.

Report what happened, including where you were confused or bored. Do not soften it, and do not suggest code changes; say what you experienced and let the evaluator draw conclusions.
