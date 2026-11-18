import type { AvatarData } from './types';

// Design doc 5.1 and 5.2; decision note 0005 items 7, 13 and 15.
// Air (5.1) is not here yet: it arrives with the hazards in M2 (0005 item 8).
export const AVATAR: AvatarData = {
  startHealth: 10,
  carryCapacity: 20,
  lightRadiusWithOil: 3,
  // 0: with the lamp out only the miner's own cell counts as lit, so it knows
  // just the six cells it touches (issue #33; decision note 0010). The move
  // list is safe at 0 because every move checks that the cells it is judged
  // by are revealed (this replaces the "at least 1" plan of issue #19).
  lightRadiusWithoutOil: 0,
  torchLightRadius: 3,
  freeFallBlocks: 2,
  fallDamagePerBlock: 2,
  fatalFallBlocks: 6,
  maxChosenDropBlocks: 2,
};
