// Camps on the phone preview (issue #100), at phone size: the camp tool
// founds a camp with a tap, a refused patch is marked, mining near the camp
// is cheaper, and the crew can rest.
//
// Seed 1 (see `npm run play -- --seed 1`): the patch round x15 y12 has a tree
// on x14 y11; the patch round x17 y12 is clear, flat ground. x16 y10 is
// stone, one step from that patch.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

/** Tap the square (x, y) of the map, as a finger would. */
async function tapSquare(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const cellPx = Number(data['cellPx']);
  // The squares start after the rulers along the top and the left of the map.
  const originPx = Number(data['originPx']);
  await page.touchscreen.tap(
    box.x + originPx + (x - Number(data['camX']) + 0.5) * cellPx,
    box.y + originPx + (y - Number(data['camY']) + 0.5) * cellPx,
  );
}

test('the camp tool founds a camp; mining near it is cheaper; the crew rests', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill('1');
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText('Seed 1');

  const canvas = page.getByTestId('map-canvas');
  const outcome = page.getByTestId('outcome');
  const gauges = page.getByTestId('gauges');
  const campTool = page.getByTestId('tool-camp');
  await expect(campTool).toHaveText('Camp (1)');
  await expect(campTool).toHaveAttribute('aria-pressed', 'false');

  // The camp tool on: a tap on a patch with a tree is refused and marked.
  await campTool.click();
  await expect(campTool).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-hint')).toContainText('flat 3 x 3 patch');
  await tapSquare(page, canvas, 15, 12);
  await expect(outcome).toContainText('has a tree on x14 y11');
  await expect(canvas).toHaveAttribute('data-selected', '15,12');
  await expect(canvas).toHaveAttribute('data-blocked', '14,11');
  await expect(gauges).toContainText('AP 5/5');

  // A clear, flat patch: the camp is founded and takes the rest of the shift.
  await tapSquare(page, canvas, 17, 12);
  await expect(outcome).toContainText('The camp stands on x16-18, y11-13');
  await expect(gauges).toContainText('AP 0/5');
  await expect(gauges).toContainText('Stockpile: 2 Timber');
  await expect(canvas).toHaveAttribute('data-blocked', '');
  // The kit is used up: the tool is gone, and a tap mines again.
  await expect(campTool).toBeHidden();
  await expect(page.getByTestId('map-notes')).toContainText('Camp at x17 y12 (ground level)');
  // The squares where mining is cheaper are not listed on the phone: the map
  // draws a line round them, and the legend says what it means.
  await expect(page.getByTestId('map-notes')).not.toContainText('by row');
  await expect(page.getByTestId('map-notes')).toContainText('under "Other actions"');
  await expect(page.getByTestId('map-notes')).not.toContainText('"rest 17,12"');
  await expect(page.getByTestId('map-legend')).toContainText('camp square');
  await expect(page.getByTestId('map-legend')).toContainText(
    'mining costs 1 AP less, never below 1',
  );
  await page.getByTestId('end-shift').click();
  await expect(gauges).toContainText('Shift 2');

  // Shift 2: stone beside the camp costs 1 AP, not 2.
  await tapSquare(page, canvas, 16, 10);
  await expect(outcome).toContainText('(1 AP less: near a camp)');
  await expect(gauges).toContainText('AP 4/5');
  // A camp square cannot be mined.
  await tapSquare(page, canvas, 17, 12);
  await expect(outcome).toContainText('A camp stands on x17 y12');
  await expect(gauges).toContainText('AP 4/5');

  // Rest is on the list of other actions; it takes the rest of the shift.
  await page.locator('.actions-heading').click();
  await page.locator('[data-choice="rest 17,12"]').click();
  await expect(outcome).toContainText('The crew rests at the camp at x17 y12');
  await expect(gauges).toContainText('AP 0/5');
  await page.screenshot({
    path: process.env['CAMPS_SHOT'] ?? 'test-results/camps.png',
    fullPage: true,
  });
});
