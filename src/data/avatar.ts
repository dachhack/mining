import type { AvatarData } from './types';

// Design doc 5.1; decision notes 0005 items 13 and 15. The miner has no
// gravity (owner, issue #80), so there are no fall or drop numbers.
// Air (5.1) is in hazards.ts, with the things that take it away.
export const AVATAR: AvatarData = {
  startHealth: 10,
  carryCapacity: 20,
  lightRadiusWithOil: 3,
  // 0: with the lamp out only the miner's own cell counts as lit, so it knows
  // just the six cells it touches (issue #33; decision note 0011). Those are
  // the cells a move or a mine can reach, so the action lists are the same
  // lit or dark.
  lightRadiusWithoutOil: 0,
  torchLightRadius: 3,
};
