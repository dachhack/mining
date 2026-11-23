// Smelting and crafting, PR 4: a camp panel's words for level 4.
import { describe, expect, it } from 'vitest';
import { minesText } from '../../src/app/lab/campWorld';

describe("a camp panel's words for level 4 (src/app/lab/campWorld.ts)", () => {
  it('says level 4 mines what level 3 does', () => {
    expect(minesText(4)).toBe(minesText(3));
    expect(minesText(4)).not.toBe('');
  });
});
