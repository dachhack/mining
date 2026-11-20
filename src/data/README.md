# src/data

Every gameplay number and recipe from the design doc lives here, as plain TypeScript constants. Nothing in `src/engine` may contain a gameplay number; it reads them from here.

| File            | Holds                                                       | Source                  |
| --------------- | ----------------------------------------------------------- | ----------------------- |
| `world.ts`      | Cube size, surface layer, depth bands                       | Design doc 3, 3.1; 0005 |
| `generation.ts` | Rock, veins, caverns and pockets in each depth band         | Design doc 3.3, 3.6     |
| `blocks.ts`     | Block types: code, mine cost, yield, slump limit            | Design doc 3.5; 0014    |
| `items.ts`      | Item types                                                  | Design doc 3.5, 7       |
| `structures.ts` | Things placed in a cell (support, pump, vent, ...)          | Design doc 4.1; 0014    |
| `recipes.ts`    | Field recipes and camp recipes                              | Design doc 7.1, 7.2     |
| `hazards.ts`    | Slump, water, gas and lava numbers                          | Design doc 6; 0014      |
| `camps.ts`      | Camp size, costs and upkeep; scanner numbers                | Design doc 8; 0014      |
| `crew.ts`       | Crew health; what each hazard takes off it                  | Design doc 5.1, 5.2     |
| `surface.ts`    | The surface forest: kinds, cutting, regrowth, generation    | Design doc 3; 0020      |
| `tells.ts`      | Tells: how near ore or a pocket must be for a block to show | Design doc 3.7; 0012    |
| `shift.ts`      | AP per shift, fuel upkeep, fixed action costs               | Design doc 4, 4.1; 0005 |
| `loadouts.ts`   | Starting kits; the placeholder contract id                  | 0005 items 22, 23       |
| `types.ts`      | The shape of each table                                     |                         |
| `validate.ts`   | `validateData()`: checks the tables against each other      | 0005 item 24            |
| `index.ts`      | Re-exports everything, plus `GAME_DATA` and lookups by id   |                         |

"0005" is `docs/decisions/0005-m1-assumed-defaults.md` and "0014" is `docs/decisions/0014-m2-assumed-defaults.md`.

`validateData()` returns a list of problems (an empty list means the data is good). A unit test runs it on the real data in CI, and the tools will run it at start-up. Generation numbers (vein and space sizes and frequencies) are in `generation.ts`; decision note 0030 has the survey of what they give.
