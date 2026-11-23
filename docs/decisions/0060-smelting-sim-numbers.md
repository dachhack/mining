# 0060: Smelting and crafting in the simulator

Date: 2026-11-23. PR 5 of `docs/plans/smelting-and-crafting.md`: what the simulator says about the smelter, the ingots, the tools and camp level 4 (PRs 1 to 4, engine 0.8.0). No number in `src/data` changed in that PR. The tuning options were owner questions 165 and 166; the owner's answers, and the lantern recipe they changed, are at the end.

## The policies learn to craft

Until now only the random policy built smelters or made anything. The gatherer (`tools/frontierRun.ts`), and with it the careful policy, now does `craftStep` before anything else it can do:

1. it builds a smelter, if none stands, at the first camp that may have one;
2. it makes an iron pickaxe, then an iron drill (one of each);
3. it hangs a lantern it holds at the first camp without one, or makes a lantern while a camp has none;
4. otherwise it smelts iron, then copper.

Upgrades still come next, so level 4 comes as soon as its ingots are held. The careful policy holds back a recipe that uses wood or food, as it holds back camps and upgrades, while upkeep for the next 4 shifts is not covered. The gatherer and careful golden runs are re-recorded: both now build a smelter in their first 10 shifts.

The simulator records the shift each step is first reached in, and the coal, ore and crystal mined. `npm run sim` prints them as a second line for each policy.

## The numbers (100 runs a policy, 60 shifts, seeds 1 to 100)

Each cell gives how many of the 100 runs reached that step, and the median shift they reached it in.

| Step         | careful | gatherer | random | digger |
| ------------ | ------- | -------- | ------ | ------ |
| level 2      | 100 @3  | 100 @3   | 98 @7  | 0      |
| smelter      | 100 @4  | 100 @4   | 98 @10 | 0      |
| level 3      | 89 @8   | 89 @8    | 23 @16 | 0      |
| first ingot  | 89 @13  | 89 @13   | 23 @30 | 0      |
| iron pickaxe | 89 @16  | 89 @16   | 23 @38 | 0      |
| iron drill   | 88 @18  | 88 @18   | 23 @43 | 0      |
| level 4      | 87 @21  | 87 @21   | 5 @43  | 0      |
| lantern made | 7 @59   | 7 @56    | 0      | 0      |
| lantern hung | 7 @59   | 7 @56    | 0      | 0      |

Median mined over the run: careful and gatherer 91 coal, 282 raw iron, 202 raw copper, **0 crystal**. The median deepest square is 14 levels down. No careful or gatherer crew was lost; 3 careful runs and 17 gatherer runs went hungry at some point. The careful and gatherer policies differ little: at 100 taps a shift, upkeep almost never holds the careful policy back (decision note 0058; question 160, "leave it easy"). The digger stays at one level-1 camp and never smelts.

## What it shows

- **Smelting and the pickaxe come steadily.** The smelter comes the shift after level 2. Ingots wait for a level-3 camp to mine ore (shift 8), then for enough ore and coal: the first ingot comes at shift 13. The pickaxe follows 3 shifts later, the drill 2 after that, and level 4 by shift 21.
- **The lantern is out of reach (question 165).** Crystal lies only in the deep band, layer 12 and below, at about 1% of it: some 11 blocks a layer across the 32 × 32 map. Ore is in layers 4 to 11 and coal in 1 to 3. A pit 12 levels deep needs a wide funnel because of the level rule, so median crystal mined is 0, and only 7 runs in 100 make a lantern, near the end. Two options were tried in memory only, on 50 runs of each policy over 60 shifts:
  - lantern for 2 copper ingots + 1 coal: 44 of 50 runs hang one, at a median shift of 14;
  - a little crystal in the middle band (1.5 veins per 1,000 cells, 2 to 4 blocks each): 21 crystal mined (median), and 42 of 50 runs hang a lantern, at a median shift of 20. This changes every seed's cube, the old game's too, until Phase C.
- **The drill comes after it matters most (question 166).** A level-3 camp comes at shift 8 and the drill at shift 18. By then the policies' camps mine as deep as the drill allows anyway. The drill helps only a camp still at level 1 or 2. The policies keep their 3 camps and upgrade them all, so the simulator cannot say how much a player would use it.
- **11 runs in 100 never reach level 3,** so they never make an ingot. All 11 stop 1 to 4 apples short of the upgrade's 10. By then only 2 or 3 apple trees are left on the map, none of them lit and bearing. The gatherer fells bare apple trees for wood. This is mostly the policy, not a rule. The playtest brief asks the playtesters to watch for it.

## The owner's answers (2026-11-23)

- **Question 165: (a).** The copper lantern takes 2 copper ingots + 1 coal; crystal is no longer needed (`FRONTIER_RECIPES` in `src/data/frontier.ts`).
- **Question 166: (a).** The drill stays as it is; the playtest will show whether players use it.

The same 100 runs of 60 shifts with the coal lantern:

| Step         | careful (crystal → coal) | gatherer (crystal → coal) |
| ------------ | ------------------------ | ------------------------- |
| lantern hung | 7 @59 → 88 @15           | 7 @56 → 88 @15            |
| iron drill   | 88 @18 → 82 @18          | 88 @18 → 82 @18           |
| level 4      | 87 @21 → 62 @21          | 87 @21 → 62 @21           |

The other steps are unchanged. Lanterns now compete for copper ingots. The policies hang a lantern at each of their 3 camps (6 copper ingots) before they save for the drill (2) and level 4 (6), so fewer runs reach those by shift 60. A player who wants level 4 sooner can hang fewer lanterns; the playtest brief asks which they chose.
