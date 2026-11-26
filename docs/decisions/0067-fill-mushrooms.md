# 0067: Filling with dirt, one-is-enough recipes, early wood and apples, mushrooms

Owner, after the 0.17.0 build: "Fill any square with dirt as a move. No
resource restrictions. Height restrictions still apply. Recipe book can hide
items where it doesn't help to have a second. Apples and wood can be in sale
at the start. If a (non-maple) tree is standing when rain happens, 3-7 days
later a mushroom has a chance of emerging. The chance increases for every
adjacent space where there is another tree. Contracts for mushrooms in the
market and mushrooms sell for gold."

- **Fill** is an action of its own (`fillSquare`, fill.ts), 1 tap, from the 🔨
  tray's 🟫 Dirt choice, which stays on until ×, as planting does. "Height restrictions" is the
  level rule read the other way: a filled square may not stand more than 1
  above a face neighbour, so a square beside a deeper one waits. Only dug
  squares: the surface is the top.
- **The recipe book** hides, and the engine refuses ('owned'), a recipe
  whose output is on the market's one-is-enough list while one is held.
  Pinned recipes for such items wait off the pin strip.
- **Wood and apples** lose `afterTier1`; the camp kit keeps it.
- **Mushrooms** live in two lists per square, `mushrooms` and `mushroomIn`
  (state version 22), rolled after the night's rain with the state's own
  generator, so the same seed and steps give the same mushrooms. "Gold" is
  read as coins, the game's only money. The contract board counts the
  mushrooms standing, coming and held as the world's stock, so a mushroom
  contract is offered only once rain has set enough coming.
- The random policy now also fills squares, so the golden runs cover it;
  the gatherer picks mushrooms when it taps a tree that has one.

Gatherer simulator, 40 runs of 100 shifts: crews lost 1 (2 before these
changes); every run picked a mushroom, the first at about shift 12; 5,292
coins on average (5,383 before).

After the 0.18.0 build the owner said: "Let's omit apple trees from mushroom
generation". Mushrooms now come only under plain trees. Apple trees and
maples still count as trees beside one, raising its chance. Engine 0.19.0.

After the 0.20.0 build the owner said: "Mushrooms need uncut trees to grow
and appear." Each night, before the countdown, a mushroom coming or standing
on a square with no plain tree is lost. Felling the tree, fire, or a camp
cleared over it all count. A tap still picks a mushroom before it fells the
tree, so a picked mushroom is never lost this way. Engine 0.21.0.

Also after the 0.20.0 build, the owner sent a screenshot: "I can't deliver
these?" Both contracts held everything they asked for, but the shift had no
taps left, and delivering cost 1 tap. Asked how it should work, the owner
chose "Free, any time". Delivering and dropping a held contract now cost no
tap on any shift, and work with none left. Only a run that has ended stops
them.

Also after the 0.20.0 build, the owner sent a screenshot of a raid: "Defneses
don't seem to do anything". They do: each level cuts the damage. That raid
was one level short, so it took 10% of each stack and 2 upgrades. But the
night's news never showed it. And from depth 16 the raiders' strength (4)
was above the most a camp can be defended (3), so even full defenses could
not turn them away. Asked, the owner chose only "Cap raids at strength 3",
not the other choices offered: the news showing strength against defense,
raiding the weakest camp, or any defense protecting the store. Engine 0.21.0.
