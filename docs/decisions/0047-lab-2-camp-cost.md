# 0047 — Lab 2: a new camp costs 15 wood + 15 grass

Date: 2026-11-22. Status: implemented (PR #126). This is the owner's answer to question 139. Only Lab 2's own data changed (`src/data/labCamps.ts`): no game rule, game data number or golden hash changes, and nothing under `src/engine` changed.

## Why

The owner playtested the PR #125 build, where the camp radii are 9, 12 and 15, and said: "camp is too cheap. radius is good though." With a ring of radius 9, 5 wood and 5 grass took only a few taps. Their answer to how the cost should change: "Flat, about 3× higher."

## What

- `LAB_NEW_CAMP_COST` is **15 wood + 15 grass** (was 5 + 5).
- It is the same for every new camp. The first camp is still free.
- The radii and the upgrade costs are unchanged.

## Is it still reachable?

On seeds 1 to 200, harvesting only (cutting grass, felling trees, no digging), the first camp's ring holds:

|       | Fewest (any seed) | 10th percentile | Median |
| ----- | ----------------- | --------------- | ------ |
| Wood  | 30                | 86              | 126    |
| Grass | 114               | 126             | 143    |

So every seed has at least twice the wood a camp costs.

## Tests

- The existing 200-seed test ("the first ring alone holds the wood and grass for a second camp") now checks 15 + 15.
- A new 200-seed test checks the first ring pays for a second camp even with that camp's 3 × 3 left undug, so its patch stays level.
- The surface test that read 5 from the cost now reads it from the data.
- The e2e plans (`tapsUntil`) find a way to pay for the new cost on seed 110, so the e2e tests needed no change.
