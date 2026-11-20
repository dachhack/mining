// The early phone preview screen (issues #64 and #86): start a run on a fixed
// seed, play it with the buttons under the map, and check the gauges follow.
// Taps on the map itself are in tapMap.spec.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Start a new run on `seed` through the "New run" form. */
async function startRun(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill(String(seed));
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText(`Seed ${seed}`);
}

/** Unfold the list of other choices (crafting, leaving) under the map. */
async function openOtherActions(page: Page): Promise<void> {
  await page.getByText(/^Other actions/).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Each test starts with no saved run.
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
});

test('a run on a fixed seed is played with the buttons under the map', async ({ page }) => {
  await startRun(page, 7);
  const gauges = page.getByTestId('gauges');
  await expect(gauges).toContainText('Shift 1 | AP 5/5 | Fuel 24');
  await expect(gauges).toContainText('You have: 2 Timber');
  await expect(page.getByTestId('forecast')).toContainText('If you end the shift now:');

  await page.getByTestId('end-shift').click();
  // The same choice in `npm run play -- --seed 7 --do end` gives the same gauges.
  await expect(gauges).toContainText('Shift 2 | AP 5/5 | Fuel 23');
  await expect(page.getByTestId('outcome')).toContainText('> End the shift.');

  // Leaving asks first, then ends the run.
  await openOtherActions(page);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('button[data-choice="leave"]').click();
  await expect(page.getByTestId('ended')).toContainText('left the mine alive');
  await expect(page.getByTestId('end-shift')).toBeHidden();
});

test('the run is saved after each choice and resumed on reload', async ({ page }) => {
  await startRun(page, 7);
  await page.getByTestId('end-shift').click();
  await expect(page.getByTestId('gauges')).toContainText('Shift 2');
  await page.reload();
  await expect(page.getByTestId('note')).toContainText('Resumed your saved run: seed 7.');
  await expect(page.getByTestId('seed')).toHaveText('Seed 7');
  await expect(page.getByTestId('gauges')).toContainText('Shift 2');

  // Restart asks first, then starts the same seed again.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(page.getByTestId('gauges')).toContainText('Shift 1 | AP 5/5');
  await expect(page.getByTestId('seed')).toHaveText('Seed 7');
});

test('a run saved by the build before mining by square is dropped, not a crash', async ({
  page,
}) => {
  // What engine 0.3.0 left on the phone: play-log format 1, with a move.
  await page.evaluate(() => {
    window.localStorage.setItem(
      'mining-game.preview.run',
      JSON.stringify({
        format: 1,
        engineVersion: '0.3.0',
        seed: 7,
        contractId: 'none',
        loadoutId: 'standard',
        actions: [{ type: 'move', to: { x: 17, y: 16, z: -1 }, ap: 1 }],
      }),
    );
  });
  await page.reload();
  await expect(page.getByTestId('note')).toContainText('could not be resumed');
  await expect(page.getByTestId('gauges')).toContainText('Shift 1 | AP 5/5');
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
  await openOtherActions(page);
  // No page-wide sideways scroll.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Every button, and the fold of the list, is at least 44 px tall.
  const heights = await page
    .locator('button:visible, summary')
    .evaluateAll((targets) => targets.map((t) => t.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(5);
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(44);
  }
  // The map, what came of the last tap, and End shift are in sight together.
  const endShift = await page.getByTestId('end-shift').boundingBox();
  expect(endShift).not.toBeNull();
  expect((endShift?.y ?? 0) + (endShift?.height ?? 0)).toBeLessThanOrEqual(844);
});
