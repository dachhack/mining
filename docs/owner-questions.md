# Questions for the owner

Agents add design questions here instead of guessing. The coordinator keeps this file current.

- **Status** is `open`, `assumed` (work is going ahead on the stated default, held in `src/data`, until the owner answers), or `answered`.
- Questions about [Decided] items block work. Questions about [Default] items do not; the coordinator records an assumed default.
- Section numbers refer to `docs/game-design-doc.md`.

| #   | Question                                                                                                                                                       | Needed by | Status  | Answer or assumed default   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------- | --------------------------- |
| 1   | Bedrock (3.2): is it inside the 32×32×32 grid, making the minable area 30×30×31, or an implied wall outside it?                                                | M1        | open    |                             |
| 2   | Starting kit: starting fuel, timber, ladders, and other items are not specified.                                                                               | M1        | open    |                             |
| 3   | Banked AP (4): does unspent AP carry into the next shift, or only convert to fuel (3 AP → 1 fuel) and reset?                                                   | M1        | open    |                             |
| 4   | Mining overhead (4.1): where must the support be placed before the block above the avatar's head can be mined?                                                 | M1        | open    |                             |
| 5   | Diagonal mining (4.1): can a diagonal neighbour be mined when both cells it shares an edge with are solid?                                                     | M1        | open    |                             |
| 6   | Light and reveal (3, 5.1): how is light radius measured (Manhattan, Chebyshev, or through open cells)? Do revealed blocks stay revealed?                       | M1        | open    |                             |
| 7   | Undo (4.1): mining always reveals neighbours, so only moves, placements, and crafting could be undone. Is that the intent?                                     | M3        | open    |                             |
| 8   | Span rule (6.1): is span measured only from a block resting on solid ground, or can span-supported blocks chain? How many cells does a placed support hold up? | M2        | open    |                             |
| 9   | Air (5.1): away from a camp, what counts as connected air? Any open path to the surface?                                                                       | M2        | open    |                             |
| 10  | Gas ignition (6.3): does the avatar's default lamp ignite gas? How fast is lamp oil used?                                                                      | M2        | open    |                             |
| 11  | Missing numbers: item weights, lamp-oil burn rate, pump rate, crack-timer start, damage for rockfall, lava, and explosions, and how gas thins.                 | M1–M2     | open    |                             |
| 12  | Entombment (5.3): is "no path, no mineable block that could open one, and not enough fuel" an acceptable conservative test? Should lacking ladders count?      | M2        | open    |                             |
| 13  | Timber supply: timber-root is in layers 0–7 only, but camp kits, supports, ladders, and torches all need it. Is hauling timber down intended?                  | M2        | open    |                             |
| 14  | Data validation: a hand-written validator, or a library such as Zod?                                                                                           | M1        | open    |                             |
| 15  | Agent plan section 4: may the coordinator merge PRs that are green and reviewer-approved, with the owner merging each milestone's last PR?                     | M1        | assumed | Yes, as written in the plan |
| 16  | Agent plan section 6: may the coordinator proceed on assumed defaults for unanswered [Default] questions?                                                      | M1        | assumed | Yes, as written in the plan |
| 17  | Agent plan section 3.4: is 12 runs per playtest round (4 personas × 3 seeds) the right size to start with?                                                     | M1        | assumed | Yes, as written in the plan |
