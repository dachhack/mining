// The market's info chips (owner: "You also need to see what all the things
// you can buy do. Maybe do it in an info chip to save space").
import { describe, expect, it } from 'vitest';
import { FRONTIER_MARKET, FRONTIER_PUMP } from '../../src/data/frontier';
import { itemInfo } from '../../src/app/lab/itemInfo';

describe('what each item does, for the market', () => {
  it('says something for every item the market buys or sells', () => {
    for (const lot of [...FRONTIER_MARKET.buyPrices, ...FRONTIER_MARKET.sellPrices]) {
      const info = itemInfo(lot.item);
      expect(info, lot.item).not.toBe(null);
      expect((info ?? '').length, lot.item).toBeGreaterThan(10);
    }
  });

  it('takes its numbers from the data', () => {
    expect(itemInfo(FRONTIER_PUMP.item)).toContain(String(FRONTIER_PUMP.drainPerShift));
  });
});
