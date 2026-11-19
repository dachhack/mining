// The early phone preview screen (issue #64): start a run on a fixed seed,
// tap a few choices by their labels, and check the gauges follow.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Start a new run on `seed` through the "New run" form. */
async function startRun(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill(String(seed));
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText(`Seed ${seed}`);
}

/** Unfold the full list of choices under the map (folded by default since issue #66). */
async function openAllActions(page: Page): Promise<void> {
  await page.getByText(/^All actions/).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Each test starts with no saved run.
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
});

test('a run on a fixed seed is played by tapping choices in the full list', async ({ page }) => {
  await startRun(page, 7);
  await openAllActions(page);
  const gauges = page.getByTestId('gauges');
  await expect(gauges).toContainText('Shift 1 | AP 5/5 | Fuel 24');
  await expect(gauges).toContainText('the surface');
  await expect(page.getByTestId('map-legend')).toContainText('Dirt');
  await expect(page.getByTestId('forecast')).toContainText('If you end the shift now:');

  // Tap by label: the button's text is what the play tool prints for the choice.
  await page.getByRole('button', { name: 'Move east' }).click();
  await expect(gauges).toContainText('AP 4/5');
  await expect(page.getByTestId('outcome')).toContainText('> Move east.');

  await page.getByRole('button', { name: 'Mine below you' }).click();
  // The same two choices in `npm run play -- --seed 7 --do e,mine-down` give the same gauges.
  await expect(gauges).toContainText('AP 2/5');
  // Digging down moves the miner into the dug cell (issues #75 and #80): no health lost.
  await expect(gauges).toContainText('Health 10/10');
  await expect(gauges).toContainText('layer 0');

  await page.getByRole('button', { name: 'End the shift' }).click();
  await expect(gauges).toContainText('Shift 2 | AP 5/5 | Fuel 23');
});

test('the run is saved after each choice and resumed on reload', async ({ page }) => {
  await startRun(page, 7);
  await openAllActions(page);
  await page.getByRole('button', { name: 'Move east' }).click();
  await expect(page.getByTestId('gauges')).toContainText('AP 4/5');
  await page.reload();
  await expect(page.getByTestId('note')).toContainText('Resumed your saved run: seed 7.');
  await expect(page.getByTestId('seed')).toHaveText('Seed 7');
  await expect(page.getByTestId('gauges')).toContainText('AP 4/5');

  // Restart asks first, then starts the same seed again.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');
  await expect(page.getByTestId('seed')).toHaveText('Seed 7');
});

test('a bad seed is refused', async ({ page }) => {
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill('not a number');
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByText('The seed must be a whole number')).toBeVisible();
});

test('the screen fits a phone held upright', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startRun(page, 7);
  await openAllActions(page);
  // No page-wide sideways scroll.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Every button, and the fold of the full list, is at least 44 px tall.
  const heights = await page
    .locator('button:visible, summary')
    .evaluateAll((targets) => targets.map((t) => t.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(5);
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(44);
  }
});
