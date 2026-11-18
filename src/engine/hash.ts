// A fingerprint of a GameState, for determinism tests and golden runs:
// "same seed and same actions give the same hash".
//
// Written in plain TypeScript with 32-bit integer arithmetic, with no Node
// `crypto`, so it gives the same answer in Node and in every browser
// (decision note 0005 item 25). It is a checksum, not a security feature.

import { serialise } from './serialise';
import type { GameState } from './state';

/**
 * A 64-bit hash of a string, as 16 hex digits. This is the public-domain
 * "cyrb53"-style mix: two 32-bit running hashes, stirred together at the end.
 * `Math.imul` is 32-bit integer multiplication; `>>>` is an unsigned shift.
 */
export function hashString(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const high = (h2 >>> 0).toString(16).padStart(8, '0');
  const low = (h1 >>> 0).toString(16).padStart(8, '0');
  return high + low;
}

/**
 * The hash of a state: 16 hex digits. Two states that serialise to the same
 * JSON have the same hash; any difference in the cube, the avatar, the
 * gauges, the inventory, the loose items, the RNG or the run status changes it.
 */
export function hashState(state: GameState): string {
  return hashString(JSON.stringify(serialise(state)));
}
