// A fingerprint of a whole frontier state, for determinism tests and the
// new game's golden runs (plan A3): "same seed and same taps give the same
// hash". Like `hashState`, it is a checksum, not a security feature.

import { hashState, hashString } from '../hash';
import type { FrontierState } from './state';

/**
 * The hash of a frontier state: 16 hex digits. Any difference in the cube,
 * the surface, the animals, the generator, the camps, what has been seen,
 * the inventory or the count of blocks mined changes it.
 */
export function hashFrontier(state: FrontierState): string {
  // A Map does not turn into JSON by itself, so the inventory is written as
  // [item, count] pairs in item order (sorted, so the order items were
  // gained in does not matter).
  const inventory = [...state.inventory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return hashString(
    JSON.stringify({
      version: state.version,
      seed: state.seed,
      cube: hashState(state.cube),
      features: state.features,
      apples: state.apples,
      animals: state.animals,
      nextAnimalId: state.nextAnimalId,
      rng: state.rng,
      camps: state.camps,
      nextCampId: state.nextCampId,
      seen: state.seen,
      inventory,
      mined: state.mined,
    }),
  );
}
