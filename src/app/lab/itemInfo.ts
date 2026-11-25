// What each item is for, in one short line, for the market's info chips
// (owner: "For the market you need to see what you already own and what it
// does. You also need to see what all the things you can buy do. Maybe do it
// in an info chip to save space"). The numbers come from the data, so the
// text follows any change to them. This is the screen's own text: nothing
// here changes the game.

import {
  FRONTIER_DEEP_CAMP,
  FRONTIER_DRAGON,
  FRONTIER_DRILL,
  FRONTIER_FOODS,
  FRONTIER_LANTERN,
  FRONTIER_PEN,
  FRONTIER_PICKAXE,
  FRONTIER_PUMP,
  FRONTIER_SAPLINGS,
  FRONTIER_SHIFT,
  FRONTIER_STEEL_DRILL,
} from '../../data/frontier';

/** Grass eaten as one food (FRONTIER_FOODS). */
const GRASS_A_FOOD = FRONTIER_FOODS.find((f) => f.item === 'grass')?.count ?? 0;

/** What `item` is for, in one line; `null` for an item with nothing to say. */
export function itemInfo(item: string): string | null {
  switch (item) {
    case 'wood':
      return `Upkeep: ${FRONTIER_SHIFT.woodEveryShift} a night, more with more camps. Builds camps, upgrades, pens and defenses.`;
    case 'grass':
      return `Food: ${GRASS_A_FOOD} make a meal. Makes hay, and pays for camp upgrades.`;
    case 'apple':
      return 'Food for the crew, and needed for camp upgrades.';
    case 'animal':
      return 'Food (the last kept), needed for upgrades, and breeds in a pen.';
    case 'hay':
      return `Food for the crew; ${FRONTIER_PEN.hayPerBirth} feed each animal born in a pen.`;
    case 'clay':
      return 'Pays for camp upgrades, and the clay contracts ask for it.';
    case 'stone':
      return 'Builds stone walls and the deep camp; stone contracts ask for it.';
    case 'coal':
      return 'Smelts ore into ingots, and makes lanterns; coal contracts ask for it.';
    case 'rawIronOre':
    case 'rawCopperOre':
      return 'Smelt it with coal at a smelter: 2 ore make 2 ingots.';
    case 'ironIngot':
    case 'copperIngot':
      return 'Makes tools, lanterns and swords at a smelter; ingot contracts ask for it.';
    case 'crystal':
    case 'rareOre':
    case 'relic':
    case 'keystone':
      return 'Treasure: worth most to a tier-3 contract.';
    case 'sapling':
      return `Plant it with 🌱 on bare dirt: a tree in ${FRONTIER_SAPLINGS.saplingGrowShifts} shifts.`;
    case 'appleSapling':
      return `Plant it with 🌱 on bare dirt: an apple tree in ${FRONTIER_SAPLINGS.appleSaplingGrowShifts} shifts.`;
    case FRONTIER_PUMP.item:
      return `Tap a flood to set it: it drains ${FRONTIER_PUMP.drainPerShift} squares a night, then comes back to your store.`;
    case FRONTIER_DRAGON.sword:
      return 'Tap a dragon with it to drive it off. You keep the sword.';
    case FRONTIER_DRILL.item:
      return 'Mines iron and copper ore on any camp’s ground, while you have one.';
    case FRONTIER_STEEL_DRILL.item:
      return 'Mines iron, copper, crystal, rare ore, relics and keystones, while you have one.';
    case FRONTIER_PICKAXE.item:
      return `Every mining tap gives ${FRONTIER_PICKAXE.yieldTimes}×, while you have one.`;
    case FRONTIER_LANTERN.item:
      return `Hang it at a camp from its panel: its ring grows by ${FRONTIER_LANTERN.ringBonus}.`;
    case 'campKit':
      return `Builds a deep camp (with ${FRONTIER_DEEP_CAMP.cost
        .filter((c) => c.item !== 'campKit')
        .map((c) => `${c.count} ${c.item}`)
        .join(' and ')}): it levels any 3 × 3 and mines as level ${FRONTIER_DEEP_CAMP.level}.`;
    default:
      return null;
  }
}
