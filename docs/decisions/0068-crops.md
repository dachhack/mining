# 0068: Grains and vegetables

Owner, after the 0.19.0 build: "Let's add seeds to the market for a few
grains and vegetables. You can plant these in soil and they grow and you can
harvest."

- Four crops, two grains and two vegetables: wheat, corn, carrot and potato
  (`FRONTIER_CROPS`). Their seeds are market items from the start. Their
  harvests are food, eaten after apples and before an animal, and they sell
  for about a coin each. Wheat feeds at 2 a meal, since a harvest gives 4.
- A crop is not a tree feature. It is kept in two lists per square,
  `crops` (which crop) and `cropIn` (shifts until ripe; 0 once ripe), in
  state version 23, engine 0.20.0. A crop is harvested once and leaves bare
  dirt; trees are felled and grow back.
- "Plant in soil" is read as the saplings' ground: lit surface dirt never
  dug. A seed is not sown on a stump.
- A growing crop protects its square: a tap does nothing and costs nothing.
  A sapling, by contrast, is lost if its square is mined. A stray tap on a
  field should not cost a harvest.
- The 🌱 tray now lists only what is held, in a row that scrolls sideways:
  seven kinds never fit a phone.
- The gatherer and careful policies buy four seeds of a kind once none are
  held or sown, sow them, and harvest ripe crops first. The random policy
  sows the seeds it buys. Every golden run was re-recorded (the state
  changed), and the coverage check asks for a sowing and a harvest.

Gatherer simulator, 40 runs of 100 shifts: 1 crew lost, as before; hungry
in 7 runs, not 11; 5,451 coins on average, not 5,292.
