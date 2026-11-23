// The help of the new game's play interface: usage, then the rules as the
// player needs them. The numbers come from src/data/frontier.ts, so the text
// stays true when they are tuned.

import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_BOARD,
  FRONTIER_CAMP_PLACE,
  FRONTIER_DEEP_CAMP,
  FRONTIER_FOODS,
  FRONTIER_LANTERN,
  FRONTIER_MARKET,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_PEN,
  FRONTIER_PICKAXE,
  FRONTIER_RECIPES,
  FRONTIER_RUN,
  FRONTIER_SAPLINGS,
  FRONTIER_SMELTER,
  FRONTIER_SHIFT,
  FRONTIER_SURFACE,
} from '../../src/data/frontier';
import { ENGINE_VERSION } from '../../src/engine';

/** "15 wood, 15 grass". */
function cost(stacks: { item: string; count: number }[]): string {
  return stacks.map((s) => `${s.count} ${s.item}`).join(', ');
}

export function frontierHelpText(): string {
  const s = FRONTIER_SHIFT;
  // "1 apple, else 2 grass, else 1 animal"
  const foods = FRONTIER_FOODS.map((f) => `${f.count} ${f.item}`).join(', else ');
  const levels = FRONTIER_CAMP_LEVELS.map(
    (level, i) =>
      `  Level ${i + 1}: ring ${level.radius}; mines ${level.addsBlocks.length === 0 ? 'nothing new' : `${level.addsBlocks.join(', ')}${i === 0 ? '' : ' and all of the above'}`}${level.upgradeCost.length > 0 ? `; upgrade costs ${cost(level.upgradeCost)}` : ''}`,
  );
  return [
    `Mining Game: the text play interface (engine ${ENGINE_VERSION})`,
    '',
    'Usage:',
    '  npm run play -- --seed 7 -i                    play seed 7, choice by choice',
    '  npm run play -- --seed 7 --log run.json -i     the same, saved to run.json after every step;',
    '                                                 run it again to carry on',
    '  npm run play -- --log run.json --do "tap 16,15; end"   take choices, then show the view',
    '  npm run play -- --replay run.json              replay a saved run and show where it ended',
    '  npm run play:old -- --help                     the old game (until it is removed)',
    '',
    'Choices: "tap X,Y", "place X,Y", "upgrade N", "demolish N", "smelter N", "make R", "lantern N",',
    '"sell ITEM N", "buy ITEM N", "plant X,Y sapling", "plant X,Y appleSapling", "end", "rest N", "close",',
    '"undo", "look X,Y", or the number of a',
    'listed choice. Separate several with ";".',
    '',
    'The rules:',
    `- A run lasts ${FRONTIER_RUN.shifts} shifts, unless the crew is lost first. Your score is the coins you hold at the end.`,
    '- The map is a square of ground seen from above. Your camps light a ring around them;',
    '  the rest is fog. A square once lit but out of range now is shown, but cannot be mined.',
    `- A shift has ${s.taps} taps. Every action that does something costs 1 tap. "end" ends the`,
    '  shift (unused taps are lost); then the world moves on.',
    '- A tap takes what is on a square first: an animal (1 animal), grass (1 grass), an apple',
    `  (1 apple a tap, ${FRONTIER_SURFACE.applesPerTree} on a tree), or a tree (${FRONTIER_SURFACE.woodPerTree} wood; an apple tree once its apples are gone).`,
    '  Then it mines the top block, which gives what the block gives (stone, clay, coal...).',
    '- The level rule: a square can only be mined if none of its four neighbours is more than',
    '  1 level higher. Dig wide, not deep.',
    `- A camp stands on a level 3 x 3, lit, not over another camp, no deeper than depth ${FRONTIER_CAMP_PLACE.maxDepth}. Its ground is never mined.`,
    `  A new camp costs ${cost(FRONTIER_NEW_CAMP_COST)}. A camp can be demolished once other camps' rings`,
    '  cover its 3 x 3; it gives nothing back.',
    ...levels,
    `- At the end of each shift: animals take ${s.animalStepsPerShift} steps (a new one walks in every ${s.animalEveryShifts} shifts);`,
    `  an apple tree picked bare has its apples back ${s.appleRegrowShifts} shifts later; a felled tree grows back`,
    `  ${s.treeRegrowShifts} shifts later, unless its square was mined or a camp stands on it; upkeep is paid:`,
    `  ${s.woodEveryShift} wood every shift, 1 food (${foods}) every ${s.foodEveryShifts} shifts, and 1 more wood`,
    `  every ${s.campWoodEveryShifts} shifts for each camp after the first.`,
    `- Each item of upkeep you cannot pay costs 1 health (of ${s.startHealth}). At 0 the crew is lost.`,
    '- "rest N" rests at camp N: full health, then the shift ends. "close" closes the mine: the run ends.',
    `- "smelter N" builds a smelter at camp N (level ${FRONTIER_SMELTER.minLevel} or more; ${cost(FRONTIER_SMELTER.cost)}; one a camp, lost with it).`,
    `  With a smelter anywhere, "make R" makes recipe R: ${FRONTIER_RECIPES.filter(
      (r) => r.needsSmelter,
    )
      .map((r) => `${r.id} (${cost(r.inputs)} -> ${r.output.count} ${r.output.item})`)
      .join(', ')}.`,
    `  While you hold an iron pickaxe, every mining tap yields ${FRONTIER_PICKAXE.yieldTimes} times as much (a second adds nothing).`,
    `  While you hold an iron drill, iron and copper ore can be mined on any camp's ground; a steel drill also mines`,
    `  crystal, rare ore and relics. No camp level mines those. The market sells both once your best camp is level 3.`,
    `  "lantern N" hangs a copper lantern from your store at camp N: its ring grows by ${FRONTIER_LANTERN.ringBonus} (one a camp, lost with it).`,
    '  Each costs 1 tap.',
    `- The market opens every ${FRONTIER_MARKET.everyShifts.join(', ')} shifts while your best camp is level 1, 2, 3, ...`,
    '  (on the shifts that are multiples of that), for the whole shift. "sell ITEM N" sells N lots for coins,',
    '  "buy ITEM N" buys N lots; each trade costs 1 tap. The view lists the prices when it is open.',
    `- Farming: cut grass grows back ${FRONTIER_SHIFT.grassRegrowShifts} shifts later if grass grows beside it (a patch cut bare stays bare).`,
    `  Every ${FRONTIER_SAPLINGS.saplingEveryFelled}nd tree felled gives a sapling; 3 apples make an apple sapling ("make apple-sapling", no smelter).`,
    `  "plant X,Y sapling" plants one on lit surface dirt or a stump (1 tap): a tree in ${FRONTIER_SAPLINGS.saplingGrowShifts} shifts,`,
    `  an apple tree in ${FRONTIER_SAPLINGS.appleSaplingGrowShifts}. Mining its square digs it out.`,
    `- "pen N" builds an animal pen at camp N (level ${FRONTIER_PEN.minLevel} or more; ${cost(FRONTIER_PEN.cost)}; one a camp; lost with it, its animals back to the store).`,
    `  "penin N" / "penout N" moves an animal from the store into it or back (up to ${FRONTIER_PEN.capacity}). Penned animals are never eaten.`,
    `  A pen with 2 or more and room breeds one every ${FRONTIER_PEN.breedEveryShifts} shifts, eating ${FRONTIER_PEN.hayPerBirth} hay; "make hay" turns 3 grass into 1 hay.`,
    `- Contracts: on a market day the board offers ${FRONTIER_BOARD.perTier} of each open tier ("take ID"). Tier 1 opens with a level ${FRONTIER_BOARD.tier1Level} camp,`,
    '  tier 2 after a tier-1 contract is delivered, tier 3 after a tier-2. Hold one at a time; "deliver" on any shift once you',
    '  hold everything it asks for pays its coins; "drop" gives it up. Each costs 1 tap. The view names your phase and goal.',
    `- "deep X,Y" places a deep camp at any depth (${cost(FRONTIER_DEEP_CAMP.cost)}; the market sells the kit after a tier-1 contract).`,
    `  Its ring is ${FRONTIER_DEEP_CAMP.radius}; it mines as a level ${FRONTIER_DEEP_CAMP.level} camp and is never upgraded.`,
    '- "undo" takes back your last action in this shift and gives the tap back. Catching an',
    '  animal and picking an apple cannot be undone, and nothing before the shift began can.',
  ].join('\n');
}
