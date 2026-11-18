import { describe, expect, it } from 'vitest';
import { createRng, isValidSeed, nextFloat, nextInt, nextUint32 } from '../../src/engine/rng';

/** The first `count` numbers the generator gives for `seed`. */
function sequence(seed: number, count: number): number[] {
  const rng = createRng(seed);
  const numbers: number[] = [];
  for (let i = 0; i < count; i += 1) {
    numbers.push(nextUint32(rng));
  }
  return numbers;
}

describe('rng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(sequence(12345, 100)).toEqual(sequence(12345, 100));
  });

  it('gives different sequences for different seeds', () => {
    expect(sequence(1, 20)).not.toEqual(sequence(2, 20));
    // Neighbouring seeds must not give shifted copies of one sequence either.
    expect(sequence(1, 20).slice(1)).not.toEqual(sequence(2, 20).slice(0, 19));
  });

  it('gives a fixed, known sequence (so a change of algorithm cannot go unnoticed)', () => {
    // If this fails, every seed now generates a different cube: golden runs
    // change, and the PR must say so.
    expect(sequence(0, 3)).toEqual([1144304738, 1416247, 958946056]);
  });

  it('keeps its whole state in one unsigned 32-bit number', () => {
    const rng = createRng(4294967295); // the largest seed
    for (let i = 0; i < 1000; i += 1) {
      nextUint32(rng);
      expect(Object.keys(rng)).toEqual(['s']);
      expect(isValidSeed(rng.s)).toBe(true);
    }
  });

  it('can be continued from a copy of its state', () => {
    const rng = createRng(99);
    nextUint32(rng);
    nextUint32(rng);
    const copy = { ...rng };
    expect(nextUint32(copy)).toBe(nextUint32(rng));
    expect(nextUint32(copy)).toBe(nextUint32(rng));
  });

  it('gives whole numbers from 0 to 2**32 - 1', () => {
    for (const value of sequence(7, 1000)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });

  it('nextFloat gives numbers in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = nextFloat(rng);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('nextInt gives every whole number below the bound, and nothing else', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(nextInt(rng, 6));
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('rejects a bad bound and a bad seed', () => {
    expect(() => nextInt(createRng(1), 0)).toThrow();
    expect(() => nextInt(createRng(1), 2.5)).toThrow();
    expect(() => createRng(-1)).toThrow();
    expect(() => createRng(1.5)).toThrow();
    expect(() => createRng(2 ** 32)).toThrow();
    expect(isValidSeed(0)).toBe(true);
    expect(isValidSeed(2 ** 32 - 1)).toBe(true);
  });
});
