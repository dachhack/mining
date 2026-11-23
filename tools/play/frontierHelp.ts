// The help of the new game's play interface: usage, then the rules as the
// player needs them. The numbers come from src/data/frontier.ts, so the text
// stays true when they are tuned.

import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_FOODS,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_RECIPES,
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
      `  Level ${i + 1}: ring ${level.radius}; mines ${level.addsBlocks.join(', ')}${i === 0 ? '' : ' and all of the above'}${level.upgradeCost.length > 0 ? `; upgrade costs ${cost(level.upgradeCost)}` : ''}`,
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
    'Choices: "tap X,Y", "place X,Y", "upgrade N", "demolish N", "smelter N", "make R", "end",',
    '"rest N", "close", "undo", "look X,Y", or the number of a listed choice. Separate several with ";".',
    '',
    'The rules:',
    '- The map is a square of ground seen from above. Your camps light a ring around them;',
    '  the rest is fog. A square once lit but out of range now is shown, but cannot be mined.',
    `- A shift has ${s.taps} taps. Every action that does something costs 1 tap. "end" ends the`,
    '  shift (unused taps are lost); then the world moves on.',
    '- A tap takes what is on a square first: an animal (1 animal), grass (1 grass), an apple',
    `  (1 apple a tap, ${FRONTIER_SURFACE.applesPerTree} on a tree), or a tree (${FRONTIER_SURFACE.woodPerTree} wood; an apple tree once its apples are gone).`,
    '  Then it mines the top block, which gives what the block gives (stone, clay, coal...).',
    '- The level rule: a square can only be mined if none of its four neighbours is more than',
    '  1 level higher. Dig wide, not deep.',
    '- A camp stands on a level 3 x 3, lit, not over another camp. Its ground is never mined.',
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
    `  With a smelter anywhere, "make R" makes recipe R: ${FRONTIER_RECIPES.map((r) => `${r.id} (${cost(r.inputs)} -> ${r.output.count} ${r.output.item})`).join(', ')}.`,
    '  Each costs 1 tap.',
    '- "undo" takes back your last action in this shift and gives the tap back. Catching an',
    '  animal and picking an apple cannot be undone, and nothing before the shift began can.',
  ].join('\n');
}
