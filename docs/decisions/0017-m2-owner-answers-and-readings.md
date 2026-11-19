# 0017 — M2: the owner's answers of 2026-11-19 and the readings that settle the developers' questions

Date: 2026-11-19. Status: accepted. Amends decision note 0014 where it says so; 0014 has been edited to point here.

## Context

The five M2 developers (issues #52, #53, #54, #55, #57) were paused part-way on 2026-11-18. Before the pause they raised questions that 0014 does not settle. Four went to the owner (questions 59, 63, 64, 65 in `docs/owner-questions.md`); the coordinator settles the rest here so that work can resume without another round of questions.

## Owner's answers

1. **Starting camp kit (question 63; owner: "yes").** The standard loadout includes one camp kit (weight 8, so the starting load is 10 of 20). Every run's starting state changes, so the golden runs are re-recorded in the camps task (#57), and tests that depend on the starting kit are updated there. The starting-fuel survey (0016) is re-run in that task and its numbers reported.
2. **Gas is weaker than an explosive (question 64; owner: "the gas should be less powerful than the explosive").** A gas explosion deals 3 damage; an explosive deals 6 (both [Default], in `src/data/hazards.ts`). Each is one explosion as 0014 item 15 defines it, so an explosive that sets off a gas pocket beside the miner deals 6 + 3 = 9: survivable from full health (10), not from less. Only an explosive removes blocks; a gas explosion removes the gas and destroys structures, as item 15 says.
3. **Explosions and relics (question 65; owner: "probability based").** An explosion that would remove a relic or keystone block destroys it with a probability set in `src/data` ([Default], 0.5 until tuned); otherwise the block is left in place. Relics and keystones are generated only from M4 (contracts), so this is built then, not in M2. It is the one place where the cube phase draws from the seeded RNG in state; 0014 item 1's "nothing in the cube phase uses the RNG" holds until then. The forecast does not draw: it reports that a relic in the blast "may be destroyed".
4. **Dirt roofs (question 59; owner: "acceptable and let's play test it").** 0014 item 11 stands. Rubble that falls into a stair cannot be cleared from below (the pick does not reach up the diagonal), and that is accepted too. The cave-ins task (#53) updates any M1 acceptance assertion this rule breaks (for example "no damage, no ladders, exactly 17 blocks mined" on seed 8), and says in its PR which assertion changed and why. The M2 playtest round watches the top band.

## Coordinator's readings

Each is the smallest reading of 0014 and the design doc; each can change after the M2 playtest round.

Camps (#57):

5. Lava counts as a bad cell for a camp's air line, as water does.
6. The vents that bridge a bad stretch of the air line stand in the good cells at either end of it.
7. A decommissioned camp's stash is dropped as loose items in its founding cell.
8. Camp upkeep takes at most the fuel that is left; reaching zero fuel is then handled by the usual out-of-fuel rule (0014 item 34).
9. A second camp kit cannot be picked up while one is carried (section 8: "at most one"); the one-line change in `actions/items.ts` is accepted.

Water and lava (#54):

10. Water does not flow into a lava cell; where they meet, the stone rule of 0014 item 16 applies.
11. Water destroys camps (0014 item 30) and nothing else; torches and other structures survive in water. To be watched in the playtest.
12. Lava entering a cell with a placed explosive does not destroy it; the explosive goes off as planned in step (c) of the same phase.
13. A cell that turns to stone destroys what it held (structures, loose items, a camp cell), as lava entering it would. The avatar's own cell does not turn to stone (0014 item 16).
14. Lava damage is 5 in the avatar's cell, otherwise 1 if lava is beside it, recorded once (0014 items 1(b) and 16).
15. A lava cell blocks connected air, as a flooded cell does (0014 item 20), consistent with reading 5.
16. Water and gas never share a cell: gas does not spread into flooded cells (0014 item 13).

Gas and explosions (#55):

17. An explosion does not destroy loose items (0014 item 15 does not list them).
18. Connected gas goes off as one explosion (0014 item 14), so gas does not chain to gas, and ignition ends after one round unless a new explosion reaches other gas.

Generation (#52):

19. Caverns are generated wide enough for 0014 item 19 and still at rest by the support rule of item 5; where the two disagree, the cavern is made narrower.
20. Each hazard is generated only in the band design doc 3.1 names for it.
21. Caverns are generated empty: no pooled water or gas.

## Carry-overs added after the surface forest (PR #72, decision note 0020)

For the paused M2 tasks, to go into their briefs when they resume:

- #52 (generation): path wear and the coal-in-sight step read layer 1 (they wear or place only where layer 1 is solid); once upper-band voids exist this would give away an unseen void, so change them as 0020 says. Add a test that pins the coal guarantee's no-leak property (changing cells under trees must not change what the guarantee does).
- #53 (cave-ins): a test that regrowth happens after the cube phase: a stump due this shift over a block that falls in step (a) is named in the forecast's `regrowth` part and then does not grow.
- #54 and #55 (water, lava, gas, air): trees count as open air for flows and connected air, but any rule that lets something enter or rest in a surface cell must also check `hasTree`.
- All M2 tasks: `ShiftForecast` has a required `regrowth` field; STATE_VERSION is 5; the golden runs were re-recorded for the forest.

## Consequences

- Starting load becomes 10 of 20; golden runs are re-recorded once, in #57.
- `src/data/hazards.ts` gains a gas-explosion damage of 3 beside the explosive's 6 (#55).
- No RNG in the cube phase in M2.
