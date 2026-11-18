# 0015 — Starting fuel reaches coal: 24 stays

Date: 2026-11-18. Issue #51; decision note 0014 item 33; owner question 53.

## Decision

The standard loadout's `fuel` stays at 24. No number in `src/data` changed.

## Why

The owner asked that starting fuel be enough to get to coal, so that coal need not be near the start. Measured over seeds 1 to 1000 with `npm run sim -- --survey coal --runs 1000`:

| Question                                                                    | Answer                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Seeds with coal in the top layer, in view from shift 1                      | 1,000 of 1,000                                        |
| Steps to walk until that coal is in the pick's reach                        | half the seeds 4 or fewer; 99% within 15; furthest 25 |
| Seeds where a scripted player fetched coal and got all the fuel back        | 1,000 of 1,000                                        |
| Shift in which the fuel gauge was back to 24 or more                        | half the seeds by shift 2; 99% by shift 4; latest 10  |
| Lowest the gauge ever read on the way                                       | 19 of 24 (seeds 595 and 819)                          |
| Smallest starting fuel that would still leave 3 in hand at the worst moment | 6 for 99% of seeds, 8 for every seed                  |

The scripted player is the `coal` policy in `tools/policies.ts`: walk over the surface to the nearest coal in view, mine it from beside, craft fuel, repeat until the gauge is back to what the run started with. It digs through no rock, takes no damage and uses no ladders.

## Consequences

- 24 is three times what the worst seed needs. Whether it is now too generous is a different question, and the owner's (it is in the PR for issue #51).
- One seed in a further 4,000 (seed 1148) has no coal in the top layer at all. Its nearest coal is one layer down beside the start, but a player cannot see it. Starting fuel does not help there; whether generation should guarantee coal in view is also in the PR.
- The survey can be run again whenever generation, the fuel recipe or the loadout changes. `tests/tools/coalSurvey.test.ts` runs it on seeds 1 to 100 and fails if a trip does not pay back with 3 fuel to spare.
- `npm run sim` now also reports shifts begun with the lamp out ("shifts in the dark").
