// Accomplishments (owner, after the 0.26.0 build: "We also need a
// accomplishment system"; asked: per run, each worth family glory): a toast
// when one is earned, the list in the contracts card, and the run's glory.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FRONTIER_FEATS } from '../../src/data/frontier';
import { createFrontier, saveFrontier, standingOf } from '../../src/engine';
import type { FrontierState } from '../../src/engine';

test.use({ viewport: { width: 390, height: 844 } });

const RUN_KEY = 'mining-game.run';

async function openGame(page: Page, state: FrontierState): Promise<void> {
  await page.goto('/');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    RUN_KEY,
    saveFrontier(state),
  ] as const);
  await page.reload();
  await expect(page.getByTestId('lab-map')).toHaveAttribute('data-camps', '1');
}

test('an accomplishment earned shows a toast, and the contracts card lists it with the glory', async ({
  page,
}) => {
  // A relic in the store: the next action (End shift) earns "What was ours".
  const state: FrontierState = {
    ...createFrontier(110),
    inventory: new Map([
      ['relic', 1],
      ['wood', 9],
      ['apple', 9],
    ]),
  };
  const feat = FRONTIER_FEATS.find((f) => f.id === 'first-relic');
  if (feat === undefined) throw new Error('the first-relic accomplishment');
  await openGame(page, state);
  const toast = page.getByTestId('lab2-feat-toast');
  await expect(toast).toBeHidden();
  // None earned yet.
  await page.getByTestId('lab2-goals').click();
  await expect(page.getByTestId('lab2-feat-first-relic')).toHaveAttribute('data-earned', 'false');
  await page.getByTestId('lab2-goals-close').click();

  await page.getByTestId('lab2-end-shift').click();
  const night = page.getByTestId('lab2-night');
  await expect(night).toBeVisible();
  await night.click();
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(`${feat.name} · +${feat.glory} glory`);
  // A tap sends it away.
  await toast.click();
  await expect(toast).toBeHidden();

  await page.getByTestId('lab2-goals').click();
  await expect(page.getByTestId('lab2-feat-first-relic')).toHaveAttribute('data-earned', 'true');
  await expect(page.getByTestId('lab2-feats-head')).toContainText(
    `1 of ${FRONTIER_FEATS.length} · ✨ ${feat.glory} glory · ${standingOf(feat.glory)}`,
  );
});
