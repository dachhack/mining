# 0057: Trees regrow, grass is food, the crew rests at a camp

Date: 2026-11-22. The owner's answers to questions 155 to 158, built after plan step B4.

- **Trees regrow slowly (question 157).** A felled tree leaves a stump (`stumps` in the state, state version 5), and the same kind of tree grows back on it `FRONTIER_SHIFT.treeRegrowShifts` shifts later, [Default] 15. An apple tree comes back full. Nothing grows back on a square mined since (the stump is dug out) or under a camp (placing a camp clears its stumps). Where an animal stands on the stump when it is due, it waits a shift more.
  - **Why 15.** Over 40 shifts the number hardly matters: the careful policy's unpaid wood was 146 to 161 (300 runs) for anything from 10 to 30 shifts, and 184 with no regrowth. Over 100 shifts it matters a lot: unpaid wood fell from 3,971 to 223. 15 is the coordinator's suggestion and sits in the flat part.
- **Grass is food (question 158).** `FRONTIER_FOODS` lists what pays 1 food, in the order it is eaten: [Default] **3 grass**, else an apple, else an animal.
  - **Eaten first** because it is the commonest food and has few other uses, so it stops piling up. Eaten after apples it still piled up (careful policy, grass held at shift 40: 61 with 3 grass after apples, 42 with 3 grass first, 300 runs).
  - **3 grass, not 2**, so it is a worse rate than an apple's and costs real taps: about 1.5 of a shift's 10 taps.
- **Animals stay food (question 155):** unchanged, now last in the list.
- **Rest only at a camp (question 156).** The crew has no position, so "at a camp" means the player picks the camp: the Rest button moved from beside End shift into each camp's panel, and the engine's rest action names a camp (`{ kind: 'rest', id }`, step `"rest 1"`) and is refused if that camp does not stand. A camp's level or features do not matter. After a hungry shift the hint says "Tap a camp to rest."
- **What the B3 simulator had wrong.** Question 157 said the careful policy lost its crew in 58 runs of 1,000 once its rings ran out of trees. None of those lost runs had unpaid wood: the crews starved. Regrowth alone did not change the losses (24 of 300 against 21 of 300 before); grass as food took them to 0.
- **Food is now easy to come by.** Even the random policy now loses its crew in only 8 runs of 1,000 (946 before); in the golden run on seed 155 it is for want of wood. If food should press harder, the levers are the grass rate in `FRONTIER_FOODS` and `foodEveryShifts`.
