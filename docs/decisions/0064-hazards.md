# 0064: Hazards come back: rain, water, gas and fire, dragons, marauders

Date: 2026-11-24. The owner, after the clay-contracts build (engine 0.12.0):

> Let's do some hazards. Rain overnight washes clay and soil into low areas and covers them. Pockets of gas can explode starting at level 4. This blows away blocks and starts fires on combustable squares. You need to put out each fire with a click. You can hit water starting at level 3. It fills the area and you need to purchase a pump to remove it by clicking it and waiting. Wandering dragons can eat your sheep and apples and set fire to things. They don't go away until you get a sword and drive them away. Marauders can come and steal things from your camps and remove their upgrades and put them back to basic. If the camp has defneses though, they can be turned away. The strength of the marauders depends on how far you have dug. The damage they do depends on what level of defense your targeted camp has.

## Decision

Five hazards, built one PR at a time in this order: rain, water and the pump, gas and fire, dragons and the sword, marauders and camp defenses; then the simulator's numbers. The plan, with every default: `docs/plans/hazards.md`. The choices made without the owner are questions 181 to 192.

This replaces the design doc's "Hazards: none for now" (section 2) and the "dropped for now" row of section 10. Water and gas reuse the old game's pockets in the cube, which the frontier treated as rubble until now. Harm stays hunger only (question 182).
