// What each item is for, in one short line, for the market's info chips
// (owner: "For the market you need to see what you already own and what it
// does. You also need to see what all the things you can buy do. Maybe do it
// in an info chip to save space"). The numbers come from the data, so the
// text follows any change to them. This is the screen's own text: nothing
// here changes the game.

import {
  FRONTIER_AXE,
  FRONTIER_CROPS,
  FRONTIER_DEEP_CAMP,
  FRONTIER_DRAGON,
  FRONTIER_DRILL,
  FRONTIER_FOODS,
  FRONTIER_LANTERN,
  FRONTIER_MINERS,
  FRONTIER_PEN,
  FRONTIER_PICKAXE,
  FRONTIER_PUMP,
  FRONTIER_SAPLINGS,
  FRONTIER_SHIFT,
  FRONTIER_STEEL_DRILL,
  FRONTIER_SURFACE,
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
    case 'mapleSapling':
      return `Plant it with 🌱 on bare dirt: a maple tree in ${FRONTIER_SAPLINGS.mapleSaplingGrowShifts} shifts, tapped for sap.`;
    case 'sap':
      return `From a maple tree, 1 a tap (${FRONTIER_SURFACE.sapPerTree} a tree). Boil it into syrup at a sugar shack.`;
    case 'syrup':
      return 'Boiled from maple sap at a sugar shack. Sells well at the market.';
    case 'lumber':
      return 'Sawn from 2 wood at a saw house. Lumber contracts ask for it; it sells at the market.';
    case 'mushroom':
      return 'Comes up under trees some nights after rain. Sells for coins; mushroom contracts ask for it.';
    case 'wheatSeed':
    case 'cornSeed':
    case 'carrotSeed':
    case 'potatoSeed': {
      const crop = FRONTIER_CROPS.find((c) => c.seed === item);
      return crop === undefined
        ? null
        : `Sow it with 🌱 on bare dirt: ripe in ${crop.growShifts} shifts, then a tap harvests ${crop.yield}.`;
    }
    case 'wheat':
    case 'corn':
    case 'carrot':
    case 'potato': {
      const food = FRONTIER_FOODS.find((f) => f.item === item)?.count ?? 1;
      return `Food for the crew: ${food === 1 ? 'one' : food} a meal. Sells at the market.`;
    }
    case FRONTIER_MINERS.item:
      return `One more of the crew: more taps a shift, and from 2 a long press digs a 3 × 3. Eats ${FRONTIER_MINERS.foodEach} food when the crew eats. Up to ${FRONTIER_MINERS.most}.`;
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
    case FRONTIER_AXE.item:
      return `A felled tree gives ${FRONTIER_AXE.woodPerTree} wood, not ${FRONTIER_SURFACE.woodPerTree}, while you have one.`;
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
