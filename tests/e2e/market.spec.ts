// Progression PR 1 (docs/plans/progression-phases.md, sections 3 and 7): the
// market's card, selling and buying for coins, Undo, and the end of a run
// after its last shift.
//
// The run is saved and opened as the game opens any saved run: seed 110 on
// a market day (shift 10 with a level-1 camp), holding wood and coins.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FRONTIER_MARKET, FRONTIER_RUN, FRONTIER_SHIFT } from '../../src/data/frontier';
import { createFrontier, saveFrontier } from '../../src/engine';
import type { FrontierState } from '../../src/engine';

test.use({ viewport: { width: 390, height: 844 } });

/** Where the game keeps its run (`RUN_KEY` in src/app/lab/campScreen.ts). */
const RUN_KEY = 'mining-game.run';

/** Seed 110 on shift `shift`, holding `inventory`. */
function worldOn(shift: number, inventory: Record<string, number>): FrontierState {
  return { ...createFrontier(110), shift, inventory: new Map(Object.entries(inventory)) };
}

async function openGame(page: Page, state: FrontierState): Promise<void> {
  await page.goto('/');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    RUN_KEY,
    saveFrontier(state),
  ] as const);
  await page.reload();
  await expect(page.getByTestId('lab-map')).toHaveAttribute('data-camps', '1');
}

const wood = FRONTIER_MARKET.sellPrices.find((l) => l.item === 'wood') ?? { count: 2, coins: 1 };
const animal = FRONTIER_MARKET.buyPrices.find((l) => l.item === 'animal') ?? { count: 1, coins: 8 };

test('on a market day, sells and buys for coins, 1 tap a trade, and Undo takes a trade back', async ({
  page,
}) => {
  await openGame(page, worldOn(10, { wood: wood.count * 20 }));
  const market = page.getByTestId('lab2-market');
  await expect(market).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('lab-coins')).toHaveAttribute('data-count', '0');
  await market.click();
  await expect(page.getByTestId('lab2-book-card')).toBeVisible();
  await expect(page.getByTestId('lab2-market-when')).toContainText('Open this shift');
  // Buying an animal needs coins first.
  await expect(page.getByTestId('lab2-buy-one-animal')).toBeDisabled();
  await page.getByTestId('lab2-sell-all-wood').click();
  await expect(page.getByTestId('lab2-book-note')).toHaveText(
    `Sold ${wood.count * 20} wood for ${wood.coins * 20} coins.`,
  );
  await expect(page.getByTestId('lab-coins')).toHaveAttribute(
    'data-count',
    String(wood.coins * 20),
  );
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 1),
  );
  await page.getByTestId('lab2-buy-one-animal').click();
  await expect(page.getByTestId('lab-coins')).toHaveAttribute(
    'data-count',
    String(wood.coins * 20 - animal.coins),
  );
  await page.getByTestId('lab2-market-close').click();
  await expect(page.getByTestId('lab2-book-card')).toBeHidden();
  await page.getByTestId('lab2-undo').click();
  await expect(page.getByTestId('lab-coins')).toHaveAttribute(
    'data-count',
    String(wood.coins * 20),
  );
  await expect(page.getByTestId('lab-res-animal')).toHaveCount(0);
});

test('on other days, the market shows when it opens, and every trade is off', async ({ page }) => {
  await openGame(page, worldOn(3, { wood: 10 }));
  const market = page.getByTestId('lab2-market');
  await expect(market).toHaveAttribute('data-open', 'false');
  await market.click();
  await expect(page.getByTestId('lab2-market-when')).toContainText('opens on shift 10');
  await expect(page.getByTestId('lab2-sell-one-wood')).toBeDisabled();
});

test('the run is over after its last shift, scored in coins', async ({ page }) => {
  await openGame(page, worldOn(FRONTIER_RUN.shifts, { wood: 10, grass: 30, coin: 42 }));
  await page.getByTestId('lab2-end-shift').click();
  const over = page.getByTestId('lab2-over');
  await expect(over).toBeVisible();
  await expect(over).toContainText('🪙 42 coins');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-status', 'finished');
  await expect(page.getByTestId('lab2-end-shift')).toBeDisabled();
});
