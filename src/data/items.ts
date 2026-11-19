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
  | 'torch'
  | 'ironIngot'
  | 'copperIngot'
  | 'drill'
  | 'pump'
  | 'vent'
  | 'safetyLamp'
  | 'scannerCharge'
  | 'sealant'
  | 'explosive'
  | 'campKit';

// Weights: decision note 0005 item 18. Fuel and lamp oil are gauges, not
// items, so they are not here.
//
// "Raw ore" (design doc 3.2) is two items, iron and copper, because the camp
// recipes in 7.2 need to tell them apart; each has the raw-ore weight of 2.
// The weights of rare ore, relic and keystone are not given anywhere yet
// (owner question 26); they are placeholders until M2 and M4.
export const ITEMS: Record<ItemId, ItemDef> = {
  stone: { name: 'Stone', weight: 2 },
  coal: { name: 'Coal', weight: 1 },
  timber: { name: 'Timber', weight: 1 },
  rawIronOre: { name: 'Raw iron ore', weight: 2 },
  rawCopperOre: { name: 'Raw copper ore', weight: 2 },
  crystal: { name: 'Crystal', weight: 1 },
  rareOre: { name: 'Rare ore', weight: 2 },
  relic: { name: 'Relic', weight: 2 },
  keystone: { name: 'Keystone', weight: 2 },
  support: { name: 'Support', weight: 2 },
  torch: { name: 'Torch', weight: 1 },
  // Camp-made items (design doc 7.2). Weights: decision note 0014 items 25
  // and 31. An ingot weighs 1, half the raw ore it is smelted from.
  ironIngot: { name: 'Iron ingot', weight: 1 },
  copperIngot: { name: 'Copper ingot', weight: 1 },
  drill: { name: 'Drill', weight: 3 },
  pump: { name: 'Pump', weight: 3 },
  vent: { name: 'Vent', weight: 2 },
  safetyLamp: { name: 'Safety lamp', weight: 1 },
  scannerCharge: { name: 'Scanner charge', weight: 1 },
  sealant: { name: 'Sealant', weight: 1 },
  explosive: { name: 'Explosive', weight: 1 },
  campKit: { name: 'Camp kit', weight: 8 },
};
