import type { AvatarData } from './types';

// Design doc 5.1; decision notes 0005 items 13 and 15. The miner has no
// gravity (owner, issue #80), so there are no fall or drop numbers.
// Air (5.1) is in hazards.ts, with the things that take it away.
// The light radii are gone with light (design doc v0.2).
export const AVATAR: AvatarData = {
  startHealth: 10,
  carryCapacity: 20,
};
