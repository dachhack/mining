// Seeded pseudo-random number generator (decision note 0005 item 25).
//
// The generator's whole state is one number, held in `GameState.rng`. There is
// no hidden module-level state: every function here takes the state object and
// advances it in place. Same seed, same sequence of calls, same numbers, in
// Node and in any browser.
//
// The algorithm is "mulberry32", a small, well-known 32-bit generator. It is
// good enough for a game and far too weak for cryptography.

/** The generator's state. `s` is always an unsigned 32-bit integer. */
export interface RngState {
  s: number;
}

const UINT32_RANGE = 0x100000000; // 2 ** 32

/** True if `value` can be used as a seed: a whole number from 0 to 2**32 - 1. */
export function isValidSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < UINT32_RANGE;
}

/** A new generator state for this seed. Throws if the seed is not valid. */
export function createRng(seed: number): RngState {
  if (!isValidSeed(seed)) {
    throw new Error(`Seed must be a whole number from 0 to 4294967295, but is ${seed}`);
  }
  return { s: seed };
}

/** The next whole number from 0 to 2**32 - 1. Advances `rng`. */
export function nextUint32(rng: RngState): number {
  // `>>> 0` turns a JavaScript number into an unsigned 32-bit integer, and
  // `Math.imul` is 32-bit integer multiplication. Together they make the
  // arithmetic wrap around exactly as it would in C.
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** The next number in [0, 1), like Python's `random.random()`. Advances `rng`. */
export function nextFloat(rng: RngState): number {
  return nextUint32(rng) / UINT32_RANGE;
}

/** The next whole number from 0 to `upperBound - 1`, like `random.randrange(n)`. Advances `rng`. */
export function nextInt(rng: RngState, upperBound: number): number {
  if (!Number.isInteger(upperBound) || upperBound < 1) {
    throw new Error(`nextInt needs a whole upper bound of at least 1, but got ${upperBound}`);
  }
  return Math.floor(nextFloat(rng) * upperBound);
}
