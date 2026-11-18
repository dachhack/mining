# src/data

Every gameplay number and recipe from the design doc lives here, as plain TypeScript constants. Nothing in `src/engine` may contain a gameplay number; it reads them from here.

| File            | Holds                                                        | Source                  |
| --------------- | ------------------------------------------------------------ | ----------------------- |
| `world.ts`      | Cube size, surface layer, start position, depth bands        | Design doc 3, 3.1; 0005 |
| `blocks.ts`     | Block types: code, mine cost, yield                          | Design doc 3.2          |
| `items.ts`      | Item types and weights                                       | 0005 item 18            |
| `structures.ts` | Things placed in a cell (ladder, torch, support)             | Design doc 4.1          |
| `recipes.ts`    | Field recipes                                                | Design doc 7.1          |
| `avatar.ts`     | Health, carry capacity, light radii, fall damage             | Design doc 5.1, 5.2     |
| `shift.ts`      | AP per shift, fuel upkeep, lamp-oil burn, fixed action costs | Design doc 4, 4.1; 0005 |
| `loadouts.ts`   | Starting kits; the placeholder contract id                   | 0005 items 22, 23       |
| `types.ts`      | The shape of each table                                      |                         |
| `validate.ts`   | `validateData()`: checks the tables against each other       | 0005 item 24            |
| `index.ts`      | Re-exports everything, plus `GAME_DATA` and lookups by id    |                         |

"0005" is `docs/decisions/0005-m1-assumed-defaults.md`.

`validateData()` returns a list of problems (an empty list means the data is good). A unit test runs it on the real data in CI, and the tools will run it at start-up. Generation numbers (vein sizes and frequencies) are added by the generation task.
