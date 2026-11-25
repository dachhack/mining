import type { ItemDef } from './types';

export type ItemId =
  | 'stone'
  | 'coal'
  | 'timber'
  | 'rawIronOre'
  | 'rawCopperOre'
  | 'crystal'
  | 'rareOre'
  | 'relic'
  | 'keystone'
  | 'support'
  | 'ironIngot'
  | 'copperIngot'
  | 'drill'
  | 'pump'
  | 'vent'
  | 'scannerCharge'
  | 'sealant'
  | 'explosive'
  | 'campKit'
  // The new game's surface and clay (Lab 2 becomes the game, plan A1).
  | 'wood'
  | 'grass'
  | 'apple'
  | 'animal'
  | 'clay'
  // Made from ingots (smelting and crafting, PR 3).
  | 'ironPickaxe'
  | 'copperLantern'
  // Money at the market (docs/plans/progression-phases.md, section 3).
  | 'coin'
  // Bought at the market: mines crystal, rare ore and relics (plan section 4).
  | 'steelDrill'
  // Planted to grow a tree or an apple tree (progression plan section 6.2).
  | 'sapling'
  | 'appleSapling'
  // Made from grass; feeds penned animals and the crew (plan section 6.3).
  | 'hay'
  // Drives a dragon off (docs/plans/hazards.md, section 4).
  | 'sword'
  // Fells a tree for more wood (owner, after the 0.17.0 build).
  | 'axe'
  // Maple trees, their sap and the syrup boiled from it (owner, after the 0.17.0 build).
  | 'mapleSapling'
  | 'sap'
  | 'syrup'
  // Picked where a tree stood in the rain (owner, after the 0.17.0 build).
  | 'mushroom'
  // Grains and vegetables, grown from seeds (owner, after the 0.19.0 build).
  | 'wheatSeed'
  | 'cornSeed'
  | 'carrotSeed'
  | 'potatoSeed'
  | 'wheat'
  | 'corn'
  | 'carrot'
  | 'potato';

// Fuel is a gauge, not an item, so it is not here. The torch and the safety
// lamp are gone with light (design doc v0.2, section 7). Items have no weight:
// carrying is gone and the stockpile has no limit (design doc 4.1 and 5.4;
// owner question 87).
//
// "Raw ore" (design doc 3.5) is two items, iron and copper, because the camp
// recipes in 7.2 need to tell them apart.
export const ITEMS: Record<ItemId, ItemDef> = {
  stone: { name: 'Stone' },
  coal: { name: 'Coal' },
  timber: { name: 'Timber' },
  rawIronOre: { name: 'Raw iron ore' },
  rawCopperOre: { name: 'Raw copper ore' },
  crystal: { name: 'Crystal' },
  rareOre: { name: 'Rare ore' },
  relic: { name: 'Relic' },
  keystone: { name: 'Keystone' },
  support: { name: 'Support' },
  // Camp-made items (design doc 7.2).
  ironIngot: { name: 'Iron ingot' },
  copperIngot: { name: 'Copper ingot' },
  drill: { name: 'Drill' },
  pump: { name: 'Pump' },
  vent: { name: 'Vent' },
  scannerCharge: { name: 'Scanner charge' },
  sealant: { name: 'Sealant' },
  explosive: { name: 'Explosive' },
  campKit: { name: 'Camp kit' },
  // The new game's surface and clay (plan A1).
  wood: { name: 'Wood' },
  grass: { name: 'Grass' },
  apple: { name: 'Apples' },
  animal: { name: 'Animals' },
  clay: { name: 'Clay' },
  // Made from ingots (docs/plans/smelting-and-crafting.md, PR 3).
  ironPickaxe: { name: 'Iron pickaxe' },
  coin: { name: 'Coins' },
  steelDrill: { name: 'Steel drill' },
  sapling: { name: 'Saplings' },
  hay: { name: 'Hay' },
  sword: { name: 'Sword' },
  axe: { name: 'Axe' },
  mapleSapling: { name: 'Maple saplings' },
  sap: { name: 'Sap' },
  syrup: { name: 'Syrup' },
  mushroom: { name: 'Mushrooms' },
  wheatSeed: { name: 'Wheat seeds' },
  cornSeed: { name: 'Corn seeds' },
  carrotSeed: { name: 'Carrot seeds' },
  potatoSeed: { name: 'Potato seeds' },
  wheat: { name: 'Wheat' },
  corn: { name: 'Corn' },
  carrot: { name: 'Carrots' },
  potato: { name: 'Potatoes' },
  appleSapling: { name: 'Apple saplings' },
  copperLantern: { name: 'Copper lantern' },
};
