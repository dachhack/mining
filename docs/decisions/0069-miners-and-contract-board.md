# 0069: Miners, the long-press dig, a smaller board, seeds back, saplings pulled up

Owner, after the 0.20.0 build:

- "Contract management. Only 3-7 available to take. Gauge on how deep the
  player has dug, no keystone or relics etc if they are still far away."
- "When you harvest plants get one seed as well 50% of the time."
- "Click on a block with growing saplings and it removes the sapling, but
  does not dig the block."
- "Make the maple sapling look different than the other saplings."
- "Let's add miners to the market. You can hire a miner to add to the crew.
  You just pay them a annual salary when you hire them. They just need food
  upkeep." Then the miner levels (125/135/150/165 taps; a long-press 3 × 3
  dig for the lesser of 4/3/2 and the squares dug). Last: "Long press is no
  longer just for camp placement."

Decisions:

- **Miners are an item**, `miner`, held in the store, so no new state was
  needed. The store is capped at 4 by the market (`ownsUseful` and
  `tradeRefusal`). They are never stolen, and there is no lot to sell them.
  The "annual salary" is the price, paid once, as asked.
- **Taps a shift** come from the miners held at the start of the shift
  (`tapsPerShift`). Hiring mid-shift pays off from the next shift.
- **Food:** each miner adds `foodEach` (1) to each food payment. Unpaid, it
  costs health like any other upkeep.
- **The long-press dig** (`dig.ts`) is the mining taps it stands for, run
  one after another, so every tap rule applies (yields, the pickaxe, water,
  gas, dragons). The invariants check it that way. It costs the lesser of
  the crew's cost and the squares dug, and needs that many taps.
- **Long press:** with 2 or more miners it digs. Where nothing round the
  square can be dug, or without the miners, it opens the camp tool as
  before, so placing a camp by long press still works.
- **The board:** up to 3 a tier are drawn as before, then 3 to 7 (drawn) are
  kept, taken in turn from each tier, highest first, so every open tier
  still shows. Reach is the ground down to `reachBelowDeepest` (4) levels
  below the deepest square dug, plus the store and smelting.
- **Seeds back:** rolled on the state's own generator at harvest, so runs
  replay to the same hash.
- **A pulled-up sapling** goes back to the store, for 1 tap. A stump of a
  felled tree is mined as before.
- The gatherer and careful policies hire 2 miners once they hold 280 coins,
  and long-press dig where it digs 3 or more squares. The random policy
  tries the dig too. Golden coverage asks for both.

These changes ship with engine 0.21.0, in the same unmerged batch as the
mushroom, delivery and raid changes.

Gatherer simulator, 40 runs of 100 shifts, before and after:

|                                 | Before | After |
| ------------------------------- | ------ | ----- |
| Contracts delivered (average)   | 71     | 50    |
| Coins (average)                 | 5,451  | 4,093 |
| Crews lost                      | 1      | 2     |
| Runs where the crew went hungry | 7      | 13    |
| Blocks mined                    | 6,446  | 5,948 |

The smaller board offers fewer contracts, and two miners eat twice as much
again as the crew alone. The gatherer's scripted choices do not make up for
either. The policy, not the rules, may be what needs tuning.
