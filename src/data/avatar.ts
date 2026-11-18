import type { AvatarData } from './types';

// Design doc 5.1 and 5.2; decision notes 0005 items 7, 13 and 15, and 0010.
// Air (5.1) is not here yet: it arrives with the hazards in M2 (0005 item 8).
export const AVATAR: AvatarData = {
  startHealth: 10,
  carryCapacity: 20,
  lightRadiusWithOil: 3,
  lightRadiusWithoutOil: 1,
  torchLightRadius: 3,
  freeFallBlocks: 2,
  fallDamagePerBlock: 2,
  uncontrolledFallDamagePerBlock: 1,
  fatalFallBlocks: 6,
  maxChosenDropBlocks: 2,
};
