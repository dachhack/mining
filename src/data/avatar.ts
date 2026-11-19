import type { AvatarData } from './types';

// Design doc 5.1 and 5.2; decision notes 0005 items 7, 13 and 15, and 0010.
// Air (5.1) is in hazards.ts, with the things that take it away.
export const AVATAR: AvatarData = {
  startHealth: 10,
  carryCapacity: 20,
  // 3 also covers the cells a walk off a ledge is judged by (up to 3 below
  // the neighbour). Since issue #75 nothing else reveals them (no looking
  // over an edge), so a smaller radius would quietly offer fewer lit drops.
  lightRadiusWithOil: 3,
  // 0: with the lamp out only the miner's own cell counts as lit, so it knows
  // just the six cells it touches (issue #33; decision note 0011). The move
  // list is safe at 0 because every move checks that the cells it is judged
  // by are revealed (this replaces the "at least 1" plan of issue #19).
  lightRadiusWithoutOil: 0,
  torchLightRadius: 3,
  freeFallBlocks: 2,
  fallDamagePerBlock: 2,
  uncontrolledFallDamagePerBlock: 1,
  fatalFallBlocks: 6,
  maxChosenDropBlocks: 2,
  // Owner, issue #75: "safe one-block drop" when digging out the block you
  // stand on, as in Minecraft.
  safeDigDownBlocks: 1,
};
