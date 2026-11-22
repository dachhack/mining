# 0046 — Lab 2: a wider light radius

Date: 2026-11-22. Status: implemented (PR #125). This is the owner's answer to question 138. Only Lab 2's own data changed (`src/data/labCamps.ts`): no game rule, game data number or golden hash changes, and nothing under `src/engine` changed.

## Why

The owner playtested the PR #123 build and said: "You have to place the camps next to each other to expand. It's too close." A new camp's 3 × 3 must stand on lit ground. With a level-1 ring of radius 5, the next camp could go only 4 squares out, so camps touched and the lit area grew slowly. The owner's answer was "Bigger light radius."

## What

The camp levels' radii are now **9, 12 and 15** (they were 5, 8 and 12). A new camp still has to stand on lit ground.

The world is 32 × 32. These are the numbers for a camp in the middle (squares lit, out of 1,024):

| Radius           | Across | The camp lights | A camp one radius out adds |
| ---------------- | ------ | --------------- | -------------------------- |
| 5 (was level 1)  | 11     | 97 (9%)         | 44                         |
| **9 (level 1)**  | 19     | 293 (29%)       | 132                        |
| 10               | 21     | 349 (34%)       | 139                        |
| **12 (level 2)** | 25     | 489 (48%)       | 133                        |
| **15 (level 3)** | 31     | 749 (73%)       | 90                         |
| 16               | 33     | 843 (82%)       | 69                         |

## Choices

- **Level 1 is 9, not 10.** At 9 a new camp can go 8 squares out and lights three times as much new ground as before, and the first camp lights under a third of the world. At 10 the first camp would light a third or more, and fog would be gone after two more camps.
- **The upgrades grow by 3, not in proportion.** Doubling 8 and 12 to 16 and 24 would light the whole 32 × 32 world from one camp, and fog would no longer matter. At 12 and 15, each upgrade still lights a wide new band, and level 3 lights about three quarters of the world.
- **The map's zoom is unchanged.** It opens 14 squares across, centred on the first camp: about 26 px a square on a 390 px wide phone, the size the game uses for a tap. A ring of radius 9 is 19 squares across, so its sides run past the screen. The map already drags with one finger and pinches to zoom out (to 32 squares across), so the rest of the ring is a drag away. Shrinking the squares to fit the whole ring would make them about 19 px, too small to tap reliably.
- **`LAB_START_REACH` (4) is unchanged.** It is how far from the middle the free first camp may stand, not how far a camp lights.
- **A bigger world is not possible in the lab** without changing the engine, because Lab 2 uses the game's own cube.

## Tests

- **Unit:**
  - A new camp can stand one radius out (8 squares) but not one further, and it lights more than a quarter of a ring of new ground.
  - Level 1 reaches at least 8 squares, and each level reaches further than the one below.
  - On 200 seeds, the first camp lights less than a third of the world.
- **E2e:**
  - The second-camp test places the new camp 8 squares out and checks it lights more than 100 new squares.
  - A tap on a square off screen first drags the map to it with one finger, as a player would.
  - The system-bar tests also check that the tray's key rows are above the gesture bar.
