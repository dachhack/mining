// Smelting and crafting, PR 4: a camp panel's words for level 4 and the drill.
import { describe, expect, it } from 'vitest';
import { FRONTIER_DRILL } from '../../src/data/frontier';
import { minesAsLevel, minesText } from '../../src/app/lab/campWorld';

describe("a camp panel's words for level 4 and the drill (src/app/lab/campWorld.ts)", () => {
  it('says level 4 mines what level 3 does, and the drill raises a camp by one level', () => {
    expect(minesText(4)).toBe(minesText(3));
    expect(minesText(4)).not.toBe('');
    const drill = new Map([[FRONTIER_DRILL.item, 1]]);
    expect([1, 2, 3, 4].map((level) => minesAsLevel(level, drill))).toEqual([2, 3, 3, 4]);
    expect(minesAsLevel(1, new Map())).toBe(1);
  });
});
