// The market (docs/plans/progression-phases.md, section 3, and the owner's
// market scene): it opens after the night before a market day, the player
// trades (no taps), and closing it starts the day; it cannot be opened
// otherwise. Also the end of a run after its last shift.
//
// The runs are saved and opened as the game opens any saved run.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FRONTIER_MARKET, FRONTIER_RUN, FRONTIER_SHIFT } from '../../src/data/frontier';
import { createFrontier, saveFrontier } from '../../src/engine';
import type { FrontierState } from '../../src/engine';

test.use({ viewport: { width: 390, height: 844 } });

/** Where the game keeps its run (`RUN_KEY` in src/app/lab/campScreen.ts). */
const RUN_KEY = 'mining-game.run';

/** Seed 110 on shift `shift`, holding `inventory`, its market open or not. */
function worldOn(
  shift: number,
  inventory: Record<string, number>,
  marketOpen = false,
): FrontierState {
  return {
    ...createFrontier(110),
    shift,
    marketOpen,
    inventory: new Map(Object.entries(inventory)),
  };
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
const animal = FRONTIER_MARKET.buyPrices.find((l) => l.item === 'animal') ?? {
  count: 1,
  coins: 8,
};

test('the market opens after the night before a market day', async ({ page }) => {
  await openGame(page, worldOn(9, { wood: 10, grass: 30 }));
  await expect(page.getByTestId('lab2-book-card')).toBeHidden();
  await page.getByTestId('lab2-end-shift').click();
  // Skip the night: then the market's card is open, before the day.
  await page.getByTestId('lab2-night').click();
  await expect(page.getByTestId('lab2-book-card')).toBeVisible();
  await expect(page.getByTestId('lab2-market-when')).toContainText('Market day');
});

test('trade for no taps, then close the market to start the day; it does not open again', async ({
  page,
}) => {
  await openGame(page, worldOn(10, { wood: wood.count * 20 }, true));
  // A run saved with its market open opens it again.
  await expect(page.getByTestId('lab2-book-card')).toBeVisible();
  await expect(page.getByTestId('lab2-buy-one-animal')).toBeDisabled();
  await page.getByTestId('lab2-sell-all-wood').click();
  await expect(page.getByTestId('lab2-book-note')).toHaveText(
    `Sold ${wood.count * 20} wood for ${wood.coins * 20} coins.`,
  );
  await page.getByTestId('lab2-buy-one-animal').click();
  await expect(page.getByTestId('lab-coins')).toHaveAttribute(
    'data-count',
    String(wood.coins * 20 - animal.coins),
  );
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps),
  );
  await page.getByTestId('lab2-market-close').click();
  await expect(page.getByTestId('lab2-book-card')).toBeHidden();
  await expect(page.getByTestId('lab-hint')).toHaveText('The market closes. The day begins.');
  // The goals card says when it opens next: after the night before shift 20.
  await page.getByTestId('lab2-goals').click();
  await expect(page.getByTestId('lab2-market-when')).toContainText('before shift 20');
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

test('the market shows what you own of each thing to buy, and an info chip says what it does', async ({
  page,
}) => {
  // Owner: "For the market you need to see what you already own and what it
  // does ... Maybe do it in an info chip to save space."
  await openGame(page, worldOn(10, { coin: 100, pump: 1 }, true));
  await expect(page.getByTestId('lab2-book-card')).toBeVisible();
  await expect(page.getByTestId('lab2-buy-have-pump')).toContainText('Own 1');
  await expect(page.getByTestId('lab2-buy-have-pump')).toContainText('100 coins');
  // Closed until tapped; a tap opens one line on what it does, another closes it.
  await expect(page.getByTestId('lab2-buy-info-text-pump')).toHaveCount(0);
  await page.getByTestId('lab2-buy-info-pump').click();
  await expect(page.getByTestId('lab2-buy-info-text-pump')).toContainText('drains');
  await expect(page.getByTestId('lab2-buy-info-pump')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('lab2-buy-info-pump').click();
  await expect(page.getByTestId('lab2-buy-info-text-pump')).toHaveCount(0);
});
