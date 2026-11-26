# 0070: Work camps and quicker saplings

Owner, after the 0.20.0 build: "Saplings take way too long." Then, the
lumberjack, farm and hermit camps (quoted in the design doc, section 6).
Asked, the owner chose:

- saplings in 5 shifts, apple and maple saplings in 8 (they were 15 and 20);
- farmers and gatherers take **everything in reach** each night, and each
  lumberjack fells one tree;
- workers and horses are hired **from the camp's panel**, for coins paid
  once, like the miners' salary;
- workers whose upkeep cannot be paid **skip that night**.

How it is built:

- Work camps are buildings (buildings.ts) with a 2 × 2 footprint
  (`buildingFootprint`). A building now records `workers` and `horses`, 0
  for the one-square ones; state version 24. Everything that asked "is a
  building on this square" now asks about any square of its footprint.
- `workers.ts` holds hiring (`hireRefusal`, `hire`: action `hire`, 1 tap),
  reach (`campReach`: 3 a worker, round any square of the 2 × 2), and the
  night's work (`nightOfWorkers`, after the crops ripen). The night pays
  each camp's upkeep whole or not at all, in the order the camps were built.
- The horse rule: a lumberjack camp's workers may not exceed 3 plus its
  horses. A horse can be hired only for the next lumberjack who needs one.
- The gatherer and careful policies build each camp once its reason exists
  and hire one worker at each. The random policy tries building every kind
  and hiring. In the recorded runs the hermit camp (apple trees stand from
  the start) and hiring are covered. The coverage check asks for both.
- The random policy's new options moved the overnight-fire golden again,
  to seed 2.

Engine 0.21.0, the same unmerged batch.

## Grass on any open dirt

The owner, after the 0.20.0 build: "Grass should grow on any open dirt
space."

- Cut grass now grows back after its wait without needing grass beside it.
- Every other open square of dirt (never dug, nothing on it) comes up in
  grass with `FRONTIER_SURFACE.grassSpreadChance` (10%) a night. It is
  rolled row by row on the night's generator.
- Within about 20 nights most open ground is grass again. To place a
  building or a work camp, the player cuts the grass first.
- Grass burns. In a test world of open dirt, a dragon's fire after shift 20
  spread through the meadow and burned off a third of it. That is real
  play, so the new engine test stops before dragons come.

Gatherer simulator, 40 runs of 100 shifts, after the work camps and the
grass:

|                       | Before | After |
| --------------------- | ------ | ----- |
| Crews lost            | 2      | 1     |
| Runs that went hungry | 13     | 23    |
| Coins (average)       | 4,093  | 4,130 |
| Saw houses built      | 32     | 19    |

Fewer saw houses get built because the policy does not clear grass to make
room for one. The extra hunger has not been traced. It may come from the
work camps' food, or from fires on the new grass.
