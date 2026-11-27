# 0074: Contract stages, dangerous dragons, random marauders

The owner, after the 0.25.0 build:

- "A player won't have spare sheep or crops until later early game or mid
  game. Let's stay heavy on clay stone wood and hay in early game. Then coal
  and common ores mix in. Then crops, sheep, syrup mix in. Then more refined
  ore products and larger contracts. Then special ores and items."
- "Let's make dragons more dangerous. They fly to trees, grass, or animals
  and set them on fire or eat them on every 1-3 taps. 1 of 20 attacks will be
  your camp."
- "Marauders also need to decrease what they get according to the defenses
  of the camp. Even completely repelled if the camp is fortified enough.
  Let's get randomized strength back into marauders. 1-4 strength with
  declining probability as strength goes up."

Asked, the owner chose:

- **stages** open with a milestone and a count of contracts delivered, both
  needed: stage 2 with a level-2 camp and 2 delivered, stage 3 with a level-3
  camp and 5, stage 4 with a smelter and 9, stage 5 with a steel drill or a
  deep camp and 14;
- a dragon goes for the **nearest** tree, grass or animal; a camp attack
  **sets the camp on fire and takes an upgrade at once**;
- a **4th defense level**, the Fortress, so a fully fortified camp repels
  every raid.

What was built (engine 0.26.0, state version 27):

- Every contract has a `stage`. The board draws up to `perStage` (4) from
  each open stage and takes the day's 3 to 7 from them in turn, the newest
  stage first. Tiers no longer open the board (the "surface first" and "early
  clay and stone" rules of 0.23.0 to 0.25.0 are gone: stage 1 is all clay,
  stone, wood and hay). Apples and lumber come in at stage 2, mushrooms at 3:
  the owner did not list them, so they sit with the goods they are nearest.
- Dragons: `dragonsOnTaps` runs after every action that spends taps
  (`frontierAct`), one count a tap. The old day flight (a square every 3 to 7
  mines) is gone; the night flight, eating and fire chance stay.
- Marauders: strength is drawn, 1 to 4, at 50/30/15/5%. Damage already fell
  with each level of defense (each level takes a point off the shortfall),
  so that is unchanged: the owner's "decrease what they get according to the
  defenses" holds, and the Fortress now turns away even strength 4.
