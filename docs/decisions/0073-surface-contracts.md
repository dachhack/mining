# 0073: Surface contracts, lumber, and one fill a market day

The owner, after the 0.22.0 build: "Let's review the contract system. We need
more surface resource contracts especially early game. Wood, hay, sheep,
syrup, apples, mushrooms, crops. Let's make lumber productable if you have a
saw house."

Asked, the owner chose:

- surface contracts are on the board **from the first market day**, before a
  level-3 camp opens the rest of tier 1;
- one delivered **opens tier 2**, like any tier-1 contract;
- lumber is **2 wood for 1**, at a saw house, for 1 tap; it sells for 2 coins.

What was built (engine 0.23.0, state version 26):

- `surface: true` marks 10 tier-1 and 5 tier-2 contracts (the mushroom ones
  among them). Each tier's surface and other contracts are drawn apart, up to
  `perTier` of each, and taken in turn, surface first.
- `FRONTIER_BOARD.renewable` lists what the world always counts as to be had:
  it grows back, or it is bought and made. Mushrooms are still counted.
- The simulator found a money pump at once: buy wood, fill the firewood
  contract, buy wood, fill it again, thousands of times a day. Two fixes:
  - a contract taken or filled leaves that day's board (`boardUsed`, emptied
    every night). Mining contracts could be filled again and again before
    this too, if the store held enough;
  - where the market sells everything a contract asks for, it pays no more
    than buying it would cost. That trims firewood (22), hay (20 hay, 20),
    apples (18) and the flock (80) below plan section 5's tier ranges.
- Golden coverage now checks that a run saws lumber and delivers a surface
  contract.
