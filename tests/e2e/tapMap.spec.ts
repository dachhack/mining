// The tap map of the phone preview (issue #66): drag to pan, "Centre on me",
// tap a cell to move or mine, and the chooser for a choice with a warning.
// Seed 7 starts on the surface at x16 y16 over dirt; under it, on layer 0,
// there is dirt to the west (see `npm run play -- --seed 7 --do mine-down`).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function startRun(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill(String(seed));
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText(`Seed ${seed}`);
}

/** Where the map's camera is: the cell at its top-left corner, and the cell size in pixels. */
async function camera(canvas: Locator): Promise<{ x: number; y: number; cellPx: number }> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  return { x: Number(data['camX']), y: Number(data['camY']), cellPx: Number(data['cellPx']) };
}

/** The page position of the middle of cell (x, y) on the map. */
async function cellPoint(canvas: Locator, x: number, y: number): Promise<{ x: number; y: number }> {
  const cam = await camera(canvas);
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  return {
    x: box.x + (x - cam.x + 0.5) * cam.cellPx,
    y: box.y + (y - cam.y + 0.5) * cam.cellPx,
  };
}

/** Tap cell (x, y) of the map, as a finger would. */
async function tapCell(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  const point = await cellPoint(canvas, x, y);
  await page.touchscreen.tap(point.x, point.y);
}

/** Drag the map by (dx, dy) pixels with the mouse, in small steps. */
async function drag(page: Page, canvas: Locator, dx: number, dy: number): Promise<void> {
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  await startRun(page, 7);
});

test('the map is centred on the miner, a drag pans it, "Centre on me" brings it back', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  // x16 y16 on a 32 x 32 cube: the 16 x 16 window starts at x8 y8.
  expect(await camera(canvas)).toMatchObject({ x: 8, y: 8 });
  await expect(page.getByTestId('layer-label')).toHaveText('Layer 0 · you stand on it');

  const { cellPx } = await camera(canvas);
  await drag(page, canvas, 3 * cellPx, 2 * cellPx);
  const moved = await camera(canvas);
  // Dragging the map right and down shows more of the west and north.
  expect(moved.x).toBeCloseTo(5, 1);
  expect(moved.y).toBeCloseTo(6, 1);
  // A drag is never a tap: nothing was done.
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');
  await expect(page.getByTestId('chooser')).toBeHidden();

  await page.getByRole('button', { name: 'Centre on me' }).click();
  expect(await camera(canvas)).toMatchObject({ x: 8, y: 8 });
});

test('tapping the miner opens the chooser with the fall warning; one more tap mines', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  await tapCell(page, canvas, 16, 16);
  const chooser = page.getByTestId('chooser');
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText('you will fall 1 block or more and lose at least 1 health');
  // Nothing was done yet.
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');

  // Tapping elsewhere on the map cancels. (The chooser covers the top half
  // of the map, above the miner, so the tap is in the bottom half.)
  await tapCell(page, canvas, 10, 22);
  await expect(chooser).toBeHidden();
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');

  await tapCell(page, canvas, 16, 16);
  await chooser.getByRole('button', { name: /Mine below you/ }).click();
  await expect(page.getByTestId('gauges')).toContainText('AP 4/5');
  await expect(page.getByTestId('gauges')).toContainText('Health 9/10');
  await expect(page.getByTestId('gauges')).toContainText('x16 y16, layer 0');
  await expect(page.getByTestId('layer-label')).toHaveText('Layer 0 · you are here');
});

test('tapping a neighbouring block mines it, and tapping the open cell moves there', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  await tapCell(page, canvas, 16, 16);
  await page
    .getByTestId('chooser')
    .getByRole('button', { name: /Mine below you/ })
    .click();
  await expect(gauges).toContainText('AP 4/5');

  // West is dirt: one tap mines it (one choice, no warning).
  await tapCell(page, canvas, 15, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Mine west: Dirt');
  await expect(gauges).toContainText('AP 3/5');
  await expect(page.getByTestId('chooser')).toBeHidden();

  // Now west is open: one tap walks there.
  await tapCell(page, canvas, 15, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Move west.');
  await expect(gauges).toContainText('x15 y16, layer 0');
  await expect(gauges).toContainText('AP 2/5');

  // A cell with nothing to do says so and does nothing.
  await tapCell(page, canvas, 10, 10);
  await expect(page.getByTestId('map-hint')).toHaveText('Nothing to do there');
  await expect(gauges).toContainText('AP 2/5');
});

test('the layer buttons show the layer below, and its blocks can be mined from there', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  await tapCell(page, canvas, 16, 16);
  await page
    .getByTestId('chooser')
    .getByRole('button', { name: /Mine below you/ })
    .click();
  await page.getByRole('button', { name: 'Look one layer down' }).click();
  await expect(page.getByTestId('layer-label')).toHaveText('Layer 1 · 1 below you');
  // Under the west neighbour is dirt: mining it from here is "mine-w-down".
  await tapCell(page, canvas, 15, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Mine west, one layer down: Dirt');
  await page.getByRole('button', { name: 'Look one layer up' }).click();
  await expect(page.getByTestId('layer-label')).toHaveText('Layer 0 · you are here');
});

test('at phone width: no sideways scroll, and every tap target is at least 44 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const canvas = page.getByTestId('map-canvas');
  // With the chooser open, so its buttons are measured too.
  await tapCell(page, canvas, 16, 16);
  await expect(page.getByTestId('chooser')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const heights = await page
    .locator('button:visible, summary')
    .evaluateAll((targets) => targets.map((t) => t.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(5);
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(44);
  }
});
