import type { AvatarData } from './types';

// What is left of the avatar's numbers: carrying (until task T4) and light
// (until task T3). Health is the crew's now: see crew.ts (issue #90).
export const AVATAR: AvatarData = {
  carryCapacity: 20,
  lightRadiusWithOil: 3,
  // 0: with the lamp out only the miner's own cell counts as lit, so it knows
  // just the six cells it touches (issue #33; decision note 0011). Those are
  // the cells a move or a mine can reach, so the action lists are the same
  // lit or dark.
  lightRadiusWithoutOil: 0,
  torchLightRadius: 3,
};
